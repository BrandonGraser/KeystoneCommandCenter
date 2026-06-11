import { readWorkbook } from "./xlsx.mjs";
import {
  createDailyNoteFromImport,
  createImport,
  createTask,
  finishImport
} from "./db.mjs";
import {
  cleanText,
  isDoneValue,
  normalizeAssignee,
  normalizeDateInput,
  normalizeDateTimeInput,
  normalizeStatus
} from "./validators.mjs";

const TASK_TABS = new Map([
  ["brandon to do", "Brandon"],
  ["mac to do", "Mac"],
  ["tommy to do", "Tommy"]
]);

const NOTE_PEOPLE = ["Tommy", "Brandon", "Mac"];

export function importWorkbook(buffer, filename) {
  const sheets = readWorkbook(buffer);
  const importId = createImport(filename);
  const summary = {
    importId,
    filename,
    importedRows: 0,
    skippedRows: 0,
    taskRows: 0,
    dailyNoteRows: 0,
    tabs: []
  };

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const normalizedName = sheetName.trim().toLowerCase();
    if (!TASK_TABS.has(normalizedName)) continue;

    const assignee = TASK_TABS.get(normalizedName);
    const tabSummary = importTaskSheet(rows, {
      assignee,
      sheetName,
      filename,
      importId
    });
    summary.importedRows += tabSummary.importedRows;
    summary.skippedRows += tabSummary.skippedRows;
    summary.taskRows += tabSummary.taskRows;
    summary.dailyNoteRows += tabSummary.dailyNoteRows;
    summary.tabs.push(tabSummary);
  }

  finishImport(importId, summary);
  return summary;
}

function importTaskSheet(rows, meta) {
  const summary = {
    tab: meta.sheetName,
    importedRows: 0,
    skippedRows: 0,
    taskRows: 0,
    dailyNoteRows: 0
  };
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) return summary;

  const headers = rows[headerIndex].cells.map(normalizeHeader);
  let inCredentialBlock = false;
  let inDailyNotes = false;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const values = row.cells.map(cleanText);
    const rowText = values.filter(Boolean).join(" ");
    const lower = rowText.toLowerCase();

    if (!rowText) {
      inCredentialBlock = false;
      continue;
    }

    summary.importedRows += 1;

    if (/daily\s+notes?/.test(lower)) {
      inDailyNotes = true;
      inCredentialBlock = false;
      summary.skippedRows += 1;
      continue;
    }

    if (startsCredentialBlock(lower)) {
      inCredentialBlock = true;
    }
    if (inCredentialBlock || includesCredentialInfo(lower)) {
      summary.skippedRows += 1;
      continue;
    }

    if (inDailyNotes) {
      const note = extractDailyNote(values, meta.assignee);
      if (note) {
        createDailyNoteFromImport(note, {
          source_filename: meta.filename,
          source_tab: meta.sheetName,
          source_row: row.rowNumber,
          import_id: meta.importId
        });
        summary.dailyNoteRows += 1;
      } else {
        summary.skippedRows += 1;
      }
      continue;
    }

    const task = extractTask(values, headers, meta.assignee);
    if (!task) {
      summary.skippedRows += 1;
      continue;
    }

    createTask(task, {
      source_filename: meta.filename,
      source_tab: meta.sheetName,
      source_row: row.rowNumber,
      import_id: meta.importId
    });
    summary.taskRows += 1;
  }

  return summary;
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => {
    const headers = row.cells.map(normalizeHeader);
    const joined = headers.join("|");
    return (
      /done/.test(joined) &&
      /(task|tasks|todo|to_do)/.test(joined) &&
      /(project|status|project_status)/.test(joined)
    );
  });
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function extractTask(values, headers, fallbackAssignee) {
  const byHeader = (matcher) => {
    const index = headers.findIndex(matcher);
    return index >= 0 ? values[index] : "";
  };

  const taskText = byHeader((header) => ["tasks", "task", "todo", "to_do"].includes(header));
  const doneText = byHeader((header) => header === "done");
  const stampText = byHeader((header) => header.includes("stamp"));
  const dueText = byHeader((header) => header === "due" || header.includes("due_date"));
  const projectStatusText = byHeader((header) => header.includes("project"));
  const linkText = byHeader((header) => header.includes("link"));
  const assigneeText = byHeader((header) => header.includes("assignee") || header.includes("owner"));

  const noteEntries = headers
    .map((header, index) => ({ header, value: values[index] }))
    .filter(({ header, value }) => header.includes("note") && cleanText(value))
    .map(({ header, value }) => ({
      person: NOTE_PEOPLE.find((person) => header.includes(person.toLowerCase())) || "General",
      body: cleanText(value)
    }));

  const allMeaningful = [taskText, projectStatusText, linkText, ...noteEntries.map((note) => note.body)]
    .map(cleanText)
    .filter(Boolean);

  if (!allMeaningful.length) return null;
  if (looksLikeStatusSeparator(allMeaningful)) return null;

  const projectStatus = cleanText(projectStatusText);
  const normalizedProjectStatus = normalizeStatus(projectStatus);
  const done = isDoneValue(doneText) || normalizedProjectStatus === "Done";
  let status = done ? "Done" : normalizedProjectStatus || "BRB";
  let project = normalizedProjectStatus ? "" : projectStatus;

  if (projectStatus && !project && !normalizedProjectStatus) project = projectStatus;
  if (status === "BRB" && done) status = "Done";

  const title = cleanText(taskText || project || noteEntries[0]?.body || linkText);
  if (!title) return null;

  return {
    assignee: normalizeAssignee(assigneeText) || fallbackAssignee,
    title,
    details: taskText && title !== taskText ? taskText : "",
    project,
    status,
    done,
    due_date: normalizeSheetDate(dueText, true),
    stamp_at: normalizeSheetDate(stampText, false),
    links: parseLinks(linkText),
    notes: noteEntries
  };
}

function extractDailyNote(values, fallbackAssignee) {
  const body = values.filter(Boolean).join(" | ");
  if (!body) return null;
  const date = values.map((value) => normalizeSheetDate(value, true)).find(Boolean);
  return {
    note_date: date || new Date().toISOString().slice(0, 10),
    assignee: fallbackAssignee,
    body
  };
}

function parseLinks(text) {
  const raw = cleanText(text);
  if (!raw) return [];
  return raw
    .split(/\s*(?:\n|,|;|\|)\s*/g)
    .map(cleanText)
    .filter(Boolean)
    .map((part) => {
      const urlMatch = part.match(/https?:\/\/\S+/i);
      return {
        label: urlMatch ? part.replace(urlMatch[0], "").trim() || urlMatch[0] : part,
        url: urlMatch ? urlMatch[0] : ""
      };
    });
}

function normalizeSheetDate(value, dateOnly) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) {
    const date = excelSerialToDate(Number(text));
    return dateOnly ? date.toISOString().slice(0, 10) : date.toISOString();
  }
  return dateOnly ? normalizeDateInput(text) : normalizeDateTimeInput(text);
}

function excelSerialToDate(serial) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 86400000);
}

function looksLikeStatusSeparator(values) {
  if (values.length > 2) return false;
  const text = values.join(" ").trim();
  return Boolean(normalizeStatus(text)) && text.length < 40;
}

function startsCredentialBlock(text) {
  return /(login|password|credentials?|account\s+info|access\s+info)/.test(text) &&
    !/(task|todo|review|due)/.test(text);
}

function includesCredentialInfo(text) {
  return /(password|passcode|username|user\s*name|login|2fa|secret|recovery\s+code|api\s+key)/.test(text) &&
    /(account|email|@|http|www|credential|access|pw|pass)/.test(text);
}
