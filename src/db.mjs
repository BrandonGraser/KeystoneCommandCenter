import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ASSIGNEES, DAILY_CATEGORIES, STATUSES, validateTaskPayload } from "./validators.mjs";

const DB_PATH = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : join(process.cwd(), "data", "tasks.sqlite");
let db;

export function getDb() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  seedAssignees(db);
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS assignees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      imported_rows INTEGER NOT NULL DEFAULT 0,
      skipped_rows INTEGER NOT NULL DEFAULT 0,
      task_rows INTEGER NOT NULL DEFAULT 0,
      daily_note_rows INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignee TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT,
      project TEXT,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'BRB',
      done INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      stamp_at TEXT,
      source_filename TEXT,
      source_tab TEXT,
      source_row INTEGER,
      import_id INTEGER,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (import_id) REFERENCES imports(id)
    );

    CREATE TABLE IF NOT EXISTS task_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      person TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_workflow_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_date TEXT NOT NULL,
      assignee TEXT,
      category TEXT,
      body TEXT NOT NULL,
      source_filename TEXT,
      source_tab TEXT,
      source_row INTEGER,
      import_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (import_id) REFERENCES imports(id)
    );

    CREATE TABLE IF NOT EXISTS resource_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      note TEXT,
      username TEXT,
      password TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks (assignee);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks (archived);
    CREATE INDEX IF NOT EXISTS idx_links_task ON task_links (task_id);
    CREATE INDEX IF NOT EXISTS idx_notes_task ON task_notes (task_id);
    CREATE INDEX IF NOT EXISTS idx_messages_task ON task_messages (task_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_task ON task_workflow_steps (task_id);
    CREATE INDEX IF NOT EXISTS idx_resource_items_section ON resource_items (section, sort_order);
  `);

  const dailyColumns = database.prepare("PRAGMA table_info(daily_notes)").all();
  if (!dailyColumns.some((column) => column.name === "category")) {
    database.exec("ALTER TABLE daily_notes ADD COLUMN category TEXT;");
  }
  const taskColumns = database.prepare("PRAGMA table_info(tasks)").all();
  if (!taskColumns.some((column) => column.name === "category")) {
    database.exec("ALTER TABLE tasks ADD COLUMN category TEXT;");
  }
  if (!taskColumns.some((column) => column.name === "archived_at")) {
    database.exec("ALTER TABLE tasks ADD COLUMN archived_at TEXT;");
  }
  const resourceColumns = database.prepare("PRAGMA table_info(resource_items)").all();
  if (!resourceColumns.some((column) => column.name === "username")) {
    database.exec("ALTER TABLE resource_items ADD COLUMN username TEXT;");
  }
  if (!resourceColumns.some((column) => column.name === "password")) {
    database.exec("ALTER TABLE resource_items ADD COLUMN password TEXT;");
  }
  database.exec("UPDATE tasks SET status = 'BRB' WHERE status = 'Unsorted';");
  database.exec("UPDATE tasks SET status = 'Not Started' WHERE status = 'Misc.';");
  database.exec("UPDATE tasks SET due_date = NULL WHERE status = 'BRB';");
  database.exec("UPDATE tasks SET assignee = 'Tommy' WHERE lower(assignee) = 'ryan';");
  database.exec("UPDATE tasks SET source_tab = NULL WHERE lower(coalesce(source_tab, '')) LIKE '%ryan%';");
  database.exec("UPDATE daily_notes SET assignee = NULL WHERE lower(coalesce(assignee, '')) = 'ryan';");
  database.exec("UPDATE daily_notes SET source_tab = NULL WHERE lower(coalesce(source_tab, '')) LIKE '%ryan%';");
  database.exec("UPDATE task_notes SET person = 'General' WHERE lower(person) = 'ryan';");
  database.exec("UPDATE task_messages SET author = 'Me' WHERE lower(author) = 'ryan';");
  database.exec("DELETE FROM assignees WHERE lower(name) = 'ryan';");
  database.exec("CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks (category);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_daily_notes_category ON daily_notes (category);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks (archived_at);");
  database.exec("UPDATE tasks SET archived_at = coalesce(archived_at, updated_at, datetime('now')) WHERE archived = 1;");
  purgeExpiredArchivedTasks(database);
}

function seedAssignees(database) {
  const insert = database.prepare(
    "INSERT OR IGNORE INTO assignees (name, sort_order) VALUES (?, ?)"
  );
  ASSIGNEES.forEach((name, index) => insert.run(name, index + 1));
}

export function listTasks(filters = {}) {
  const database = getDb();
  purgeExpiredArchivedTasks(database);
  const showArchived = filters.archived === "true";
  const where = showArchived
    ? ["archived = 1", "archived_at >= datetime('now', '-30 days')"]
    : ["archived = 0"];
  const params = [];

  if (filters.assignee && filters.assignee !== "All") {
    where.push("assignee = ?");
    params.push(filters.assignee);
  }
  if (filters.status && filters.status !== "All") {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.done === "true") where.push("done = 1");
  if (filters.done === "false") where.push("done = 0");

  if (filters.due === "overdue") {
    where.push("status != 'BRB' AND due_date IS NOT NULL AND due_date < date('now', 'localtime') AND done = 0");
  } else if (filters.due === "today") {
    where.push("status != 'BRB' AND due_date = date('now', 'localtime')");
  } else if (filters.due === "week") {
    where.push("status != 'BRB' AND due_date IS NOT NULL AND due_date BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+7 days')");
  } else if (filters.due === "none") {
    where.push("(due_date IS NULL OR status = 'BRB')");
  }

  if (filters.search) {
    const search = `%${filters.search.toLowerCase()}%`;
    where.push(`(
      lower(coalesce(title, '')) LIKE ?
      OR lower(coalesce(details, '')) LIKE ?
      OR lower(coalesce(project, '')) LIKE ?
      OR EXISTS (
        SELECT 1 FROM task_links
        WHERE task_links.task_id = tasks.id
        AND (lower(label) LIKE ? OR lower(coalesce(url, '')) LIKE ?)
      )
      OR EXISTS (
        SELECT 1 FROM task_notes
        WHERE task_notes.task_id = tasks.id
        AND (lower(person) LIKE ? OR lower(body) LIKE ?)
      )
    )`);
    params.push(search, search, search, search, search, search, search);
  }

  const rows = database
    .prepare(`
      SELECT * FROM tasks
      WHERE ${where.join(" AND ")}
      ORDER BY done ASC,
        CASE status
          WHEN 'Needs Tommy Review' THEN 1
          WHEN 'Needs Brandon Review' THEN 2
          WHEN 'Working' THEN 3
          WHEN 'Not Started' THEN 4
          WHEN 'Pending' THEN 5
          WHEN 'BRB' THEN 6
          WHEN 'Done' THEN 7
          ELSE 8
        END,
        due_date IS NULL ASC,
        due_date ASC,
        ${showArchived ? "archived_at DESC," : ""}
        updated_at DESC
    `)
    .all(...params);

  return rows.map(hydrateTask);
}

export function getTask(id) {
  const row = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(Number(id));
  return row ? hydrateTask(row) : null;
}

export function createTask(input, meta = {}) {
  const payload = validateTaskPayload(input);
  const database = getDb();
  const result = database
    .prepare(`
      INSERT INTO tasks (
        assignee, title, details, project, category, status, done, due_date, stamp_at,
        source_filename, source_tab, source_row, import_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      payload.assignee,
      payload.title,
      payload.details || null,
      payload.project || null,
      payload.category || "Misc.",
      payload.status,
      payload.done ? 1 : 0,
      payload.due_date || null,
      payload.stamp_at || null,
      meta.source_filename || null,
      meta.source_tab || null,
      meta.source_row || null,
      meta.import_id || null
    );

  const taskId = Number(result.lastInsertRowid);
  replaceLinks(taskId, payload.links || []);
  replaceNotes(taskId, payload.notes || []);
  replaceWorkflowSteps(taskId, payload.workflow_steps || []);
  return getTask(taskId);
}

export function updateTask(id, input) {
  const task = getTask(id);
  if (!task) return null;
  const payload = validateTaskPayload(input, { partial: true });
  const sets = [];
  const params = [];

  for (const field of ["assignee", "title", "details", "project", "category", "status", "due_date", "stamp_at", "archived"]) {
    if (field in payload) {
      sets.push(`${field} = ?`);
      params.push(field === "archived" ? (payload[field] ? 1 : 0) : payload[field]);
      if (field === "archived") {
        sets.push(payload[field] ? "archived_at = coalesce(archived_at, datetime('now'))" : "archived_at = NULL");
      }
    }
  }

  if ("done" in payload) {
    sets.push("done = ?");
    params.push(payload.done ? 1 : 0);
    if (payload.done && !("stamp_at" in payload)) {
      sets.push("stamp_at = coalesce(stamp_at, datetime('now'))");
    }
    if (payload.done && !("status" in payload)) {
      sets.push("status = 'Done'");
    }
    if (!payload.done && task.status === "Done" && !("status" in payload)) {
      sets.push("status = 'Not Started'");
    }
  }

  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    params.push(Number(id));
    getDb().prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  if ("links" in payload) replaceLinks(Number(id), payload.links || []);
  if ("notes" in payload) replaceNotes(Number(id), payload.notes || []);
  if ("workflow_steps" in payload) replaceWorkflowSteps(Number(id), payload.workflow_steps || []);
  return getTask(id);
}

export function archiveTask(id) {
  const database = getDb();
  database
    .prepare("UPDATE tasks SET archived = 1, archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(Number(id));
  return { ok: true, task: getTask(id) };
}

export function deleteTask(id) {
  const database = getDb();
  database.prepare("DELETE FROM tasks WHERE id = ?").run(Number(id));
  return { deleted: true };
}

export function restoreTask(id) {
  const database = getDb();
  database
    .prepare("UPDATE tasks SET archived = 0, archived_at = NULL, updated_at = datetime('now') WHERE id = ?")
    .run(Number(id));
  return { ok: true, task: getTask(id) };
}

export function purgeExpiredArchivedTasks(database = getDb()) {
  database
    .prepare("DELETE FROM tasks WHERE archived = 1 AND archived_at IS NOT NULL AND archived_at < datetime('now', '-30 days')")
    .run();
}

export function duplicateTask(id) {
  const source = getTask(id);
  if (!source) return null;
  const status = source.done || source.status === "Done" ? "Not Started" : source.status;
  return createTask({
    assignee: source.assignee,
    title: `${source.title} (copy)`,
    details: source.details || "",
    project: source.project || "",
    category: source.category || "Misc.",
    status,
    done: false,
    due_date: status === "BRB" ? null : source.due_date || null,
    links: source.links.map((link) => ({
      label: link.label,
      url: link.url || ""
    })),
    notes: source.notes.map((note) => ({
      person: note.person,
      body: note.body
    })),
    workflow_steps: source.workflow_steps.map((step) => ({
      label: step.label
    }))
  });
}

export function replaceLinks(taskId, links) {
  const database = getDb();
  database.prepare("DELETE FROM task_links WHERE task_id = ?").run(taskId);
  const insert = database.prepare(
    "INSERT INTO task_links (task_id, label, url) VALUES (?, ?, ?)"
  );
  links.forEach((link) => insert.run(taskId, link.label, link.url || null));
}

export function replaceNotes(taskId, notes) {
  const database = getDb();
  database.prepare("DELETE FROM task_notes WHERE task_id = ?").run(taskId);
  const insert = database.prepare(
    "INSERT INTO task_notes (task_id, person, body) VALUES (?, ?, ?)"
  );
  notes.forEach((note) => insert.run(taskId, note.person, note.body));
}

export function replaceWorkflowSteps(taskId, steps) {
  const database = getDb();
  database.prepare("DELETE FROM task_workflow_steps WHERE task_id = ?").run(taskId);
  const insert = database.prepare(
    "INSERT INTO task_workflow_steps (task_id, label, sort_order) VALUES (?, ?, ?)"
  );
  steps.forEach((step, index) => insert.run(taskId, step.label, index + 1));
}

export function addTaskLink(input) {
  const database = getDb();
  const result = database
    .prepare("INSERT INTO task_links (task_id, label, url) VALUES (?, ?, ?)")
    .run(Number(input.task_id), input.label, input.url || null);
  return database.prepare("SELECT * FROM task_links WHERE id = ?").get(Number(result.lastInsertRowid));
}

export function updateTaskLink(id, input) {
  getDb()
    .prepare("UPDATE task_links SET label = ?, url = ?, updated_at = datetime('now') WHERE id = ?")
    .run(input.label, input.url || null, Number(id));
  return getDb().prepare("SELECT * FROM task_links WHERE id = ?").get(Number(id));
}

export function deleteTaskLink(id) {
  getDb().prepare("DELETE FROM task_links WHERE id = ?").run(Number(id));
  return { ok: true };
}

export function listTaskMessages(taskId) {
  return getDb()
    .prepare("SELECT * FROM task_messages WHERE task_id = ? ORDER BY created_at ASC, id ASC")
    .all(Number(taskId));
}

export function createTaskMessage(taskId, input) {
  const author = String(input.author || "Me").trim() || "Me";
  const body = String(input.body || "").replace(/\s+/g, " ").trim();
  if (!body) {
    const error = new Error("Message body is required.");
    error.status = 400;
    throw error;
  }
  const task = getTask(taskId);
  if (!task) {
    const error = new Error("Task not found.");
    error.status = 404;
    throw error;
  }
  const result = getDb()
    .prepare("INSERT INTO task_messages (task_id, author, body) VALUES (?, ?, ?)")
    .run(Number(taskId), author, body);
  return getDb()
    .prepare("SELECT * FROM task_messages WHERE id = ?")
    .get(Number(result.lastInsertRowid));
}

export function deleteTaskMessage(taskId, messageId) {
  const database = getDb();
  const existing = database
    .prepare("SELECT * FROM task_messages WHERE id = ? AND task_id = ?")
    .get(Number(messageId), Number(taskId));
  if (!existing) return null;
  database
    .prepare("DELETE FROM task_messages WHERE id = ? AND task_id = ?")
    .run(Number(messageId), Number(taskId));
  return { ok: true };
}

export function listDailyNotes(date) {
  const database = getDb();
  if (date) {
    return database
      .prepare("SELECT * FROM daily_notes WHERE note_date = ? ORDER BY updated_at DESC")
      .all(date);
  }
  return database
    .prepare("SELECT * FROM daily_notes ORDER BY note_date DESC, updated_at DESC LIMIT 200")
    .all();
}

export function saveDailyNote(input) {
  const database = getDb();
  if (input.id) {
    database
      .prepare("UPDATE daily_notes SET note_date = ?, assignee = ?, category = ?, body = ?, updated_at = datetime('now') WHERE id = ?")
      .run(input.note_date, input.assignee || null, input.category || "Misc.", input.body, Number(input.id));
    return database.prepare("SELECT * FROM daily_notes WHERE id = ?").get(Number(input.id));
  }
  const result = database
    .prepare("INSERT INTO daily_notes (note_date, assignee, category, body) VALUES (?, ?, ?, ?)")
    .run(input.note_date, input.assignee || null, input.category || "Misc.", input.body);
  return database.prepare("SELECT * FROM daily_notes WHERE id = ?").get(Number(result.lastInsertRowid));
}

export function deleteDailyNote(id) {
  getDb().prepare("DELETE FROM daily_notes WHERE id = ?").run(Number(id));
  return { ok: true };
}

export function listResourceItems() {
  return getDb()
    .prepare("SELECT * FROM resource_items ORDER BY section ASC, sort_order ASC, title ASC, id ASC")
    .all();
}

export function createResourceItem(input) {
  const database = getDb();
  const section = ["logins", "important_links"].includes(input.section) ? input.section : "important_links";
  const maxOrder = database
    .prepare("SELECT coalesce(max(sort_order), 0) AS sort_order FROM resource_items WHERE section = ?")
    .get(section).sort_order;
  const result = database
    .prepare(`
      INSERT INTO resource_items (section, title, url, note, username, password, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      section,
      input.title,
      input.url || null,
      input.note || null,
      input.username || null,
      input.password || null,
      Number(maxOrder) + 1
    );
  return database.prepare("SELECT * FROM resource_items WHERE id = ?").get(Number(result.lastInsertRowid));
}

export function deleteResourceItem(id) {
  getDb().prepare("DELETE FROM resource_items WHERE id = ?").run(Number(id));
  return { ok: true };
}

export function createImport(filename) {
  const result = getDb()
    .prepare("INSERT INTO imports (filename) VALUES (?)")
    .run(filename);
  return Number(result.lastInsertRowid);
}

export function finishImport(id, summary) {
  getDb()
    .prepare(`
      UPDATE imports
      SET imported_rows = ?, skipped_rows = ?, task_rows = ?, daily_note_rows = ?
      WHERE id = ?
    `)
    .run(summary.importedRows, summary.skippedRows, summary.taskRows, summary.dailyNoteRows, Number(id));
}

export function createDailyNoteFromImport(input, meta = {}) {
  getDb()
    .prepare(`
      INSERT INTO daily_notes (
        note_date, assignee, category, body, source_filename, source_tab, source_row, import_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.note_date,
      input.assignee || null,
      input.category || "Misc.",
      input.body,
      meta.source_filename || null,
      meta.source_tab || null,
      meta.source_row || null,
      meta.import_id || null
    );
}

export function getBootstrap() {
  const database = getDb();
  purgeExpiredArchivedTasks(database);
  return {
    assignees: ASSIGNEES,
    dailyCategories: DAILY_CATEGORIES,
    statuses: STATUSES,
    counts: {
      tasks: database.prepare("SELECT count(*) AS count FROM tasks WHERE archived = 0").get().count,
      open: database.prepare("SELECT count(*) AS count FROM tasks WHERE archived = 0 AND done = 0").get().count,
      overdue: database
        .prepare("SELECT count(*) AS count FROM tasks WHERE archived = 0 AND done = 0 AND status != 'BRB' AND due_date < date('now', 'localtime')")
        .get().count,
      archived: database
        .prepare("SELECT count(*) AS count FROM tasks WHERE archived = 1 AND archived_at >= datetime('now', '-30 days')")
        .get().count
    },
    latestImport: database
      .prepare("SELECT * FROM imports ORDER BY imported_at DESC LIMIT 1")
      .get() || null
  };
}

function hydrateTask(row) {
  const database = getDb();
  return {
    ...row,
    done: Boolean(row.done),
    archived: Boolean(row.archived),
    links: database.prepare("SELECT * FROM task_links WHERE task_id = ? ORDER BY id ASC").all(row.id),
    notes: database.prepare("SELECT * FROM task_notes WHERE task_id = ? ORDER BY id ASC").all(row.id),
    workflow_steps: database.prepare("SELECT * FROM task_workflow_steps WHERE task_id = ? ORDER BY sort_order ASC, id ASC").all(row.id)
  };
}
