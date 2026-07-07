// Spotify helpers still used by the Chartex tab (the standalone Spotify tab
// was removed 2026-07-07 — Chartex supplies all the same stats and more).

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

// Browser UAs get the JS-only web-player shell, but crawler UAs get server-
// rendered og: meta tags — name, image, and "N monthly listeners" in the
// description (verified 2026-07-07). Used to resolve an artist's name when
// adding them to Chartex tracking, which matches artists by name search.
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
