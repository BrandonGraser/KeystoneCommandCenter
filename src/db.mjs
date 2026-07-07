// Unified async data layer for BOTH deployments.
//
// One @libsql/client connection serves every environment:
//   - Vercel/production: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (remote Turso)
//   - local/Docker: file:data/tasks.sqlite (same SQLite file the old sync
//     node:sqlite layer used, so existing local data carries over)
//
// This module replaced the old split (src/db.mjs sync + src/db-async.mjs) —
// the two copies had drifted (production was missing the daily metrics
// pipeline entirely). Everything is async now; there is exactly one schema.

import { createClient } from "@libsql/client";
import { ASSIGNEES, DAILY_CATEGORIES, DEFAULT_ACCOUNT_STEPS, STATUSES, cleanMultiline, validateAccountPayload, validateTaskPayload } from "./validators.mjs";

let _initPromise = null;

function getDb() {
  if (!_initPromise) {
    _initPromise = _init().catch((error) => {
      _initPromise = null;
      throw error;
    });
  }
  return _initPromise;
}

async function _init() {
  if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
    const error = new Error(
      "Database is not configured: TURSO_DATABASE_URL is missing. Vercel's filesystem is temporary, so saves would be lost. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project's environment variables, then redeploy."
    );
    error.status = 503;
    throw error;
  }

  const dbPath = process.env.DB_PATH || "data/tasks.sqlite";
  const url = process.env.TURSO_DATABASE_URL || `file:${dbPath}`;

  if (url.startsWith("file:")) {
    const { mkdirSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    mkdirSync(dirname(resolve(url.slice(5))), { recursive: true });
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined
  });

  await migrate(client);
  await seedAssignees(client);
  return client;
}

function toRow(columns, row) {
  if (!row) return null;
  const obj = {};
  for (const col of columns) obj[col] = row[col];
  return obj;
}

function rows(result) {
  return result.rows.map((row) => toRow(result.columns, row));
}

function firstRow(result) {
  return result.rows[0] ? toRow(result.columns, result.rows[0]) : null;
}

async function migrate(client) {
  await client.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS assignees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        imported_at TEXT NOT NULL DEFAULT (datetime('now')),
        imported_rows INTEGER NOT NULL DEFAULT 0,
        skipped_rows INTEGER NOT NULL DEFAULT 0,
        task_rows INTEGER NOT NULL DEFAULT 0,
        daily_note_rows INTEGER NOT NULL DEFAULT 0
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS tasks (
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
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS task_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS task_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        person TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS task_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS task_workflow_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS task_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        image TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS daily_notes (
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
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS resource_items (
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
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS tiktok_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ae_project_url TEXT,
        tutorial_url TEXT,
        username TEXT,
        email TEXT,
        password TEXT,
        scheduled_through TEXT,
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
        follower_count INTEGER,
        following_count INTEGER,
        profile_likes INTEGER,
        tiktok_video_count INTEGER,
        tiktok_open_id TEXT,
        tiktok_access_token TEXT,
        tiktok_refresh_token TEXT,
        tiktok_token_expires_at TEXT,
        tiktok_connected_at TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS tiktok_account_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        assignee TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id) ON DELETE CASCADE
      )`
    },
    {
      // One row per TikTok video ever seen for an account. Stats are the
      // latest known values; rows persist even after a video falls out of
      // the API's recent-videos window, so history keeps accumulating.
      sql: `CREATE TABLE IF NOT EXISTS tiktok_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        create_time INTEGER,
        title TEXT,
        cover_url TEXT,
        share_url TEXT,
        duration INTEGER,
        views INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        comments INTEGER NOT NULL DEFAULT 0,
        shares INTEGER NOT NULL DEFAULT 0,
        first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(account_id, video_id),
        FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id) ON DELETE CASCADE
      )`
    },
    {
      // One row per account per day with RAW CUMULATIVE totals (not diffs).
      // Daily growth is computed at query time by differencing consecutive
      // snapshots, so a missed or double sync can never corrupt history.
      sql: `CREATE TABLE IF NOT EXISTS tiktok_account_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        comments INTEGER NOT NULL DEFAULT 0,
        shares INTEGER NOT NULL DEFAULT 0,
        video_count INTEGER NOT NULL DEFAULT 0,
        follower_count INTEGER,
        following_count INTEGER,
        profile_likes INTEGER,
        UNIQUE(account_id, snapshot_date),
        FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id) ON DELETE CASCADE
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS spotify_artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spotify_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        image_url TEXT,
        genres TEXT,
        spotify_url TEXT,
        followers INTEGER,
        popularity INTEGER,
        monthly_listeners INTEGER,
        top_tracks TEXT,
        sync_error TEXT,
        synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    },
    {
      // One row per artist per day with RAW ABSOLUTE values (same philosophy
      // as tiktok_account_snapshots): growth is a query-time diff.
      sql: `CREATE TABLE IF NOT EXISTS spotify_artist_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        followers INTEGER,
        popularity INTEGER,
        monthly_listeners INTEGER,
        UNIQUE(artist_id, snapshot_date),
        FOREIGN KEY (artist_id) REFERENCES spotify_artists(id) ON DELETE CASCADE
      )`
    },
    {
      // Chartex tab: tracked artists. `stats` holds the latest raw Chartex
      // artist item (totals + rolling 24h/7d numbers) as JSON for display.
      sql: `CREATE TABLE IF NOT EXISTS chartex_artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spotify_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        image_url TEXT,
        stats TEXT,
        sync_error TEXT,
        synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS chartex_songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        spotify_track_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        artists TEXT,
        image_url TEXT,
        release_date TEXT,
        stats TEXT,
        synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(artist_id, spotify_track_id),
        FOREIGN KEY (artist_id) REFERENCES chartex_artists(id) ON DELETE CASCADE
      )`
    },
    {
      // Raw cumulative daily snapshots (query-time diffs), Chartex flavor.
      sql: `CREATE TABLE IF NOT EXISTS chartex_artist_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        tiktok_creates INTEGER,
        spotify_streams INTEGER,
        youtube_views INTEGER,
        shazam_count INTEGER,
        tiktok_followers INTEGER,
        instagram_followers INTEGER,
        UNIQUE(artist_id, snapshot_date),
        FOREIGN KEY (artist_id) REFERENCES chartex_artists(id) ON DELETE CASCADE
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS chartex_song_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        tiktok_creates INTEGER,
        spotify_streams INTEGER,
        youtube_views INTEGER,
        shazam_count INTEGER,
        UNIQUE(song_id, snapshot_date),
        FOREIGN KEY (song_id) REFERENCES chartex_songs(id) ON DELETE CASCADE
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS canvas_notes (
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
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS storyboard_workspace (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    }
  ], "write");

  await client.batch([
    { sql: "CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks (assignee)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks (archived)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_links_task ON task_links (task_id)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_notes_task ON task_notes (task_id)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_messages_task ON task_messages (task_id)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_workflow_task ON task_workflow_steps (task_id)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_images_task ON task_images (task_id)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_resource_items_section ON resource_items (section, sort_order)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks (category)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_daily_notes_category ON daily_notes (category)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks (archived_at)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_tiktok_account_steps_account ON tiktok_account_steps (account_id)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages (channel, created_at)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_tiktok_videos_account_time ON tiktok_videos (account_id, create_time)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_tiktok_videos_views ON tiktok_videos (views)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_account_snapshots_date ON tiktok_account_snapshots (account_id, snapshot_date)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_spotify_snapshots_date ON spotify_artist_snapshots (artist_id, snapshot_date)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_chartex_artist_snapshots_date ON chartex_artist_snapshots (artist_id, snapshot_date)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_chartex_song_snapshots_date ON chartex_song_snapshots (song_id, snapshot_date)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_chartex_songs_artist ON chartex_songs (artist_id)" }
  ], "write");

  const dailyCols = await client.execute("PRAGMA table_info(daily_notes)");
  if (!dailyCols.rows.some((r) => r["name"] === "category")) {
    await client.execute("ALTER TABLE daily_notes ADD COLUMN category TEXT");
  }

  const taskCols = await client.execute("PRAGMA table_info(tasks)");
  const taskColNames = taskCols.rows.map((r) => r["name"]);
  if (!taskColNames.includes("category")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN category TEXT");
  }
  if (!taskColNames.includes("archived_at")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN archived_at TEXT");
  }
  if (!taskColNames.includes("urgency")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN urgency INTEGER NOT NULL DEFAULT 5");
  }

  const resourceCols = await client.execute("PRAGMA table_info(resource_items)");
  const resourceColNames = resourceCols.rows.map((r) => r["name"]);
  if (!resourceColNames.includes("username")) {
    await client.execute("ALTER TABLE resource_items ADD COLUMN username TEXT");
  }
  if (!resourceColNames.includes("password")) {
    await client.execute("ALTER TABLE resource_items ADD COLUMN password TEXT");
  }

  const messageCols = await client.execute("PRAGMA table_info(task_messages)");
  if (!messageCols.rows.some((r) => r["name"] === "image")) {
    await client.execute("ALTER TABLE task_messages ADD COLUMN image TEXT");
  }

  const accountCols = await client.execute("PRAGMA table_info(tiktok_accounts)");
  const accountColNames = accountCols.rows.map((r) => r["name"]);
  if (!accountColNames.includes("group_name")) {
    await client.execute("ALTER TABLE tiktok_accounts ADD COLUMN group_name TEXT");
  }
  for (const col of ["total_views", "total_likes", "total_comments", "total_shares", "post_count", "prev_views", "prev_likes", "prev_comments", "prev_shares", "prev_post_count", "follower_count", "following_count", "profile_likes", "tiktok_video_count"]) {
    if (!accountColNames.includes(col)) await client.execute(`ALTER TABLE tiktok_accounts ADD COLUMN ${col} INTEGER`);
  }
  for (const col of ["metrics_synced_at", "metrics_source", "tiktok_open_id", "tiktok_access_token", "tiktok_refresh_token", "tiktok_token_expires_at", "tiktok_connected_at", "avatar", "metrics_daily", "upload_url"]) {
    if (!accountColNames.includes(col)) await client.execute(`ALTER TABLE tiktok_accounts ADD COLUMN ${col} TEXT`);
  }

  await client.batch([
    { sql: "UPDATE tasks SET status = 'BRB' WHERE status = 'Unsorted'" },
    { sql: "UPDATE tasks SET status = 'Not Started' WHERE status = 'Misc.'" },
    { sql: "UPDATE tasks SET due_date = NULL WHERE status = 'BRB'" },
    { sql: "UPDATE tasks SET assignee = 'Tommy' WHERE lower(assignee) = 'ryan'" },
    { sql: "UPDATE tasks SET source_tab = NULL WHERE lower(coalesce(source_tab, '')) LIKE '%ryan%'" },
    { sql: "UPDATE daily_notes SET assignee = NULL WHERE lower(coalesce(assignee, '')) = 'ryan'" },
    { sql: "UPDATE daily_notes SET source_tab = NULL WHERE lower(coalesce(source_tab, '')) LIKE '%ryan%'" },
    { sql: "UPDATE task_notes SET person = 'General' WHERE lower(person) = 'ryan'" },
    { sql: "UPDATE task_messages SET author = 'Me' WHERE lower(author) = 'ryan'" },
    { sql: "DELETE FROM assignees WHERE lower(name) = 'ryan'" },
    { sql: "UPDATE tasks SET archived_at = coalesce(archived_at, updated_at, datetime('now')) WHERE archived = 1" }
  ], "write");

  await client.execute("INSERT OR IGNORE INTO storyboard_workspace (id, data, version) VALUES (1, '{}', 0)");

  // Seed the tracked Spotify artist (Drezzdon) so the tab works out of the box.
  await client.execute(
    "INSERT OR IGNORE INTO spotify_artists (spotify_id, name) VALUES ('4a10dwuUNwm8ae6aSnQLUH', 'Drezzdon')"
  );
  // Chartex tab seed — the name must match Chartex's artist search results
  // (lowercase there), since artist stats are matched by search + spotify_id.
  await client.execute(
    "INSERT OR IGNORE INTO chartex_artists (spotify_id, name) VALUES ('4a10dwuUNwm8ae6aSnQLUH', 'drezzdon')"
  );

  const canvasCols = await client.execute("PRAGMA table_info(canvas_notes)");
  const canvasColNames = canvasCols.rows.map((r) => r["name"]);
  if (!canvasColNames.includes("title")) await client.execute("ALTER TABLE canvas_notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
  if (!canvasColNames.includes("width")) await client.execute("ALTER TABLE canvas_notes ADD COLUMN width REAL");
  if (!canvasColNames.includes("height")) await client.execute("ALTER TABLE canvas_notes ADD COLUMN height REAL");
}

async function seedAssignees(client) {
  for (let i = 0; i < ASSIGNEES.length; i++) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO assignees (name, sort_order) VALUES (?, ?)",
      args: [ASSIGNEES[i], i + 1]
    });
  }
}

async function purgeExpired(client) {
  await client.execute(
    "DELETE FROM tasks WHERE archived = 1 AND archived_at IS NOT NULL AND archived_at < datetime('now', '-30 days')"
  );
}

// --- Tasks ---------------------------------------------------------------

async function hydrateTask(row, columns, client) {
  const task = toRow(columns, row);
  const [links, notes, steps, lastMsg, imageCount] = await Promise.all([
    client.execute({ sql: "SELECT * FROM task_links WHERE task_id = ? ORDER BY id ASC", args: [task.id] }),
    client.execute({ sql: "SELECT * FROM task_notes WHERE task_id = ? ORDER BY id ASC", args: [task.id] }),
    client.execute({ sql: "SELECT * FROM task_workflow_steps WHERE task_id = ? ORDER BY sort_order ASC, id ASC", args: [task.id] }),
    client.execute({ sql: "SELECT author, created_at FROM task_messages WHERE task_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", args: [task.id] }),
    client.execute({ sql: "SELECT count(*) AS count FROM task_images WHERE task_id = ?", args: [task.id] })
  ]);
  return {
    ...task,
    done: Boolean(task.done),
    archived: Boolean(task.archived),
    links: rows(links),
    notes: rows(notes),
    workflow_steps: rows(steps),
    last_message: firstRow(lastMsg),
    image_count: Number(imageCount.rows[0]?.["count"] ?? 0)
  };
}

export async function listTaskImages(taskId) {
  const client = await getDb();
  const r = await client.execute({
    sql: "SELECT id, task_id, image, created_at FROM task_images WHERE task_id = ? ORDER BY id ASC",
    args: [Number(taskId)]
  });
  return rows(r);
}

export async function addTaskImage(taskId, image) {
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    const e = new Error("A valid image is required."); e.status = 400; throw e;
  }
  const task = await getTask(taskId);
  if (!task) { const e = new Error("Task not found."); e.status = 404; throw e; }
  const client = await getDb();
  await client.execute({
    sql: "INSERT INTO task_images (task_id, image) VALUES (?, ?)",
    args: [Number(taskId), image]
  });
  return listTaskImages(taskId);
}

export async function deleteTaskImage(taskId, imageId) {
  const client = await getDb();
  await client.execute({
    sql: "DELETE FROM task_images WHERE id = ? AND task_id = ?",
    args: [Number(imageId), Number(taskId)]
  });
  return listTaskImages(taskId);
}

export async function listTasks(filters = {}) {
  const client = await getDb();
  await purgeExpired(client);

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
        SELECT 1 FROM task_links WHERE task_links.task_id = tasks.id
        AND (lower(label) LIKE ? OR lower(coalesce(url, '')) LIKE ?)
      )
      OR EXISTS (
        SELECT 1 FROM task_notes WHERE task_notes.task_id = tasks.id
        AND (lower(person) LIKE ? OR lower(body) LIKE ?)
      )
    )`);
    params.push(search, search, search, search, search, search, search);
  }

  const result = await client.execute({
    sql: `SELECT * FROM tasks WHERE ${where.join(" AND ")}
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
        urgency DESC,
        due_date IS NULL ASC,
        due_date ASC,
        ${showArchived ? "archived_at DESC," : ""}
        updated_at DESC`,
    args: params
  });

  return Promise.all(result.rows.map((row) => hydrateTask(row, result.columns, client)));
}

export async function getTask(id) {
  const client = await getDb();
  const result = await client.execute({
    sql: "SELECT * FROM tasks WHERE id = ?",
    args: [Number(id)]
  });
  if (!result.rows[0]) return null;
  return hydrateTask(result.rows[0], result.columns, client);
}

export async function createTask(input, meta = {}) {
  const payload = validateTaskPayload(input);
  const client = await getDb();
  const result = await client.execute({
    sql: `INSERT INTO tasks (assignee, title, details, project, category, status, done, due_date, stamp_at,
      source_filename, source_tab, source_row, import_id, urgency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
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
      meta.import_id || null,
      payload.urgency ?? 5
    ]
  });
  const taskId = Number(result.lastInsertRowid);
  await _replaceLinks(taskId, payload.links || [], client);
  await _replaceNotes(taskId, payload.notes || [], client);
  await _replaceSteps(taskId, payload.workflow_steps || [], client);
  return getTask(taskId);
}

export async function updateTask(id, input) {
  const task = await getTask(id);
  if (!task) return null;
  const payload = validateTaskPayload(input, { partial: true });
  const sets = [];
  const params = [];

  for (const field of ["assignee", "title", "details", "project", "category", "status", "due_date", "stamp_at", "archived", "urgency"]) {
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
    if (payload.done && !("stamp_at" in payload)) sets.push("stamp_at = coalesce(stamp_at, datetime('now'))");
    if (payload.done && !("status" in payload)) sets.push("status = 'Done'");
    if (!payload.done && task.status === "Done" && !("status" in payload)) sets.push("status = 'Not Started'");
  }

  const client = await getDb();
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    params.push(Number(id));
    await client.execute({ sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, args: params });
  }
  if ("links" in payload) await _replaceLinks(Number(id), payload.links || [], client);
  if ("notes" in payload) await _replaceNotes(Number(id), payload.notes || [], client);
  if ("workflow_steps" in payload) await _replaceSteps(Number(id), payload.workflow_steps || [], client);
  return getTask(id);
}

export async function archiveTask(id) {
  const client = await getDb();
  await client.execute({
    sql: "UPDATE tasks SET archived = 1, archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    args: [Number(id)]
  });
  return { ok: true, task: await getTask(id) };
}

export async function deleteTask(id) {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM tasks WHERE id = ?", args: [Number(id)] });
  return { deleted: true };
}

export async function restoreTask(id) {
  const client = await getDb();
  await client.execute({
    sql: "UPDATE tasks SET archived = 0, archived_at = NULL, updated_at = datetime('now') WHERE id = ?",
    args: [Number(id)]
  });
  return { ok: true, task: await getTask(id) };
}

export async function duplicateTask(id) {
  const source = await getTask(id);
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
    urgency: source.urgency ?? 5,
    due_date: status === "BRB" ? null : source.due_date || null,
    links: source.links.map((l) => ({ label: l.label, url: l.url || "" })),
    notes: source.notes.map((n) => ({ person: n.person, body: n.body })),
    workflow_steps: source.workflow_steps.map((s) => ({ label: s.label }))
  });
}

async function _replaceLinks(taskId, links, client) {
  await client.execute({ sql: "DELETE FROM task_links WHERE task_id = ?", args: [taskId] });
  for (const link of links) {
    await client.execute({
      sql: "INSERT INTO task_links (task_id, label, url) VALUES (?, ?, ?)",
      args: [taskId, link.label, link.url || null]
    });
  }
}

async function _replaceNotes(taskId, notes, client) {
  await client.execute({ sql: "DELETE FROM task_notes WHERE task_id = ?", args: [taskId] });
  for (const note of notes) {
    await client.execute({
      sql: "INSERT INTO task_notes (task_id, person, body) VALUES (?, ?, ?)",
      args: [taskId, note.person, note.body]
    });
  }
}

async function _replaceSteps(taskId, steps, client) {
  await client.execute({ sql: "DELETE FROM task_workflow_steps WHERE task_id = ?", args: [taskId] });
  for (let i = 0; i < steps.length; i++) {
    await client.execute({
      sql: "INSERT INTO task_workflow_steps (task_id, label, sort_order) VALUES (?, ?, ?)",
      args: [taskId, steps[i].label, i + 1]
    });
  }
}

export async function addTaskLink(input) {
  const client = await getDb();
  const result = await client.execute({
    sql: "INSERT INTO task_links (task_id, label, url) VALUES (?, ?, ?)",
    args: [Number(input.task_id), input.label, input.url || null]
  });
  const r = await client.execute({ sql: "SELECT * FROM task_links WHERE id = ?", args: [Number(result.lastInsertRowid)] });
  return firstRow(r);
}

export async function updateTaskLink(id, input) {
  const client = await getDb();
  await client.execute({
    sql: "UPDATE task_links SET label = ?, url = ?, updated_at = datetime('now') WHERE id = ?",
    args: [input.label, input.url || null, Number(id)]
  });
  const r = await client.execute({ sql: "SELECT * FROM task_links WHERE id = ?", args: [Number(id)] });
  return firstRow(r);
}

export async function deleteTaskLink(id) {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM task_links WHERE id = ?", args: [Number(id)] });
  return { ok: true };
}

export async function listTaskMessages(taskId) {
  const client = await getDb();
  const r = await client.execute({
    sql: "SELECT * FROM task_messages WHERE task_id = ? ORDER BY created_at ASC, id ASC",
    args: [Number(taskId)]
  });
  return rows(r);
}

export async function createTaskMessage(taskId, input) {
  const author = String(input.author || "Me").trim() || "Me";
  const body = cleanMultiline(input.body);
  const image = typeof input.image === "string" && input.image.startsWith("data:image/") ? input.image : null;
  if (!body && !image) { const e = new Error("Message body is required."); e.status = 400; throw e; }
  const task = await getTask(taskId);
  if (!task) { const e = new Error("Task not found."); e.status = 404; throw e; }
  const client = await getDb();
  const result = await client.execute({
    sql: "INSERT INTO task_messages (task_id, author, body, image) VALUES (?, ?, ?, ?)",
    args: [Number(taskId), author, body, image]
  });
  const r = await client.execute({ sql: "SELECT * FROM task_messages WHERE id = ?", args: [Number(result.lastInsertRowid)] });
  return firstRow(r);
}

export async function deleteTaskMessage(taskId, messageId) {
  const client = await getDb();
  const check = await client.execute({
    sql: "SELECT id FROM task_messages WHERE id = ? AND task_id = ?",
    args: [Number(messageId), Number(taskId)]
  });
  if (!check.rows[0]) return null;
  await client.execute({
    sql: "DELETE FROM task_messages WHERE id = ? AND task_id = ?",
    args: [Number(messageId), Number(taskId)]
  });
  return { ok: true };
}

// --- Daily notes -----------------------------------------------------------

export async function listDailyNotes(date) {
  const client = await getDb();
  if (date) {
    const r = await client.execute({ sql: "SELECT * FROM daily_notes WHERE note_date = ? ORDER BY updated_at DESC", args: [date] });
    return rows(r);
  }
  const r = await client.execute("SELECT * FROM daily_notes ORDER BY note_date DESC, updated_at DESC LIMIT 200");
  return rows(r);
}

export async function saveDailyNote(input) {
  const client = await getDb();
  if (input.id) {
    await client.execute({
      sql: "UPDATE daily_notes SET note_date = ?, assignee = ?, category = ?, body = ?, updated_at = datetime('now') WHERE id = ?",
      args: [input.note_date, input.assignee || null, input.category || "Misc.", input.body, Number(input.id)]
    });
    const r = await client.execute({ sql: "SELECT * FROM daily_notes WHERE id = ?", args: [Number(input.id)] });
    return firstRow(r);
  }
  const result = await client.execute({
    sql: "INSERT INTO daily_notes (note_date, assignee, category, body) VALUES (?, ?, ?, ?)",
    args: [input.note_date, input.assignee || null, input.category || "Misc.", input.body]
  });
  const r = await client.execute({ sql: "SELECT * FROM daily_notes WHERE id = ?", args: [Number(result.lastInsertRowid)] });
  return firstRow(r);
}

export async function deleteDailyNote(id) {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM daily_notes WHERE id = ?", args: [Number(id)] });
  return { ok: true };
}

// --- Resources ---------------------------------------------------------------

export async function listResourceItems() {
  const client = await getDb();
  const r = await client.execute("SELECT * FROM resource_items ORDER BY section ASC, sort_order ASC, title ASC, id ASC");
  return rows(r);
}

export async function createResourceItem(input) {
  const client = await getDb();
  const section = ["logins", "important_links"].includes(input.section) ? input.section : "important_links";
  const maxR = await client.execute({
    sql: "SELECT coalesce(max(sort_order), 0) AS sort_order FROM resource_items WHERE section = ?",
    args: [section]
  });
  const maxOrder = Number(maxR.rows[0]?.["sort_order"] ?? 0);
  const result = await client.execute({
    sql: "INSERT INTO resource_items (section, title, url, note, username, password, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [section, input.title, input.url || null, input.note || null, input.username || null, input.password || null, maxOrder + 1]
  });
  const r = await client.execute({ sql: "SELECT * FROM resource_items WHERE id = ?", args: [Number(result.lastInsertRowid)] });
  return firstRow(r);
}

export async function deleteResourceItem(id) {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM resource_items WHERE id = ?", args: [Number(id)] });
  return { ok: true };
}

// --- Canvas notes (Notes tab) ------------------------------------------------

export async function listCanvasNotes() {
  const client = await getDb();
  const result = await client.execute("SELECT * FROM canvas_notes ORDER BY z_index ASC, id ASC");
  return rows(result);
}

export async function createCanvasNote(input) {
  const client = await getDb();
  const maxRes = await client.execute("SELECT coalesce(max(z_index), 0) AS mz FROM canvas_notes");
  const maxZ = Number(maxRes.rows[0]?.["mz"] ?? 0);
  const result = await client.execute({
    sql: "INSERT INTO canvas_notes (title, body, x, y, color, pinned, z_index) VALUES (?, ?, ?, ?, ?, 0, ?)",
    args: [input.title || "", input.body || "", Number(input.x) || 100, Number(input.y) || 100, input.color || "yellow", maxZ + 1]
  });
  const row = await client.execute({ sql: "SELECT * FROM canvas_notes WHERE id = ?", args: [Number(result.lastInsertRowid)] });
  return firstRow(row);
}

export async function updateCanvasNote(id, input) {
  const client = await getDb();
  const existing = await client.execute({ sql: "SELECT * FROM canvas_notes WHERE id = ?", args: [Number(id)] });
  if (!existing.rows.length) return null;
  const fields = [];
  const args = [];
  for (const key of ["title", "body", "x", "y", "width", "height", "color", "pinned", "z_index"]) {
    if (key in input) {
      fields.push(`${key} = ?`);
      args.push(key === "pinned" ? (input[key] ? 1 : 0) : input[key]);
    }
  }
  if (!fields.length) return firstRow(existing);
  fields.push("updated_at = datetime('now')");
  args.push(Number(id));
  await client.execute({ sql: `UPDATE canvas_notes SET ${fields.join(", ")} WHERE id = ?`, args });
  const row = await client.execute({ sql: "SELECT * FROM canvas_notes WHERE id = ?", args: [Number(id)] });
  return firstRow(row);
}

export async function deleteCanvasNote(id) {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM canvas_notes WHERE id = ?", args: [Number(id)] });
  return { ok: true };
}

export async function bringCanvasNoteToFront(id) {
  const client = await getDb();
  const maxRes = await client.execute("SELECT coalesce(max(z_index), 0) AS mz FROM canvas_notes");
  const maxZ = Number(maxRes.rows[0]?.["mz"] ?? 0);
  await client.execute({ sql: "UPDATE canvas_notes SET z_index = ?, updated_at = datetime('now') WHERE id = ?", args: [maxZ + 1, Number(id)] });
  const row = await client.execute({ sql: "SELECT * FROM canvas_notes WHERE id = ?", args: [Number(id)] });
  return firstRow(row);
}

// --- TikTok accounts -------------------------------------------------------

async function hydrateAccount(row, columns, client) {
  const account = toRow(columns, row);
  const steps = await client.execute({
    sql: "SELECT id, label, assignee, position FROM tiktok_account_steps WHERE account_id = ? ORDER BY position ASC, id ASC",
    args: [account.id]
  });
  // Never send OAuth tokens to the client — expose only a connected flag.
  const { tiktok_access_token, tiktok_refresh_token, tiktok_token_expires_at, tiktok_open_id, ...safe } = account;
  return {
    ...safe,
    archived: Boolean(account.archived),
    runout_date: account.scheduled_through || null,
    tiktok_connected: Boolean(tiktok_access_token),
    steps: rows(steps)
  };
}

export async function getAccountTokens(id) {
  const client = await getDb();
  const r = await client.execute({
    sql: "SELECT tiktok_open_id, tiktok_access_token, tiktok_refresh_token, tiktok_token_expires_at FROM tiktok_accounts WHERE id = ?",
    args: [Number(id)]
  });
  return firstRow(r) || {};
}

export async function saveAccountTikTokTokens(id, { open_id, access_token, refresh_token, expires_in }) {
  const expiresAt = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();
  const client = await getDb();
  await client.execute({
    sql: `UPDATE tiktok_accounts SET
      tiktok_open_id = coalesce(?, tiktok_open_id),
      tiktok_access_token = ?, tiktok_refresh_token = ?, tiktok_token_expires_at = ?,
      tiktok_connected_at = coalesce(tiktok_connected_at, datetime('now')),
      updated_at = datetime('now')
    WHERE id = ?`,
    args: [open_id || null, access_token || null, refresh_token || null, expiresAt, Number(id)]
  });
  return getTikTokAccount(id);
}

export async function disconnectAccountTikTok(id) {
  const client = await getDb();
  await client.execute({
    sql: "UPDATE tiktok_accounts SET tiktok_open_id = NULL, tiktok_access_token = NULL, tiktok_refresh_token = NULL, tiktok_token_expires_at = NULL, tiktok_connected_at = NULL, updated_at = datetime('now') WHERE id = ?",
    args: [Number(id)]
  });
  return getTikTokAccount(id);
}

export async function listTikTokAccounts() {
  const client = await getDb();
  const result = await client.execute(`
    SELECT * FROM tiktok_accounts
    WHERE archived = 0
    ORDER BY
      scheduled_through IS NULL ASC,
      scheduled_through ASC,
      sort_order ASC, id ASC
  `);
  return Promise.all(result.rows.map((row) => hydrateAccount(row, result.columns, client)));
}

export async function getTikTokAccount(id) {
  const client = await getDb();
  const result = await client.execute({ sql: "SELECT * FROM tiktok_accounts WHERE id = ?", args: [Number(id)] });
  if (!result.rows[0]) return null;
  return hydrateAccount(result.rows[0], result.columns, client);
}

export async function createTikTokAccount(input) {
  const payload = validateAccountPayload(input);
  const client = await getDb();
  const maxR = await client.execute("SELECT coalesce(max(sort_order), 0) AS sort_order FROM tiktok_accounts");
  const maxOrder = Number(maxR.rows[0]?.["sort_order"] ?? 0);
  const result = await client.execute({
    sql: `INSERT INTO tiktok_accounts (
      name, ae_project_url, tutorial_url, username, email, password,
      scheduled_through, group_name, avatar, upload_url, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      payload.name,
      payload.ae_project_url || null,
      payload.tutorial_url || null,
      payload.username || null,
      payload.email || null,
      payload.password || null,
      payload.scheduled_through || null,
      payload.group_name || null,
      payload.avatar || null,
      payload.upload_url || null,
      maxOrder + 1
    ]
  });
  const accountId = Number(result.lastInsertRowid);
  const steps = payload.steps && payload.steps.length
    ? payload.steps
    : DEFAULT_ACCOUNT_STEPS.map((label) => ({ label, assignee: null }));
  await _replaceAccountSteps(accountId, steps, client);
  return getTikTokAccount(accountId);
}

export async function updateTikTokAccount(id, input) {
  const account = await getTikTokAccount(id);
  if (!account) return null;
  const payload = validateAccountPayload(input, { partial: true });
  const sets = [];
  const params = [];
  for (const field of ["name", "ae_project_url", "tutorial_url", "username", "email", "password", "scheduled_through", "group_name", "avatar", "upload_url"]) {
    if (field in payload) {
      sets.push(`${field} = ?`);
      params.push(payload[field] || null);
    }
  }
  const client = await getDb();
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    params.push(Number(id));
    await client.execute({ sql: `UPDATE tiktok_accounts SET ${sets.join(", ")} WHERE id = ?`, args: params });
  }
  if ("steps" in payload) await _replaceAccountSteps(Number(id), payload.steps || [], client);
  return getTikTokAccount(id);
}

async function _replaceAccountSteps(accountId, steps, client) {
  await client.execute({ sql: "DELETE FROM tiktok_account_steps WHERE account_id = ?", args: [accountId] });
  for (let i = 0; i < steps.length; i++) {
    await client.execute({
      sql: "INSERT INTO tiktok_account_steps (account_id, label, assignee, position) VALUES (?, ?, ?, ?)",
      args: [accountId, steps[i].label, steps[i].assignee || null, i + 1]
    });
  }
}

export async function setAccountSync(id, { metrics = null, metricsSource = null } = {}) {
  const m = metrics || {};
  const p = m.prev || {};
  const client = await getDb();
  await client.execute({
    sql: `UPDATE tiktok_accounts SET
      total_views = ?, total_likes = ?, total_comments = ?, total_shares = ?, post_count = ?,
      prev_views = ?, prev_likes = ?, prev_comments = ?, prev_shares = ?, prev_post_count = ?,
      metrics_source = ?, metrics_daily = ?, metrics_synced_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?`,
    args: [
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
    ]
  });
  return getTikTokAccount(id);
}

export async function setAccountProfileStats(id, { follower_count = null, following_count = null, likes_count = null, video_count = null } = {}) {
  const client = await getDb();
  await client.execute({
    sql: `UPDATE tiktok_accounts SET
      follower_count = coalesce(?, follower_count),
      following_count = coalesce(?, following_count),
      profile_likes = coalesce(?, profile_likes),
      tiktok_video_count = coalesce(?, tiktok_video_count),
      updated_at = datetime('now')
    WHERE id = ?`,
    args: [follower_count, following_count, likes_count, video_count, Number(id)]
  });
}

export async function deleteTikTokAccount(id) {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM tiktok_accounts WHERE id = ?", args: [Number(id)] });
  return { deleted: true };
}

// --- Per-video history + daily snapshots (metrics pipeline) ----------------

// Upsert the latest stats for each video returned by a sync. Rows are never
// deleted: videos that fall out of TikTok's recent window keep their
// last-known stats, so long-range aggregates stay meaningful.
export async function upsertAccountVideos(accountId, videos) {
  if (!videos.length) return;
  const client = await getDb();
  await client.batch(videos.map((v) => ({
    sql: `INSERT INTO tiktok_videos (account_id, video_id, create_time, title, cover_url, share_url, duration, views, likes, comments, shares)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, video_id) DO UPDATE SET
        create_time = excluded.create_time,
        title = coalesce(excluded.title, title),
        cover_url = coalesce(excluded.cover_url, cover_url),
        share_url = coalesce(excluded.share_url, share_url),
        duration = coalesce(excluded.duration, duration),
        views = excluded.views,
        likes = excluded.likes,
        comments = excluded.comments,
        shares = excluded.shares,
        last_synced_at = datetime('now')`,
    args: [
      Number(accountId),
      String(v.id),
      Number(v.create_time) || null,
      v.title || null,
      v.cover_image_url || null,
      v.share_url || null,
      Number(v.duration) || null,
      Number(v.view_count) || 0,
      Number(v.like_count) || 0,
      Number(v.comment_count) || 0,
      Number(v.share_count) || 0
    ]
  })), "write");
}

// Write today's cumulative snapshot for an account: totals summed over every
// stored video plus the latest profile stats. Re-syncing the same day just
// overwrites the row with fresher cumulative numbers.
export async function saveAccountSnapshot(accountId, { date, follower_count = null, following_count = null, profile_likes = null } = {}) {
  const client = await getDb();
  const snapshotDate = date || new Date().toISOString().slice(0, 10);
  const totals = await client.execute({
    sql: `SELECT count(*) AS n, coalesce(sum(views), 0) AS v, coalesce(sum(likes), 0) AS l,
      coalesce(sum(comments), 0) AS c, coalesce(sum(shares), 0) AS s
      FROM tiktok_videos WHERE account_id = ?`,
    args: [Number(accountId)]
  });
  const t = firstRow(totals) || {};
  await client.execute({
    sql: `INSERT INTO tiktok_account_snapshots
      (account_id, snapshot_date, views, likes, comments, shares, video_count, follower_count, following_count, profile_likes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, snapshot_date) DO UPDATE SET
        views = excluded.views,
        likes = excluded.likes,
        comments = excluded.comments,
        shares = excluded.shares,
        video_count = excluded.video_count,
        follower_count = coalesce(excluded.follower_count, follower_count),
        following_count = coalesce(excluded.following_count, following_count),
        profile_likes = coalesce(excluded.profile_likes, profile_likes)`,
    args: [
      Number(accountId), snapshotDate,
      Number(t.v) || 0, Number(t.l) || 0, Number(t.c) || 0, Number(t.s) || 0, Number(t.n) || 0,
      follower_count, following_count, profile_likes
    ]
  });
}

// All snapshots on/after `sinceDate` plus, per account, the latest snapshot
// BEFORE it (the baseline the first in-window delta is measured against).
export async function getSnapshotSeries(sinceDate) {
  const client = await getDb();
  const [inWindow, baseline] = await Promise.all([
    client.execute({
      sql: "SELECT * FROM tiktok_account_snapshots WHERE snapshot_date >= ? ORDER BY account_id ASC, snapshot_date ASC",
      args: [sinceDate]
    }),
    client.execute({
      sql: `SELECT s.* FROM tiktok_account_snapshots s
        JOIN (
          SELECT account_id, max(snapshot_date) AS md
          FROM tiktok_account_snapshots WHERE snapshot_date < ? GROUP BY account_id
        ) b ON s.account_id = b.account_id AND s.snapshot_date = b.md`,
      args: [sinceDate]
    })
  ]);
  return { rows: rows(inWindow), baseline: rows(baseline) };
}

// Videos posted on/after `sinceUnix` across all active accounts — used to
// build "by post date" series for any window length.
export async function listVideosSince(sinceUnix) {
  const client = await getDb();
  const r = await client.execute({
    sql: `SELECT v.account_id, v.create_time, v.views, v.likes, v.comments, v.shares
      FROM tiktok_videos v
      JOIN tiktok_accounts a ON a.id = v.account_id AND a.archived = 0
      WHERE v.create_time >= ?`,
    args: [Number(sinceUnix)]
  });
  return rows(r);
}

export async function countAccountVideos(accountId) {
  const client = await getDb();
  const r = await client.execute({
    sql: "SELECT count(*) AS c FROM tiktok_videos WHERE account_id = ?",
    args: [Number(accountId)]
  });
  return Number(r.rows[0]?.["c"] ?? 0);
}

const VIDEO_SORTS = new Set(["views", "likes", "comments", "shares", "create_time"]);

export async function listAccountVideos(accountId, { sinceUnix = 0, sort = "views", limit = 20 } = {}) {
  const client = await getDb();
  const orderBy = VIDEO_SORTS.has(sort) ? sort : "views";
  const r = await client.execute({
    sql: `SELECT video_id, create_time, title, cover_url, share_url, duration, views, likes, comments, shares
      FROM tiktok_videos
      WHERE account_id = ? AND create_time >= ?
      ORDER BY ${orderBy} DESC LIMIT ?`,
    args: [Number(accountId), Number(sinceUnix), Math.min(Number(limit) || 20, 100)]
  });
  return rows(r);
}

export async function listTopVideos({ sinceUnix = 0, sort = "views", limit = 20 } = {}) {
  const client = await getDb();
  const orderBy = VIDEO_SORTS.has(sort) ? sort : "views";
  const r = await client.execute({
    sql: `SELECT v.video_id, v.account_id, v.create_time, v.title, v.cover_url, v.share_url, v.duration,
      v.views, v.likes, v.comments, v.shares, a.name AS account_name
      FROM tiktok_videos v
      JOIN tiktok_accounts a ON a.id = v.account_id AND a.archived = 0
      WHERE v.create_time >= ?
      ORDER BY v.${orderBy} DESC LIMIT ?`,
    args: [Number(sinceUnix), Math.min(Number(limit) || 20, 100)]
  });
  return rows(r);
}

// --- Spotify artists (Spotify tab) --------------------------------------------

function hydrateSpotifyArtist(row) {
  if (!row) return null;
  let genres = [];
  let topTracks = [];
  try { genres = JSON.parse(row.genres) || []; } catch { /* none stored */ }
  try { topTracks = JSON.parse(row.top_tracks) || []; } catch { /* none stored */ }
  const { top_tracks, ...rest } = row;
  return { ...rest, genres, top_tracks: topTracks };
}

export async function listSpotifyArtists() {
  const client = await getDb();
  const r = await client.execute("SELECT * FROM spotify_artists ORDER BY id ASC");
  return rows(r).map(hydrateSpotifyArtist);
}

export async function getSpotifyArtist(id) {
  const client = await getDb();
  const r = await client.execute({ sql: "SELECT * FROM spotify_artists WHERE id = ?", args: [Number(id)] });
  return hydrateSpotifyArtist(firstRow(r));
}

export async function createSpotifyArtist({ spotify_id, name = "" }) {
  const client = await getDb();
  await client.execute({
    sql: "INSERT OR IGNORE INTO spotify_artists (spotify_id, name) VALUES (?, ?)",
    args: [String(spotify_id), String(name)]
  });
  const r = await client.execute({ sql: "SELECT * FROM spotify_artists WHERE spotify_id = ?", args: [String(spotify_id)] });
  return hydrateSpotifyArtist(firstRow(r));
}

export async function deleteSpotifyArtist(id) {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM spotify_artists WHERE id = ?", args: [Number(id)] });
  return { deleted: true };
}

// Partial update: only fields explicitly present overwrite; undefined fields
// keep their last-known values (e.g. the scrape failed today).
export async function saveSpotifyArtistSync(id, data) {
  const client = await getDb();
  const sets = [];
  const args = [];
  for (const col of ["name", "image_url", "genres", "spotify_url", "followers", "popularity", "monthly_listeners", "top_tracks", "sync_error"]) {
    if (data[col] !== undefined) {
      sets.push(`${col} = ?`);
      args.push(data[col]);
    }
  }
  sets.push("synced_at = datetime('now')");
  await client.execute({ sql: `UPDATE spotify_artists SET ${sets.join(", ")} WHERE id = ?`, args: [...args, Number(id)] });
  return getSpotifyArtist(id);
}

export async function saveSpotifySnapshot(artistId, { date, followers = null, popularity = null, monthly_listeners = null } = {}) {
  const client = await getDb();
  const snapshotDate = date || new Date().toISOString().slice(0, 10);
  await client.execute({
    sql: `INSERT INTO spotify_artist_snapshots (artist_id, snapshot_date, followers, popularity, monthly_listeners)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(artist_id, snapshot_date) DO UPDATE SET
        followers = coalesce(excluded.followers, followers),
        popularity = coalesce(excluded.popularity, popularity),
        monthly_listeners = coalesce(excluded.monthly_listeners, monthly_listeners)`,
    args: [Number(artistId), snapshotDate, followers, popularity, monthly_listeners]
  });
}

// All snapshots on/after `sinceDate` plus, per artist, the latest snapshot
// BEFORE it (the baseline window deltas are measured against).
export async function getSpotifySnapshotSeries(sinceDate) {
  const client = await getDb();
  const [inWindow, baseline] = await Promise.all([
    client.execute({
      sql: "SELECT * FROM spotify_artist_snapshots WHERE snapshot_date >= ? ORDER BY artist_id ASC, snapshot_date ASC",
      args: [sinceDate]
    }),
    client.execute({
      sql: `SELECT s.* FROM spotify_artist_snapshots s
        JOIN (
          SELECT artist_id, max(snapshot_date) AS md
          FROM spotify_artist_snapshots WHERE snapshot_date < ? GROUP BY artist_id
        ) b ON s.artist_id = b.artist_id AND s.snapshot_date = b.md`,
      args: [sinceDate]
    })
  ]);
  return { rows: rows(inWindow), baseline: rows(baseline) };
}

// --- Chartex artists + songs (Chartex tab) -------------------------------------

function hydrateChartex(row) {
  if (!row) return null;
  let stats = null;
  try { stats = JSON.parse(row.stats); } catch { /* none stored */ }
  return { ...row, stats };
}

export async function listChartexArtists() {
  const client = await getDb();
  const r = await client.execute("SELECT * FROM chartex_artists ORDER BY id ASC");
  return rows(r).map(hydrateChartex);
}

export async function getChartexArtist(id) {
  const client = await getDb();
  const r = await client.execute({ sql: "SELECT * FROM chartex_artists WHERE id = ?", args: [Number(id)] });
  return hydrateChartex(firstRow(r));
}

export async function createChartexArtist({ spotify_id, name = "" }) {
  const client = await getDb();
  await client.execute({
    sql: "INSERT OR IGNORE INTO chartex_artists (spotify_id, name) VALUES (?, ?)",
    args: [String(spotify_id), String(name)]
  });
  const r = await client.execute({ sql: "SELECT * FROM chartex_artists WHERE spotify_id = ?", args: [String(spotify_id)] });
  return hydrateChartex(firstRow(r));
}

export async function deleteChartexArtist(id) {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM chartex_artists WHERE id = ?", args: [Number(id)] });
  return { deleted: true };
}

// Partial update; undefined fields keep their last-known values.
export async function saveChartexArtistSync(id, data) {
  const client = await getDb();
  const sets = [];
  const args = [];
  for (const col of ["name", "image_url", "stats", "sync_error"]) {
    if (data[col] !== undefined) {
      sets.push(`${col} = ?`);
      args.push(data[col]);
    }
  }
  sets.push("synced_at = datetime('now')");
  await client.execute({ sql: `UPDATE chartex_artists SET ${sets.join(", ")} WHERE id = ?`, args: [...args, Number(id)] });
  return getChartexArtist(id);
}

export async function listChartexSongs(artistId) {
  const client = await getDb();
  const r = await client.execute({
    sql: "SELECT * FROM chartex_songs WHERE artist_id = ? ORDER BY id ASC",
    args: [Number(artistId)]
  });
  return rows(r).map(hydrateChartex);
}

// Find-or-create by Spotify track id, refreshing metadata + latest stats.
export async function upsertChartexSong(artistId, item) {
  const client = await getDb();
  await client.execute({
    sql: `INSERT INTO chartex_songs (artist_id, spotify_track_id, name, artists, image_url, release_date, stats, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(artist_id, spotify_track_id) DO UPDATE SET
        name = excluded.name,
        artists = excluded.artists,
        image_url = coalesce(excluded.image_url, image_url),
        release_date = coalesce(excluded.release_date, release_date),
        stats = excluded.stats,
        synced_at = excluded.synced_at`,
    args: [
      Number(artistId),
      String(item.spotify_id),
      item.song_name || "",
      item.artists || null,
      item.song_image_url || null,
      item.release_date || null,
      JSON.stringify(item)
    ]
  });
  const r = await client.execute({
    sql: "SELECT * FROM chartex_songs WHERE artist_id = ? AND spotify_track_id = ?",
    args: [Number(artistId), String(item.spotify_id)]
  });
  return hydrateChartex(firstRow(r));
}

export async function saveChartexArtistSnapshot(artistId, values) {
  const client = await getDb();
  const snapshotDate = values.date || new Date().toISOString().slice(0, 10);
  await client.execute({
    sql: `INSERT INTO chartex_artist_snapshots
      (artist_id, snapshot_date, tiktok_creates, spotify_streams, youtube_views, shazam_count, tiktok_followers, instagram_followers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(artist_id, snapshot_date) DO UPDATE SET
        tiktok_creates = coalesce(excluded.tiktok_creates, tiktok_creates),
        spotify_streams = coalesce(excluded.spotify_streams, spotify_streams),
        youtube_views = coalesce(excluded.youtube_views, youtube_views),
        shazam_count = coalesce(excluded.shazam_count, shazam_count),
        tiktok_followers = coalesce(excluded.tiktok_followers, tiktok_followers),
        instagram_followers = coalesce(excluded.instagram_followers, instagram_followers)`,
    args: [
      Number(artistId), snapshotDate,
      values.tiktok_creates ?? null, values.spotify_streams ?? null, values.youtube_views ?? null,
      values.shazam_count ?? null, values.tiktok_followers ?? null, values.instagram_followers ?? null
    ]
  });
}

export async function saveChartexSongSnapshot(songId, values) {
  const client = await getDb();
  const snapshotDate = values.date || new Date().toISOString().slice(0, 10);
  await client.execute({
    sql: `INSERT INTO chartex_song_snapshots
      (song_id, snapshot_date, tiktok_creates, spotify_streams, youtube_views, shazam_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(song_id, snapshot_date) DO UPDATE SET
        tiktok_creates = coalesce(excluded.tiktok_creates, tiktok_creates),
        spotify_streams = coalesce(excluded.spotify_streams, spotify_streams),
        youtube_views = coalesce(excluded.youtube_views, youtube_views),
        shazam_count = coalesce(excluded.shazam_count, shazam_count)`,
    args: [
      Number(songId), snapshotDate,
      values.tiktok_creates ?? null, values.spotify_streams ?? null,
      values.youtube_views ?? null, values.shazam_count ?? null
    ]
  });
}

// In-window snapshots plus per-artist latest-before-window baseline rows.
export async function getChartexArtistSnapshotSeries(sinceDate) {
  const client = await getDb();
  const [inWindow, baseline] = await Promise.all([
    client.execute({
      sql: "SELECT * FROM chartex_artist_snapshots WHERE snapshot_date >= ? ORDER BY artist_id ASC, snapshot_date ASC",
      args: [sinceDate]
    }),
    client.execute({
      sql: `SELECT s.* FROM chartex_artist_snapshots s
        JOIN (
          SELECT artist_id, max(snapshot_date) AS md
          FROM chartex_artist_snapshots WHERE snapshot_date < ? GROUP BY artist_id
        ) b ON s.artist_id = b.artist_id AND s.snapshot_date = b.md`,
      args: [sinceDate]
    })
  ]);
  return { rows: rows(inWindow), baseline: rows(baseline) };
}

// --- Storyboard workspace (Notes tab) ----------------------------------------

export async function getStoryboardWorkspace() {
  const client = await getDb();
  const r = await client.execute("SELECT data, version, updated_at FROM storyboard_workspace WHERE id = 1");
  return firstRow(r) || { data: "{}", version: 0, updated_at: null };
}

export async function saveStoryboardWorkspace(data, clientVersion) {
  const client = await getDb();
  const cur = await client.execute("SELECT version FROM storyboard_workspace WHERE id = 1");
  const currentVersion = cur.rows[0] ? Number(cur.rows[0]["version"]) : 0;
  if (typeof clientVersion === "number" && clientVersion < currentVersion) {
    return { conflict: true, serverVersion: currentVersion };
  }
  const nextVersion = currentVersion + 1;
  await client.execute({
    sql: "UPDATE storyboard_workspace SET data = ?, version = ?, updated_at = datetime('now') WHERE id = 1",
    args: [data, nextVersion]
  });
  return { version: nextVersion, conflict: false };
}

// --- Chat messages (sidebar messaging) ----------------------------------------

export function dmChannel(user1, user2) {
  return `dm:${[user1, user2].sort().join(":")}`;
}

export async function listChatMessages(channel, limit = 200) {
  const client = await getDb();
  const r = await client.execute({
    sql: "SELECT * FROM chat_messages WHERE channel = ? ORDER BY created_at ASC LIMIT ?",
    args: [channel, limit]
  });
  return rows(r);
}

export async function chatMessageCounts() {
  const client = await getDb();
  const r = await client.execute("SELECT channel, count(*) AS count FROM chat_messages GROUP BY channel");
  const counts = {};
  for (const row of rows(r)) counts[row.channel] = Number(row.count) || 0;
  return counts;
}

export async function createChatMessage({ channel, author, body }) {
  if (!body || !body.trim()) { const e = new Error("Message body is required."); e.status = 400; throw e; }
  const client = await getDb();
  const result = await client.execute({
    sql: "INSERT INTO chat_messages (channel, author, body) VALUES (?, ?, ?)",
    args: [channel, author, body.trim()]
  });
  const r = await client.execute({ sql: "SELECT * FROM chat_messages WHERE id = ?", args: [Number(result.lastInsertRowid)] });
  return firstRow(r);
}

export async function deleteChatMessage(id) {
  const client = await getDb();
  await client.execute({ sql: "DELETE FROM chat_messages WHERE id = ?", args: [Number(id)] });
  return { ok: true };
}

// --- Imports (xlsx) ----------------------------------------------------------

export async function createImport(filename) {
  const client = await getDb();
  const result = await client.execute({ sql: "INSERT INTO imports (filename) VALUES (?)", args: [filename] });
  return Number(result.lastInsertRowid);
}

export async function finishImport(id, summary) {
  const client = await getDb();
  await client.execute({
    sql: "UPDATE imports SET imported_rows = ?, skipped_rows = ?, task_rows = ?, daily_note_rows = ? WHERE id = ?",
    args: [summary.importedRows, summary.skippedRows, summary.taskRows, summary.dailyNoteRows, Number(id)]
  });
}

export async function createDailyNoteFromImport(input, meta = {}) {
  const client = await getDb();
  await client.execute({
    sql: `INSERT INTO daily_notes (
      note_date, assignee, category, body, source_filename, source_tab, source_row, import_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.note_date,
      input.assignee || null,
      input.category || "Misc.",
      input.body,
      meta.source_filename || null,
      meta.source_tab || null,
      meta.source_row || null,
      meta.import_id || null
    ]
  });
}

// --- Bootstrap ---------------------------------------------------------------

export async function getBootstrap() {
  const client = await getDb();
  await purgeExpired(client);
  const [total, open, overdue, archived, latestImport] = await Promise.all([
    client.execute("SELECT count(*) AS count FROM tasks WHERE archived = 0"),
    client.execute("SELECT count(*) AS count FROM tasks WHERE archived = 0 AND done = 0"),
    client.execute("SELECT count(*) AS count FROM tasks WHERE archived = 0 AND done = 0 AND status != 'BRB' AND due_date < date('now', 'localtime')"),
    client.execute("SELECT count(*) AS count FROM tasks WHERE archived = 1 AND archived_at >= datetime('now', '-30 days')"),
    client.execute("SELECT * FROM imports ORDER BY imported_at DESC LIMIT 1")
  ]);
  return {
    assignees: ASSIGNEES,
    dailyCategories: DAILY_CATEGORIES,
    statuses: STATUSES,
    counts: {
      tasks: Number(total.rows[0]?.["count"] ?? 0),
      open: Number(open.rows[0]?.["count"] ?? 0),
      overdue: Number(overdue.rows[0]?.["count"] ?? 0),
      archived: Number(archived.rows[0]?.["count"] ?? 0)
    },
    latestImport: firstRow(latestImport)
  };
}
