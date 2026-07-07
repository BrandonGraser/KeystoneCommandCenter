// The entire HTTP API, shared verbatim by both deployments:
//   - server.mjs (local/Docker) wraps this with static file serving
//   - api/index.js (Vercel) wraps this as a serverless function
// Add new routes HERE — never in the wrappers — so the two can't drift.

import {
  addTaskImage,
  addTaskLink,
  archiveTask,
  bringCanvasNoteToFront,
  chatMessageCounts,
  createCanvasNote,
  createChatMessage,
  createResourceItem,
  createTask,
  createTaskMessage,
  createTikTokAccount,
  deleteCanvasNote,
  deleteChatMessage,
  deleteDailyNote,
  deleteResourceItem,
  deleteTask,
  deleteTaskImage,
  deleteTaskLink,
  deleteTaskMessage,
  deleteTikTokAccount,
  disconnectAccountTikTok,
  duplicateTask,
  getBootstrap,
  getStoryboardWorkspace,
  getTask,
  listAccountVideos,
  listCanvasNotes,
  listDailyNotes,
  listResourceItems,
  listTaskImages,
  listTaskMessages,
  listTasks,
  listTikTokAccounts,
  listTopVideos,
  restoreTask,
  saveAccountTikTokTokens,
  saveDailyNote,
  saveStoryboardWorkspace,
  updateCanvasNote,
  updateTask,
  updateTaskLink,
  updateTikTokAccount
} from "./db.mjs";
import { getMetricsOverview, normalizeWindow, syncAllAccounts, syncOneAccount } from "./sync.mjs";
import { importWorkbook } from "./importer.mjs";
import { sendRingNotification, sendTaskDoneNotification } from "./notifications.mjs";
import { cleanText, validateLinkPayload } from "./validators.mjs";
import { axisStartMs } from "./metrics.mjs";
import { buildAuthUrl, buildOAuthErrorHtml, exchangeCode, isTikTokConfigured } from "./tiktok.mjs";
import { fetchArtist, getSpotifyOverview, isSpotifyConfigured, parseArtistId, scrapeArtistPage, syncAllSpotifyArtists, syncSpotifyArtist } from "./spotify.mjs";
import { getChartexOverview, syncAllChartexArtists, syncChartexArtist } from "./chartex.mjs";
import { createChartexArtist, createSpotifyArtist, deleteChartexArtist, deleteSpotifyArtist } from "./db.mjs";
import { buildAuthCookie, verifyCredentials } from "./auth.mjs";

export async function handleApi(request, response, url, currentUser) {
  const method = request.method || "GET";

  if (url.pathname === "/api/login" && method === "POST") {
    await handleLogin(request, response);
    return;
  }

  if (method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(response, 200, { ...await getBootstrap(), user: currentUser });
    return;
  }

  // Combined polling endpoint: one request replaces the old bootstrap +
  // tasks + resources + per-channel chat fetches the client fired every tick.
  if (method === "GET" && url.pathname === "/api/sync") {
    const [bootstrap, tasks, resources, chatCounts] = await Promise.all([
      getBootstrap(),
      listTasks(Object.fromEntries(url.searchParams.entries())),
      listResourceItems(),
      chatMessageCounts()
    ]);
    sendJson(response, 200, { counts: bootstrap.counts, tasks, resources, chatCounts });
    return;
  }

  if (url.pathname === "/api/resources" && method === "GET") {
    sendJson(response, 200, { resources: await listResourceItems() });
    return;
  }

  if (url.pathname === "/api/resources" && method === "POST") {
    const body = await readJson(request);
    const title = cleanText(body.title);
    if (!title) throw badRequest("A resource title is required.");
    sendJson(response, 201, {
      resource: await createResourceItem({
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
    sendJson(response, 200, await deleteResourceItem(Number(resourceMatch[1])));
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
    const task = taskId ? await getTask(taskId) : null;
    if (taskId && !task) throw badRequest("Attached task was not found.");
    sendJson(response, 200, {
      notification: await sendRingNotification({ description, urgency, task })
    });
    return;
  }

  if (url.pathname === "/api/tasks" && method === "GET") {
    sendJson(response, 200, {
      tasks: await listTasks(Object.fromEntries(url.searchParams.entries()))
    });
    return;
  }

  if (url.pathname === "/api/tasks" && method === "POST") {
    const body = await readJson(request);
    const task = await createTask(body);
    const notification = task.done ? await notifyTaskDone(task) : null;
    sendJson(response, 201, { task, notification });
    return;
  }

  const messageMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/messages$/);
  if (messageMatch && method === "GET") {
    sendJson(response, 200, { messages: await listTaskMessages(Number(messageMatch[1])) });
    return;
  }
  if (messageMatch && method === "POST") {
    const body = await readJson(request);
    const message = await createTaskMessage(Number(messageMatch[1]), {
      author: cleanText(body.author) || "Me",
      body: body.body,
      image: body.image
    });
    sendJson(response, 201, { message, messages: await listTaskMessages(Number(messageMatch[1])) });
    return;
  }

  const messageItemMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/messages\/(\d+)$/);
  if (messageItemMatch && method === "DELETE") {
    const deleted = await deleteTaskMessage(Number(messageItemMatch[1]), Number(messageItemMatch[2]));
    if (!deleted) throw notFound("Message not found.");
    sendJson(response, 200, { messages: await listTaskMessages(Number(messageItemMatch[1])) });
    return;
  }

  const imagesMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/images$/);
  if (imagesMatch && method === "GET") {
    sendJson(response, 200, { images: await listTaskImages(Number(imagesMatch[1])) });
    return;
  }
  if (imagesMatch && method === "POST") {
    const body = await readJson(request);
    sendJson(response, 201, { images: await addTaskImage(Number(imagesMatch[1]), body.image) });
    return;
  }
  const imageItemMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/images\/(\d+)$/);
  if (imageItemMatch && method === "DELETE") {
    sendJson(response, 200, { images: await deleteTaskImage(Number(imageItemMatch[1]), Number(imageItemMatch[2])) });
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  const duplicateMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/duplicate$/);
  const restoreMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/restore$/);
  const deleteMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/delete$/);
  if (deleteMatch && method === "DELETE") {
    sendJson(response, 200, await deleteTask(Number(deleteMatch[1])));
    return;
  }
  if (duplicateMatch && method === "POST") {
    const task = await duplicateTask(Number(duplicateMatch[1]));
    if (!task) throw notFound("Task not found.");
    sendJson(response, 201, { task });
    return;
  }
  if (restoreMatch && method === "POST") {
    const restored = await restoreTask(Number(restoreMatch[1]));
    if (!restored.task) throw notFound("Task not found.");
    sendJson(response, 200, restored);
    return;
  }

  if (taskMatch && method === "PATCH") {
    const taskId = Number(taskMatch[1]);
    const before = await getTask(taskId);
    const task = await updateTask(taskId, await readJson(request));
    if (!task) throw notFound("Task not found.");
    const notification = !before?.done && task.done ? await notifyTaskDone(task) : null;
    sendJson(response, 200, { task, notification });
    return;
  }
  if (taskMatch && method === "DELETE") {
    sendJson(response, 200, await archiveTask(Number(taskMatch[1])));
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
    // Spotify + Chartex piggyback on the same daily cron; their failures
    // never block the TikTok sync (or each other).
    let spotify = null;
    try {
      spotify = (await syncAllSpotifyArtists()).results;
    } catch (error) {
      spotify = [{ ok: false, reason: error.message }];
    }
    let chartex = null;
    try {
      chartex = (await syncAllChartexArtists()).results;
    } catch (error) {
      chartex = [{ ok: false, reason: error.message }];
    }
    sendJson(response, 200, { ok: true, synced: result.results.length, results: result.results, spotify, chartex });
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
    sendJson(response, 200, { account: await disconnectAccountTikTok(Number(tiktokDisconnect[1])) });
    return;
  }

  // --- Canvas notes (Notes tab) -------------------------------------------
  if (url.pathname === "/api/canvas-notes" && method === "GET") {
    sendJson(response, 200, { notes: await listCanvasNotes() });
    return;
  }
  if (url.pathname === "/api/canvas-notes" && method === "POST") {
    sendJson(response, 201, { note: await createCanvasNote(await readJson(request)) });
    return;
  }
  const canvasNoteMatch = url.pathname.match(/^\/api\/canvas-notes\/(\d+)$/);
  if (canvasNoteMatch && method === "PATCH") {
    const note = await updateCanvasNote(Number(canvasNoteMatch[1]), await readJson(request));
    if (!note) throw notFound("Note not found.");
    sendJson(response, 200, { note });
    return;
  }
  if (canvasNoteMatch && method === "DELETE") {
    sendJson(response, 200, await deleteCanvasNote(Number(canvasNoteMatch[1])));
    return;
  }
  const canvasFrontMatch = url.pathname.match(/^\/api\/canvas-notes\/(\d+)\/front$/);
  if (canvasFrontMatch && method === "POST") {
    const note = await bringCanvasNoteToFront(Number(canvasFrontMatch[1]));
    if (!note) throw notFound("Note not found.");
    sendJson(response, 200, { note });
    return;
  }

  // --- Storyboard workspace (Notes tab) -----------------------------------
  if (url.pathname === "/api/storyboard" && method === "GET") {
    const row = await getStoryboardWorkspace();
    sendJson(response, 200, { data: row.data, version: row.version });
    return;
  }
  if (url.pathname === "/api/storyboard" && method === "PUT") {
    const body = await readJson(request);
    const result = await saveStoryboardWorkspace(
      typeof body.data === "string" ? body.data : JSON.stringify(body.data),
      typeof body.version === "number" ? body.version : undefined
    );
    if (result.conflict) {
      sendJson(response, 409, { conflict: true, serverVersion: result.serverVersion });
    } else {
      sendJson(response, 200, { version: result.version });
    }
    return;
  }
  if (url.pathname === "/api/storyboard/version" && method === "GET") {
    const row = await getStoryboardWorkspace();
    sendJson(response, 200, { version: row.version });
    return;
  }

  // --- TikTok accounts ---------------------------------------------------
  if (url.pathname === "/api/tiktok-accounts" && method === "GET") {
    sendJson(response, 200, { accounts: await listTikTokAccounts() });
    return;
  }
  if (url.pathname === "/api/tiktok-accounts" && method === "POST") {
    const account = await createTikTokAccount(await readJson(request));
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
  const accountVideosMatch = url.pathname.match(/^\/api\/tiktok-accounts\/(\d+)\/videos$/);
  if (accountVideosMatch && method === "GET") {
    sendJson(response, 200, {
      videos: await listAccountVideos(Number(accountVideosMatch[1]), {
        sinceUnix: sinceUnixParam(url),
        sort: url.searchParams.get("sort") || "views",
        limit: url.searchParams.get("limit") || 20
      })
    });
    return;
  }
  const accountMatch = url.pathname.match(/^\/api\/tiktok-accounts\/(\d+)$/);
  if (accountMatch && method === "PATCH") {
    const account = await updateTikTokAccount(Number(accountMatch[1]), await readJson(request));
    if (!account) throw notFound("Account not found.");
    sendJson(response, 200, { account });
    return;
  }
  if (accountMatch && method === "DELETE") {
    sendJson(response, 200, await deleteTikTokAccount(Number(accountMatch[1])));
    return;
  }

  // --- Spotify artist stats ------------------------------------------------
  if (url.pathname === "/api/spotify/overview" && method === "GET") {
    sendJson(response, 200, await getSpotifyOverview(normalizeWindow(url.searchParams.get("days"))));
    return;
  }
  if (url.pathname === "/api/spotify/artists" && method === "POST") {
    const body = await readJson(request);
    const spotifyId = parseArtistId(body.input || body.spotify_id || body.url);
    if (!spotifyId) throw badRequest("Paste a Spotify artist link, URI, or ID.");
    // Grab the real name up front when the API is available so the card isn't blank.
    let name = cleanText(body.name);
    if (!name && isSpotifyConfigured()) {
      name = (await fetchArtist(spotifyId).catch(() => null))?.name || "";
    }
    const artist = await createSpotifyArtist({ spotify_id: spotifyId, name });
    try { await syncSpotifyArtist(artist.id); } catch { /* stats fill on next sync */ }
    sendJson(response, 201, { artist });
    return;
  }
  const spotifyArtistMatch = url.pathname.match(/^\/api\/spotify\/artists\/(\d+)$/);
  if (spotifyArtistMatch && method === "DELETE") {
    sendJson(response, 200, await deleteSpotifyArtist(Number(spotifyArtistMatch[1])));
    return;
  }
  const spotifySyncMatch = url.pathname.match(/^\/api\/spotify\/artists\/(\d+)\/sync$/);
  if (spotifySyncMatch && method === "POST") {
    sendJson(response, 200, await syncSpotifyArtist(Number(spotifySyncMatch[1])));
    return;
  }
  if (url.pathname === "/api/spotify/sync" && method === "POST") {
    sendJson(response, 200, await syncAllSpotifyArtists());
    return;
  }

  // --- Chartex artist/song stats --------------------------------------------
  if (url.pathname === "/api/chartex/overview" && method === "GET") {
    sendJson(response, 200, await getChartexOverview(normalizeWindow(url.searchParams.get("days"))));
    return;
  }
  if (url.pathname === "/api/chartex/artists" && method === "POST") {
    const body = await readJson(request);
    const spotifyId = parseArtistId(body.input || body.spotify_id || body.url);
    if (!spotifyId) throw badRequest("Paste a Spotify artist link, URI, or ID.");
    // Chartex matches artists by name search + Spotify id, so grab the name
    // from the public artist page up front.
    let name = cleanText(body.name);
    if (!name) name = (await scrapeArtistPage(spotifyId)).name || "";
    if (!name) throw badRequest("Could not resolve the artist's name — add it in the `name` field.");
    const artist = await createChartexArtist({ spotify_id: spotifyId, name });
    try { await syncChartexArtist(artist.id); } catch { /* stats fill on next sync */ }
    sendJson(response, 201, { artist });
    return;
  }
  const chartexArtistMatch = url.pathname.match(/^\/api\/chartex\/artists\/(\d+)$/);
  if (chartexArtistMatch && method === "DELETE") {
    sendJson(response, 200, await deleteChartexArtist(Number(chartexArtistMatch[1])));
    return;
  }
  const chartexSyncMatch = url.pathname.match(/^\/api\/chartex\/artists\/(\d+)\/sync$/);
  if (chartexSyncMatch && method === "POST") {
    sendJson(response, 200, await syncChartexArtist(Number(chartexSyncMatch[1])));
    return;
  }
  if (url.pathname === "/api/chartex/sync" && method === "POST") {
    sendJson(response, 200, await syncAllChartexArtists());
    return;
  }

  // --- Metrics -------------------------------------------------------------
  if (url.pathname === "/api/metrics/overview" && method === "GET") {
    sendJson(response, 200, await getMetricsOverview(normalizeWindow(url.searchParams.get("days"))));
    return;
  }
  if (url.pathname === "/api/videos/top" && method === "GET") {
    sendJson(response, 200, {
      videos: await listTopVideos({
        sinceUnix: sinceUnixParam(url),
        sort: url.searchParams.get("sort") || "views",
        limit: url.searchParams.get("limit") || 20
      })
    });
    return;
  }

  if (url.pathname === "/api/task-links" && method === "POST") {
    const body = await readJson(request);
    const link = validateLinkPayload(body);
    if (!body.task_id || !link) throw badRequest("A task id and link label or URL are required.");
    sendJson(response, 201, { link: await addTaskLink({ task_id: body.task_id, ...link }) });
    return;
  }

  const linkMatch = url.pathname.match(/^\/api\/task-links\/(\d+)$/);
  if (linkMatch && method === "PATCH") {
    const link = validateLinkPayload(await readJson(request));
    if (!link) throw badRequest("A link label or URL is required.");
    sendJson(response, 200, { link: await updateTaskLink(Number(linkMatch[1]), link) });
    return;
  }
  if (linkMatch && method === "DELETE") {
    sendJson(response, 200, await deleteTaskLink(Number(linkMatch[1])));
    return;
  }

  if (url.pathname === "/api/daily-notes" && method === "GET") {
    sendJson(response, 200, { notes: await listDailyNotes(url.searchParams.get("date")) });
    return;
  }

  const dailyNoteMatch = url.pathname.match(/^\/api\/daily-notes\/(\d+)$/);
  if (dailyNoteMatch && method === "DELETE") {
    sendJson(response, 200, await deleteDailyNote(Number(dailyNoteMatch[1])));
    return;
  }

  if (url.pathname === "/api/daily-notes" && (method === "POST" || method === "PATCH")) {
    const body = await readJson(request);
    const note_date = cleanText(body.note_date) || new Date().toISOString().slice(0, 10);
    const bodyText = cleanText(body.body);
    if (!bodyText) throw badRequest("Daily note body is required.");
    sendJson(response, 200, {
      note: await saveDailyNote({
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
    const summary = await importWorkbook(upload.buffer, upload.filename || "tasks.xlsx");
    sendJson(response, 200, { summary });
    return;
  }

  // --- Chat (sidebar messaging) -------------------------------------------
  const chatMatch = url.pathname.match(/^\/api\/chat\/([^/]+)\/messages$/);
  if (chatMatch && method === "GET") {
    const channel = decodeURIComponent(chatMatch[1]);
    sendJson(response, 200, { messages: await listChatMessages(channel) });
    return;
  }
  if (chatMatch && method === "POST") {
    const channel = decodeURIComponent(chatMatch[1]);
    const body = await readJson(request);
    const message = await createChatMessage({ channel, author: currentUser, body: cleanText(body.body) });
    sendJson(response, 201, { message, messages: await listChatMessages(channel) });
    return;
  }
  const chatDeleteMatch = url.pathname.match(/^\/api\/chat\/messages\/(\d+)$/);
  if (chatDeleteMatch && method === "DELETE") {
    sendJson(response, 200, await deleteChatMessage(Number(chatDeleteMatch[1])));
    return;
  }

  throw notFound("Route not found.");
}

// `days` query param → unix-seconds cutoff. "all" (or 0) means no cutoff.
function sinceUnixParam(url) {
  const raw = url.searchParams.get("days");
  if (!raw || raw === "all" || raw === "0") return 0;
  const days = Math.max(1, Math.min(365, Number(raw) || 14));
  return Math.floor(axisStartMs(days) / 1000);
}

async function handleLogin(request, response) {
  const body = await readJson(request);
  const username = verifyCredentials(body?.username, body?.password);
  if (!username) {
    sendJson(response, 401, { error: "Incorrect password." });
    return;
  }
  const secure = (request.headers["x-forwarded-proto"] || "").includes("https");
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": await buildAuthCookie({ username, secure })
  });
  response.end(JSON.stringify({ ok: true }));
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
    await saveAccountTikTokTokens(accountId, token);
    try { await syncOneAccount(Number(accountId)); } catch { /* numbers will fill on next sync */ }

    response.writeHead(302, { Location: "/?tiktok=connected" });
    response.end();
  } catch (err) {
    sendHtml(response, 200, buildOAuthErrorHtml(err.message));
  }
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

// --- HTTP helpers ------------------------------------------------------------

export async function readJson(request) {
  // Vercel's Node helpers may have already consumed the stream and parsed the body.
  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};
    if (Buffer.isBuffer(request.body)) {
      const text = request.body.toString("utf8");
      return text ? JSON.parse(text) : {};
    }
    return request.body;
  }
  const text = (await readBody(request)).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export async function readBody(request, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw badRequest("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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

export function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

export function sendHtml(response, status, html) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

export function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}
