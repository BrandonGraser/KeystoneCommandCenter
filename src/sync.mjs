// TikTok account sync + metrics assembly, shared by the local server and the
// Vercel handler so both deployments run the identical pipeline.
//
// Each sync of a connected account:
//   1. pulls its recent videos and profile stats from TikTok,
//   2. upserts per-video rows (tiktok_videos) so history accumulates forever,
//   3. writes today's cumulative snapshot (tiktok_account_snapshots) — raw
//      totals, so daily growth is a query-time diff that bad syncs can't corrupt,
//   4. refreshes the 14-day summary stats shown on the account row.

import {
  countAccountVideos,
  getAccountTokens,
  getSnapshotSeries,
  getTikTokAccount,
  listTikTokAccounts,
  listVideosSince,
  saveAccountSnapshot,
  saveAccountTikTokTokens,
  setAccountProfileStats,
  setAccountSync,
  upsertAccountVideos
} from "./db.mjs";
import { aggregateWindows, getUserInfo, listVideos, refreshToken } from "./tiktok.mjs";
import { METRICS_WINDOW_DAYS, axisStartMs, buildGrowthSeries, buildPostedSeries, isoDate } from "./metrics.mjs";

async function freshAccessToken(accountId) {
  const tok = await getAccountTokens(accountId);
  if (!tok.tiktok_access_token) throw Object.assign(new Error("TikTok not connected."), { status: 400 });
  const expiresAt = tok.tiktok_token_expires_at ? Date.parse(tok.tiktok_token_expires_at) : 0;
  if (expiresAt && expiresAt > Date.now() + 60000) return tok.tiktok_access_token;
  const refreshed = await refreshToken(tok.tiktok_refresh_token);
  await saveAccountTikTokTokens(accountId, refreshed);
  return refreshed.access_token;
}

export async function syncOneAccount(id) {
  const account = await getTikTokAccount(id);
  if (!account) throw Object.assign(new Error("Account not found."), { status: 404 });

  if (!account.tiktok_connected) {
    return { account: await setAccountSync(id, { metrics: null, metricsSource: null }) };
  }

  const accessToken = await freshAccessToken(id);
  // Deep fetch (200 videos) only on an account's first sync to backfill
  // history; after that 40 recent videos per sync keeps TikTok's API quota
  // happy — that's where the stats actually move.
  const stored = await countAccountVideos(id);
  const videos = await listVideos(accessToken, { maxPages: stored > 0 ? 2 : 10 });
  // Profile stats need the user.info.stats scope; tolerate tokens that predate it.
  const userInfo = await getUserInfo(accessToken).catch(() => null);

  await upsertAccountVideos(id, videos);
  if (userInfo) await setAccountProfileStats(id, userInfo);
  await saveAccountSnapshot(id, {
    follower_count: userInfo?.follower_count ?? null,
    following_count: userInfo?.following_count ?? null,
    profile_likes: userInfo?.likes_count ?? null
  });

  const metrics = aggregateWindows(videos, METRICS_WINDOW_DAYS);
  return { account: await setAccountSync(id, { metrics, metricsSource: "tiktok" }) };
}

export function isRateLimitError(error) {
  return /rate_limit/i.test(error?.code || "") || /rate_limit_exceeded/i.test(error?.message || "");
}

// Sync all accounts sequentially (used by the daily cron). Stops at the first
// rate-limit error — once TikTok says no, every further call just burns more
// quota to fail.
export async function syncAllAccounts() {
  const accounts = await listTikTokAccounts();
  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    try {
      const r = await syncOneAccount(account.id);
      results.push({ id: account.id, ok: true, through: r.account.runout_date });
    } catch (error) {
      results.push({ id: account.id, ok: false, reason: error.message });
      if (isRateLimitError(error)) {
        for (const rest of accounts.slice(i + 1)) {
          results.push({ id: rest.id, ok: false, reason: "Skipped: TikTok rate limit hit." });
        }
        break;
      }
    }
  }
  return { accounts: await listTikTokAccounts(), results };
}

// --- Overview assembly (GET /api/metrics/overview) --------------------------

const ALLOWED_WINDOWS = [14, 30, 90];

export function normalizeWindow(value) {
  const days = Number(value) || METRICS_WINDOW_DAYS;
  return ALLOWED_WINDOWS.includes(days) ? days : METRICS_WINDOW_DAYS;
}

// Per-account daily series for the overall chart, both attributions:
//   posted — video totals bucketed on post date (available immediately)
//   growth — snapshot-to-snapshot gains + absolute follower counts
// `tzOffsetMin` (client's UTC offset, minutes) aligns the posted-series day
// boundaries to the viewer's calendar days; snapshots keep the server axis
// because their dates were recorded server-side.
export async function getMetricsOverview(days, tzOffsetMin = null) {
  const startMs = axisStartMs(days, tzOffsetMin);
  const startDate = isoDate(new Date(axisStartMs(days)));
  const [accounts, videoRows, snapshots] = await Promise.all([
    listTikTokAccounts(),
    listVideosSince(Math.floor(startMs / 1000)),
    getSnapshotSeries(startDate)
  ]);

  const posted = buildPostedSeries(videoRows, days, startMs);
  const growth = buildGrowthSeries(snapshots.rows, snapshots.baseline, days);

  return {
    days,
    start: startDate,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      group_name: account.group_name || null,
      follower_count: account.follower_count ?? null,
      posted: posted.get(account.id) || legacyPostedSeries(account, days, startMs),
      growth: growth.get(account.id) || null
    }))
  };
}

// Accounts that haven't synced since per-video storage shipped still have the
// old 14-day metrics_daily blob — realign it onto the requested axis so the
// chart isn't empty before their first new-style sync.
function legacyPostedSeries(account, days, startMs) {
  let daily = null;
  try { daily = JSON.parse(account.metrics_daily); } catch { /* none stored */ }
  if (!daily || !Array.isArray(daily.views)) return null;
  const zero = () => new Array(days).fill(0);
  const series = { views: zero(), likes: zero(), comments: zero(), shares: zero(), posts: zero() };
  const blobStart = new Date(`${daily.start}T00:00:00`).getTime();
  let any = false;
  for (let j = 0; j < daily.views.length; j++) {
    const idx = Math.round((blobStart + j * 86400000 - startMs) / 86400000);
    if (idx < 0 || idx >= days) continue;
    series.views[idx] += Number(daily.views[j]) || 0;
    series.likes[idx] += Number(daily.likes?.[j]) || 0;
    series.comments[idx] += Number(daily.comments?.[j]) || 0;
    series.posts[idx] += Number(daily.posts?.[j]) || 0;
    any = true;
  }
  return any ? series : null;
}
