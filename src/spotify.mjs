// Spotify artist stats, shared by both deployments (same pattern as tiktok.mjs).
//
// Two data sources per artist:
//   1. Official Web API (client-credentials flow) — followers, popularity,
//      genres, images, top tracks. Needs SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET
//      (free app at https://developer.spotify.com/dashboard).
//   2. The public open.spotify.com artist page — monthly listeners, which the
//      API does not expose. Best-effort scrape; tolerated when it breaks.
//
// Daily snapshots accumulate in spotify_artist_snapshots so growth charts are
// query-time diffs, mirroring the TikTok pipeline.

import {
  getSpotifyArtist,
  getSpotifySnapshotSeries,
  getTrackStreamSeries,
  listSpotifyArtists,
  listSpotifyTracks,
  saveSpotifyArtistSync,
  saveSpotifySnapshot,
  saveTrackStreams,
  upsertSpotifyTrack
} from "./db.mjs";
import { axisStartMs, isoDate } from "./metrics.mjs";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";

export function isSpotifyConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

// Accepts a bare artist id, a spotify:artist:<id> URI, or any
// open.spotify.com/artist/<id> URL (with or without ?si=… junk).
export function parseArtistId(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  const urlMatch = text.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?artist\/([A-Za-z0-9]+)/i);
  if (urlMatch) return urlMatch[1];
  const uriMatch = text.match(/^spotify:artist:([A-Za-z0-9]+)$/i);
  if (uriMatch) return uriMatch[1];
  if (/^[A-Za-z0-9]{15,30}$/.test(text)) return text;
  return null;
}

// --- Official API (client credentials) --------------------------------------

let cachedToken = null; // { token, expiresAt } — module-level, survives warm invocations

async function appToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30000) return cachedToken.token;
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Spotify token request failed: ${JSON.stringify(data)}`);
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

async function apiGet(path) {
  const token = await appToken();
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Spotify API ${path} failed: ${JSON.stringify(data.error || data)}`);
  }
  return data;
}

export async function fetchArtist(spotifyId) {
  const a = await apiGet(`/artists/${encodeURIComponent(spotifyId)}`);
  return {
    name: a.name || "",
    followers: Number.isFinite(Number(a.followers?.total)) ? Number(a.followers.total) : null,
    popularity: Number.isFinite(Number(a.popularity)) ? Number(a.popularity) : null,
    genres: Array.isArray(a.genres) ? a.genres : [],
    image_url: a.images?.[0]?.url || null,
    spotify_url: a.external_urls?.spotify || `https://open.spotify.com/artist/${spotifyId}`
  };
}

export async function fetchTopTracks(spotifyId) {
  const data = await apiGet(`/artists/${encodeURIComponent(spotifyId)}/top-tracks?market=US`);
  return (data.tracks || []).map((t) => ({
    id: t.id,
    name: t.name || "",
    popularity: Number.isFinite(Number(t.popularity)) ? Number(t.popularity) : null,
    album: t.album?.name || "",
    release_date: t.album?.release_date || null,
    image_url: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
    spotify_url: t.external_urls?.spotify || null
  }));
}

// --- Monthly listeners (public page scrape) ----------------------------------

// Browser UAs get the JS-only web-player shell, but crawler UAs get server-
// rendered og: meta tags — including "Artist · 278.2K monthly listeners." in
// og:description (verified 2026-07-07). Spotify can change this at any time —
// callers treat null as "unknown today", never as zero.
export async function scrapeArtistPage(spotifyId) {
  const empty = { monthly_listeners: null, name: null, image_url: null };
  try {
    const response = await fetch(`https://open.spotify.com/artist/${encodeURIComponent(spotifyId)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept-Language": "en"
      }
    });
    if (!response.ok) return empty;
    const html = await response.text();
    const meta = (prop) => html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`, "i"))?.[1] || null;
    // Full number first ("12,345 monthly listeners"), then abbreviated ("278.2K monthly listeners").
    const match = html.match(/([\d][\d,.]*)\s*(K|M|B)?\s*monthly listeners/i);
    let listeners = null;
    if (match) {
      let value = Number(match[1].replace(/,/g, ""));
      const suffix = (match[2] || "").toUpperCase();
      if (suffix === "K") value *= 1e3;
      else if (suffix === "M") value *= 1e6;
      else if (suffix === "B") value *= 1e9;
      if (Number.isFinite(value)) listeners = Math.round(value);
    }
    return { monthly_listeners: listeners, name: meta("og:title"), image_url: meta("og:image") };
  } catch {
    return empty;
  }
}

// --- Sync --------------------------------------------------------------------

export async function syncSpotifyArtist(id) {
  const artist = await getSpotifyArtist(id);
  if (!artist) throw Object.assign(new Error("Spotify artist not found."), { status: 404 });

  const errors = [];
  let api = null;
  let topTracks = null;
  if (isSpotifyConfigured()) {
    try {
      [api, topTracks] = await Promise.all([
        fetchArtist(artist.spotify_id),
        fetchTopTracks(artist.spotify_id).catch(() => null)
      ]);
    } catch (error) {
      errors.push(error.message);
    }
  } else {
    errors.push("Spotify API not configured — set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET for followers, popularity and top tracks.");
  }

  const page = await scrapeArtistPage(artist.spotify_id);
  const monthlyListeners = page.monthly_listeners;
  if (monthlyListeners == null) errors.push("Monthly listeners could not be read from the public artist page.");

  if (!api && monthlyListeners == null) {
    throw Object.assign(new Error(errors.join(" ")), { status: 502 });
  }

  const updated = await saveSpotifyArtistSync(id, {
    name: api?.name || page.name || undefined,
    image_url: api?.image_url || page.image_url || undefined,
    genres: api ? JSON.stringify(api.genres) : undefined,
    spotify_url: api?.spotify_url,
    followers: api?.followers,
    popularity: api?.popularity,
    monthly_listeners: monthlyListeners ?? undefined,
    top_tracks: topTracks ? JSON.stringify(topTracks) : undefined,
    sync_error: errors.length ? errors.join(" ") : null
  });
  await saveSpotifySnapshot(id, {
    followers: api?.followers ?? null,
    popularity: api?.popularity ?? null,
    monthly_listeners: monthlyListeners
  });
  return { artist: updated };
}

export async function syncAllSpotifyArtists() {
  const artists = await listSpotifyArtists();
  const results = [];
  for (const artist of artists) {
    try {
      await syncSpotifyArtist(artist.id);
      results.push({ id: artist.id, ok: true });
    } catch (error) {
      results.push({ id: artist.id, ok: false, reason: error.message });
    }
  }
  return { artists: await listSpotifyArtists(), results };
}

// --- Spotify for Artists CSV import -------------------------------------------
//
// S4A has no public API, so song streams arrive as manual CSV exports. Column
// names aren't documented and may shift, so headers are detected loosely.
// Supported shapes:
//   timeline  — a date column + streams column (one song's daily streams;
//               needs track_name unless a song column is present)
//   totals    — a song column + streams column, no dates (the Music > Songs
//               table; values are treated as cumulative totals stamped today,
//               so daily numbers emerge by diffing successive imports)

// Minimal RFC-4180 parser: quoted fields, embedded commas/newlines/quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = String(text || "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function findColumn(headers, candidates) {
  for (const cand of candidates) {
    const idx = headers.findIndex((h) => h === cand);
    if (idx >= 0) return idx;
  }
  for (const cand of candidates) {
    const idx = headers.findIndex((h) => h.includes(cand));
    if (idx >= 0) return idx;
  }
  return -1;
}

// "2026-07-07", "7/7/2026", "Jul 7, 2026" → "2026-07-07" (null if unparseable).
function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const mdY = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (mdY) return `${mdY[3]}-${mdY[1].padStart(2, "0")}-${mdY[2].padStart(2, "0")}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return isoDate(parsed);
}

function parseCount(value) {
  const n = Number(String(value || "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function importS4ACsv(artistId, csvText, trackName) {
  const artist = await getSpotifyArtist(artistId);
  if (!artist) throw Object.assign(new Error("Spotify artist not found."), { status: 404 });

  const parsed = parseCsv(csvText);
  if (parsed.length < 2) throw Object.assign(new Error("That CSV has no data rows."), { status: 400 });
  const headers = parsed[0].map((h) => h.trim().toLowerCase());
  const body = parsed.slice(1);

  const dateCol = findColumn(headers, ["date", "day"]);
  const songCol = findColumn(headers, ["song title", "song", "title", "track"]);
  const streamsCol = findColumn(headers, ["streams", "stream count", "plays", "stream"]);
  if (streamsCol < 0) {
    throw Object.assign(new Error(`No streams column found. Headers were: ${headers.join(", ")}`), { status: 400 });
  }

  // Timeline export for a single song: caller must say which song it is.
  if (dateCol >= 0 && songCol < 0 && !String(trackName || "").trim()) {
    return { needs_track_name: true };
  }

  const today = new Date().toISOString().slice(0, 10);
  const entriesByTrack = new Map(); // track name -> [{date, streams?, total_streams?}]
  let skipped = 0;
  for (const row of body) {
    const name = songCol >= 0 ? String(row[songCol] || "").trim() : String(trackName).trim();
    const streams = parseCount(row[streamsCol]);
    const date = dateCol >= 0 ? normalizeDate(row[dateCol]) : today;
    if (!name || streams == null || !date) { skipped++; continue; }
    if (!entriesByTrack.has(name)) entriesByTrack.set(name, []);
    // No date column = the Songs table: totals for the export's timeframe.
    // Only all-time exports are truly cumulative, but diffing successive
    // imports is correct either way as long as the user keeps the same
    // timeframe ("Since 2015" recommended).
    entriesByTrack.get(name).push(dateCol >= 0 ? { date, streams } : { date, total_streams: streams });
  }
  if (!entriesByTrack.size) {
    throw Object.assign(new Error("No usable rows found in that CSV."), { status: 400 });
  }

  let rowsImported = 0;
  for (const [name, entries] of entriesByTrack) {
    const track = await upsertSpotifyTrack(artistId, name);
    if (!track) continue;
    await saveTrackStreams(track.id, entries);
    rowsImported += entries.length;
  }
  return {
    imported: true,
    mode: dateCol >= 0 ? "timeline" : "totals",
    tracks: entriesByTrack.size,
    rows: rowsImported,
    skipped
  };
}

// Per-track daily-stream series for the songs chart. Daily values come from
// timeline rows directly; where only cumulative totals exist, the diff between
// consecutive totals lands on the later date.
async function buildTrackSeries(artistId, days, startMs) {
  const startDate = isoDate(new Date(startMs));
  const [tracks, streams] = await Promise.all([
    listSpotifyTracks(artistId),
    getTrackStreamSeries(artistId, startDate)
  ]);
  if (!tracks.length) return [];

  const rowsByTrack = new Map();
  for (const row of streams.rows) {
    if (!rowsByTrack.has(row.track_id)) rowsByTrack.set(row.track_id, []);
    rowsByTrack.get(row.track_id).push(row);
  }
  const baselineByTrack = new Map(streams.baseline.map((row) => [row.track_id, row]));

  return tracks.map((track) => {
    const perDay = new Array(days).fill(null);
    let prevTotal = baselineByTrack.get(track.id)?.total_streams ?? null;
    for (const row of rowsByTrack.get(track.id) || []) {
      const idx = Math.round((new Date(`${row.stream_date}T00:00:00`).getTime() - startMs) / 86400000);
      const inWindow = idx >= 0 && idx < days;
      if (inWindow && row.streams != null) perDay[idx] = Number(row.streams);
      if (row.total_streams != null) {
        const total = Number(row.total_streams);
        if (inWindow && perDay[idx] == null && prevTotal != null && total >= prevTotal) {
          perDay[idx] = total - prevTotal;
        }
        prevTotal = total;
      }
    }
    const total = perDay.reduce((sum, v) => sum + (v || 0), 0);
    return { id: track.id, name: track.name, image_url: track.image_url, perDay, total };
  });
}

// --- Overview assembly (GET /api/spotify/overview) ---------------------------

// Per-artist daily series of ABSOLUTE values (null = no snapshot that day, so
// charts break the line instead of plunging to zero), plus the latest snapshot
// before the window as the delta baseline.
export async function getSpotifyOverview(days) {
  const startMs = axisStartMs(days);
  const startDate = isoDate(new Date(startMs));
  const [artists, snapshots] = await Promise.all([
    listSpotifyArtists(),
    getSpotifySnapshotSeries(startDate)
  ]);

  const seriesByArtist = new Map();
  const emptySeries = () => ({
    followers: new Array(days).fill(null),
    monthly_listeners: new Array(days).fill(null),
    popularity: new Array(days).fill(null)
  });
  for (const row of snapshots.rows) {
    const idx = Math.round((new Date(`${row.snapshot_date}T00:00:00`).getTime() - startMs) / 86400000);
    if (idx < 0 || idx >= days) continue;
    if (!seriesByArtist.has(row.artist_id)) seriesByArtist.set(row.artist_id, emptySeries());
    const s = seriesByArtist.get(row.artist_id);
    if (row.followers != null) s.followers[idx] = Number(row.followers);
    if (row.monthly_listeners != null) s.monthly_listeners[idx] = Number(row.monthly_listeners);
    if (row.popularity != null) s.popularity[idx] = Number(row.popularity);
  }

  const baselineByArtist = new Map(snapshots.baseline.map((row) => [row.artist_id, {
    followers: row.followers != null ? Number(row.followers) : null,
    monthly_listeners: row.monthly_listeners != null ? Number(row.monthly_listeners) : null,
    popularity: row.popularity != null ? Number(row.popularity) : null
  }]));

  const trackSeries = await Promise.all(artists.map((artist) => buildTrackSeries(artist.id, days, startMs)));

  return {
    days,
    start: startDate,
    configured: isSpotifyConfigured(),
    artists: artists.map((artist, i) => ({
      ...artist,
      series: seriesByArtist.get(artist.id) || emptySeries(),
      baseline: baselineByArtist.get(artist.id) || null,
      tracks: trackSeries[i]
    }))
  };
}
