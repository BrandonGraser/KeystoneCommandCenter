const state = {
  assignees: [],
  statuses: [],
  activeAssignee: "",
  tasks: [],
  filters: {
    status: "All",
    due: "",
    search: ""
  },
  showArchive: false,
  dailyCategories: [],
  expandedTaskId: null,
  taskMessages: {},
  taskImages: {},
  formImages: [],
  removedImageIds: [],
  focusedMessageId: null,
  editingTask: null,
  theme: getStoredTheme()
};

const CATEGORY_TONES = {
  "ThxSoMch": { accent: "#0033a0", background: "#e5edff", border: "#b8c8f6" },
  "Drezzdon": { accent: "#9d1c2d", background: "#fde8eb", border: "#edb8c1" },
  "Misc.": { accent: "#5f6368", background: "#eeeeea", border: "#d7d7d2" },
  "Subliminals": { accent: "#1f7a4d", background: "#e4f4eb", border: "#b8dcc8" },
  "T0XiiK": { accent: "#5b42a5", background: "#eee9ff", border: "#c9bdf4" },
  "SAiLOR": { accent: "#23766f", background: "#e2f5f2", border: "#b5ded8" },
  "Keystone": { accent: "#0033a0", background: "#eef3ff", border: "#b8c8f6" },
  "Dire Dreams": { accent: "#2d6687", background: "#e6f2f7", border: "#b8d4df" },
  "Hardstyle": { accent: "#0033a0", background: "#e4ecff", border: "#b4c7f6" },
  "Polysynth": { accent: "#8a6a08", background: "#fff6d7", border: "#ead89e" },
  "11:11": { accent: "#6f563b", background: "#f2e8dd", border: "#dac9b6" },
  "run it back": { accent: "#287345", background: "#e5f4e9", border: "#badcc4" }
};

const els = {
  metrics: document.querySelector("#metrics"),
  assigneeTabs: document.querySelector("#assigneeTabs"),
  statusFilter: document.querySelector("#statusFilter"),
  dueFilter: document.querySelector("#dueFilter"),
  searchInput: document.querySelector("#searchInput"),
  archiveToggle: document.querySelector("#archiveToggle"),
  taskBoard: document.querySelector("#taskBoard"),
  notice: document.querySelector("#notice"),
  taskDialog: document.querySelector("#taskDialog"),
  taskForm: document.querySelector("#taskForm"),
  ringDialog: document.querySelector("#ringDialog"),
  ringForm: document.querySelector("#ringForm"),
  closeRingDialog: document.querySelector("#closeRingDialog"),
  cancelRing: document.querySelector("#cancelRing"),
  ringDescription: document.querySelector("#ringDescription"),
  ringTask: document.querySelector("#ringTask"),
  dialogMode: document.querySelector("#dialogMode"),
  dialogTitle: document.querySelector("#dialogTitle"),
  closeDialog: document.querySelector("#closeDialog"),
  cancelTask: document.querySelector("#cancelTask"),
  archiveTask: document.querySelector("#archiveTask"),
  taskId: document.querySelector("#taskId"),
  taskName: document.querySelector("#taskName"),
  taskTitle: document.querySelector("#taskTitle"),
  taskAssignee: document.querySelector("#taskAssignee"),
  taskCategory: document.querySelector("#taskCategory"),
  taskDue: document.querySelector("#taskDue"),
  taskDone: document.querySelector("#taskDone"),
  taskWorkflow: document.querySelector("#taskWorkflow"),
  addWorkflowStep: document.querySelector("#addWorkflowStep"),
  taskLinks: document.querySelector("#taskLinks"),
  addTaskLink: document.querySelector("#addTaskLink"),
  taskNotes: document.querySelector("#taskNotes"),
  taskNoteLinks: document.querySelector("#taskNoteLinks"),
  addNoteLink: document.querySelector("#addNoteLink"),
  taskImages: document.querySelector("#taskImages"),
  loginResources: document.querySelector("#loginResources"),
  importantLinkResources: document.querySelector("#importantLinkResources"),
  resourceDialog: document.querySelector("#resourceDialog"),
  resourceForm: document.querySelector("#resourceForm"),
  resourceDialogTitle: document.querySelector("#resourceDialogTitle"),
  closeResourceDialog: document.querySelector("#closeResourceDialog"),
  cancelResource: document.querySelector("#cancelResource"),
  resourceSection: document.querySelector("#resourceSection"),
  resourceTitle: document.querySelector("#resourceTitle"),
  resourceUrl: document.querySelector("#resourceUrl"),
  resourceLoginFields: document.querySelector("#resourceLoginFields"),
  resourceUsername: document.querySelector("#resourceUsername"),
  resourcePassword: document.querySelector("#resourcePassword"),
  mainTabs: document.querySelector("#mainTabs"),
  tasksView: document.querySelector("#tasksView"),
  accountsView: document.querySelector("#accountsView"),
  accountBoard: document.querySelector("#accountBoard"),
  addAccount: document.querySelector("#addAccount"),
  syncAllAccounts: document.querySelector("#syncAllAccounts"),
  accountDialog: document.querySelector("#accountDialog"),
  accountForm: document.querySelector("#accountForm"),
  accountDialogTitle: document.querySelector("#accountDialogTitle"),
  accountDialogMode: document.querySelector("#accountDialogMode"),
  closeAccountDialog: document.querySelector("#closeAccountDialog"),
  cancelAccount: document.querySelector("#cancelAccount"),
  deleteAccount: document.querySelector("#deleteAccount"),
  accountId: document.querySelector("#accountId"),
  accountName: document.querySelector("#accountName"),
  accountNameSelect: document.querySelector("#accountNameSelect"),
  accountNameCustomRow: document.querySelector("#accountNameCustomRow"),
  accountAeUrl: document.querySelector("#accountAeUrl"),
  accountTutorialUrl: document.querySelector("#accountTutorialUrl"),
  accountUsername: document.querySelector("#accountUsername"),
  accountEmail: document.querySelector("#accountEmail"),
  accountPassword: document.querySelector("#accountPassword"),
  accountScheduledThrough: document.querySelector("#accountScheduledThrough"),
  accountFlowstageId: document.querySelector("#accountFlowstageId"),
  accountSteps: document.querySelector("#accountSteps"),
  addAccountStep: document.querySelector("#addAccountStep")
};

const SYNC_INTERVAL_MS = 5000;

init();

async function init() {
  applyTheme();
  bindEvents();
  const bootstrap = await api("/api/bootstrap");
  state.assignees = bootstrap.assignees;
  state.activeAssignee = state.assignees[0] || "";
  state.statuses = bootstrap.statuses;
  state.dailyCategories = bootstrap.dailyCategories || [];
  renderChrome(bootstrap);
  renderLinkInputs();
  applyStoredResourceCollapse();
  await Promise.all([loadTasks(), loadResources()]);
  // Restore the last-used tab here (not during bindEvents): this runs after the
  // module has fully evaluated, so the accounts state/consts are initialized.
  switchTab(getStoredTab());
  startLiveSync();
}

function applyStoredResourceCollapse() {
  document.querySelectorAll("[data-resource-block]").forEach((block) => {
    const open = getStoredResourceOpen(block.dataset.resourceBlock);
    block.classList.toggle("collapsed", !open);
    block.querySelector(".resource-heading")?.setAttribute("aria-expanded", String(open));
  });
}

function toggleResourceBlock(block) {
  if (!block) return;
  const collapsed = block.classList.toggle("collapsed");
  block.querySelector(".resource-heading")?.setAttribute("aria-expanded", String(!collapsed));
  try {
    localStorage.setItem(`keystone-resources-${block.dataset.resourceBlock}`, collapsed ? "collapsed" : "open");
  } catch {
    // Collapse state just won't persist across reloads if storage is unavailable.
  }
}

function getStoredResourceOpen(name) {
  try {
    return localStorage.getItem(`keystone-resources-${name}`) === "open";
  } catch {
    return false;
  }
}

// Surface failed requests instead of letting clicks silently do nothing.
window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || "Request failed.";
  showNotice(message, "bad");
});

function startLiveSync() {
  window.setInterval(() => { syncNow(); }, SYNC_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncNow();
  });
}

let syncInFlight = false;

async function syncNow() {
  if (syncInFlight || document.hidden) return;
  // Don't yank the UI out from under someone mid-edit.
  if (els.taskDialog.open || els.ringDialog.open || els.resourceDialog.open) return;
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;

  syncInFlight = true;
  try {
    const [bootstrap, data, resources] = await Promise.all([
      api("/api/bootstrap"),
      api(`/api/tasks?${taskQueryParams()}`),
      api("/api/resources")
    ]);
    if (JSON.stringify(data.tasks) !== JSON.stringify(state.tasks)) {
      state.tasks = data.tasks;
      if (state.expandedTaskId) {
        if (state.tasks.some((task) => task.id === state.expandedTaskId)) {
          await loadTaskMessages(state.expandedTaskId);
        } else {
          state.expandedTaskId = null;
          state.focusedMessageId = null;
        }
      }
      renderTasks();
    } else if (state.expandedTaskId) {
      const before = JSON.stringify(state.taskMessages[state.expandedTaskId] || []);
      await loadTaskMessages(state.expandedTaskId);
      if (JSON.stringify(state.taskMessages[state.expandedTaskId] || []) !== before) renderTasks();
    }
    updateMetricCounts(bootstrap.counts);
    renderResources(resources.resources);
  } catch {
    // Network hiccups during background sync are non-fatal; next tick retries.
  } finally {
    syncInFlight = false;
  }
}

function bindEvents() {
  els.assigneeTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-assignee]");
    if (!button) return;
    state.activeAssignee = button.dataset.assignee;
    state.expandedTaskId = null;
    state.focusedMessageId = null;
    renderAssigneeTabs();
    loadTasks();
  });
  els.statusFilter.addEventListener("change", () => {
    state.filters.status = els.statusFilter.value;
    loadTasks();
  });
  els.dueFilter.addEventListener("change", () => {
    state.filters.due = els.dueFilter.value;
    loadTasks();
  });
  els.searchInput.addEventListener("input", debounce(() => {
    state.filters.search = els.searchInput.value.trim();
    loadTasks();
  }, 180));
  els.archiveToggle.addEventListener("click", () => {
    state.showArchive = !state.showArchive;
    state.expandedTaskId = null;
    renderArchiveToggle();
    loadTasks();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("#newTaskButton")) openTaskDialog();
    if (event.target.closest("#themeToggleButton")) toggleTheme();
    if (event.target.closest("#ringButton")) openRingDialog();
  });
  document.addEventListener("click", async (event) => {
    const addButton = event.target.closest(".add-resource");
    if (addButton) {
      openResourceDialog(addButton.dataset.resourceSection);
      return;
    }

    const heading = event.target.closest(".resource-heading");
    if (heading) {
      toggleResourceBlock(heading.closest(".resource-block"));
      return;
    }

    const deleteButton = event.target.closest(".delete-resource");
    if (deleteButton) await deleteResource(Number(deleteButton.dataset.resourceId));
  });
  els.closeResourceDialog.addEventListener("click", () => els.resourceDialog.close());
  els.cancelResource.addEventListener("click", () => els.resourceDialog.close());
  els.resourceForm.addEventListener("submit", saveResource);
  els.closeRingDialog.addEventListener("click", () => els.ringDialog.close());
  els.cancelRing.addEventListener("click", () => els.ringDialog.close());
  els.ringForm.addEventListener("submit", sendRing);
  els.closeDialog.addEventListener("click", () => els.taskDialog.close());
  els.cancelTask.addEventListener("click", () => els.taskDialog.close());
  els.addTaskLink.addEventListener("click", () => addLinkRow());
  els.addNoteLink.addEventListener("click", () => addNoteLinkRow());
  els.addWorkflowStep.addEventListener("click", () => addWorkflowStep());
  els.taskWorkflow.addEventListener("click", removeWorkflowStep);
  els.taskForm.addEventListener("submit", saveTask);
  els.archiveTask.addEventListener("click", archiveCurrentTask);
  bindAccountEvents();
  els.taskImages.addEventListener("click", (event) => {
    if (event.target.closest(".task-image-browse")) {
      els.taskImages.querySelector(".task-image-input")?.click();
      return;
    }
    const del = event.target.closest(".task-image-delete");
    if (del) {
      removeFormImage(Number(del.dataset.imageIndex));
      return;
    }
    const thumb = event.target.closest(".task-image-thumb");
    if (thumb) openImageLightbox(thumb.src);
  });
  els.taskImages.addEventListener("change", async (event) => {
    const input = event.target.closest(".task-image-input");
    if (!input) return;
    const files = [...(input.files || [])];
    input.value = "";
    for (const file of files) await addFormImageFile(file);
  });
  els.taskImages.addEventListener("paste", async (event) => {
    if (!event.target.closest(".task-image-add")) return;
    const imageItem = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    await addFormImageFile(file);
  });
  els.taskCategory.addEventListener("change", () => applyCategoryTone(els.taskCategory, els.taskCategory.value));
  document.querySelector("#categoryPillPicker")?.addEventListener("click", (event) => {
    const pill = event.target.closest(".category-pill-option");
    if (!pill) return;
    const category = pill.dataset.category;
    els.taskCategory.value = category;
    applyCategoryTone(els.taskCategory, category);
    renderCategoryPillPicker(category);
  });
  els.taskAssignee.addEventListener("change", () => ensureNoteLinkPerson(els.taskAssignee.value));
  els.taskBoard.addEventListener("change", async (event) => {
    const authorSelect = event.target.closest(".chat-author");
    if (authorSelect) {
      storeChatAuthor(authorSelect.value);
      authorSelect.className = `chat-author author-name author-${authorSlug(authorSelect.value)}`;
      return;
    }
    const photoInput = event.target.closest(".chat-photo-input");
    if (photoInput) {
      await handleChatPhoto(photoInput);
      return;
    }
    const select = event.target.closest(".inline-status-select");
    if (!select) return;
    const row = select.closest(".task-row");
    if (!row) return;
    const taskId = Number(row.dataset.taskId);
    const data = await api(`/api/tasks/${taskId}`, { method: "PATCH", body: { status: select.value } });
    const index = state.tasks.findIndex((t) => t.id === taskId);
    if (index >= 0) state.tasks[index] = data.task;
    renderTasks();
  });
  els.taskBoard.addEventListener("keydown", (event) => {
    const composer = event.target.closest(".chat-body");
    if (!composer) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const expanded = composer.closest(".task-expanded");
      if (expanded) sendTaskMessage(expanded);
    }
  });
  els.taskBoard.addEventListener("paste", async (event) => {
    const composer = event.target.closest(".chat-body");
    if (!composer) return;
    const items = [...(event.clipboardData?.items || [])];
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    await attachChatImage(composer.closest(".task-expanded"), file);
  });
}

async function handleChatPhoto(input) {
  const file = input.files && input.files[0];
  const expanded = input.closest("[data-task-id]");
  input.value = "";
  await attachChatImage(expanded, file);
}

async function attachChatImage(expanded, file) {
  const taskId = Number(expanded?.dataset.taskId);
  if (!file || !taskId) return;
  try {
    pendingImages[taskId] = await readImageAsDataUrl(file);
    const preview = expanded.querySelector(".chat-photo-preview");
    if (preview) {
      preview.hidden = false;
      preview.innerHTML = `<img src="${escapeHtml(pendingImages[taskId])}" alt="Attachment preview"><button type="button" class="chat-photo-remove" title="Remove photo">Remove</button>`;
    }
  } catch (error) {
    showNotice(error.message, "bad");
  }
}

function renderChrome(bootstrap) {
  els.metrics.innerHTML = [
    metric("Open tasks", bootstrap.counts.open, "open"),
    metric("Total active", bootstrap.counts.tasks, "tasks"),
    metric("Overdue", bootstrap.counts.overdue, "overdue"),
    metric("Archived 30 days", bootstrap.counts.archived || 0, "archived"),
    `<div class="metric metric-action">
      <button id="newTaskButton" class="primary">New Task</button>
      <div class="action-subrow">
        <button id="ringButton" class="secondary ring-button" type="button">
          <span class="ring-icon" aria-hidden="true"></span>
          Ring Tommy
        </button>
        <button id="themeToggleButton" class="secondary theme-toggle" type="button" aria-pressed="${state.theme === "dark"}"></button>
      </div>
    </div>`
  ].join("");
  renderThemeToggle();
  renderArchiveToggle();

  if (!state.assignees.includes(state.activeAssignee)) {
    state.activeAssignee = state.assignees[0] || "";
  }

  els.assigneeTabs.innerHTML = state.assignees
    .map((name) => `<button type="button" data-assignee="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
    .join("");
  renderAssigneeTabs();

  els.statusFilter.innerHTML = ["All", ...state.statuses]
    .map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`)
    .join("");

  els.taskAssignee.innerHTML = state.assignees
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
  els.taskCategory.innerHTML = state.dailyCategories
    .map(renderCategoryOption)
    .join("");
  applyCategoryTone(els.taskCategory, els.taskCategory.value || "Misc.");
}

function renderAssigneeTabs() {
  els.assigneeTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.assignee === state.activeAssignee);
  });
}

function renderArchiveToggle() {
  if (!els.archiveToggle) return;
  els.archiveToggle.classList.toggle("active", state.showArchive);
  els.archiveToggle.textContent = state.showArchive ? "Back to Active" : "Archive";
  els.archiveToggle.setAttribute("aria-pressed", String(state.showArchive));
}

function taskQueryParams() {
  const params = new URLSearchParams();
  if (state.activeAssignee) params.set("assignee", state.activeAssignee);
  if (state.filters.status !== "All") params.set("status", state.filters.status);
  if (state.filters.due) params.set("due", state.filters.due);
  if (state.filters.search) params.set("search", state.filters.search);
  if (state.showArchive) params.set("archived", "true");
  return params.toString();
}

async function loadTasks() {
  const data = await api(`/api/tasks?${taskQueryParams()}`);
  state.tasks = data.tasks;
  renderTasks();
}

function renderTasks() {
  if (!state.tasks.length) {
    els.taskBoard.innerHTML = `<div class="empty">${state.showArchive ? "No archived tasks inside the 30-day window." : "No tasks match the current filters."}</div>`;
    return;
  }
  if (state.showArchive) {
    els.taskBoard.innerHTML = `
      <section class="status-group archive-group">
        <div class="group-head">
          <h2>Archive</h2>
          <span>${state.tasks.length} task${state.tasks.length === 1 ? "" : "s"} kept for 30 days</span>
        </div>
        ${state.tasks.map(renderTaskBlock).join("")}
      </section>
    `;
    return;
  }
  const groups = groupBy(state.tasks, (task) => task.status || "BRB");
  els.taskBoard.innerHTML = state.statuses
    .filter((status) => groups.has(status))
    .map((status) => renderGroup(status, groups.get(status)))
    .join("");
}

function renderGroup(status, tasks) {
  return `
    <section class="status-group">
      <div class="group-head">
        <h2>${escapeHtml(status)}</h2>
        <span>${tasks.length} task${tasks.length === 1 ? "" : "s"}</span>
      </div>
      ${tasks.map(renderTaskBlock).join("")}
    </section>
  `;
}

function renderTaskBlock(task) {
  return `${renderTaskRow(task)}${state.expandedTaskId === task.id ? renderTaskExpanded(task) : ""}`;
}

function renderTaskRow(task) {
  const due = dueState(task.due_date, task.done, task.status);
  const archive = archiveState(task);
  const statusMeta = taskStatusMeta(task.status, task.done);
  const statusSelect = task.done
    ? `<span class="status-badge status-done-status">Done</span>`
    : `<select class="status-badge status-${statusMeta.className} inline-status-select" title="Change status">
        ${state.statuses.map((s) => `<option value="${escapeHtml(s)}"${s === task.status ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}
       </select>`;
  return `
    <article class="task-row ${task.done ? "done" : ""} ${state.showArchive ? "archived-row" : ""} status-row-${statusMeta.className}" data-task-id="${task.id}">
      <input class="task-check" type="checkbox" ${task.done ? "checked" : ""} ${state.showArchive ? "disabled" : ""} title="Mark done">
      <div class="task-main">
        <div class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</div>
        <div class="task-tags">
          <span class="task-category collapsed-category" style="${categoryToneStyle(task.category)}">${escapeHtml(task.category || "Misc.")}</span>
          ${statusSelect}
          ${task.image_count ? `<span class="img-count">${task.image_count} img</span>` : ""}
          ${task.last_message ? `<span class="last-msg">last: <span class="author-name author-${authorSlug(task.last_message.author)}">${escapeHtml(task.last_message.author)}</span></span>` : ""}
        </div>
      </div>
      <div class="due ${due.className}" title="${escapeHtml(due.label)}">
        <span>${escapeHtml(state.showArchive ? archive.display : (due.display || task.due_date || "No due"))}</span>
        <small>${escapeHtml(state.showArchive ? archive.label : due.label)}</small>
      </div>
      <div class="row-actions">
        <span class="expand-hint">${state.expandedTaskId === task.id ? "▲ Hide" : "▼ View"}</span>
        ${state.showArchive
          ? `<button type="button" data-action="restore-task">Restore</button>`
          : `<button type="button" class="row-archive-button" data-action="archive-task" title="Archive task">Archive</button><button type="button" class="row-delete-button danger" data-action="delete-task" title="Permanently delete">Delete</button><button type="button" data-action="duplicate-task">Duplicate</button><button type="button" data-action="edit">Edit</button>`}
      </div>
    </article>
  `;
}

function renderTaskExpanded(task) {
  const messages = state.taskMessages[task.id] || [];
  const noteLinks = (task.links || []).filter(isNoteLink);
  const taskLinks = (task.links || []).filter((link) => !isNoteLink(link));
  return `
    <section class="task-expanded" data-task-id="${task.id}">
      <div class="task-detail-grid">
        <div class="full-task-detail">
          <span class="detail-label">Full Task</span>
          <div class="full-task-text expanded-task-title">${escapeHtml(task.title)}</div>
          <textarea class="task-detail-copy inline-task-input expanded-task-details" data-inline-field="details" rows="6" placeholder="Add task details" aria-label="Task details">${escapeHtml(task.details || "")}</textarea>
        </div>
        <div class="workflow-detail">
          <span class="detail-label">Workflow</span>
          ${renderWorkflowSummary(task.workflow_steps || [])}
        </div>
        <div>
          <span class="detail-label">Category</span>
          <p><span class="task-category detail-category" style="${categoryToneStyle(task.category)}">${escapeHtml(task.category || "Misc.")}</span></p>
        </div>
      </div>
      <div class="task-detail-columns">
        <div>
          <span class="detail-label">Links</span>
          ${taskLinks.length ? `
            <ul class="detail-list">
              ${taskLinks.map((link) => `
                <li>${link.url ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label || link.url)}</a>` : escapeHtml(link.label)}</li>
              `).join("")}
            </ul>
          ` : `<p class="detail-empty">No links yet.</p>`}
        </div>
        <div>
          <span class="detail-label">Notes</span>
          ${task.notes.length || noteLinks.length ? `
            <ul class="detail-list">
              ${task.notes.map((note) => `<li>${note.person && note.person !== "General" ? `<strong>${escapeHtml(note.person)}:</strong> ` : ""}${escapeHtml(note.body)}</li>`).join("")}
              ${noteLinks.map((link) => `
                <li><strong>${escapeHtml(noteLinkPerson(link))} Link:</strong> ${link.url ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.url)}</a>` : escapeHtml(link.label)}</li>
              `).join("")}
            </ul>
          ` : `<p class="detail-empty">No notes yet.</p>`}
        </div>
      </div>
      ${renderExpandedImages(task)}
      <div class="task-chat">
        <div class="chat-head">
          <span class="detail-label">Discussion</span>
          <span>${messages.length} message${messages.length === 1 ? "" : "s"}</span>
        </div>
        <div class="chat-messages" data-task-id="${task.id}">
          ${messages.length ? messages.map(renderMessage).join("") : `<p class="detail-empty">No discussion yet. Start one below.</p>`}
        </div>
        <div class="chat-composer">
          <select class="chat-author author-name author-${authorSlug(composerAuthor())}" aria-label="Your name">
            ${state.assignees.map((name) => `<option value="${escapeHtml(name)}"${name === composerAuthor() ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}
          </select>
          <textarea class="chat-body" rows="2" placeholder="Message — Enter to send, Shift+Enter for a new line, Ctrl+V to paste a screenshot"></textarea>
          <div class="chat-actions">
            <label class="chat-photo-button" title="Attach a photo">Photo
              <input type="file" accept="image/*" class="chat-photo-input" hidden>
            </label>
            <button type="button" class="primary chat-send">Send</button>
          </div>
          <div class="chat-photo-preview"${pendingImages[task.id] ? "" : " hidden"}>
            ${pendingImages[task.id] ? `<img src="${escapeHtml(pendingImages[task.id])}" alt="Attachment preview"><button type="button" class="chat-photo-remove" title="Remove photo">Remove</button>` : ""}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderExpandedImages(task) {
  const images = state.taskImages[task.id];
  if (!images || !images.length) return "";
  return `
    <div class="task-images-section">
      <span class="detail-label">Images</span>
      <div class="task-images-gallery">
        ${images.map((img) => `<img class="task-image-thumb" src="${escapeHtml(img.image)}" alt="Reference image" loading="lazy">`).join("")}
      </div>
    </div>
  `;
}

function renderMessage(message) {
  return `
    <article class="chat-message ${state.focusedMessageId === message.id ? "focused" : ""}" data-message-id="${message.id}" tabindex="0" title="Click to revisit this message">
      <div class="chat-message-head">
        <strong class="author-name author-${authorSlug(message.author)}">${escapeHtml(message.author)}</strong>
        <button type="button" class="delete-chat-message" data-action="delete-message" title="Delete discussion text">Delete</button>
      </div>
      ${message.body ? `<p>${escapeHtml(message.body)}</p>` : ""}
      ${message.image ? `<img class="chat-image" src="${escapeHtml(message.image)}" alt="Shared photo" loading="lazy">` : ""}
      <time>${escapeHtml(shortDateTime(message.created_at))}</time>
    </article>
`;
}

els.taskBoard.addEventListener("focusin", (event) => {
  const input = event.target.closest(".inline-task-input");
  if (!input) return;
  input.dataset.originalValue = input.value;
});

els.taskBoard.addEventListener("keydown", (event) => {
  const input = event.target.closest(".inline-task-input");
  if (!input) return;
  event.stopPropagation();
  if (event.key === "Escape") {
    input.value = input.dataset.originalValue || "";
    input.dataset.inlineCancel = "true";
    input.blur();
    return;
  }
  if (event.key === "Enter" && input.tagName !== "TEXTAREA") {
    event.preventDefault();
    input.blur();
    return;
  }
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    input.blur();
  }
});

els.taskBoard.addEventListener("focusout", async (event) => {
  const input = event.target.closest(".inline-task-input");
  if (!input) return;
  if (input.dataset.inlineCancel) {
    delete input.dataset.inlineCancel;
    return;
  }
  await saveInlineTaskField(input);
});

els.taskBoard.addEventListener("click", async (event) => {
  if (event.target.closest(".inline-task-input")) return;
  if (event.target.closest(".inline-status-select")) return;
  const zoomImage = event.target.closest(".chat-image, .task-images-gallery .task-image-thumb");
  if (zoomImage) {
    openImageLightbox(zoomImage.src);
    return;
  }
  const expanded = event.target.closest(".task-expanded");
  const message = event.target.closest(".chat-message");
  if (expanded && event.target.closest("[data-action='delete-message']")) {
    await deleteTaskMessage(expanded, event.target.closest(".chat-message"));
    return;
  }
  if (expanded && message) {
    state.focusedMessageId = Number(message.dataset.messageId);
    renderTasks();
    scrollExpandedChatToEnd(Number(expanded.dataset.taskId));
    return;
  }

  if (expanded && event.target.closest(".chat-photo-remove")) {
    delete pendingImages[Number(expanded.dataset.taskId)];
    const preview = expanded.querySelector(".chat-photo-preview");
    if (preview) {
      preview.hidden = true;
      preview.innerHTML = "";
    }
    return;
  }


  if (expanded && event.target.closest(".chat-send")) {
    await sendTaskMessage(expanded);
    return;
  }
  const row = event.target.closest(".task-row");
  if (!row) return;
  const task = state.tasks.find((item) => item.id === Number(row.dataset.taskId));
  if (!task) return;
  if (event.target.matches(".task-check")) {
    const data = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: { done: event.target.checked }
    });
    if (event.target.checked) {
      celebrateTaskDone(row);
      await sleep(760);
    }
    if (data.notification) showNotice(data.notification.message, data.notification.sent ? "good" : "");
    await loadTasks();
    return;
  }
  if (event.target.closest("[data-action='restore-task']")) {
    await restoreCurrentTask(row);
    return;
  }
  if (event.target.closest("[data-action='archive-task']")) {
    await archiveTaskFromRow(row);
    return;
  }
  if (event.target.closest("[data-action='delete-task']")) {
    await deleteTaskFromRow(row);
    return;
  }
  if (event.target.closest("[data-action='duplicate-task']")) {
    await duplicateCurrentTask(row);
    return;
  }
  if (event.target.closest("[data-action='edit']")) openTaskDialog(task);
  else await toggleTaskExpanded(task.id);
});

function openTaskDialog(task = null) {
  state.editingTask = task;
  els.dialogTitle.textContent = "What do you want me to do?";
  els.dialogMode.textContent = task ? `Edit task #${task.id}` : "New task";
  els.taskId.value = task?.id || "";
  els.taskName.value = task?.title || "";
  els.taskTitle.value = task?.details || "";
  els.taskAssignee.value = task?.assignee || state.activeAssignee || state.assignees[0] || "";
  els.taskCategory.value = task?.category || "Misc.";
  applyCategoryTone(els.taskCategory, els.taskCategory.value);
  renderCategoryPillPicker(els.taskCategory.value);
  els.taskDue.value = task ? (task.due_date || "") : today();
  els.taskDone.checked = Boolean(task?.done);
  fillWorkflowInputs(task?.workflow_steps || []);
  fillLinkInputs((task?.links || []).filter((link) => !isNoteLink(link)));
  fillNoteLinkInputs((task?.links || []).filter(isNoteLink), els.taskAssignee.value);
  els.taskNotes.value = (task?.notes || [])
    .map((note) => (note.person && note.person !== "General" ? `${note.person}: ${note.body}` : note.body))
    .join("\n");
  state.formImages = [];
  state.removedImageIds = [];
  renderFormImages();
  els.archiveTask.hidden = !task;
  els.taskDialog.showModal();
  if (task) loadFormImages(task.id);
}

async function loadFormImages(taskId) {
  try {
    const data = await api(`/api/tasks/${taskId}/images`);
    // Ignore if the dialog moved on to another task while loading.
    if (Number(els.taskId.value) !== Number(taskId)) return;
    state.formImages = data.images.map((img) => ({ id: img.id, image: img.image }));
    renderFormImages();
  } catch {
    // Non-fatal — the form just opens without preloaded images.
  }
}

async function saveTask(event) {
  event.preventDefault();
  const id = els.taskId.value;
  const basePayload = {
    title: els.taskName.value,
    details: els.taskTitle.value,
    assignee: els.taskAssignee.value,
    category: els.taskCategory.value,
    due_date: els.taskDue.value || null,
    done: els.taskDone.checked,
    workflow_steps: collectWorkflowInputs(),
    links: [...collectLinkInputs(), ...collectNoteLinkInputs()],
    notes: parseNoteTextarea(els.taskNotes.value)
  };
  let savedTaskId;
  if (id) {
    const payload = basePayload;
    const data = await api(`/api/tasks/${id}`, { method: "PATCH", body: payload });
    savedTaskId = data.task.id;
    state.expandedTaskId = data.task.id;
    if (data.notification) showNotice(data.notification.message, data.notification.sent ? "good" : "");
  } else {
    const payload = { ...basePayload, status: "Not Started" };
    const data = await api("/api/tasks", { method: "POST", body: payload });
    savedTaskId = data.task.id;
    state.expandedTaskId = data.task.id;
    state.activeAssignee = data.task.assignee;
    if (data.notification) showNotice(data.notification.message, data.notification.sent ? "good" : "");
  }
  await applyFormImages(savedTaskId);
  els.taskDialog.close();
  await loadTaskMessages(state.expandedTaskId);
  await loadTaskImages(state.expandedTaskId);
  await refreshAll();
}

async function saveInlineTaskField(input) {
  const container = input.closest("[data-task-id]");
  const taskId = Number(container?.dataset.taskId);
  const field = input.dataset.inlineField;
  if (!taskId || !field) return;

  const originalValue = input.dataset.originalValue || "";
  const value = input.value.trim();
  if (value === originalValue) return;
  if (field === "workflow_steps") {
    await saveInlineWorkflowSteps(input, taskId);
    return;
  }
  if (field === "title" && !value) {
    input.value = originalValue;
    showNotice("Task name cannot be empty.", "bad");
    return;
  }

  input.disabled = true;
  try {
    const data = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: { [field]: value }
    });
    const index = state.tasks.findIndex((task) => task.id === taskId);
    if (index >= 0) state.tasks[index] = data.task;
    renderTasks();
    showNotice("Task updated.", "good");
  } catch (error) {
    input.disabled = false;
    input.value = originalValue;
    showNotice(error.message, "bad");
  }
}

async function saveInlineWorkflowSteps(input, taskId) {
  const expanded = input.closest(".task-expanded");
  const steps = [...expanded.querySelectorAll(".workflow-summary-input")]
    .map((stepInput) => ({ label: stepInput.value.trim() }))
    .filter((step) => step.label);
  const originalSteps = (state.tasks.find((task) => task.id === taskId)?.workflow_steps || [])
    .map((step) => step.label)
    .filter(Boolean);
  const nextSteps = steps.map((step) => step.label);
  if (JSON.stringify(nextSteps) === JSON.stringify(originalSteps)) return;

  expanded.querySelectorAll(".workflow-summary-input").forEach((stepInput) => {
    stepInput.disabled = true;
  });
  try {
    const data = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: { workflow_steps: steps }
    });
    const index = state.tasks.findIndex((task) => task.id === taskId);
    if (index >= 0) state.tasks[index] = data.task;
    state.expandedTaskId = taskId;
    renderTasks();
    showNotice("Workflow updated.", "good");
  } catch (error) {
    input.disabled = false;
    input.value = input.dataset.originalValue || "";
    showNotice(error.message, "bad");
  }
}

async function archiveCurrentTask() {
  const id = els.taskId.value;
  if (!id) return;
  await api(`/api/tasks/${id}`, { method: "DELETE" });
  els.taskDialog.close();
  showNotice("Task moved to the 30-day archive.", "good");
  await refreshAll();
}

async function archiveTaskFromRow(container) {
  const taskId = Number(container.dataset.taskId);
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });
  if (state.expandedTaskId === taskId) state.expandedTaskId = null;
  showNotice("Task moved to the 30-day archive.", "good");
  await refreshAll();
}

async function deleteTaskFromRow(container) {
  const taskId = Number(container.dataset.taskId);
  if (!window.confirm("Permanently delete this task? This cannot be undone.")) return;
  await api(`/api/tasks/${taskId}/delete`, { method: "DELETE" });
  if (state.expandedTaskId === taskId) state.expandedTaskId = null;
  showNotice("Task permanently deleted.", "good");
  await refreshAll();
}

async function restoreCurrentTask(container) {
  const taskId = Number(container.dataset.taskId);
  await api(`/api/tasks/${taskId}/restore`, { method: "POST" });
  state.expandedTaskId = null;
  showNotice("Task restored.", "good");
  await refreshAll();
}

async function refreshAll() {
  const bootstrap = await api("/api/bootstrap");
  state.assignees = bootstrap.assignees;
  if (!state.assignees.includes(state.activeAssignee)) {
    state.activeAssignee = state.assignees[0] || "";
  }
  renderChrome(bootstrap);
  await loadTasks();
}

async function toggleTaskExpanded(taskId) {
  if (state.expandedTaskId === taskId) {
    state.expandedTaskId = null;
    state.focusedMessageId = null;
    renderTasks();
    return;
  }
  state.expandedTaskId = taskId;
  state.focusedMessageId = null;
  await Promise.all([loadTaskMessages(taskId), loadTaskImages(taskId)]);
  renderTasks();
  scrollExpandedChatToEnd(taskId);
}

async function loadTaskMessages(taskId) {
  const data = await api(`/api/tasks/${taskId}/messages`);
  state.taskMessages[taskId] = data.messages;
}

async function loadTaskImages(taskId) {
  try {
    const data = await api(`/api/tasks/${taskId}/images`);
    state.taskImages[taskId] = data.images || [];
  } catch {
    state.taskImages[taskId] = [];
  }
}

// --- Task dialog images (staged; only persisted when the form is saved) ---

function renderFormImages() {
  if (!els.taskImages) return;
  els.taskImages.innerHTML = `
    ${state.formImages.map((img, index) => `
      <div class="task-image-item">
        <img class="task-image-thumb" src="${escapeHtml(img.image)}" alt="Reference image" loading="lazy">
        <button type="button" class="task-image-delete" data-image-index="${index}" title="Remove image">×</button>
      </div>
    `).join("")}
    <div class="task-image-add" tabindex="0" role="button" title="Click here, then Ctrl+V to paste a screenshot">
      <span class="task-image-add-main">+ Add image</span>
      <small>Click then Ctrl+V, or</small>
      <button type="button" class="task-image-browse">Browse</button>
      <input type="file" accept="image/*" class="task-image-input" hidden multiple>
    </div>
  `;
}

async function addFormImageFile(file) {
  if (!file) return;
  try {
    const dataUrl = await readImageAsDataUrl(file);
    state.formImages.push({ image: dataUrl });
    renderFormImages();
  } catch (error) {
    showNotice(error.message, "bad");
  }
}

function removeFormImage(index) {
  const [removed] = state.formImages.splice(index, 1);
  if (removed?.id) state.removedImageIds.push(removed.id);
  renderFormImages();
}

// After the task is saved, reconcile staged image changes against the server.
async function applyFormImages(taskId) {
  for (const imageId of state.removedImageIds) {
    await api(`/api/tasks/${taskId}/images/${imageId}`, { method: "DELETE" });
  }
  for (const img of state.formImages) {
    if (!img.id) await api(`/api/tasks/${taskId}/images`, { method: "POST", body: { image: img.image } });
  }
}

async function sendTaskMessage(container) {
  const taskId = Number(container.dataset.taskId);
  const rawBody = container.querySelector(".chat-body").value;
  const image = pendingImages[taskId] || null;
  if (!rawBody.trim() && !image) return;
  const author = container.querySelector(".chat-author").value || state.assignees[0] || "Me";
  storeChatAuthor(author);
  const data = await api(`/api/tasks/${taskId}/messages`, {
    method: "POST",
    body: { author, body: rawBody, image }
  });
  delete pendingImages[taskId];
  state.taskMessages[taskId] = data.messages;
  state.focusedMessageId = data.message.id;
  renderTasks();
  scrollExpandedChatToEnd(taskId);
}

async function deleteTaskMessage(container, messageElement) {
  const taskId = Number(container.dataset.taskId);
  const messageId = Number(messageElement.dataset.messageId);
  const data = await api(`/api/tasks/${taskId}/messages/${messageId}`, { method: "DELETE" });
  state.taskMessages[taskId] = data.messages;
  if (state.focusedMessageId === messageId) state.focusedMessageId = null;
  renderTasks();
  showNotice("Discussion text deleted.", "good");
}

async function duplicateCurrentTask(container) {
  const taskId = Number(container.dataset.taskId);
  const data = await api(`/api/tasks/${taskId}/duplicate`, { method: "POST" });
  state.expandedTaskId = data.task.id;
  state.focusedMessageId = null;
  await loadTaskMessages(data.task.id);
  await refreshAll();
  showNotice("Task duplicated.", "good");
}

let lastResourcesJson = "";

async function loadResources() {
  const data = await api("/api/resources");
  renderResources(data.resources, true);
}

function renderResources(resources, force = false) {
  const json = JSON.stringify(resources);
  if (!force && json === lastResourcesJson) return;
  lastResourcesJson = json;
  const groups = groupBy(resources, (resource) => resource.section);
  renderResourceList(els.loginResources, groups.get("logins") || [], "logins");
  renderResourceList(els.importantLinkResources, groups.get("important_links") || [], "important_links");
}

function renderResourceList(container, resources, section) {
  container.innerHTML = resources.length
    ? resources.map((resource) => section === "logins" ? renderLoginResource(resource) : renderLinkResource(resource)).join("")
    : `<div class="resource-empty">No items yet</div>`;
}

function renderLoginResource(resource) {
  const name = resource.url
    ? `<a class="login-resource-button" href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">${escapeHtml(resource.title)}</a>`
    : `<span class="login-resource-button">${escapeHtml(resource.title)}</span>`;
  return `
    <article class="resource-item login-resource-item">
      ${name}
      <div class="login-credentials">
        ${resource.username ? `<span>${escapeHtml(resource.username)}</span>` : `<span class="credential-empty">username</span>`}
        ${resource.password ? `<span>${escapeHtml(resource.password)}</span>` : `<span class="credential-empty">password</span>`}
      </div>
      <button type="button" class="delete-resource" data-resource-id="${resource.id}" title="Delete resource">x</button>
    </article>
  `;
}

function renderLinkResource(resource) {
  const title = resource.url
    ? `<a href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">${escapeHtml(resource.title)}</a>`
    : `<span>${escapeHtml(resource.title)}</span>`;
  return `
    <article class="resource-item">
      <div>
        <strong>${title}</strong>
        ${resource.note ? `<small>${escapeHtml(resource.note)}</small>` : ""}
      </div>
      <button type="button" class="delete-resource" data-resource-id="${resource.id}" title="Delete resource">x</button>
    </article>
  `;
}

function openResourceDialog(section = "important_links") {
  const normalized = section === "logins" ? "logins" : "important_links";
  els.resourceSection.value = normalized;
  els.resourceDialogTitle.textContent = normalized === "logins" ? "Add Login" : "Add Link";
  els.resourceTitle.value = "";
  els.resourceUrl.value = "";
  els.resourceUsername.value = "";
  els.resourcePassword.value = "";
  els.resourceLoginFields.hidden = normalized !== "logins";
  els.resourceTitle.closest("label").querySelector("span").textContent = normalized === "logins" ? "Name" : "Name";
  els.resourceUrl.closest("label").querySelector("span").textContent = "Link";
  els.resourceDialog.showModal();
  els.resourceTitle.focus();
}

async function saveResource(event) {
  event.preventDefault();
  const title = els.resourceTitle.value.trim();
  if (!title) {
    showNotice("Add a name before saving.", "bad");
    return;
  }
  await api("/api/resources", {
    method: "POST",
    body: {
      section: els.resourceSection.value,
      title,
      url: els.resourceUrl.value.trim(),
      note: "",
      username: els.resourceUsername.value.trim(),
      password: els.resourcePassword.value.trim()
    }
  });
  els.resourceDialog.close();
  await loadResources();
}

async function deleteResource(id) {
  await api(`/api/resources/${id}`, { method: "DELETE" });
  await loadResources();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function renderWorkflowSummary(steps) {
  if (!steps.length) return `<p class="detail-empty">No workflow steps yet.</p>`;
  return `
    <ol class="workflow-summary" style="--workflow-summary-columns: ${steps.length};">
      ${steps.map((step, index) => `
        <li>
          <input
            class="workflow-summary-input inline-task-input"
            data-inline-field="workflow_steps"
            data-step-index="${index}"
            value="${escapeHtml(step.label)}"
            aria-label="Workflow step ${index + 1}"
          >
        </li>
      `).join("")}
    </ol>
  `;
}

function renderWorkflowInputs() {
  els.taskWorkflow.innerHTML = "";
  for (let index = 0; index < 3; index += 1) {
    addWorkflowStep({}, index);
  }
  syncWorkflowGrid();
}

function addWorkflowStep(step = {}, index = els.taskWorkflow.querySelectorAll(".workflow-step").length) {
  const box = document.createElement("div");
  box.className = "workflow-step";
  box.innerHTML = `
    <button
      type="button"
      class="remove-workflow-step"
      title="Remove workflow step"
      aria-label="Remove workflow step ${index + 1}"
    >x</button>
    <input
      type="text"
      class="workflow-step-input"
      data-step-index="${index}"
      placeholder="Workflow"
      aria-label="Workflow step ${index + 1}"
      value="${escapeHtml(step.label || "")}"
    >
  `;
  els.taskWorkflow.append(box);
  syncWorkflowGrid();
}

function removeWorkflowStep(event) {
  const button = event.target.closest(".remove-workflow-step");
  if (!button) return;
  button.closest(".workflow-step")?.remove();
  syncWorkflowGrid();
}

function fillWorkflowInputs(steps) {
  els.taskWorkflow.innerHTML = "";
  const paddedSteps = [...steps];
  while (paddedSteps.length < 3) paddedSteps.push({});
  paddedSteps.forEach((step, index) => addWorkflowStep(step, index));
  syncWorkflowGrid();
}

function collectWorkflowInputs() {
  return [...els.taskWorkflow.querySelectorAll(".workflow-step-input")]
    .map((input) => ({ label: input.value.trim() }))
    .filter((step) => step.label);
}

function syncWorkflowGrid() {
  const steps = [...els.taskWorkflow.querySelectorAll(".workflow-step")];
  steps.forEach((step, index) => {
    const input = step.querySelector(".workflow-step-input");
    const button = step.querySelector(".remove-workflow-step");
    if (input) {
      input.dataset.stepIndex = String(index);
      input.setAttribute("aria-label", `Workflow step ${index + 1}`);
    }
    if (button) button.setAttribute("aria-label", `Remove workflow step ${index + 1}`);
  });
  const count = Math.max(3, steps.length);
  els.taskWorkflow.style.setProperty("--workflow-columns", count);
}

function renderLinkInputs() {
  els.taskLinks.innerHTML = "";
  addLinkRow();
  fillNoteLinkInputs([], state.activeAssignee);
}

function addLinkRow(link = {}, index = els.taskLinks.querySelectorAll(".link-row").length) {
  const row = document.createElement("div");
  row.className = "link-row";
  row.innerHTML = `
    <div class="link-index">${index + 1}</div>
    <label>
      <input
        type="text"
        class="link-label"
        data-link-index="${index}"
        placeholder="Example: client folder"
        aria-label="Link ${index + 1} description"
        value="${escapeHtml(link.label && link.label !== link.url ? link.label : "")}"
      >
    </label>
    <label>
      <input
        type="url"
        class="link-url"
        data-link-index="${index}"
        placeholder="https://..."
        aria-label="Link ${index + 1} URL"
        value="${escapeHtml(link.url || "")}"
      >
    </label>
  `;
  els.taskLinks.append(row);
}

function fillLinkInputs(links) {
  els.taskLinks.innerHTML = "";
  const rows = links.length ? links : [{}];
  rows.forEach((link, index) => addLinkRow(link, index));
}

function collectLinkInputs() {
  return [...els.taskLinks.querySelectorAll(".link-row")]
    .map((row) => ({
      url: row.querySelector(".link-url").value.trim(),
      label: row.querySelector(".link-label").value.trim()
    }))
    .filter((link) => link.url || link.label)
    .map((link) => ({
      url: link.url,
      label: link.label || link.url
    }));
}

function fillNoteLinkInputs(links, assignee = "") {
  els.taskNoteLinks.innerHTML = "";
  const existingPeople = new Set(links.map(noteLinkPerson).filter(Boolean));
  const starterRows = [];
  if (!existingPeople.has("Tommy")) starterRows.push({ person: "Tommy", url: "" });
  if (assignee && assignee !== "Tommy" && !existingPeople.has(assignee)) starterRows.push({ person: assignee, url: "" });
  const rows = [...links.map((link) => ({ person: noteLinkPerson(link), url: link.url || "" })), ...starterRows, { person: "", url: "" }];
  rows.forEach((link, index) => addNoteLinkRow(link, index));
}

function addNoteLinkRow(link = {}, index = els.taskNoteLinks.querySelectorAll(".note-link-row").length) {
  const row = document.createElement("div");
  row.className = "note-link-row";
  row.innerHTML = `
    <label>
      <input
        type="text"
        class="note-link-person"
        placeholder="Name"
        aria-label="Person for note link ${index + 1}"
        value="${escapeHtml(link.person || "")}"
      >
    </label>
    <span class="note-link-label">Link</span>
    <label>
      <input
        type="url"
        class="note-link-url"
        placeholder="https://..."
        aria-label="Note link ${index + 1} URL"
        value="${escapeHtml(link.url || "")}"
      >
    </label>
  `;
  els.taskNoteLinks.append(row);
}

function ensureNoteLinkPerson(person) {
  if (!person || person === "Tommy") return;
  const people = [...els.taskNoteLinks.querySelectorAll(".note-link-person")]
    .map((input) => input.value.trim().toLowerCase());
  if (people.includes(person.toLowerCase())) return;
  const emptyRow = [...els.taskNoteLinks.querySelectorAll(".note-link-row")]
    .find((row) => !row.querySelector(".note-link-person").value.trim() && !row.querySelector(".note-link-url").value.trim());
  if (emptyRow) {
    emptyRow.querySelector(".note-link-person").value = person;
  } else {
    addNoteLinkRow({ person, url: "" });
  }
}

function collectNoteLinkInputs() {
  return [...els.taskNoteLinks.querySelectorAll(".note-link-row")]
    .map((row) => ({
      person: row.querySelector(".note-link-person").value.trim(),
      url: row.querySelector(".note-link-url").value.trim()
    }))
    .filter((link) => link.person && link.url)
    .map((link) => ({
      label: `${link.person} Link`,
      url: link.url
    }));
}

function isNoteLink(link) {
  return /\slink$/i.test(String(link?.label || "").trim());
}

function noteLinkPerson(link) {
  return String(link?.label || "")
    .replace(/\slink$/i, "")
    .trim();
}

function parseNoteTextarea(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]{2,30}):\s*(.+)$/);
      return match ? { person: match[1], body: match[2] } : { person: "General", body: line };
    });
}

function metric(label, value, key = "") {
  return `<div class="metric"><strong${key ? ` data-metric="${escapeHtml(key)}"` : ""}>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function updateMetricCounts(counts) {
  const values = {
    open: counts.open,
    tasks: counts.tasks,
    overdue: counts.overdue,
    archived: counts.archived || 0
  };
  for (const [key, value] of Object.entries(values)) {
    const node = els.metrics.querySelector(`[data-metric="${key}"]`);
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  }
}

function renderCategoryOption(category) {
  return `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
}

function applyCategoryTone(element, category) {
  if (!element) return;
  const tone = categoryTone(category);
  element.style.setProperty("--category-accent", tone.accent);
  element.style.setProperty("--category-bg", tone.background);
  element.style.setProperty("--category-border", tone.border);
}

function categoryToneStyle(category) {
  const tone = categoryTone(category);
  return `--category-accent: ${tone.accent}; --category-bg: ${tone.background}; --category-border: ${tone.border};`;
}

function categoryTone(category = "Misc.") {
  return CATEGORY_TONES[category] || CATEGORY_TONES["Misc."];
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function dueState(date, done = false, status = "") {
  if (done) return { className: "done", label: "Completed" };
  if (status === "BRB") return { className: "pending", label: "Waiting for review", display: "Pending" };
  if (!date) return { className: "none", label: "No due date" };

  const dueDate = parseLocalDate(date);
  const currentDate = parseLocalDate(today());
  const diffDays = Math.round((dueDate - currentDate) / 86400000);

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      className: "overdue",
      label: `${days} day${days === 1 ? "" : "s"} overdue`
    };
  }
  if (diffDays === 0) return { className: "today", label: "Due today" };
  if (diffDays === 1) return { className: "tomorrow", label: "Due tomorrow" };
  if (diffDays <= 3) return { className: "soon", label: `Due in ${diffDays} days` };
  if (diffDays <= 7) return { className: "upcoming", label: `Due in ${diffDays} days` };
  return { className: "later", label: `Due in ${diffDays} days` };
}

function archiveState(task) {
  const archivedAt = task.archived_at ? new Date(`${task.archived_at.replace(" ", "T")}Z`) : null;
  if (!archivedAt || Number.isNaN(archivedAt.getTime())) {
    return { display: "30 days left", label: "Archived" };
  }
  const expiresAt = new Date(archivedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
  return {
    display: daysLeft === 1 ? "1 day left" : `${daysLeft} days left`,
    label: `Archived ${shortDate(task.archived_at)}`
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseLocalDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shortDate(value) {
  return String(value || "").slice(0, 10);
}

function shortDateTime(value) {
  return String(value || "").replace("T", " ").slice(0, 16);
}

function scrollExpandedChatToEnd(taskId) {
  window.requestAnimationFrame(() => {
    const scroller = document.querySelector(`.chat-messages[data-task-id="${taskId}"]`);
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
}

function celebrateTaskDone(row) {
  row.classList.remove("celebrate-done");
  row.classList.add("done", "celebrate-done");
  window.setTimeout(() => row.classList.remove("celebrate-done"), 900);
}

async function openRingDialog() {
  els.ringDescription.value = "";
  els.ringTask.innerHTML = `<option value="">Loading tasks...</option>`;
  const todayOption = els.ringForm.querySelector('input[name="ringUrgency"][value="today"]');
  if (todayOption) todayOption.checked = true;
  els.ringDialog.showModal();
  els.ringDescription.focus();
  await loadRingTaskOptions();
}

async function sendRing(event) {
  event.preventDefault();
  const description = els.ringDescription.value.trim();
  const urgency = els.ringForm.querySelector('input[name="ringUrgency"]:checked')?.value || "today";
  const taskId = Number(els.ringTask.value || 0);
  if (!description) {
    showNotice("Add a short note before ringing.", "bad");
    return;
  }

  const submitButton = els.ringForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const data = await api("/api/ring", {
      method: "POST",
      body: { description, urgency, task_id: taskId || null }
    });
    els.ringDialog.close();
    showNotice(data.notification.message, data.notification.sent ? "good" : "");
  } catch (error) {
    showNotice(error.message, "bad");
  } finally {
    submitButton.disabled = false;
  }
}

async function loadRingTaskOptions() {
  try {
    const data = await api("/api/tasks");
    els.ringTask.innerHTML = [
      `<option value="">No task attached</option>`,
      ...data.tasks.map((task) => {
        const label = [
          task.title,
          task.assignee ? `(${task.assignee})` : "",
          task.status ? `- ${task.status}` : ""
        ].filter(Boolean).join(" ");
        return `<option value="${task.id}">${escapeHtml(label)}</option>`;
      })
    ].join("");
  } catch {
    els.ringTask.innerHTML = `<option value="">No task attached</option>`;
  }
}

function showNotice(message, tone = "") {
  els.notice.textContent = message;
  els.notice.className = `notice ${tone}`.trim();
  els.notice.hidden = false;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    els.notice.hidden = true;
  }, 6000);
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  storeTheme(state.theme);
  applyTheme();
  renderThemeToggle();
}

function getStoredTheme() {
  try {
    return localStorage.getItem("keystone-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem("keystone-theme", theme);
  } catch {
    // The theme still changes for this session if browser storage is unavailable.
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function renderThemeToggle() {
  const button = document.querySelector("#themeToggleButton");
  if (!button) return;
  const isDark = state.theme === "dark";
  button.innerHTML = `<span class="theme-icon ${isDark ? "theme-icon-sun" : "theme-icon-moon"}" aria-hidden="true"></span>`;
  button.setAttribute("aria-pressed", String(isDark));
  button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  button.title = isDark ? "Switch to light mode" : "Switch to dark mode";
}

const pendingImages = {};

function openImageLightbox(src) {
  let overlay = document.querySelector("#imageLightbox");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "imageLightbox";
    overlay.className = "image-lightbox";
    overlay.innerHTML = `<img alt="Full size image"><button type="button" class="image-lightbox-close" title="Close (Esc)" aria-label="Close">×</button>`;
    overlay.addEventListener("click", closeImageLightbox);
    document.body.append(overlay);
  }
  overlay.querySelector("img").src = src;
  overlay.classList.add("open");
  document.addEventListener("keydown", closeLightboxOnEscape);
}

function closeImageLightbox() {
  const overlay = document.querySelector("#imageLightbox");
  if (overlay) overlay.classList.remove("open");
  document.removeEventListener("keydown", closeLightboxOnEscape);
}

function closeLightboxOnEscape(event) {
  if (event.key === "Escape") closeImageLightbox();
}

function authorSlug(name) {
  return String(name || "").toLowerCase().replace(/[^a-z]/g, "") || "unknown";
}

function composerAuthor() {
  const stored = getStoredChatAuthor();
  if (stored && state.assignees.includes(stored)) return stored;
  return state.assignees[0] || "";
}

function getStoredChatAuthor() {
  try {
    return localStorage.getItem("keystone-chat-author") || "";
  } catch {
    return "";
  }
}

function storeChatAuthor(name) {
  try {
    localStorage.setItem("keystone-chat-author", name);
  } catch {
    // Author just won't be remembered across reloads if storage is unavailable.
  }
}

// Shrink the image in the browser so uploads stay small (longest edge ~1400px).
function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a readable image."));
      img.onload = () => {
        const max = 1400;
        let { width, height } = img;
        if (width > max || height > max) {
          const scale = Math.min(max / width, max / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function debounce(fn, delay) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function renderCategoryPillPicker(selectedCategory = "Misc.") {
  const container = document.querySelector("#categoryPillPicker");
  if (!container) return;
  const categories = state.dailyCategories.length ? state.dailyCategories : Object.keys(CATEGORY_TONES);
  container.innerHTML = categories.map((category) => {
    const tone = categoryTone(category);
    const isActive = category === selectedCategory;
    return `<button
      type="button"
      class="category-pill-option${isActive ? " active" : ""}"
      data-category="${escapeHtml(category)}"
      style="--pill-accent: ${tone.accent}; --pill-bg: ${tone.background}; --pill-border: ${tone.border};"
    >${escapeHtml(category)}</button>`;
  }).join("");
}

function taskStatusMeta(status, done = false) {
  if (done) return { className: "done-status", label: "Done" };
  const map = {
    "Not Started": { className: "not-started", label: "Not Started" },
    "Working": { className: "working", label: "Working" },
    "Pending": { className: "pending", label: "Pending" },
    "Needs Brandon Review": { className: "brandon-review", label: "BR Review" },
    "Needs Tommy Review": { className: "tommy-review", label: "TM Review" },
    "Done": { className: "done-status", label: "Done" },
    "BRB": { className: "brb", label: "BRB" }
  };
  return map[status] || { className: "misc", label: status };
}

// ===================================================================
// TikTok Accounts tab (FlowStage content tracking).
// Fully independent of the task board: own state, render, dialog, API.
// ===================================================================

const DEFAULT_ACCOUNT_STEPS_UI = ["AI", "Editor", "Scheduler", "Poster"];

const accountsState = {
  accounts: [],
  loaded: false,
  editing: null,
  steps: [], // working copy while the dialog is open
  flowstageAccounts: null // cached list of connected FlowStage accounts
};

function getStoredTab() {
  try {
    return localStorage.getItem("keystone-active-tab") || "tasks";
  } catch {
    return "tasks";
  }
}

function setStoredTab(tab) {
  try {
    localStorage.setItem("keystone-active-tab", tab);
  } catch {
    // Tab choice just won't persist if storage is unavailable.
  }
}

function bindAccountEvents() {
  els.mainTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".main-tab");
    if (button) switchTab(button.dataset.tab);
  });
  els.addAccount.addEventListener("click", () => openAccountDialog());
  els.syncAllAccounts.addEventListener("click", syncAllAccountsNow);
  els.closeAccountDialog.addEventListener("click", () => els.accountDialog.close());
  els.cancelAccount.addEventListener("click", () => els.accountDialog.close());
  els.addAccountStep.addEventListener("click", () => {
    accountsState.steps.push({ label: "", assignee: "" });
    renderAccountSteps();
  });
  els.accountSteps.addEventListener("input", syncStepFromEvent);
  els.accountSteps.addEventListener("change", syncStepFromEvent);
  els.accountSteps.addEventListener("click", (event) => {
    const remove = event.target.closest(".account-step-remove");
    if (!remove) return;
    accountsState.steps.splice(Number(remove.dataset.stepIndex), 1);
    renderAccountSteps();
  });
  els.accountForm.addEventListener("submit", saveAccount);
  els.deleteAccount.addEventListener("click", deleteCurrentAccount);
  els.accountBoard.addEventListener("click", onAccountBoardClick);
  els.accountNameSelect.addEventListener("change", onAccountNameSelectChange);
}

// The account name IS the FlowStage account: picking one sets the name + links
// the id. "Custom name" reveals a text field for accounts not on FlowStage.
function onAccountNameSelectChange() {
  const value = els.accountNameSelect.value;
  if (value === "__custom__") {
    els.accountNameCustomRow.hidden = false;
    els.accountFlowstageId.value = "";
    els.accountName.value = "";
    els.accountName.focus();
  } else {
    els.accountNameCustomRow.hidden = true;
    els.accountFlowstageId.value = value;
  }
}

function switchTab(tab) {
  const isAccounts = tab === "accounts";
  els.tasksView.hidden = isAccounts;
  els.accountsView.hidden = !isAccounts;
  els.mainTabs.querySelectorAll(".main-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  setStoredTab(tab);
  if (isAccounts && !accountsState.loaded) loadAccounts();
}

async function loadAccounts() {
  const data = await api("/api/tiktok-accounts");
  accountsState.accounts = data.accounts || [];
  accountsState.loaded = true;
  renderAccounts();
}

function renderAccounts() {
  if (!accountsState.accounts.length) {
    els.accountBoard.innerHTML = `<p class="detail-empty account-empty">No accounts yet. Add one to start tracking content runout.</p>`;
    return;
  }
  els.accountBoard.innerHTML = accountsState.accounts.map(renderAccountRow).join("");
}

// Days of scheduled content left, color-coded by how soon the account runs dry.
function runoutState(dateStr) {
  if (!dateStr) return { className: "none", label: "No schedule", title: "No scheduled-through date set" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  const days = Math.round((target - today) / 86400000);
  const title = `Content scheduled through ${dateStr}`;
  if (days < 0) return { className: "overdue", label: "Out of content", title };
  if (days === 0) return { className: "today", label: "Runs out today", title };
  if (days === 1) return { className: "today", label: "1 day left", title };
  if (days <= 3) return { className: "soon", label: `${days} days left`, title };
  if (days <= 7) return { className: "week", label: `${days} days left`, title };
  return { className: "ok", label: `${days} days left`, title };
}

function renderAccountRow(account) {
  const runout = runoutState(account.runout_date);
  const stepChips = (account.steps || []).map((step) => `
    <span class="account-step-chip">
      <span class="account-step-chip-label">${escapeHtml(step.label)}</span>
      ${step.assignee
        ? `<span class="author-name author-${authorSlug(step.assignee)}">${escapeHtml(step.assignee)}</span>`
        : `<span class="account-step-unassigned">—</span>`}
    </span>
  `).join("");
  const links = [];
  if (account.ae_project_url) links.push(`<a href="${escapeHtml(account.ae_project_url)}" target="_blank" rel="noreferrer">AE Project</a>`);
  if (account.tutorial_url) links.push(`<a href="${escapeHtml(account.tutorial_url)}" target="_blank" rel="noreferrer">Tutorial</a>`);
  return `
    <article class="account-row" data-account-id="${account.id}">
      <div class="account-main">
        <div class="account-headline">
          <span class="account-name">${escapeHtml(account.name)}</span>
          <span class="runout-badge runout-${runout.className}" title="${escapeHtml(runout.title)}">${escapeHtml(runout.label)}</span>
        </div>
        <div class="account-steps-row">${stepChips || `<span class="detail-empty">No steps</span>`}</div>
        ${links.length ? `<div class="account-links">${links.join("")}</div>` : ""}
      </div>
      <div class="account-actions">
        <button type="button" data-action="sync-account" title="Pull scheduled-through date from FlowStage">Sync</button>
        <button type="button" data-action="edit-account">Edit</button>
      </div>
    </article>
  `;
}

async function onAccountBoardClick(event) {
  const row = event.target.closest(".account-row");
  if (!row) return;
  const id = Number(row.dataset.accountId);
  const account = accountsState.accounts.find((item) => item.id === id);
  if (event.target.closest("[data-action='edit-account']")) {
    openAccountDialog(account);
    return;
  }
  if (event.target.closest("[data-action='sync-account']")) {
    await syncAccount(id);
  }
}

function openAccountDialog(account = null) {
  accountsState.editing = account;
  els.accountDialogTitle.textContent = account ? "Edit account" : "Add account";
  els.accountDialogMode.textContent = account ? `Account #${account.id}` : "New TikTok account";
  els.accountId.value = account?.id || "";
  els.accountName.value = account?.name || "";
  els.accountAeUrl.value = account?.ae_project_url || "";
  els.accountTutorialUrl.value = account?.tutorial_url || "";
  els.accountUsername.value = account?.username || "";
  els.accountEmail.value = account?.email || "";
  els.accountPassword.value = account?.password || "";
  els.accountScheduledThrough.value = account?.scheduled_through || "";
  els.accountFlowstageId.value = account?.flowstage_account_id || "";
  accountsState.steps = account
    ? (account.steps || []).map((step) => ({ label: step.label, assignee: step.assignee || "" }))
    : DEFAULT_ACCOUNT_STEPS_UI.map((label) => ({ label, assignee: "" }));
  renderAccountSteps();
  populateAccountNameOptions(account);
  els.deleteAccount.hidden = !account;
  els.accountDialog.showModal();
}

// Build the Account Name dropdown from the team's connected FlowStage accounts.
// Selecting one sets the name (handle) and links its id. A "Custom name" option
// (and the fallback when the list can't load) reveals a free-text name field.
async function populateAccountNameOptions(account) {
  const select = els.accountNameSelect;
  const currentId = account?.flowstage_account_id || "";
  const currentName = account?.name || "";
  select.innerHTML = `<option value="">Select a FlowStage account…</option>`;

  let listed = [];
  try {
    if (!accountsState.flowstageAccounts) {
      const data = await api("/api/flowstage/social-accounts");
      accountsState.flowstageAccounts = data.accounts || [];
    }
    listed = accountsState.flowstageAccounts;
  } catch {
    accountsState.flowstageAccounts = null;
  }

  for (const item of listed) {
    const option = document.createElement("option");
    option.value = item.id;
    option.dataset.handle = item.handle || item.id;
    option.textContent = `${item.handle || item.id}${item.platform ? ` (${item.platform})` : ""}`;
    select.appendChild(option);
  }
  const customOption = document.createElement("option");
  customOption.value = "__custom__";
  customOption.textContent = "Custom name (not on FlowStage)";
  select.appendChild(customOption);

  // Decide the initial selection / whether to show the custom text field.
  if (currentId && listed.some((item) => item.id === currentId)) {
    select.value = currentId;
    els.accountNameCustomRow.hidden = true;
  } else if (currentName) {
    // Editing a custom/unlinked account, or the list couldn't load.
    select.value = "__custom__";
    els.accountName.value = currentName;
    els.accountNameCustomRow.hidden = false;
  } else {
    select.value = "";
    els.accountNameCustomRow.hidden = true;
  }
}

function renderAccountSteps() {
  els.accountSteps.innerHTML = accountsState.steps.map((step, index) => `
    <div class="account-step-item">
      <input class="account-step-input" data-step-index="${index}" data-field="label" value="${escapeHtml(step.label)}" placeholder="Step (e.g. Editor)" aria-label="Step name">
      <select class="account-step-select" data-step-index="${index}" data-field="assignee" aria-label="Assignee">
        <option value="">Unassigned</option>
        ${state.assignees.map((name) => `<option value="${escapeHtml(name)}"${name === step.assignee ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}
      </select>
      <button type="button" class="account-step-remove" data-step-index="${index}" title="Remove step">×</button>
    </div>
  `).join("");
}

// Keep the in-memory step list in sync with edits so add/remove re-renders
// don't wipe out what the user just typed.
function syncStepFromEvent(event) {
  const field = event.target.closest("[data-field]");
  if (!field) return;
  const index = Number(field.dataset.stepIndex);
  if (accountsState.steps[index]) accountsState.steps[index][field.dataset.field] = field.value;
}

async function saveAccount(event) {
  event.preventDefault();
  const id = els.accountId.value;

  // Resolve the name + FlowStage link from the merged Account Name dropdown.
  const selected = els.accountNameSelect.value;
  let name = "";
  let flowstageId = "";
  if (selected === "__custom__") {
    name = els.accountName.value.trim();
  } else if (selected) {
    name = els.accountNameSelect.selectedOptions[0]?.dataset.handle || els.accountNameSelect.selectedOptions[0]?.textContent || "";
    flowstageId = selected;
  }

  const payload = {
    name,
    ae_project_url: els.accountAeUrl.value.trim(),
    tutorial_url: els.accountTutorialUrl.value.trim(),
    username: els.accountUsername.value.trim(),
    email: els.accountEmail.value.trim(),
    password: els.accountPassword.value,
    scheduled_through: els.accountScheduledThrough.value || "",
    flowstage_account_id: flowstageId,
    steps: accountsState.steps
      .map((step) => ({ label: step.label.trim(), assignee: step.assignee }))
      .filter((step) => step.label)
  };
  if (!payload.name) {
    showNotice("Choose a FlowStage account or enter a custom name.", "bad");
    return;
  }
  if (id) await api(`/api/tiktok-accounts/${id}`, { method: "PATCH", body: payload });
  else await api("/api/tiktok-accounts", { method: "POST", body: payload });
  els.accountDialog.close();
  await loadAccounts();
}

async function deleteCurrentAccount() {
  const id = els.accountId.value;
  if (!id) return;
  if (!window.confirm("Delete this account? This cannot be undone.")) return;
  await api(`/api/tiktok-accounts/${id}`, { method: "DELETE" });
  els.accountDialog.close();
  await loadAccounts();
}

async function syncAccount(id) {
  try {
    showNotice("Syncing with FlowStage…");
    await api(`/api/tiktok-accounts/${id}/sync`, { method: "POST" });
    await loadAccounts();
    showNotice("FlowStage sync complete.", "good");
  } catch (error) {
    showNotice(error.message, "bad");
  }
}

async function syncAllAccountsNow() {
  try {
    showNotice("Syncing all accounts with FlowStage…");
    const data = await api("/api/tiktok-accounts/sync", { method: "POST" });
    await loadAccounts();
    const results = data.results || [];
    const failures = results.filter((result) => !result.ok);
    if (results.length && failures.length === results.length) {
      showNotice(failures[0].reason, "bad");
    } else {
      showNotice("FlowStage sync complete.", "good");
    }
  } catch (error) {
    showNotice(error.message, "bad");
  }
}
