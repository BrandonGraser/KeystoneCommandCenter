// Chartex (chartex.com) — TikTok/Spotify/YouTube/Shazam stats per artist and
// per song, shared by both deployments (same pattern as spotify.mjs).
//
// Auth: X-APP-ID + X-APP-TOKEN headers from the Chartex API Dashboard
// (https://chartex.com/apidocs/dashboard), via CHARTEX_APP_ID and
// CHARTEX_APP_TOKEN env vars. Requests are paid per-call, so syncs stay lean:
// one artist-chart search + the artist's paginated song list per sync.
//
// Chartex serves rolling 24h/7d/all-time numbers but no history endpoint, so
// daily snapshots of the raw cumulative totals accumulate here (query-time
// diffs, mirroring the TikTok pipeline) to build our own time series.

import {
  getChartexArtist,
  getChartexArtistSnapshotSeries,
  listChartexArtists,
  listChartexSongs,
  saveChartexArtistSnapshot,
  saveChartexArtistSync,
  saveChartexSongSnapshot,
  upsertChartexSong
} from "./db.mjs";
import { axisStartMs, isoDate } from "./metrics.mjs";

const BASE = "https://api.chartex.com/external/v1";

export function isChartexConfigured() {
  return Boolean(process.env.CHARTEX_APP_ID && process.env.CHARTEX_APP_TOKEN);
}

async function chartexGet(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    headers: {
      "X-APP-ID": process.env.CHARTEX_APP_ID,
      "X-APP-TOKEN": process.env.CHARTEX_APP_TOKEN
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === "error") {
    throw new Error(`Chartex ${url.replace(BASE, "")} failed (${response.status}): ${JSON.stringify(data.error || data).slice(0, 300)}`);
  }
  return data.data || data;
}

// Artist-level stats come from the chart endpoint's search — items carry the
// Spotify artist id, which is how a result is matched to the tracked artist.
export async function fetchChartexArtist(name, spotifyId) {
  const params = new URLSearchParams({
    search: name,
    sort_platform: "tiktok-creates",
    sort_column: "all_time",
    limit: "20"
  });
  const data = await chartexGet(`/artists/?${params}`);
  return (data.items || []).find((item) => item.spotify_id === spotifyId) || null;
}

// All of an artist's songs, following pagination (20/page).
export async function fetchChartexSongs(spotifyId) {
  const songs = [];
  let url = `/artists/${encodeURIComponent(spotifyId)}/songs/`;
  for (let page = 0; page < 10 && url; page++) {
    const data = await chartexGet(url);
    songs.push(...(data.items || []));
    url = data.next || null;
  }
  return songs;
}

// --- Sync --------------------------------------------------------------------

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

export async function syncChartexArtist(id) {
  const artist = await getChartexArtist(id);
  if (!artist) throw Object.assign(new Error("Chartex artist not found."), { status: 404 });
  if (!isChartexConfigured()) {
    throw Object.assign(new Error("Chartex is not configured. Set CHARTEX_APP_ID and CHARTEX_APP_TOKEN."), { status: 503 });
  }

  const errors = [];
  const stats = await fetchChartexArtist(artist.name, artist.spotify_id).catch((error) => {
    errors.push(error.message);
    return null;
  });
  if (!stats && !errors.length) {
    errors.push(`Chartex has no artist named "${artist.name}" with Spotify id ${artist.spotify_id}.`);
  }
  const songs = await fetchChartexSongs(artist.spotify_id).catch((error) => {
    errors.push(error.message);
    return null;
  });
  if (!stats && !songs) throw Object.assign(new Error(errors.join(" ")), { status: 502 });

  if (stats) {
    await saveChartexArtistSnapshot(id, {
      tiktok_creates: num(stats.tiktok_total_video_count),
      spotify_streams: num(stats.spotify_total_streams),
      youtube_views: num(stats.youtube_total_views),
      shazam_count: num(stats.shazam_total_count),
      tiktok_followers: num(stats.tiktok_total_followers),
      instagram_followers: num(stats.instagram_total_followers)
    });
  }
  if (songs) {
    for (const item of songs) {
      if (!item.spotify_id) continue;
      const song = await upsertChartexSong(id, item);
      await saveChartexSongSnapshot(song.id, {
        tiktok_creates: num(item.tiktok_total_video_count),
        spotify_streams: num(item.spotify_total_streams),
        youtube_views: num(item.youtube_total_views),
        shazam_count: num(item.shazam_total_count)
      });
    }
  }

  const updated = await saveChartexArtistSync(id, {
    name: stats?.artist_name || undefined,
    image_url: stats?.artist_image_url || undefined,
    stats: stats ? JSON.stringify(stats) : undefined,
    sync_error: errors.length ? errors.join(" ") : null
  });
  return { artist: updated };
}

export async function syncAllChartexArtists() {
  const artists = await listChartexArtists();
  const results = [];
  for (const artist of artists) {
    try {
      await syncChartexArtist(artist.id);
      results.push({ id: artist.id, ok: true });
    } catch (error) {
      results.push({ id: artist.id, ok: false, reason: error.message });
    }
  }
  return { artists: await listChartexArtists(), results };
}

// --- Overview assembly (GET /api/chartex/overview) ----------------------------

export const CHARTEX_SERIES_METRICS = ["tiktok_creates", "spotify_streams", "youtube_views", "shazam_count"];

// Daily-gain series from cumulative snapshots: the diff between consecutive
// snapshots lands on the later snapshot's day; days without snapshots stay
// null so charts break the line rather than showing zero.
function buildGainSeries(rows, baselineByKey, keyOf, days, startMs) {
  const seriesByKey = new Map();
  const prevByKey = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!seriesByKey.has(key)) {
      seriesByKey.set(key, Object.fromEntries(CHARTEX_SERIES_METRICS.map((m) => [m, new Array(days).fill(null)])));
      prevByKey.set(key, { ...(baselineByKey.get(key) || {}) });
    }
    const idx = Math.round((new Date(`${row.snapshot_date}T00:00:00`).getTime() - startMs) / 86400000);
    const series = seriesByKey.get(key);
    const prev = prevByKey.get(key);
    for (const metric of CHARTEX_SERIES_METRICS) {
      const value = row[metric];
      if (value == null) continue;
      const before = prev[metric];
      if (before != null && idx >= 0 && idx < days && Number(value) >= Number(before)) {
        series[metric][idx] = Number(value) - Number(before);
      }
      prev[metric] = Number(value);
    }
  }
  return seriesByKey;
}

export async function getChartexOverview(days) {
  const startMs = axisStartMs(days);
  const startDate = isoDate(new Date(startMs));
  const [artists, snapshots] = await Promise.all([
    listChartexArtists(),
    getChartexArtistSnapshotSeries(startDate)
  ]);

  const baseline = new Map(snapshots.baseline.map((row) => [row.artist_id, row]));
  const gains = buildGainSeries(snapshots.rows, baseline, (row) => row.artist_id, days, startMs);

  const withSongs = await Promise.all(artists.map(async (artist) => ({
    ...artist,
    series: gains.get(artist.id) || null,
    songs: await listChartexSongs(artist.id)
  })));

  return { days, start: startDate, configured: isChartexConfigured(), artists: withSongs };
}
