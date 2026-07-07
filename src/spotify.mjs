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
  listSpotifyArtists,
  saveSpotifyArtistSync,
  saveSpotifySnapshot
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

// The artist EMBED page (open.spotify.com/embed/artist/<id>) server-renders a
// __NEXT_DATA__ blob containing the artist's "popular tracks" list — the same
// ranking the API's top-tracks endpoint returns, which is 403-blocked for
// Development-Mode apps. No playcounts or popularity scores, but the ordered
// list itself. Best-effort, like the monthly-listeners scrape.
export async function scrapeTopTracks(spotifyId) {
  try {
    const response = await fetch(`https://open.spotify.com/embed/artist/${encodeURIComponent(spotifyId)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "en"
      }
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return null;
    const list = JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity?.trackList;
    if (!Array.isArray(list) || !list.length) return null;
    const tracks = list.map((t) => {
      const id = String(t.uri || "").split(":").pop() || null;
      return {
        id,
        name: t.title || "",
        artists: t.subtitle || "",
        duration_ms: Number(t.duration) || null,
        popularity: null,
        album: "",
        release_date: null,
        image_url: null,
        spotify_url: id ? `https://open.spotify.com/track/${id}` : null
      };
    });
    // The trackList carries no artwork; the public oEmbed endpoint hands out
    // each track's album art without credentials.
    await Promise.all(tracks.map(async (t) => {
      if (t.id) t.image_url = await fetchTrackThumbnail(t.id);
    }));
    return tracks;
  } catch {
    return null;
  }
}

async function fetchTrackThumbnail(trackId) {
  try {
    const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${trackId}`)}`);
    if (!response.ok) return null;
    return (await response.json()).thumbnail_url || null;
  } catch {
    return null;
  }
}

// --- Sync --------------------------------------------------------------------

export async function syncSpotifyArtist(id) {
  const artist = await getSpotifyArtist(id);
  if (!artist) throw Object.assign(new Error("Spotify artist not found."), { status: 404 });

  // The official API adds followers/popularity/genres — but only for apps
  // with Extended Access; Development-Mode apps get those fields stripped
  // (200s without the data) and 403s on top-tracks. Everything the tab needs
  // day-to-day comes from the page scrapes below, so API problems are not
  // sync errors.
  const errors = [];
  let api = null;
  let topTracks = null;
  if (isSpotifyConfigured()) {
    [api, topTracks] = await Promise.all([
      fetchArtist(artist.spotify_id).catch(() => null),
      fetchTopTracks(artist.spotify_id).catch(() => null)
    ]);
  }

  const page = await scrapeArtistPage(artist.spotify_id);
  const monthlyListeners = page.monthly_listeners;
  if (monthlyListeners == null) errors.push("Monthly listeners could not be read from the public artist page.");

  if (!api && monthlyListeners == null) {
    throw Object.assign(new Error(errors.join(" ")), { status: 502 });
  }

  // Development-Mode API apps get artist objects with the stats fields
  // stripped (200s, no followers/popularity) and 403s on top-tracks — fall
  // back to the embed-page scrape for the tracks list in that case.
  if (!topTracks?.length) topTracks = await scrapeTopTracks(artist.spotify_id);

  // `?? undefined` throughout: a stripped or failed source must never
  // overwrite previously captured values with nulls.
  const updated = await saveSpotifyArtistSync(id, {
    name: api?.name || page.name || undefined,
    image_url: api?.image_url || page.image_url || undefined,
    genres: api?.genres?.length ? JSON.stringify(api.genres) : undefined,
    spotify_url: api?.spotify_url,
    followers: api?.followers ?? undefined,
    monthly_listeners: monthlyListeners ?? undefined,
    top_tracks: topTracks?.length ? JSON.stringify(topTracks) : undefined,
    sync_error: errors.length ? errors.join(" ") : null
  });
  await saveSpotifySnapshot(id, {
    followers: api?.followers ?? null,
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
    monthly_listeners: new Array(days).fill(null)
  });
  for (const row of snapshots.rows) {
    const idx = Math.round((new Date(`${row.snapshot_date}T00:00:00`).getTime() - startMs) / 86400000);
    if (idx < 0 || idx >= days) continue;
    if (!seriesByArtist.has(row.artist_id)) seriesByArtist.set(row.artist_id, emptySeries());
    const s = seriesByArtist.get(row.artist_id);
    if (row.followers != null) s.followers[idx] = Number(row.followers);
    if (row.monthly_listeners != null) s.monthly_listeners[idx] = Number(row.monthly_listeners);
  }

  const baselineByArtist = new Map(snapshots.baseline.map((row) => [row.artist_id, {
    followers: row.followers != null ? Number(row.followers) : null,
    monthly_listeners: row.monthly_listeners != null ? Number(row.monthly_listeners) : null
  }]));

  return {
    days,
    start: startDate,
    configured: isSpotifyConfigured(),
    artists: artists.map((artist) => ({
      ...artist,
      series: seriesByArtist.get(artist.id) || emptySeries(),
      baseline: baselineByArtist.get(artist.id) || null
    }))
  };
}
