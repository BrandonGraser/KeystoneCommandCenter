// FlowStage API client.
//
// Used by the Accounts tab to (a) list the team's connected FlowStage social
// accounts so a row can be linked by picking from a dropdown, and (b) figure out
// the date each account is scheduled with content *through* — the furthest-future
// scheduled (un-posted) post — so we can show how many days of content remain.
//
// API ref: https://api.theflowstage.com  — auth via the `X-API-Key` header.
// The key is read from the environment and NEVER hardcoded (public repo). Set
// FLOWSTAGE_API_KEY locally in `.env.local` and in the Vercel project env vars.

const FLOWSTAGE_API_KEY = process.env.FLOWSTAGE_API_KEY || "";
const FLOWSTAGE_BASE_URL = (process.env.FLOWSTAGE_BASE_URL || "https://api.theflowstage.com").replace(/\/$/, "");

// Engagement metrics are summed over posts published within this trailing window.
export const METRICS_WINDOW_DAYS = 14;

export function isFlowStageConfigured() {
  return Boolean(FLOWSTAGE_API_KEY);
}

function notConfigured() {
  const error = new Error(
    "FlowStage API key is not set. Add FLOWSTAGE_API_KEY (locally in .env.local, and in the Vercel project env vars) to enable sync. Until then, use the manual “Scheduled through” date."
  );
  error.status = 503;
  return error;
}

async function flowstageGet(path) {
  if (!isFlowStageConfigured()) throw notConfigured();
  let response;
  try {
    response = await fetch(`${FLOWSTAGE_BASE_URL}${path}`, {
      headers: { "X-API-Key": FLOWSTAGE_API_KEY, Accept: "application/json" }
    });
  } catch (cause) {
    const error = new Error(`Could not reach FlowStage: ${cause.message}`);
    error.status = 502;
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail || `FlowStage returned ${response.status}.`;
    const error = new Error(detail);
    error.status = response.status === 401 ? 401 : 502;
    throw error;
  }
  return response.json();
}

// Returns the team's connected social accounts so a row can be linked to one.
// Each entry: { id, platform, handle }.
export async function listSocialAccounts() {
  const data = await flowstageGet("/v1/social-accounts");
  return (data.accounts || []).map((account) => ({
    id: account.id,
    platform: account.platform,
    handle: account.handle
  }));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// One call returns everything we need for an account:
//   - scheduledThrough: ISO date of the furthest-out un-posted post (the date the
//     account is queued through; null if nothing scheduled; a past date = out of
//     content). We do NOT bound the lower date so a past date isn't hidden.
//   - metrics: summed views/likes/comments/shares + postCount across posts
//     published within the trailing METRICS_WINDOW_DAYS window.
// Throws (status-tagged) on config/network errors.
export async function getAccountStats(flowstageAccountId) {
  if (!flowstageAccountId) {
    const error = new Error("This account has no FlowStage account linked.");
    error.status = 400;
    throw error;
  }
  const data = await flowstageGet(
    `/v1/social-accounts/${encodeURIComponent(flowstageAccountId)}/posts?include_posted=true`
  );
  const posts = data.posts || [];

  const now = Date.now();
  const cutCurrent = now - METRICS_WINDOW_DAYS * 86400000;        // last 14 days
  const cutPrevious = now - 2 * METRICS_WINDOW_DAYS * 86400000;   // the 14 days before that

  const blank = () => ({ views: 0, likes: 0, comments: 0, shares: 0, postCount: 0 });
  const current = blank();
  const previous = blank();
  let latest = null;

  for (const post of posts) {
    if (post?.is_posted) {
      const when = post.time_posted || post.time_scheduled;
      const t = when ? new Date(when).getTime() : NaN;
      if (Number.isNaN(t)) continue;
      const bucket = t >= cutCurrent ? current : (t >= cutPrevious ? previous : null);
      if (!bucket) continue;
      bucket.postCount += 1;
      bucket.views += Number(post.views) || 0;
      bucket.likes += Number(post.likes) || 0;
      bucket.comments += Number(post.comments) || 0;
      bucket.shares += Number(post.shares) || 0;
    } else {
      const date = post?.time_scheduled ? new Date(post.time_scheduled) : null;
      if (date && !Number.isNaN(date.getTime()) && (!latest || date > latest)) latest = date;
    }
  }
  const metrics = { ...current, windowDays: METRICS_WINDOW_DAYS, prev: previous };
  return { scheduledThrough: latest ? isoDate(latest) : null, metrics };
}
