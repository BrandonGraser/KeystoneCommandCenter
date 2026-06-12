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

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
