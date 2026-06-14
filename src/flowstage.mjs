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

// Returns an ISO date (YYYY-MM-DD) for the furthest-out scheduled, not-yet-posted
// post — the date the account is queued *through* — or null if it has no scheduled
// content at all. A date in the past means the account is out of content. We do
// NOT bound the lower date, so a past "scheduled through" surfaces as out-of-content
// rather than being hidden. Throws (status-tagged) on config/network errors.
export async function getScheduledThrough(flowstageAccountId) {
  if (!flowstageAccountId) {
    const error = new Error("This account has no FlowStage account linked.");
    error.status = 400;
    throw error;
  }
  const data = await flowstageGet(
    `/v1/social-accounts/${encodeURIComponent(flowstageAccountId)}/posts?include_posted=false`
  );
  return latestScheduledDate(data.posts || []);
}

function latestScheduledDate(posts) {
  let latest = null;
  for (const post of posts) {
    if (post?.is_posted) continue;
    const raw = post?.time_scheduled;
    if (!raw) continue;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date > latest) latest = date;
  }
  return latest ? isoDate(latest) : null;
}
