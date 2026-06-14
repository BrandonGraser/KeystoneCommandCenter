// FlowStage API client.
//
// Goal: given a FlowStage account id, return the date that account is scheduled
// with content *through* (the latest scheduled post's date), so the Accounts tab
// can show how many days of content remain before it runs dry.
//
// The API key is read from the environment and is NEVER hardcoded here (this is a
// public repo). Set FLOWSTAGE_API_KEY locally in `.env` and in the Vercel project.
//
// !! STILL NEEDED to go live: FlowStage's base URL and the endpoint that lists a
//    given account's scheduled posts, plus the response shape. Fill in the two
//    constants + the parsing below once those docs are provided. Until then the
//    client reports a clean "not configured" error and the manual "scheduled
//    through" date on each account drives the runout countdown.

const FLOWSTAGE_API_KEY = process.env.FLOWSTAGE_API_KEY || "";

// TODO(flowstage-docs): set these from FlowStage's API documentation.
const FLOWSTAGE_BASE_URL = process.env.FLOWSTAGE_BASE_URL || ""; // e.g. "https://api.theflowstage.com"
// Endpoint template for an account's scheduled posts. `{accountId}` is replaced.
const SCHEDULED_POSTS_PATH = process.env.FLOWSTAGE_SCHEDULED_PATH || ""; // e.g. "/v1/accounts/{accountId}/scheduled-posts"

export function isFlowStageConfigured() {
  return Boolean(FLOWSTAGE_API_KEY && FLOWSTAGE_BASE_URL && SCHEDULED_POSTS_PATH);
}

function notConfigured() {
  const error = new Error(
    "FlowStage API is not fully configured yet. Set FLOWSTAGE_API_KEY, FLOWSTAGE_BASE_URL, and the scheduled-posts endpoint. Until then, use the manual “Scheduled through” date."
  );
  error.status = 503;
  return error;
}

// Returns an ISO date (YYYY-MM-DD) for the furthest-out scheduled post, or null
// if the account has no scheduled content. Throws (status-tagged) on config or
// network errors so callers can surface a clean message.
export async function getScheduledThrough(flowstageAccountId) {
  if (!flowstageAccountId) {
    const error = new Error("This account has no FlowStage account id set.");
    error.status = 400;
    throw error;
  }
  if (!isFlowStageConfigured()) throw notConfigured();

  const url =
    FLOWSTAGE_BASE_URL.replace(/\/$/, "") +
    SCHEDULED_POSTS_PATH.replace("{accountId}", encodeURIComponent(flowstageAccountId));

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${FLOWSTAGE_API_KEY}`,
        Accept: "application/json"
      }
    });
  } catch (cause) {
    const error = new Error(`Could not reach FlowStage: ${cause.message}`);
    error.status = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`FlowStage returned ${response.status} for this account.`);
    error.status = 502;
    throw error;
  }

  const data = await response.json().catch(() => null);
  return latestScheduledDate(data);
}

// Pulls the latest scheduled datetime out of a FlowStage response. The exact
// shape is unknown until the docs land, so this is defensive: it scans for
// common field names and returns the max date found.
function latestScheduledDate(data) {
  if (!data) return null;
  const posts = Array.isArray(data) ? data : data.posts || data.data || data.scheduled || [];
  let latest = null;
  for (const post of posts) {
    const raw =
      post?.scheduled_at || post?.scheduledAt || post?.publish_at ||
      post?.publishAt || post?.date || post?.scheduled_for;
    if (!raw) continue;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date > latest) latest = date;
  }
  return latest ? latest.toISOString().slice(0, 10) : null;
}
