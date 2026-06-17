import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import "./src/env.mjs";
import {
  addTaskImage,
  addTaskLink,
  archiveTask,
  createTaskMessage,
  createTask,
  createTikTokAccount,
  disconnectAccountTikTok,
  getAccountTokens,
  saveAccountTikTokTokens,
  deleteDailyNote,
  deleteTask,
  deleteTikTokAccount,
  deleteTaskImage,
  deleteTaskLink,
  deleteTaskMessage,
  deleteResourceItem,
  deleteCanvasNote,
  duplicateTask,
  getBootstrap,
  getTask,
  listCanvasNotes,
  createCanvasNote,
  updateCanvasNote,
  bringCanvasNoteToFront,
  listDailyNotes,
  listResourceItems,
  listTaskImages,
  listTaskMessages,
  listTasks,
  listTikTokAccounts,
  createResourceItem,
  restoreTask,
  saveDailyNote,
  saveAccountSnapshot,
  getAccountSnapshots,
  setAccountSync,
  updateTask,
  updateTaskLink,
  updateTikTokAccount,
  getTikTokAccount
} from "./src/db.mjs";
import { importWorkbook } from "./src/importer.mjs";
import { sendRingNotification, sendTaskDoneNotification } from "./src/notifications.mjs";
import { cleanText, validateLinkPayload } from "./src/validators.mjs";
import { getAccountStats, listSocialAccounts, newDailySeries, serializeDaily, METRICS_WINDOW_DAYS } from "./src/flowstage.mjs";
import { aggregateWindows, buildAuthUrl, buildProbeHtml, exchangeCode, isTikTokConfigured, listVideos, refreshToken } from "./src/tiktok.mjs";
import { buildAuthCookie, isAuthed, verifyPassword, LOGIN_PATH } from "./src/auth.mjs";

const PORT = Number(process.env.PORT || 4242);
const PUBLIC_DIR = join(process.cwd(), "public");

const PUBLIC_PATHS = new Set([LOGIN_PATH, "/api/login", "/healthz", "/api/cron/sync-accounts"]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/login" && (request.method || "GET") === "POST") {
      await handleLogin(request, response);
      return;
    }

    if (!PUBLIC_PATHS.has(url.pathname) && !(await isAuthed(request.headers.cookie || ""))) {
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 401, { error: "Not authorized." });
      } else {
        response.writeHead(302, { Location: LOGIN_PATH });
        response.end();
      }
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, error.status || 500, {
      error: error.message || "Something went wrong."
    });
  }
});

server.listen(PORT, () => {
  console.log(`Keystone Task Command Center running at http://localhost:${PORT}`);
});

async function handleApi(request, response, url) {
  const method = request.method || "GET";

  if (method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(response, 200, getBootstrap());
    return;
  }

  if (url.pathname === "/api/resources" && method === "GET") {
    sendJson(response, 200, { resources: listResourceItems() });
    return;
  }

  if (url.pathname === "/api/resources" && method === "POST") {
    const body = await readJson(request);
    const title = cleanText(body.title);
    if (!title) throw badRequest("A resource title is required.");
    sendJson(response, 201, {
      resource: createResourceItem({
        section: cleanText(body.section),
        title,
        url: cleanText(body.url),
        note: cleanText(body.note),
        username: cleanText(body.username),
        password: cleanText(body.password)
      })
    });
    return;
  }

  const resourceMatch = url.pathname.match(/^\/api\/resources\/(\d+)$/);
  if (resourceMatch && method === "DELETE") {
    sendJson(response, 200, deleteResourceItem(Number(resourceMatch[1])));
    return;
  }

  if (url.pathname === "/api/ring" && method === "POST") {
    const body = await readJson(request);
    const description = cleanText(body.description);
    const urgency = cleanText(body.urgency);
    if (!description) throw badRequest("A ring description is required.");
    if (!["urgent", "today", "whenever"].includes(urgency)) {
      throw badRequest("Choose urgent, today, or whenever.");
    }
    const taskId = Number(body.task_id || 0);
    const task = taskId ? getTask(taskId) : null;
    if (taskId && !task) throw badRequest("Attached task was not found.");
    sendJson(response, 200, {
      notification: await sendRingNotification({ description, urgency, task })
    });
    return;
  }

  if (url.pathname === "/api/tasks" && method === "GET") {
    sendJson(response, 200, {
      tasks: listTasks(Object.fromEntries(url.searchParams.entries()))
    });
    return;
  }

  if (url.pathname === "/api/tasks" && method === "POST") {
    const body = await readJson(request);
    const task = createTask(body);
    const notification = task.done ? await notifyTaskDone(task) : null;
    sendJson(response, 201, { task, notification });
    return;
  }

  const messageMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/messages$/);
  if (messageMatch && method === "GET") {
    sendJson(response, 200, { messages: listTaskMessages(Number(messageMatch[1])) });
    return;
  }
  if (messageMatch && method === "POST") {
    const body = await readJson(request);
    const message = createTaskMessage(Number(messageMatch[1]), {
      author: cleanText(body.author) || "Me",
      body: body.body,
      image: body.image
    });
    sendJson(response, 201, { message, messages: listTaskMessages(Number(messageMatch[1])) });
    return;
  }

  const messageItemMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/messages\/(\d+)$/);
  if (messageItemMatch && method === "DELETE") {
    const deleted = deleteTaskMessage(Number(messageItemMatch[1]), Number(messageItemMatch[2]));
    if (!deleted) throw notFound("Message not found.");
    sendJson(response, 200, { messages: listTaskMessages(Number(messageItemMatch[1])) });
    return;
  }

  const imagesMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/images$/);
  if (imagesMatch && method === "GET") {
    sendJson(response, 200, { images: listTaskImages(Number(imagesMatch[1])) });
    return;
  }
  if (imagesMatch && method === "POST") {
    const body = await readJson(request);
    sendJson(response, 201, { images: addTaskImage(Number(imagesMatch[1]), body.image) });
    return;
  }
  const imageItemMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/images\/(\d+)$/);
  if (imageItemMatch && method === "DELETE") {
    sendJson(response, 200, { images: deleteTaskImage(Number(imageItemMatch[1]), Number(imageItemMatch[2])) });
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  const duplicateMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/duplicate$/);
  const restoreMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/restore$/);
  const deleteMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/delete$/);
  if (deleteMatch && method === "DELETE") {
    sendJson(response, 200, deleteTask(Number(deleteMatch[1])));
    return;
  }
  if (duplicateMatch && method === "POST") {
    const task = duplicateTask(Number(duplicateMatch[1]));
    if (!task) throw notFound("Task not found.");
    sendJson(response, 201, { task });
    return;
  }
  if (restoreMatch && method === "POST") {
    const restored = restoreTask(Number(restoreMatch[1]));
    if (!restored.task) throw notFound("Task not found.");
    sendJson(response, 200, restored);
    return;
  }

  if (taskMatch && method === "PATCH") {
    const taskId = Number(taskMatch[1]);
    const before = getTask(taskId);
    const task = updateTask(taskId, await readJson(request));
    if (!task) throw notFound("Task not found.");
    const notification = !before?.done && task.done ? await notifyTaskDone(task) : null;
    sendJson(response, 200, { task, notification });
    return;
  }
  if (taskMatch && method === "DELETE") {
    sendJson(response, 200, archiveTask(Number(taskMatch[1])));
    return;
  }

  // Scheduled (Vercel Cron) daily resync of all accounts. Protected by
  // CRON_SECRET when set: Vercel sends it as `Authorization: Bearer <secret>`.
  if (url.pathname === "/api/cron/sync-accounts") {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.authorization !== `Bearer ${secret}`) {
      sendJson(response, 401, { error: "Unauthorized." });
      return;
    }
    const result = await syncAllAccounts();
    sendJson(response, 200, { ok: true, synced: result.results.length, results: result.results });
    return;
  }

  // --- TikTok account connection (OAuth) ---------------------------------
  if (url.pathname === "/api/tiktok/connect" && method === "GET") {
    if (!isTikTokConfigured()) {
      sendJson(response, 503, { error: "TikTok is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET." });
      return;
    }
    const accountId = url.searchParams.get("account") || "";
    const state = `${Math.random().toString(36).slice(2)}.${accountId}`;
    response.writeHead(302, { Location: buildAuthUrl(state) });
    response.end();
    return;
  }
  if (url.pathname === "/api/tiktok/callback" && method === "GET") {
    await handleTikTokCallback(response, url);
    return;
  }
  const tiktokDisconnect = url.pathname.match(/^\/api\/tiktok\/disconnect\/(\d+)$/);
  if (tiktokDisconnect && method === "POST") {
    sendJson(response, 200, { account: disconnectAccountTikTok(Number(tiktokDisconnect[1])) });
    return;
  }

  // --- Canvas notes (Notes tab) -------------------------------------------
  if (url.pathname === "/api/canvas-notes" && method === "GET") {
    sendJson(response, 200, { notes: listCanvasNotes() });
    return;
  }
  if (url.pathname === "/api/canvas-notes" && method === "POST") {
    sendJson(response, 201, { note: createCanvasNote(await readJson(request)) });
    return;
  }
  const canvasNoteMatch = url.pathname.match(/^\/api\/canvas-notes\/(\d+)$/);
  if (canvasNoteMatch && method === "PATCH") {
    const note = updateCanvasNote(Number(canvasNoteMatch[1]), await readJson(request));
    if (!note) throw notFound("Note not found.");
    sendJson(response, 200, { note });
    return;
  }
  if (canvasNoteMatch && method === "DELETE") {
    sendJson(response, 200, deleteCanvasNote(Number(canvasNoteMatch[1])));
    return;
  }
  const canvasFrontMatch = url.pathname.match(/^\/api\/canvas-notes\/(\d+)\/front$/);
  if (canvasFrontMatch && method === "POST") {
    const note = bringCanvasNoteToFront(Number(canvasFrontMatch[1]));
    if (!note) throw notFound("Note not found.");
    sendJson(response, 200, { note });
    return;
  }

  // --- TikTok accounts (FlowStage tab) -----------------------------------
  if (url.pathname === "/api/flowstage/social-accounts" && method === "GET") {
    sendJson(response, 200, { accounts: await listSocialAccounts() });
    return;
  }
  if (url.pathname === "/api/tiktok-accounts" && method === "GET") {
    sendJson(response, 200, { accounts: listTikTokAccounts() });
    return;
  }
  if (url.pathname === "/api/tiktok-accounts" && method === "POST") {
    const account = createTikTokAccount(await readJson(request));
    sendJson(response, 201, { account });
    return;
  }
  if (url.pathname === "/api/tiktok-accounts/sync" && method === "POST") {
    sendJson(response, 200, await syncAllAccounts());
    return;
  }
  const accountSyncMatch = url.pathname.match(/^\/api\/tiktok-accounts\/(\d+)\/sync$/);
  if (accountSyncMatch && method === "POST") {
    sendJson(response, 200, await syncOneAccount(Number(accountSyncMatch[1])));
    return;
  }
  const accountMatch = url.pathname.match(/^\/api\/tiktok-accounts\/(\d+)$/);
  if (accountMatch && method === "PATCH") {
    const account = updateTikTokAccount(Number(accountMatch[1]), await readJson(request));
    if (!account) throw notFound("Account not found.");
    sendJson(response, 200, { account });
    return;
  }
  if (accountMatch && method === "DELETE") {
    sendJson(response, 200, deleteTikTokAccount(Number(accountMatch[1])));
    return;
  }

  if (url.pathname === "/api/task-links" && method === "POST") {
    const body = await readJson(request);
    const link = validateLinkPayload(body);
    if (!body.task_id || !link) throw badRequest("A task id and link label or URL are required.");
    sendJson(response, 201, { link: addTaskLink({ task_id: body.task_id, ...link }) });
    return;
  }

  const linkMatch = url.pathname.match(/^\/api\/task-links\/(\d+)$/);
  if (linkMatch && method === "PATCH") {
    const link = validateLinkPayload(await readJson(request));
    if (!link) throw badRequest("A link label or URL is required.");
    sendJson(response, 200, { link: updateTaskLink(Number(linkMatch[1]), link) });
    return;
  }
  if (linkMatch && method === "DELETE") {
    sendJson(response, 200, deleteTaskLink(Number(linkMatch[1])));
    return;
  }

  if (url.pathname === "/api/daily-notes" && method === "GET") {
    sendJson(response, 200, { notes: listDailyNotes(url.searchParams.get("date")) });
    return;
  }

  const dailyNoteMatch = url.pathname.match(/^\/api\/daily-notes\/(\d+)$/);
  if (dailyNoteMatch && method === "DELETE") {
    sendJson(response, 200, deleteDailyNote(Number(dailyNoteMatch[1])));
    return;
  }

  if (url.pathname === "/api/daily-notes" && (method === "POST" || method === "PATCH")) {
    const body = await readJson(request);
    const note_date = cleanText(body.note_date) || new Date().toISOString().slice(0, 10);
    const bodyText = cleanText(body.body);
    if (!bodyText) throw badRequest("Daily note body is required.");
    sendJson(response, 200, {
      note: saveDailyNote({
        id: body.id,
        note_date,
        assignee: cleanText(body.assignee),
        category: cleanText(body.category) || "Misc.",
        body: bodyText
      })
    });
    return;
  }

  if (url.pathname === "/api/import/xlsx" && method === "POST") {
    const upload = await readMultipartFile(request);
    if (!upload) throw badRequest("Upload an .xlsx file.");
    const summary = importWorkbook(upload.buffer, upload.filename || "tasks.xlsx");
    sendJson(response, 200, { summary });
    return;
  }

  throw notFound("Route not found.");
}

function sendHtml(response, status, html) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

async function handleTikTokCallback(response, url) {
  try {
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (error) throw new Error(`TikTok denied authorization: ${error} ${url.searchParams.get("error_description") || ""}`);
    if (!code) throw new Error("No authorization code returned.");
    const accountId = (url.searchParams.get("state") || "").split(".")[1] || "";
    if (!accountId) throw new Error("Missing account reference in OAuth state.");

    const token = await exchangeCode(code);
    saveAccountTikTokTokens(accountId, token);
    try { await syncOneAccount(Number(accountId)); } catch { /* numbers will fill on next sync */ }

    response.writeHead(302, { Location: "/?tiktok=connected" });
    response.end();
  } catch (err) {
    sendHtml(response, 200, buildProbeHtml({ error: err.message }));
  }
}

async function tiktokMetricsForAccount(accountId) {
  const tok = getAccountTokens(accountId);
  if (!tok.tiktok_access_token) throw new Error("TikTok not connected.");
  let accessToken = tok.tiktok_access_token;
  const expiresAt = tok.tiktok_token_expires_at ? Date.parse(tok.tiktok_token_expires_at) : 0;
  if (!expiresAt || expiresAt <= Date.now() + 60000) {
    const refreshed = await refreshToken(tok.tiktok_refresh_token);
    saveAccountTikTokTokens(accountId, refreshed);
    accessToken = refreshed.access_token;
  }
  const videos = await listVideos(accessToken);
  return aggregateWindows(videos, 14);
}

// Runout always comes from FlowStage; engagement from TikTok when connected.
async function syncOneAccount(id) {
  const account = getTikTokAccount(id);
  if (!account) throw notFound("Account not found.");
  let scheduledThrough = null;
  let fsMetrics = null;
  if (account.flowstage_account_id) {
    const fs = await getAccountStats(account.flowstage_account_id);
    scheduledThrough = fs.scheduledThrough;
    fsMetrics = fs.metrics;
  }
  let metrics = null;
  let metricsSource = null;
  if (account.tiktok_connected) {
    metrics = await tiktokMetricsForAccount(id);
    metricsSource = "tiktok";
  } else if (fsMetrics) {
    metrics = fsMetrics;
    metricsSource = "flowstage";
  }
  if (metrics && metrics.allTime) {
    const today = new Date().toISOString().slice(0, 10);
    saveAccountSnapshot(id, today, metrics.allTime);
    const lookback = new Date();
    lookback.setDate(lookback.getDate() - METRICS_WINDOW_DAYS);
    const startDate = lookback.toISOString().slice(0, 10);
    const snapshots = getAccountSnapshots(id, startDate);
    if (snapshots.length >= 2) {
      const daily = newDailySeries();
      const snapMap = Object.fromEntries(snapshots.map((s) => [s.snapshot_date, s]));
      for (let i = 0; i < daily.days; i++) {
        const date = new Date(daily.startMs + i * 86400000).toISOString().slice(0, 10);
        const prevDate = new Date(daily.startMs + (i - 1) * 86400000).toISOString().slice(0, 10);
        const snap = snapMap[date];
        const prevSnap = snapMap[prevDate];
        if (snap && prevSnap) {
          daily.views[i] = Math.max(0, snap.total_views - prevSnap.total_views);
          daily.likes[i] = Math.max(0, snap.total_likes - prevSnap.total_likes);
          daily.comments[i] = Math.max(0, snap.total_comments - prevSnap.total_comments);
        }
      }
      const originalPosts = metrics.daily?.posts;
      if (originalPosts) daily.posts = originalPosts.slice();
      metrics.daily = serializeDaily(daily);
    }
  }
  return { account: setAccountSync(id, { scheduledThrough, metrics, metricsSource }) };
}

async function syncAllAccounts() {
  const accounts = listTikTokAccounts();
  const results = [];
  for (const account of accounts) {
    try {
      const r = await syncOneAccount(account.id);
      results.push({ id: account.id, ok: true, through: r.account.runout_date });
    } catch (error) {
      results.push({ id: account.id, ok: false, reason: error.message });
    }
  }
  return { accounts: listTikTokAccounts(), results };
}

async function notifyTaskDone(task) {
  try {
    return await sendTaskDoneNotification(task);
  } catch (error) {
    return {
      sent: false,
      channels: [],
      results: [{ channel: "notification", sent: false, reason: error.message }],
      message: "Task completed, but the ping could not be sent."
    };
  }
}

async function serveStatic(response, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const target = normalize(join(PUBLIC_DIR, cleanPath));
  if (!target.startsWith(PUBLIC_DIR) || !existsSync(target)) {
    sendText(response, 404, "Not found");
    return;
  }
  const body = await readFile(target);
  response.writeHead(200, { "Content-Type": contentType(target) });
  response.end(body);
}

function contentType(path) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[extname(path)] || "application/octet-stream";
}

async function readJson(request) {
  const text = (await readBody(request)).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function readMultipartFile(request) {
  const contentTypeHeader = request.headers["content-type"] || "";
  const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw badRequest("Expected multipart upload.");
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readBody(request, 30 * 1024 * 1024);
  let start = body.indexOf(boundary);

  while (start >= 0) {
    const next = body.indexOf(boundary, start + boundary.length);
    if (next < 0) break;
    const part = body.slice(start + boundary.length + 2, next - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd > -1) {
      const headers = part.slice(0, headerEnd).toString("utf8");
      const data = part.slice(headerEnd + 4);
      const disposition = headers.match(/Content-Disposition:.*name="([^"]+)".*filename="([^"]*)"/i);
      if (disposition) {
        return { name: disposition[1], filename: disposition[2], buffer: data };
      }
    }
    start = next;
  }
  return null;
}

async function readBody(request, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw badRequest("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

async function handleLogin(request, response) {
  const body = await readJson(request);
  if (!verifyPassword(body?.password)) {
    sendJson(response, 401, { error: "Incorrect password." });
    return;
  }
  const secure = (request.headers["x-forwarded-proto"] || "").includes("https");
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": await buildAuthCookie({ secure })
  });
  response.end(JSON.stringify({ ok: true }));
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}
