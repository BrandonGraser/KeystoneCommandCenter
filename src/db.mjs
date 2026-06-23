import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ASSIGNEES, DAILY_CATEGORIES, DEFAULT_ACCOUNT_STEPS, STATUSES, cleanMultiline, validateAccountPayload, validateTaskPayload } from "./validators.mjs";

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

    CREATE TABLE IF NOT EXISTS task_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
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

    CREATE TABLE IF NOT EXISTS tiktok_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ae_project_url TEXT,
      tutorial_url TEXT,
      username TEXT,
      email TEXT,
      password TEXT,
      scheduled_through TEXT,
      flowstage_account_id TEXT,
      flowstage_synced_through TEXT,
      flowstage_synced_at TEXT,
      group_name TEXT,
      avatar TEXT,
      upload_url TEXT,
      metrics_daily TEXT,
      total_views INTEGER,
      total_likes INTEGER,
      total_comments INTEGER,
      total_shares INTEGER,
      post_count INTEGER,
      prev_views INTEGER,
      prev_likes INTEGER,
      prev_comments INTEGER,
      prev_shares INTEGER,
      prev_post_count INTEGER,
      metrics_synced_at TEXT,
      metrics_source TEXT,
      tiktok_open_id TEXT,
      tiktok_access_token TEXT,
      tiktok_refresh_token TEXT,
      tiktok_token_expires_at TEXT,
      tiktok_connected_at TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tiktok_account_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      assignee TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tiktok_daily_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      snapshot_date TEXT NOT NULL,
      total_views INTEGER NOT NULL DEFAULT 0,
      total_likes INTEGER NOT NULL DEFAULT 0,
      total_comments INTEGER NOT NULL DEFAULT 0,
      total_shares INTEGER NOT NULL DEFAULT 0,
      UNIQUE(account_id, snapshot_date),
      FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_daily_snapshots_account_date ON tiktok_daily_snapshots (account_id, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_tiktok_account_steps_account ON tiktok_account_steps (account_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks (assignee);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks (archived);
    CREATE INDEX IF NOT EXISTS idx_links_task ON task_links (task_id);
    CREATE INDEX IF NOT EXISTS idx_notes_task ON task_notes (task_id);
    CREATE INDEX IF NOT EXISTS idx_messages_task ON task_messages (task_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_task ON task_workflow_steps (task_id);
    CREATE INDEX IF NOT EXISTS idx_images_task ON task_images (task_id);
    CREATE INDEX IF NOT EXISTS idx_resource_items_section ON resource_items (section, sort_order);

    CREATE TABLE IF NOT EXISTS storyboard_workspace (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO storyboard_workspace (id, data, version) VALUES (1, '{}', 0);

    CREATE TABLE IF NOT EXISTS canvas_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      x REAL NOT NULL DEFAULT 100,
      y REAL NOT NULL DEFAULT 100,
      width REAL,
      height REAL,
      color TEXT NOT NULL DEFAULT 'yellow',
      pinned INTEGER NOT NULL DEFAULT 0,
      z_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages (channel, created_at);
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
  const messageColumns = database.prepare("PRAGMA table_info(task_messages)").all();
  if (!messageColumns.some((column) => column.name === "image")) {
    database.exec("ALTER TABLE task_messages ADD COLUMN image TEXT;");
  }
  const accountColumns = database.prepare("PRAGMA table_info(tiktok_accounts)").all();
  const accountColNames = accountColumns.map((column) => column.name);
  if (!accountColNames.includes("group_name")) {
    database.exec("ALTER TABLE tiktok_accounts ADD COLUMN group_name TEXT;");
  }
  for (const col of ["total_views", "total_likes", "total_comments", "total_shares", "post_count", "prev_views", "prev_likes", "prev_comments", "prev_shares", "prev_post_count"]) {
    if (!accountColNames.includes(col)) database.exec(`ALTER TABLE tiktok_accounts ADD COLUMN ${col} INTEGER;`);
  }
  for (const col of ["metrics_synced_at", "metrics_source", "tiktok_open_id", "tiktok_access_token", "tiktok_refresh_token", "tiktok_token_expires_at", "tiktok_connected_at", "avatar", "metrics_daily", "upload_url"]) {
    if (!accountColNames.includes(col)) database.exec(`ALTER TABLE tiktok_accounts ADD COLUMN ${col} TEXT;`);
  }
  for (const col of ["alltime_views", "alltime_likes", "alltime_comments", "alltime_shares"]) {
    if (!accountColNames.includes(col)) database.exec(`ALTER TABLE tiktok_accounts ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0;`);
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
  const canvasCols = database.prepare("PRAGMA table_info(canvas_notes)").all().map((c) => c.name);
  if (!canvasCols.includes("title")) database.exec("ALTER TABLE canvas_notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
  if (!canvasCols.includes("width")) database.exec("ALTER TABLE canvas_notes ADD COLUMN width REAL");
  if (!canvasCols.includes("height")) database.exec("ALTER TABLE canvas_notes ADD COLUMN height REAL");
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
          WHEN 'Pending Approval' THEN 1
          WHEN 'Needs Tommy Review' THEN 2
          WHEN 'Needs Brandon Review' THEN 3
          WHEN 'Working' THEN 4
          WHEN 'Not Started' THEN 5
          WHEN 'Pending' THEN 6
          WHEN 'BRB' THEN 7
          WHEN 'Done' THEN 8
          ELSE 9
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
  const body = cleanMultiline(input.body);
  const image = typeof input.image === "string" && input.image.startsWith("data:image/") ? input.image : null;
  if (!body && !image) {
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
    .prepare("INSERT INTO task_messages (task_id, author, body, image) VALUES (?, ?, ?, ?)")
    .run(Number(taskId), author, body, image);
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

export function dmChannel(user1, user2) {
  return `dm:${[user1, user2].sort().join(":")}`;
}

export function listChatMessages(channel, limit = 200) {
  return getDb()
    .prepare("SELECT * FROM chat_messages WHERE channel = ? ORDER BY created_at ASC LIMIT ?")
    .all(channel, limit);
}

export function createChatMessage({ channel, author, body }) {
  if (!body || !body.trim()) throw Object.assign(new Error("Message body is required."), { status: 400 });
  const result = getDb()
    .prepare("INSERT INTO chat_messages (channel, author, body) VALUES (?, ?, ?)")
    .run(channel, author, body.trim());
  return getDb().prepare("SELECT * FROM chat_messages WHERE id = ?").get(Number(result.lastInsertRowid));
}

export function deleteChatMessage(id) {
  getDb().prepare("DELETE FROM chat_messages WHERE id = ?").run(Number(id));
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

// --- Canvas notes (Notes tab) ------------------------------------------------

export function listCanvasNotes() {
  return getDb()
    .prepare("SELECT * FROM canvas_notes ORDER BY z_index ASC, id ASC")
    .all();
}

export function createCanvasNote(input) {
  const database = getDb();
  const maxZ = database.prepare("SELECT coalesce(max(z_index), 0) AS mz FROM canvas_notes").get().mz;
  const result = database
    .prepare("INSERT INTO canvas_notes (title, body, x, y, color, pinned, z_index) VALUES (?, ?, ?, ?, ?, 0, ?)")
    .run(input.title || "", input.body || "", Number(input.x) || 100, Number(input.y) || 100, input.color || "yellow", maxZ + 1);
  return database.prepare("SELECT * FROM canvas_notes WHERE id = ?").get(Number(result.lastInsertRowid));
}

export function updateCanvasNote(id, input) {
  const database = getDb();
  const existing = database.prepare("SELECT * FROM canvas_notes WHERE id = ?").get(Number(id));
  if (!existing) return null;
  const fields = [];
  const params = [];
  for (const key of ["title", "body", "x", "y", "width", "height", "color", "pinned", "z_index"]) {
    if (key in input) {
      fields.push(`${key} = ?`);
      params.push(key === "pinned" ? (input[key] ? 1 : 0) : input[key]);
    }
  }
  if (!fields.length) return existing;
  fields.push("updated_at = datetime('now')");
  params.push(Number(id));
  database.prepare(`UPDATE canvas_notes SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  return database.prepare("SELECT * FROM canvas_notes WHERE id = ?").get(Number(id));
}

export function deleteCanvasNote(id) {
  getDb().prepare("DELETE FROM canvas_notes WHERE id = ?").run(Number(id));
  return { ok: true };
}

export function bringCanvasNoteToFront(id) {
  const database = getDb();
  const maxZ = database.prepare("SELECT coalesce(max(z_index), 0) AS mz FROM canvas_notes").get().mz;
  database.prepare("UPDATE canvas_notes SET z_index = ?, updated_at = datetime('now') WHERE id = ?").run(maxZ + 1, Number(id));
  return database.prepare("SELECT * FROM canvas_notes WHERE id = ?").get(Number(id));
}

// --- Storyboard workspace (Notes tab) ------------------------------------

export function getStoryboardWorkspace() {
  const row = getDb().prepare("SELECT data, version, updated_at FROM storyboard_workspace WHERE id = 1").get();
  return row || { data: "{}", version: 0, updated_at: null };
}

export function saveStoryboardWorkspace(data, clientVersion) {
  const db = getDb();
  const current = db.prepare("SELECT version FROM storyboard_workspace WHERE id = 1").get();
  if (current && typeof clientVersion === "number" && clientVersion < current.version) {
    return { conflict: true, serverVersion: current.version };
  }
  const nextVersion = (current?.version || 0) + 1;
  db.prepare("UPDATE storyboard_workspace SET data = ?, version = ?, updated_at = datetime('now') WHERE id = 1").run(data, nextVersion);
  return { version: nextVersion, conflict: false };
}

// --- TikTok accounts (FlowStage tab) -------------------------------------
// Fully independent of tasks: own tables, own helpers.

function hydrateAccount(row) {
  const database = getDb();
  const steps = database
    .prepare("SELECT id, label, assignee, position FROM tiktok_account_steps WHERE account_id = ? ORDER BY position ASC, id ASC")
    .all(row.id);
  // Never send OAuth tokens to the client — expose only a connected flag.
  const { tiktok_access_token, tiktok_refresh_token, tiktok_token_expires_at, tiktok_open_id, ...safe } = row;
  return {
    ...safe,
    archived: Boolean(row.archived),
    // Effective runout date: a live FlowStage sync wins over the manual date.
    runout_date: row.flowstage_synced_through || row.scheduled_through || null,
    tiktok_connected: Boolean(tiktok_access_token),
    steps
  };
}

// Token accessors are server-only (not exposed via the API).
export function getAccountTokens(id) {
  return getDb()
    .prepare("SELECT tiktok_open_id, tiktok_access_token, tiktok_refresh_token, tiktok_token_expires_at FROM tiktok_accounts WHERE id = ?")
    .get(Number(id)) || {};
}

export function saveAccountTikTokTokens(id, { open_id, access_token, refresh_token, expires_in }) {
  const expiresAt = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();
  getDb()
    .prepare(`
      UPDATE tiktok_accounts SET
        tiktok_open_id = coalesce(?, tiktok_open_id),
        tiktok_access_token = ?, tiktok_refresh_token = ?, tiktok_token_expires_at = ?,
        tiktok_connected_at = coalesce(tiktok_connected_at, datetime('now')),
        updated_at = datetime('now')
      WHERE id = ?
    `)
    .run(open_id || null, access_token || null, refresh_token || null, expiresAt, Number(id));
  return getTikTokAccount(id);
}

export function disconnectAccountTikTok(id) {
  getDb()
    .prepare("UPDATE tiktok_accounts SET tiktok_open_id = NULL, tiktok_access_token = NULL, tiktok_refresh_token = NULL, tiktok_token_expires_at = NULL, tiktok_connected_at = NULL, updated_at = datetime('now') WHERE id = ?")
    .run(Number(id));
  return getTikTokAccount(id);
}

export function listTikTokAccounts() {
  const rows = getDb()
    .prepare(`
      SELECT * FROM tiktok_accounts
      WHERE archived = 0
      ORDER BY
        coalesce(flowstage_synced_through, scheduled_through) IS NULL ASC,
        coalesce(flowstage_synced_through, scheduled_through) ASC,
        sort_order ASC, id ASC
    `)
    .all();
  return rows.map(hydrateAccount);
}

export function getTikTokAccount(id) {
  const row = getDb().prepare("SELECT * FROM tiktok_accounts WHERE id = ?").get(Number(id));
  return row ? hydrateAccount(row) : null;
}

export function createTikTokAccount(input) {
  const payload = validateAccountPayload(input);
  const database = getDb();
  const maxOrder = database.prepare("SELECT coalesce(max(sort_order), 0) AS sort_order FROM tiktok_accounts").get().sort_order;
  const result = database
    .prepare(`
      INSERT INTO tiktok_accounts (
        name, ae_project_url, tutorial_url, username, email, password,
        scheduled_through, flowstage_account_id, group_name, avatar, upload_url, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      payload.name,
      payload.ae_project_url || null,
      payload.tutorial_url || null,
      payload.username || null,
      payload.email || null,
      payload.password || null,
      payload.scheduled_through || null,
      payload.flowstage_account_id || null,
      payload.group_name || null,
      payload.avatar || null,
      payload.upload_url || null,
      Number(maxOrder) + 1
    );
  const accountId = Number(result.lastInsertRowid);
  // Seed the default process steps unless the caller supplied their own.
  const steps = payload.steps && payload.steps.length
    ? payload.steps
    : DEFAULT_ACCOUNT_STEPS.map((label) => ({ label, assignee: null }));
  replaceAccountSteps(accountId, steps);
  return getTikTokAccount(accountId);
}

export function updateTikTokAccount(id, input) {
  const account = getTikTokAccount(id);
  if (!account) return null;
  const payload = validateAccountPayload(input, { partial: true });
  const sets = [];
  const params = [];
  for (const field of ["name", "ae_project_url", "tutorial_url", "username", "email", "password", "scheduled_through", "flowstage_account_id", "group_name", "avatar", "upload_url"]) {
    if (field in payload) {
      sets.push(`${field} = ?`);
      params.push(payload[field] || null);
    }
  }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    params.push(Number(id));
    getDb().prepare(`UPDATE tiktok_accounts SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }
  if ("steps" in payload) replaceAccountSteps(Number(id), payload.steps || []);
  return getTikTokAccount(id);
}

export function replaceAccountSteps(accountId, steps) {
  const database = getDb();
  database.prepare("DELETE FROM tiktok_account_steps WHERE account_id = ?").run(accountId);
  const insert = database.prepare(
    "INSERT INTO tiktok_account_steps (account_id, label, assignee, position) VALUES (?, ?, ?, ?)"
  );
  steps.forEach((step, index) => insert.run(accountId, step.label, step.assignee || null, index + 1));
}

export function setAccountSync(id, { scheduledThrough = null, metrics = null, metricsSource = null } = {}) {
  const m = metrics || {};
  const p = m.prev || {};
  getDb()
    .prepare(`
      UPDATE tiktok_accounts SET
        flowstage_synced_through = ?, flowstage_synced_at = datetime('now'),
        total_views = ?, total_likes = ?, total_comments = ?, total_shares = ?, post_count = ?,
        prev_views = ?, prev_likes = ?, prev_comments = ?, prev_shares = ?, prev_post_count = ?,
        metrics_source = ?, metrics_daily = ?, metrics_synced_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `)
    .run(
      scheduledThrough || null,
      metrics ? (Number(m.views) || 0) : null,
      metrics ? (Number(m.likes) || 0) : null,
      metrics ? (Number(m.comments) || 0) : null,
      metrics ? (Number(m.shares) || 0) : null,
      metrics ? (Number(m.postCount) || 0) : null,
      metrics ? (Number(p.views) || 0) : null,
      metrics ? (Number(p.likes) || 0) : null,
      metrics ? (Number(p.comments) || 0) : null,
      metrics ? (Number(p.shares) || 0) : null,
      metrics ? (Number(p.postCount) || 0) : null,
      metrics ? metricsSource : null,
      metrics && m.daily ? JSON.stringify(m.daily) : null,
      Number(id)
    );
  return getTikTokAccount(id);
}

export function getAccountAlltime(accountId) {
  const row = getDb()
    .prepare("SELECT alltime_views, alltime_likes, alltime_comments, alltime_shares FROM tiktok_accounts WHERE id = ?")
    .get(Number(accountId));
  if (!row) return null;
  return { views: row.alltime_views || 0, likes: row.alltime_likes || 0, comments: row.alltime_comments || 0, shares: row.alltime_shares || 0 };
}

export function setAccountAlltime(accountId, totals) {
  getDb()
    .prepare("UPDATE tiktok_accounts SET alltime_views = ?, alltime_likes = ?, alltime_comments = ?, alltime_shares = ? WHERE id = ?")
    .run(totals.views || 0, totals.likes || 0, totals.comments || 0, totals.shares || 0, Number(accountId));
}

export function addDailyGains(accountId, dateStr, gains) {
  getDb()
    .prepare(`
      INSERT INTO tiktok_daily_snapshots (account_id, snapshot_date, total_views, total_likes, total_comments, total_shares)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, snapshot_date) DO UPDATE SET
        total_views = total_views + excluded.total_views,
        total_likes = total_likes + excluded.total_likes,
        total_comments = total_comments + excluded.total_comments,
        total_shares = total_shares + excluded.total_shares
    `)
    .run(Number(accountId), dateStr, gains.views || 0, gains.likes || 0, gains.comments || 0, gains.shares || 0);
}

export function getDailyGains(accountId, startDate) {
  return getDb()
    .prepare(`
      SELECT snapshot_date, total_views, total_likes, total_comments, total_shares
      FROM tiktok_daily_snapshots
      WHERE account_id = ? AND snapshot_date >= ?
      ORDER BY snapshot_date ASC
    `)
    .all(Number(accountId), startDate);
}

export function deleteTikTokAccount(id) {
  getDb().prepare("DELETE FROM tiktok_accounts WHERE id = ?").run(Number(id));
  return { deleted: true };
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
    workflow_steps: database.prepare("SELECT * FROM task_workflow_steps WHERE task_id = ? ORDER BY sort_order ASC, id ASC").all(row.id),
    last_message: database.prepare("SELECT author, created_at FROM task_messages WHERE task_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(row.id) || null,
    image_count: database.prepare("SELECT count(*) AS count FROM task_images WHERE task_id = ?").get(row.id).count
  };
}

export function listTaskImages(taskId) {
  return getDb()
    .prepare("SELECT id, task_id, image, created_at FROM task_images WHERE task_id = ? ORDER BY id ASC")
    .all(Number(taskId));
}

export function addTaskImage(taskId, image) {
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    const error = new Error("A valid image is required.");
    error.status = 400;
    throw error;
  }
  const task = getTask(taskId);
  if (!task) {
    const error = new Error("Task not found.");
    error.status = 404;
    throw error;
  }
  getDb().prepare("INSERT INTO task_images (task_id, image) VALUES (?, ?)").run(Number(taskId), image);
  return listTaskImages(taskId);
}

export function deleteTaskImage(taskId, imageId) {
  getDb()
    .prepare("DELETE FROM task_images WHERE id = ? AND task_id = ?")
    .run(Number(imageId), Number(taskId));
  return listTaskImages(taskId);
}
