// Pure helpers for building daily metric series. No I/O here — the sync
// pipeline (src/sync.mjs) feeds these from the DB or the TikTok API.

// Engagement window used for the per-account summary stats (views/likes/…
// shown on each account row) and their previous-window deltas.
export const METRICS_WINDOW_DAYS = 14;

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Start-of-day timestamp for an axis of `days` calendar days ending today.
// With no offset, days are server-local (UTC on Vercel). Pass the client's
// UTC offset in minutes (-new Date().getTimezoneOffset()) to get the axis in
// the viewer's calendar days instead — otherwise evening posts in the US land
// on the next UTC day and per-day post counts come out as 1-then-3.
export function axisStartMs(days, tzOffsetMin = null) {
  if (tzOffsetMin == null) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    return start.getTime();
  }
  const offsetMs = tzOffsetMin * 60000;
  const localMidnight = Math.floor((Date.now() + offsetMs) / 86400000) * 86400000;
  return localMidnight - offsetMs - (days - 1) * 86400000;
}

// --- Legacy per-sync daily blob (metrics_daily on the account row) ----------
// Buckets a video's CURRENT totals onto its post date. Still used for the
// 14-day mini-charts on each account card.

export function newDailySeries(days = METRICS_WINDOW_DAYS) {
  return {
    startMs: axisStartMs(days),
    days,
    views: new Array(days).fill(0),
    likes: new Array(days).fill(0),
    comments: new Array(days).fill(0),
    posts: new Array(days).fill(0)
  };
}

export function addToDaily(series, timeMs, views, likes, comments) {
  const idx = Math.floor((timeMs - series.startMs) / 86400000);
  if (idx >= 0 && idx < series.days) {
    series.views[idx] += views;
    series.likes[idx] += likes;
    series.comments[idx] += comments;
    series.posts[idx] += 1;
  }
}

export function serializeDaily(series) {
  return {
    start: isoDate(new Date(series.startMs)),
    views: series.views,
    likes: series.likes,
    comments: series.comments,
    posts: series.posts
  };
}

// --- Series builders for the overview endpoint ------------------------------

function blankSeries(days, withFollowers) {
  const zero = () => new Array(days).fill(0);
  const series = { views: zero(), likes: zero(), comments: zero(), shares: zero(), posts: zero() };
  if (withFollowers) series.followers = new Array(days).fill(null);
  return series;
}

function dayIndex(ms, startMs, days) {
  const idx = Math.floor((ms - startMs) / 86400000);
  return idx >= 0 && idx < days ? idx : -1;
}

// "By post date": each stored video's current totals land on the day it was
// posted. Works for any window because video rows accumulate forever.
// `startMs` sets the day boundaries (pass a client-offset axis so posts land
// on the viewer's calendar days). Returns Map<accountId, series>.
export function buildPostedSeries(videoRows, days, startMs = axisStartMs(days)) {
  const byAccount = new Map();
  for (const v of videoRows) {
    const idx = dayIndex((Number(v.create_time) || 0) * 1000, startMs, days);
    if (idx < 0) continue;
    let series = byAccount.get(v.account_id);
    if (!series) {
      series = blankSeries(days, false);
      byAccount.set(v.account_id, series);
    }
    series.views[idx] += Number(v.views) || 0;
    series.likes[idx] += Number(v.likes) || 0;
    series.comments[idx] += Number(v.comments) || 0;
    series.shares[idx] += Number(v.shares) || 0;
    series.posts[idx] += 1;
  }
  return byAccount;
}

// "Daily gained": difference consecutive cumulative snapshots. A day's value
// is the growth since the previous snapshot (attributed to the later day when
// syncs were skipped). Followers are absolute counts, not deltas — null on
// days with no snapshot so charts can skip the gap.
// Returns Map<accountId, series>.
export function buildGrowthSeries(snapshotRows, baselineRows, days) {
  const startMs = axisStartMs(days);
  const prevByAccount = new Map();
  for (const b of baselineRows) prevByAccount.set(b.account_id, b);

  const byAccount = new Map();
  for (const snap of snapshotRows) {
    const idx = dayIndex(new Date(`${snap.snapshot_date}T00:00:00`).getTime(), startMs, days);
    const prev = prevByAccount.get(snap.account_id);
    prevByAccount.set(snap.account_id, snap);
    if (idx < 0) continue;
    let series = byAccount.get(snap.account_id);
    if (!series) {
      series = blankSeries(days, true);
      byAccount.set(snap.account_id, series);
    }
    if (prev) {
      series.views[idx] += Math.max(0, (Number(snap.views) || 0) - (Number(prev.views) || 0));
      series.likes[idx] += Math.max(0, (Number(snap.likes) || 0) - (Number(prev.likes) || 0));
      series.comments[idx] += Math.max(0, (Number(snap.comments) || 0) - (Number(prev.comments) || 0));
      series.shares[idx] += Math.max(0, (Number(snap.shares) || 0) - (Number(prev.shares) || 0));
      series.posts[idx] += Math.max(0, (Number(snap.video_count) || 0) - (Number(prev.video_count) || 0));
    }
    if (snap.follower_count != null) series.followers[idx] = Number(snap.follower_count);
  }
  return byAccount;
}
