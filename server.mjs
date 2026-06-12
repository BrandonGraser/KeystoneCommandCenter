import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import "./src/env.mjs";
import {
  addTaskLink,
  archiveTask,
  createTaskMessage,
  createTask,
  deleteDailyNote,
  deleteTask,
  deleteTaskLink,
  deleteTaskMessage,
  deleteResourceItem,
  duplicateTask,
  getBootstrap,
  getTask,
  listDailyNotes,
  listResourceItems,
  listTaskMessages,
  listTasks,
  createResourceItem,
  restoreTask,
  saveDailyNote,
  updateTask,
  updateTaskLink
} from "./src/db.mjs";
import { importWorkbook } from "./src/importer.mjs";
import { sendRingNotification, sendTaskDoneNotification } from "./src/notifications.mjs";
import { cleanText, validateLinkPayload } from "./src/validators.mjs";

const PORT = Number(process.env.PORT || 4242);
const PUBLIC_DIR = join(process.cwd(), "public");
const APP_USERNAME = process.env.APP_USERNAME || "keystone";
const APP_PASSWORD = process.env.APP_PASSWORD || "";

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (!isAuthorized(request)) {
      requestAuth(response);
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
      body: cleanText(body.body)
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

function isAuthorized(request) {
  if (!APP_PASSWORD) return true;
  const header = request.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Basic" || !token) return false;

  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const username = separator >= 0 ? decoded.slice(0, separator) : "";
    const password = separator >= 0 ? decoded.slice(separator + 1) : "";
    return username === APP_USERNAME && password === APP_PASSWORD;
  } catch {
    return false;
  }
}

function requestAuth(response) {
  response.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Keystone Tasks", charset="UTF-8"'
  });
  response.end("Sign in to Keystone Tasks.");
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
