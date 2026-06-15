// Minimal TikTok Display API client — a one-account accuracy probe to compare
// TikTok's own numbers against FlowStage's. NOT a full integration: just enough
// to authorize one sandbox test user and read their videos' real stats.
//
// Credentials come from the environment (never hardcoded). On Vercel set:
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
//   TIKTOK_REDIRECT_URI (optional; defaults to the deployed callback)
//
// Docs: https://developers.tiktok.com/doc/login-kit-web and /display-api.

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || "https://keystone-command-center.vercel.app/api/tiktok/callback";
const SCOPES = "user.info.basic,video.list";

const VIDEO_FIELDS = "id,create_time,view_count,like_count,comment_count,share_count";

export function isTikTokConfigured() {
  return Boolean(CLIENT_KEY && CLIENT_SECRET);
}

export function getRedirectUri() {
  return REDIRECT_URI;
}

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    state
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

// Exchange the auth code for an access token.
export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI
  });
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  }
  return data; // { access_token, refresh_token, expires_in, open_id, scope, ... }
}

// Refresh an expired access token. TikTok may rotate the refresh token too.
export async function refreshToken(refresh_token) {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token
  });
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }
  return data;
}

// Page through the user's videos and return them with their real stats.
export async function listVideos(accessToken, { maxPages = 6 } = {}) {
  const videos = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const payload = { max_count: 20 };
    if (cursor) payload.cursor = cursor;
    const response = await fetch(
      `https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(VIDEO_FIELDS)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error?.code !== "ok") {
      // Surface TikTok's error so we can see exactly what's wrong.
      throw new Error(`video.list failed: ${JSON.stringify(data.error || data)}`);
    }
    for (const v of data.data?.videos || []) videos.push(v);
    if (!data.data?.has_more) break;
    cursor = data.data.cursor;
  }
  return videos;
}

// Render the comparison page (or an error). Self-contained HTML, dark theme.
export function buildProbeHtml({ tiktok, flowstage, postCount, error } = {}) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (n) => (Number(n) || 0).toLocaleString("en-US");
  let inner;
  if (error) {
    inner = `<h1>TikTok probe — error</h1><p class="err">Something went wrong:</p><pre>${esc(error)}</pre>
      <p class="muted">If this is a field/scope error, that tells us exactly what to adjust.</p>`;
  } else {
    const row = (label, t, f) => {
      const diff = f ? (((Number(t) - Number(f)) / Number(f)) * 100).toFixed(1) + "%" : "—";
      return `<tr><td>${label}</td><td class="n">${num(t)}</td><td class="n">${flowstage ? num(f) : "—"}</td><td class="n">${flowstage ? diff : "—"}</td></tr>`;
    };
    inner = `
      <h1>TikTok vs FlowStage — last 14 days</h1>
      <p class="muted">${num(postCount)} video(s) in the window, straight from TikTok's Display API.</p>
      <table>
        <thead><tr><th></th><th>TikTok (real)</th><th>FlowStage</th><th>Δ vs FlowStage</th></tr></thead>
        <tbody>
          ${row("Views", tiktok.views, flowstage?.views)}
          ${row("Likes", tiktok.likes, flowstage?.likes)}
          ${row("Comments", tiktok.comments, flowstage?.comments)}
          ${row("Shares", tiktok.shares, flowstage?.shares)}
          ${row("Posts", postCount, flowstage?.postCount)}
        </tbody>
      </table>
      ${flowstage ? "" : `<p class="muted">No FlowStage account id passed — showing TikTok only. Compare against the account's card.</p>`}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>TikTok probe</title>
    <style>
      body{background:#0a0a0a;color:#e6e6e6;font-family:ui-monospace,Menlo,Consolas,monospace;margin:0;padding:40px;}
      .card{max-width:620px;margin:0 auto;border:1px solid #262626;background:#0e0e0e;padding:24px;}
      h1{font-size:15px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 14px;}
      table{width:100%;border-collapse:collapse;margin:12px 0;}
      th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #262626;font-size:13px;}
      th{color:#8d8d8d;font-size:10px;letter-spacing:.1em;text-transform:uppercase;}
      td.n{text-align:right;}
      .muted{color:#8d8d8d;font-size:12px;}
      .err{color:#e05c5c;}
      pre{background:#000;border:1px solid #3f3f3f;padding:10px;overflow:auto;font-size:11px;color:#d8b54a;white-space:pre-wrap;}
      a{color:#6aa0ff;}
    </style></head>
    <body><div class="card">${inner}<p style="margin-top:18px"><a href="/">← Back to app</a></p></div></body></html>`;
}

// Sum stats into the last `days` window and the `days` window before it, so the
// UI can show period-over-period deltas. create_time is unix seconds.
export function aggregateWindows(videos, days = 14) {
  const now = Date.now() / 1000;
  const cutCurrent = now - days * 86400;
  const cutPrevious = now - 2 * days * 86400;
  const blank = () => ({ views: 0, likes: 0, comments: 0, shares: 0, postCount: 0 });
  const current = blank();
  const previous = blank();
  for (const v of videos) {
    const t = Number(v.create_time) || 0;
    const bucket = t >= cutCurrent ? current : (t >= cutPrevious ? previous : null);
    if (!bucket) continue;
    bucket.postCount += 1;
    bucket.views += Number(v.view_count) || 0;
    bucket.likes += Number(v.like_count) || 0;
    bucket.comments += Number(v.comment_count) || 0;
    bucket.shares += Number(v.share_count) || 0;
  }
  return { ...current, windowDays: days, prev: previous };
}
