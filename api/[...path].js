import {
  addTaskLink,
  archiveTask,
  createTask,
  createTaskMessage,
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
} from "../src/db-async.mjs";
import { sendRingNotification, sendTaskDoneNotification } from "../src/notifications.mjs";
import { cleanText, validateLinkPayload } from "../src/validators.mjs";

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    await handleApi(req, res, url);
  } catch (error) {
    res.writeHead(error.status || 500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message || "Something went wrong." }));
  }
}

async function handleApi(request, response, url) {
  const method = request.method || "GET";

  if (method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(response, 200, await getBootstrap());
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
    if (!["urgent", "today", "whenever"].includes(urgency)) throw badRequest("Choose urgent, today, or whenever.");
    const taskId = Number(body.task_id || 0);
    const task = taskId ? await getTask(taskId) : null;
    if (taskId && !task) throw badRequest("Attached task was not found.");
    sendJson(response, 200, { notification: await sendRingNotification({ description, urgency, task }) });
    return;
  }

  if (url.pathname === "/api/tasks" && method === "GET") {
    sendJson(response, 200, { tasks: await listTasks(Object.fromEntries(url.searchParams.entries())) });
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
      body: cleanText(body.body)
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
    sendJson(response, 501, { error: "XLSX import is not available on this deployment." });
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

async function readJson(request) {
  const text = (await readBody(request)).toString("utf8");
  return text ? JSON.parse(text) : {};
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
