// Exercises the production (Vercel) handler end-to-end against a temp DB.
import { rmSync, existsSync } from "node:fs";
import { Readable } from "node:stream";

const TEST_DB = "./data/test-api.db";
if (existsSync(TEST_DB)) rmSync(TEST_DB);
process.env.TURSO_DATABASE_URL = `file:${TEST_DB}`;

const { default: handler } = await import("../api/index.js");

let failures = 0;

async function call(method, path, body) {
  const req = body ? Readable.from([Buffer.from(JSON.stringify(body))]) : Readable.from([]);
  req.method = method;
  req.url = path;
  req.headers = { host: "localhost" };
  let status = 0;
  let payload = "";
  const res = {
    writeHead(code) { status = code; },
    end(data) { payload = data; this._done?.(); }
  };
  const finished = new Promise((resolve) => { res._done = resolve; });
  await handler(req, res);
  await finished;
  return { status, body: JSON.parse(payload || "{}") };
}

function check(name, condition, extra = "") {
  if (condition) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name} ${extra}`); }
}

// create
const created = await call("POST", "/api/tasks", { title: "Test task", assignee: "Tommy", status: "Working" });
check("create task", created.status === 201 && created.body.task?.id > 0, JSON.stringify(created));
const id = created.body.task.id;

// edit
const edited = await call("PATCH", `/api/tasks/${id}`, { title: "Edited title", details: "new details" });
check("edit task (PATCH)", edited.status === 200 && edited.body.task?.title === "Edited title", JSON.stringify(edited));

// verify edit persisted
const list1 = await call("GET", "/api/tasks?assignee=Tommy");
check("edit persisted in list", list1.body.tasks?.some((t) => t.id === id && t.title === "Edited title"));

// inline status change
const statusEdit = await call("PATCH", `/api/tasks/${id}`, { status: "Not Started" });
check("inline status change", statusEdit.body.task?.status === "Not Started", JSON.stringify(statusEdit.body.task?.status));

// archive
const archived = await call("DELETE", `/api/tasks/${id}`);
check("archive task", archived.status === 200 && archived.body.task?.archived === true, JSON.stringify(archived));

const list2 = await call("GET", "/api/tasks");
check("archived task gone from active list", !list2.body.tasks?.some((t) => t.id === id));

const list3 = await call("GET", "/api/tasks?archived=true");
check("archived task visible in archive list", list3.body.tasks?.some((t) => t.id === id));

// restore
const restored = await call("POST", `/api/tasks/${id}/restore`);
check("restore task", restored.status === 200 && restored.body.task?.archived === false, JSON.stringify(restored));

// duplicate
const dup = await call("POST", `/api/tasks/${id}/duplicate`);
check("duplicate task", dup.status === 201 && dup.body.task?.title.includes("(copy)"));

// permanent delete
const deleted = await call("DELETE", `/api/tasks/${id}/delete`);
check("permanent delete", deleted.status === 200 && deleted.body.deleted === true, JSON.stringify(deleted));
const list4 = await call("GET", "/api/tasks");
check("deleted task gone everywhere", !list4.body.tasks?.some((t) => t.id === id));

// messages
const dupId = dup.body.task.id;
const msg = await call("POST", `/api/tasks/${dupId}/messages`, { author: "Me", body: "hello" });
check("create message", msg.status === 201 && msg.body.message?.id > 0);
const delMsg = await call("DELETE", `/api/tasks/${dupId}/messages/${msg.body.message.id}`);
check("delete message", delMsg.status === 200);

// resources
const resource = await call("POST", "/api/resources", { section: "important_links", title: "Test link", url: "https://example.com" });
check("create resource", resource.status === 201 && resource.body.resource?.id > 0);
const delRes = await call("DELETE", `/api/resources/${resource.body.resource.id}`);
check("delete resource", delRes.status === 200 && delRes.body.ok === true);

// bootstrap
const boot = await call("GET", "/api/bootstrap");
check("bootstrap", boot.status === 200 && Array.isArray(boot.body.assignees));

// combined polling endpoint
const sync = await call("GET", "/api/sync");
check(
  "combined /api/sync",
  sync.status === 200 && Array.isArray(sync.body.tasks) && Array.isArray(sync.body.resources)
    && sync.body.counts && typeof sync.body.chatCounts === "object",
  JSON.stringify(Object.keys(sync.body))
);

// tiktok accounts + metrics endpoints
const acct = await call("POST", "/api/tiktok-accounts", { name: "Test account" });
check("create tiktok account", acct.status === 201 && acct.body.account?.id > 0, JSON.stringify(acct.body));
const acctId = acct.body.account.id;

const overview = await call("GET", "/api/metrics/overview?days=30");
check(
  "metrics overview",
  overview.status === 200 && overview.body.days === 30 && Array.isArray(overview.body.accounts)
    && overview.body.accounts.some((a) => a.id === acctId),
  JSON.stringify(overview.body).slice(0, 200)
);

const topVideos = await call("GET", "/api/videos/top?days=30");
check("top videos", topVideos.status === 200 && Array.isArray(topVideos.body.videos));

const acctVideos = await call("GET", `/api/tiktok-accounts/${acctId}/videos?days=30&limit=5`);
check("account videos", acctVideos.status === 200 && Array.isArray(acctVideos.body.videos));

const delAcct = await call("DELETE", `/api/tiktok-accounts/${acctId}`);
check("delete tiktok account", delAcct.status === 200 && delAcct.body.deleted === true);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
