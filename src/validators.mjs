export const STATUSES = [
  "Needs Tommy Review",
  "Needs Brandon Review",
  "Working",
  "Not Started",
  "Pending",
  "BRB",
  "Done"
];

export const ASSIGNEES = ["Brandon", "Mac", "Tommy"];

export const DAILY_CATEGORIES = [
  "ThxSoMch",
  "Drezzdon",
  "Misc.",
  "Subliminals",
  "T0XiiK",
  "SAiLOR",
  "Keystone",
  "Dire Dreams",
  "Hardstyle",
  "Polysynth",
  "11:11",
  "run it back"
];

export function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

// Like cleanText but keeps line breaks so multi-line descriptions and
// messages preserve the user's spacing instead of collapsing to one line.
export function cleanMultiline(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeAssignee(value) {
  const text = cleanText(value).toLowerCase();
  return ASSIGNEES.find((name) => name.toLowerCase() === text) || null;
}

export function normalizeStatus(value) {
  const text = cleanText(value);
  const lower = text.toLowerCase();
  if (!lower) return "BRB";
  if (/^(done|complete|completed|finished|x|yes)$/i.test(text)) return "Done";
  if (/^(working|in progress|started|active)$/i.test(text)) return "Working";
  if (/brandon/.test(lower) && /(review|check|approval)/.test(lower)) {
    return "Needs Brandon Review";
  }
  if (/tommy/.test(lower) && /(review|check|approval)/.test(lower)) {
    return "Needs Tommy Review";
  }
  if (/^(misc|misc\.|miscellaneous)$/i.test(text)) return "Not Started";
  if (/^(pending|waiting|on hold|hold)$/i.test(text)) return "Pending";
  if (/^(not started|todo|to do|open)$/i.test(text)) {
    return "Not Started";
  }
  const exact = STATUSES.find((status) => status.toLowerCase() === lower);
  return exact || null;
}

export function normalizeDailyCategory(value) {
  const text = cleanText(value);
  if (!text) return "Misc.";
  return DAILY_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase()) || "Misc.";
}

export function isDoneValue(value) {
  const text = cleanText(value).toLowerCase();
  return ["x", "yes", "y", "true", "done", "complete", "completed", "1"].includes(text);
}

export function validateTaskPayload(input, { partial = false } = {}) {
  const errors = [];
  const output = {};

  if (!partial || "title" in input) {
    output.title = cleanText(input.title);
    if (!output.title) errors.push("Task title is required.");
  }

  if ("details" in input) output.details = cleanMultiline(input.details);
  if ("project" in input) output.project = cleanText(input.project);
  if ("category" in input) output.category = normalizeDailyCategory(input.category);
  if ("due_date" in input) output.due_date = normalizeDateInput(input.due_date);
  if ("stamp_at" in input) output.stamp_at = normalizeDateTimeInput(input.stamp_at);
  if ("done" in input) output.done = Boolean(input.done);
  if ("archived" in input) output.archived = Boolean(input.archived);

  if (!partial || "assignee" in input) {
    output.assignee = normalizeAssignee(input.assignee);
    if (!output.assignee) errors.push("Assignee must be Brandon, Mac, or Tommy.");
  }

  if (!partial || "status" in input) {
    output.status = normalizeStatus(input.status) || "BRB";
  }

  if (output.status === "BRB" && (!partial || "status" in input || "due_date" in input)) {
    output.due_date = null;
  }

  if ("links" in input) {
    output.links = Array.isArray(input.links)
      ? input.links.map(validateLinkPayload).filter(Boolean)
      : [];
  }

  if ("notes" in input) {
    output.notes = Array.isArray(input.notes)
      ? input.notes.map(validateNotePayload).filter(Boolean)
      : [];
  }

  if ("workflow_steps" in input) {
    output.workflow_steps = Array.isArray(input.workflow_steps)
      ? input.workflow_steps.map(validateWorkflowStepPayload).filter(Boolean)
      : [];
  }

  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 400;
    throw error;
  }

  return output;
}

export function validateLinkPayload(input) {
  const label = cleanText(input?.label);
  const url = cleanText(input?.url);
  if (!label && !url) return null;
  return { label: label || url, url };
}

export function validateNotePayload(input) {
  const person = cleanText(input?.person) || "General";
  const body = cleanText(input?.body);
  if (!body) return null;
  return { person, body };
}

export function validateWorkflowStepPayload(input) {
  const label = cleanText(input?.label);
  if (!label) return null;
  return { label };
}

// --- TikTok accounts (FlowStage tab) -------------------------------------
// These are wholly independent of tasks; they share only generic helpers.

export const DEFAULT_ACCOUNT_STEPS = ["AI", "Editor", "Scheduler", "Poster"];

export function validateAccountStepPayload(input) {
  const label = cleanText(input?.label);
  if (!label) return null;
  return { label, assignee: normalizeAssignee(input?.assignee) };
}

export function validateAccountPayload(input, { partial = false } = {}) {
  const errors = [];
  const output = {};

  if (!partial || "name" in input) {
    output.name = cleanText(input.name);
    if (!output.name) errors.push("Account name is required.");
  }

  for (const field of ["ae_project_url", "tutorial_url", "username", "email", "password", "flowstage_account_id", "group_name"]) {
    if (field in input) output[field] = cleanText(input[field]);
  }
  // Avatar is a data: URL (or "" to clear) — don't run it through cleanText.
  if ("avatar" in input) {
    output.avatar = typeof input.avatar === "string" && input.avatar.startsWith("data:image/") ? input.avatar : "";
  }
  if ("scheduled_through" in input) output.scheduled_through = normalizeDateInput(input.scheduled_through);

  if ("steps" in input) {
    output.steps = Array.isArray(input.steps)
      ? input.steps.map(validateAccountStepPayload).filter(Boolean)
      : [];
  }

  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 400;
    throw error;
  }

  return output;
}

export function normalizeDateInput(value) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function normalizeDateTimeInput(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
