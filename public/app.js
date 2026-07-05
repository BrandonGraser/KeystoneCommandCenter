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
  theme: getStoredTheme(),
  currentUser: null,
  chatChannel: "general",
  chatMessages: [],
  chatLastSeenCount: 0,
  chatKnownCount: 0,
  chatSeenCounts: {},
  chatChannelCounts: {}
};

function getTaskSeenTimestamps() {
  try { return JSON.parse(localStorage.getItem("taskSeenTimestamps") || "{}"); } catch { return {}; }
}
function markTaskRead(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task?.last_message) return;
  const seen = getTaskSeenTimestamps();
  seen[taskId] = task.last_message.created_at;
  localStorage.setItem("taskSeenTimestamps", JSON.stringify(seen));
}
function hasUnreadMessages(task) {
  if (!task.last_message) return false;
  const seen = getTaskSeenTimestamps();
  return !seen[task.id] || seen[task.id] < task.last_message.created_at;
}

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
  taskUrgency: document.querySelector("#taskUrgency"),
  taskUrgencyValue: document.querySelector("#taskUrgencyValue"),
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
  syncProgress: document.querySelector("#syncProgress"),
  accountMetrics: document.querySelector("#accountMetrics"),
  accountOverall: document.querySelector("#accountOverall"),
  accountSearch: document.querySelector("#accountSearch"),
  accountSort: document.querySelector("#accountSort"),
  syncAllAccounts: document.querySelector("#syncAllAccounts"),
  accountGroup: document.querySelector("#accountGroup"),
  accountGroupList: document.querySelector("#accountGroupList"),
  addAccount: document.querySelector("#addAccount"),
  accountDialog: document.querySelector("#accountDialog"),
  accountForm: document.querySelector("#accountForm"),
  accountDialogTitle: document.querySelector("#accountDialogTitle"),
  accountDialogMode: document.querySelector("#accountDialogMode"),
  closeAccountDialog: document.querySelector("#closeAccountDialog"),
  cancelAccount: document.querySelector("#cancelAccount"),
  deleteAccount: document.querySelector("#deleteAccount"),
  accountId: document.querySelector("#accountId"),
  accountName: document.querySelector("#accountName"),
  accountAvatarInput: document.querySelector("#accountAvatarInput"),
  accountAvatarPreview: document.querySelector("#accountAvatarPreview"),
  accountAvatarRemove: document.querySelector("#accountAvatarRemove"),
  accountAeUrl: document.querySelector("#accountAeUrl"),
  accountTutorialUrl: document.querySelector("#accountTutorialUrl"),
  accountUploadUrl: document.querySelector("#accountUploadUrl"),
  accountUsername: document.querySelector("#accountUsername"),
  accountEmail: document.querySelector("#accountEmail"),
  accountPassword: document.querySelector("#accountPassword"),
  accountScheduledThrough: document.querySelector("#accountScheduledThrough"),
  chatSidebar: document.querySelector("#chatSidebar"),
  chatSidebarToggle: document.querySelector("#chatSidebarToggle"),
  chatChannels: document.querySelector("#chatChannels"),
  chatSidebarMessages: document.querySelector("#chatSidebarMessages"),
  chatSidebarForm: document.querySelector("#chatSidebarForm"),
  chatSidebarInput: document.querySelector("#chatSidebarInput"),
  chatSidebarClose: document.querySelector("#chatSidebarClose"),
  chatSidebarResize: document.querySelector("#chatSidebarResize"),
  chatBadge: document.querySelector("#chatBadge"),
  notesView: document.querySelector("#notesView")
};

function refreshIcons() {
  if (typeof lucide !== "undefined") lucide.createIcons();
}

const SYNC_INTERVAL_MS = 15000;

init();

async function init() {
  applyTheme();
  bindEvents();
  const bootstrap = await api("/api/bootstrap");
  state.assignees = bootstrap.assignees;
  state.activeAssignee = state.assignees[0] || "";
  state.statuses = bootstrap.statuses;
  state.dailyCategories = bootstrap.dailyCategories || [];
  state.currentUser = bootstrap.user || null;
  renderChrome(bootstrap);
  renderLinkInputs();
  applyStoredResourceCollapse();
  renderChatChannels();
  await initialLoad();
  if (new URLSearchParams(location.search).get("tiktok") === "connected") {
    switchTab("accounts");
    showNotice("TikTok connected — engagement metrics updated.", "good");
    try { history.replaceState(null, "", location.pathname); } catch {}
  } else {
    switchTab(getStoredTab());
  }
  startLiveSync();
  animatePageIn();
  state.pageAnimated = true;
  refreshIcons();
  if (new Date().getDate() === 1) showPayday();
}

function showPayday() {
  const overlay = document.createElement("div");
  overlay.className = "payday-overlay";
  overlay.innerHTML = `<span class="payday-text">PAY DAY!!!!</span>`;
  document.body.appendChild(overlay);
  if (typeof gsap !== "undefined") {
    gsap.from(".payday-text", { scale: 0.3, opacity: 0, duration: 0.5, ease: "back.out(2)" });
    gsap.to(".payday-overlay", { opacity: 0, delay: 2.5, duration: 0.5, onComplete: () => overlay.remove() });
  } else {
    setTimeout(() => overlay.remove(), 3000);
  }
}

function animatePageIn() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Add dot pattern background to body
  document.body.classList.add("dot-bg");

  // Initialize magic-card mouse tracking on interactive cards
  initMagicCards();

  // Animate metric numbers with ticker effect
  animateMetricNumbers();

  if (prefersReduced) return;

  // Use GSAP if available, otherwise use CSS blur-fade
  if (typeof gsap !== "undefined") {
    gsap.from(".main-tabs", { opacity: 0, y: -12, duration: 0.5, ease: "power2.out" });
    gsap.from(".metrics", { opacity: 0, y: 16, duration: 0.5, ease: "power2.out", delay: 0.08 });
    gsap.from(".metrics .metric", { opacity: 0, y: 12, scale: 0.97, duration: 0.45, stagger: 0.06, ease: "power2.out", delay: 0.15 });
    gsap.from(".resource-block", { opacity: 0, y: 12, duration: 0.4, stagger: 0.08, ease: "power2.out", delay: 0.25 });
    gsap.from(".controls", { opacity: 0, y: 12, duration: 0.4, ease: "power2.out", delay: 0.35 });
    gsap.from(".status-group", { opacity: 0, y: 18, duration: 0.5, stagger: 0.08, ease: "power2.out", delay: 0.4 });
  } else {
    // Fallback: CSS blur-fade classes
    document.querySelectorAll(".main-tabs, .metrics, .resource-block, .controls, .status-group").forEach((el, i) => {
      el.classList.add("blur-fade", `blur-fade-delay-${Math.min(i + 1, 8)}`);
    });
  }
}

// --- Magic Card: mouse-following spotlight on cards ---
function initMagicCards() {
  document.addEventListener("mousemove", (e) => {
    // Only the card under the cursor needs its spotlight moved.
    const card = e.target.closest?.(".task-row, .account-row, .metric");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--magic-x", `${e.clientX - rect.left}px`);
    card.style.setProperty("--magic-y", `${e.clientY - rect.top}px`);
  });
}

// --- Number Ticker: animate metric numbers counting up ---
function animateMetricNumbers() {
  const metricEls = document.querySelectorAll(".metric strong[data-metric]");
  for (const el of metricEls) {
    const target = parseInt(el.textContent, 10);
    if (isNaN(target) || target === 0) continue;
    const duration = 800;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    };
    el.textContent = "0";
    requestAnimationFrame(tick);
  }
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

function getAllChannels() {
  const user = state.currentUser;
  if (!user) return ["general"];
  const allUsers = ["Tommy", "Brandon", "Mac"];
  return ["general", ...allUsers.filter((u) => u !== user).map((u) => dmChannel(user, u))];
}

// First page load: one /api/sync call seeds tasks, counts, resources, and
// per-channel chat counts (everything the recurring sync also refreshes).
async function initialLoad() {
  const data = await api(`/api/sync?${taskQueryParams()}`);
  state.tasks = data.tasks || [];
  renderTasks();
  updateMetricCounts(data.counts);
  renderResources(data.resources || []);
  for (const ch of getAllChannels()) {
    const count = data.chatCounts?.[ch] ?? 0;
    state.chatSeenCounts[ch] = count;
    state.chatChannelCounts[ch] = count;
  }
  renderChatChannels();
}

// New-message detection off the cheap per-channel counts that ride along on
// /api/sync — full message bodies are only fetched for the open channel.
function handleChatCounts(chatCounts = {}) {
  const isCollapsed = els.chatSidebar.classList.contains("collapsed");
  let anyNew = false;
  for (const ch of getAllChannels()) {
    const count = chatCounts[ch] ?? 0;
    state.chatChannelCounts[ch] = count;
    if (count > (state.chatSeenCounts[ch] ?? count)) anyNew = true;
  }
  if (!anyNew) return;
  playPing();
  if (isCollapsed) {
    els.chatBadge.classList.add("visible");
  } else if ((chatCounts[state.chatChannel] ?? 0) > (state.chatSeenCounts[state.chatChannel] ?? 0)) {
    loadChatMessages();
  }
  renderChatChannels();
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
    const data = await api(`/api/sync?${taskQueryParams()}`);
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
    updateMetricCounts(data.counts);
    renderResources(data.resources);
    handleChatCounts(data.chatCounts);
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
  els.chatSidebarToggle.addEventListener("click", () => {
    const nowCollapsed = els.chatSidebar.classList.toggle("collapsed");
    document.body.classList.toggle("chat-open", !nowCollapsed);
    if (!nowCollapsed) {
      els.chatBadge.classList.remove("visible");
      state.chatLastSeenCount = state.chatKnownCount;
      loadChatMessages();
    }
  });
  els.chatSidebarClose.addEventListener("click", () => {
    els.chatSidebar.classList.add("collapsed");
    document.body.classList.remove("chat-open");
  });
  els.chatSidebarResize.addEventListener("mousedown", (e) => {
    e.preventDefault();
    els.chatSidebar.classList.add("resizing");
    document.body.classList.add("chat-resizing");
    els.chatSidebarResize.classList.add("active");
    const onMove = (ev) => {
      const w = Math.min(600, Math.max(260, ev.clientX));
      document.documentElement.style.setProperty("--chat-w", w + "px");
    };
    const onUp = () => {
      els.chatSidebar.classList.remove("resizing");
      document.body.classList.remove("chat-resizing");
      els.chatSidebarResize.classList.remove("active");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  els.chatSidebarForm.addEventListener("submit", postChatMessage);
  els.chatSidebarInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      els.chatSidebarForm.requestSubmit();
    }
  });
  els.chatChannels.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-channel]");
    if (!btn) return;
    state.chatChannel = btn.dataset.channel;
    renderChatChannels();
    loadChatMessages();
  });
  els.chatSidebarMessages.addEventListener("click", async (e) => {
    const del = e.target.closest(".chat-sidebar-msg-delete");
    if (!del) return;
    const msg = del.closest("[data-msg-id]");
    if (!msg) return;
    await api(`/api/chat/messages/${msg.dataset.msgId}`, { method: "DELETE" });
    await loadChatMessages();
  });
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
  els.taskUrgency.addEventListener("input", () => {
    els.taskUrgencyValue.textContent = els.taskUrgency.value;
    els.taskUrgency.style.setProperty("--urgency-pct", `${((els.taskUrgency.value - 1) / 4) * 100}%`);
  });
  [els.taskDialog, els.ringDialog, els.resourceDialog, els.accountDialog].forEach(d => {
    d.addEventListener("cancel", e => e.preventDefault());
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
    `<div class="metric metric-mascot"><img src="${state.theme === "dark" ? "/cat_white.gif" : "/cat.gif"}" alt="mascot" class="mascot-img"></div>`,
    metric("Open tasks", bootstrap.counts.open, "open"),
    metric("Total active", bootstrap.counts.tasks, "tasks"),
    metric("Overdue", bootstrap.counts.overdue, "overdue"),
    `<div class="metric metric-action">
      <button id="newTaskButton" class="primary"><i data-lucide="plus" style="width:15px;height:15px"></i> New Task</button>
      <div class="action-subrow">
        <button id="ringButton" class="secondary ring-button" type="button">
          <i data-lucide="bell-ring" style="width:14px;height:14px"></i>
          Ring Tommy
        </button>
        <button id="themeToggleButton" class="secondary theme-toggle" type="button" aria-pressed="${state.theme === "dark"}"></button>
      </div>
    </div>`
  ].join("");
  renderThemeToggle();
  renderArchiveToggle();
  refreshIcons();

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
  els.archiveToggle.innerHTML = state.showArchive
    ? `<i data-lucide="arrow-left" style="width:14px;height:14px"></i> Back to Active`
    : `<i data-lucide="archive" style="width:14px;height:14px"></i> Archive`;
  refreshIcons();
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
  refreshIcons();
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
          <span class="urgency-badge urgency-${urgencyTier(task.urgency)}" title="Urgency ${task.urgency ?? 3}/5">${task.urgency ?? 3}</span>
          ${task.image_count ? `<span class="img-count">${task.image_count} img</span>` : ""}
          ${task.last_message && hasUnreadMessages(task) ? `<span class="unread-msg-badge">New message</span>` : ""}
        </div>
      </div>
      <div class="due ${due.className}" title="${escapeHtml(due.label)}">
        <span>${escapeHtml(state.showArchive ? archive.display : (due.display || task.due_date || "No due"))}</span>
        <small>${escapeHtml(state.showArchive ? archive.label : due.label)}</small>
      </div>
      <div class="row-actions">
        <span class="expand-hint">${state.expandedTaskId === task.id ? "▲ Hide" : "▼ View"}</span>
        ${state.showArchive
          ? `<button type="button" data-action="restore-task"><i data-lucide="undo-2" style="width:13px;height:13px"></i> Restore</button>`
          : `<button type="button" class="row-archive-button" data-action="archive-task" title="Archive task"><i data-lucide="archive" style="width:13px;height:13px"></i> Archive</button><button type="button" class="row-delete-button danger" data-action="delete-task" title="Permanently delete"><i data-lucide="trash-2" style="width:13px;height:13px"></i> Delete</button><button type="button" data-action="duplicate-task"><i data-lucide="copy" style="width:13px;height:13px"></i> Duplicate</button><button type="button" data-action="edit"><i data-lucide="pencil" style="width:13px;height:13px"></i> Edit</button>`}
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
          <span class="chat-author-label author-name author-${authorSlug(state.currentUser)}">${escapeHtml(state.currentUser || "Me")}</span>
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
  els.taskUrgency.value = task?.urgency ?? 3;
  els.taskUrgencyValue.textContent = els.taskUrgency.value;
  els.taskUrgency.style.setProperty("--urgency-pct", `${((els.taskUrgency.value - 1) / 4) * 100}%`);
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
    urgency: Number(els.taskUrgency.value) || 3,
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
  markTaskRead(taskId);
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
  const author = state.currentUser || state.assignees[0] || "Me";
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
  // Errors tend to be long (account names, reasons) — leave them up longer.
  showNotice.timer = window.setTimeout(() => {
    els.notice.hidden = true;
  }, tone === "bad" ? 12000 : 6000);
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  storeTheme(state.theme);
  applyTheme();
  renderThemeToggle();
  const mascot = document.querySelector(".mascot-img");
  if (mascot) mascot.src = state.theme === "dark" ? "/cat_white.gif" : "/cat.gif";
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
  button.innerHTML = `<i data-lucide="${isDark ? "sun" : "moon"}" style="width:16px;height:16px"></i>`;
  button.setAttribute("aria-pressed", String(isDark));
  button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  button.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  refreshIcons();
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


// Shrink the image in the browser so uploads stay small (longest edge ~1400px,
// or a smaller cap for things like avatars).
function readImageAsDataUrl(file, maxEdge = 1400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a readable image."));
      img.onload = () => {
        const max = maxEdge;
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

function urgencyTier(value) {
  const v = value ?? 3;
  if (v >= 4) return "high";
  if (v >= 2) return "mid";
  return "low";
}

function taskStatusMeta(status, done = false) {
  if (done) return { className: "done-status", label: "Done" };
  const map = {
    "Pending Approval": { className: "pending-approval", label: "Pending Approval" },
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
// TikTok Accounts tab.
// Fully independent of the task board: own state, render, dialog, API.
// ===================================================================


const accountsState = {
  accounts: [],
  loaded: false,
  editing: null,
  steps: [], // working copy while the dialog is open
  avatar: "", // working avatar (data URL) while the dialog is open
  search: "",
  sort: "runout",
  overallMetric: "views",
  overallChartMode: "bar",
  windowDays: 14, // 14 | 30 | 90 — drives the overall chart + leaderboards
  chartSource: "posted", // posted (by post date) | growth (daily gained) | followers
  overview: null, // /api/metrics/overview payload for the current window
  topVideos: [], // cross-account leaderboard for the current window
  accountVideos: {}, // accountId -> top videos, fetched on expand
  expanded: new Set(), // account ids whose credentials panel is open
  flash: new Set(), // account ids that just finished syncing — rows flash once
  syncing: false // a Sync All run is in progress
};

const UNGROUPED_LABEL = "Ungrouped";

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
  els.syncAllAccounts.addEventListener("click", syncAllAccountsAction);
  els.closeAccountDialog.addEventListener("click", () => els.accountDialog.close());
  els.cancelAccount.addEventListener("click", () => els.accountDialog.close());
  els.accountForm.addEventListener("submit", saveAccount);
  els.deleteAccount.addEventListener("click", deleteCurrentAccount);
  els.accountBoard.addEventListener("click", onAccountBoardClick);
  els.accountSearch.addEventListener("input", debounce(() => {
    accountsState.search = els.accountSearch.value.trim();
    renderAccounts();
  }, 150));
  els.accountSort.addEventListener("change", () => {
    accountsState.sort = els.accountSort.value;
    renderAccounts();
  });
  els.accountAvatarInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      accountsState.avatar = await readImageAsDataUrl(file, 256);
      renderAvatarPreview();
    } catch (error) {
      showNotice(error.message, "bad");
    }
    event.target.value = "";
  });
  els.accountAvatarRemove.addEventListener("click", () => {
    accountsState.avatar = "";
    renderAvatarPreview();
  });
  els.accountOverall.addEventListener("click", (event) => {
    const windowBtn = event.target.closest(".overall-window-btn");
    if (windowBtn) {
      accountsState.windowDays = Number(windowBtn.dataset.days) || 14;
      accountsState.accountVideos = {}; // per-account lists are window-scoped
      loadAccounts();
      return;
    }
    const sourceBtn = event.target.closest(".overall-source-btn");
    if (sourceBtn) {
      accountsState.chartSource = sourceBtn.dataset.source;
      // Metric tab sets differ per source (posts vs shares) — reset if invalid.
      const metrics = OVERALL_METRICS[accountsState.chartSource] || [];
      if (!metrics.some(([k]) => k === accountsState.overallMetric)) accountsState.overallMetric = "views";
      renderAccountOverall();
      return;
    }
    const tab = event.target.closest(".overall-tab");
    if (tab) {
      accountsState.overallMetric = tab.dataset.metric;
      renderAccountOverall();
      return;
    }
    const modeBtn = event.target.closest(".chart-mode-btn");
    if (modeBtn) {
      accountsState.overallChartMode = modeBtn.dataset.mode;
      renderAccountOverall();
    }
  });
  // Hovering a bar segment or a legend entry highlights that account across
  // every bar and dims the rest.
  els.accountOverall.addEventListener("mouseover", (event) => {
    const target = event.target.closest("[data-acct]");
    focusOverallAccount(target ? target.dataset.acct : null);
  });
  // Instant, cursor-following value tooltip (native <title> has a ~1s delay).
  els.accountOverall.addEventListener("mousemove", (event) => {
    const seg = event.target.closest("[data-tip]");
    if (seg) showOverallTip(seg.dataset.tip, event.clientX, event.clientY);
    else hideOverallTip();
  });
  els.accountOverall.addEventListener("mouseleave", () => {
    focusOverallAccount(null);
    hideOverallTip();
  });
}

let overallTipEl = null;

function showOverallTip(text, x, y) {
  if (!overallTipEl) {
    overallTipEl = document.createElement("div");
    overallTipEl.className = "overall-tip";
    document.body.appendChild(overallTipEl);
  }
  overallTipEl.textContent = text;
  overallTipEl.hidden = false;
  const pad = 14;
  const rect = overallTipEl.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + rect.width > window.innerWidth - 6) left = x - rect.width - pad;
  if (top + rect.height > window.innerHeight - 6) top = y - rect.height - pad;
  overallTipEl.style.left = `${Math.max(6, left)}px`;
  overallTipEl.style.top = `${Math.max(6, top)}px`;
}

function hideOverallTip() {
  if (overallTipEl) overallTipEl.hidden = true;
}

function focusOverallAccount(acct) {
  els.accountOverall.querySelectorAll("[data-acct]").forEach((el) => {
    if (acct == null) {
      el.classList.remove("acct-dim", "acct-on");
      return;
    }
    const match = el.dataset.acct === String(acct);
    el.classList.toggle("acct-dim", !match);
    el.classList.toggle("acct-on", match);
  });
}

function renderAvatarPreview() {
  const a = accountsState.avatar;
  els.accountAvatarPreview.innerHTML = a
    ? `<img src="${escapeHtml(a)}" alt="Profile picture">`
    : `<span class="account-avatar-empty">No image</span>`;
  els.accountAvatarRemove.hidden = !a;
}


function switchTab(tab) {
  els.tasksView.hidden = tab !== "tasks";
  els.accountsView.hidden = tab !== "accounts";
  els.notesView.hidden = tab !== "notes";
  els.mainTabs.querySelectorAll(".main-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  setStoredTab(tab);
  if (tab === "accounts" && !accountsState.loaded) loadAccounts();
  const sbFrame = document.getElementById("storyboardFrame");
  if (tab === "notes" && sbFrame && !sbFrame.src.includes("storyboard")) {
    sbFrame.src = "/storyboard/index.html";
  }
  if (state.pageAnimated) animateTabIn(tab);
}

function animateTabIn(tab) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof gsap === "undefined") return;
  if (tab === "tasks") {
    gsap.from(".status-group", { opacity: 0, y: 14, duration: 0.4, stagger: 0.06, ease: "power2.out" });
  } else if (tab === "accounts") {
    gsap.from(".account-overall", { opacity: 0, y: 14, duration: 0.4, ease: "power2.out" });
    gsap.from(".account-metrics .metric", { opacity: 0, y: 10, scale: 0.97, duration: 0.35, stagger: 0.06, ease: "power2.out", delay: 0.1 });
    gsap.from(".account-group", { opacity: 0, y: 14, duration: 0.4, stagger: 0.06, ease: "power2.out", delay: 0.2 });
  }
}

async function loadAccounts() {
  const days = accountsState.windowDays;
  const [data, overview, top] = await Promise.all([
    api("/api/tiktok-accounts"),
    api(`/api/metrics/overview?days=${days}`).catch(() => null),
    api(`/api/videos/top?days=${days}&limit=12`).catch(() => ({ videos: [] }))
  ]);
  accountsState.accounts = data.accounts || [];
  accountsState.overview = overview;
  accountsState.topVideos = top.videos || [];
  accountsState.loaded = true;
  renderAccounts();
}

function renderAccounts() {
  renderAccountOverall();
  renderAccountMetrics();
  if (!accountsState.accounts.length) {
    els.accountBoard.innerHTML = `<p class="detail-empty account-empty">No accounts yet. Add one to start tracking content runout.</p>`;
    return;
  }

  // Filter by search, then sort, then group.
  const search = accountsState.search.toLowerCase();
  const filtered = accountsState.accounts.filter((account) =>
    !search || account.name.toLowerCase().includes(search)
  );
  if (!filtered.length) {
    els.accountBoard.innerHTML = `<p class="detail-empty account-empty">No accounts match “${escapeHtml(accountsState.search)}”.</p>`;
    return;
  }
  const sorted = sortAccounts(filtered);

  const groups = new Map();
  for (const account of sorted) {
    const key = account.group_name || UNGROUPED_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(account);
  }
  // Named groups alphabetically, with Ungrouped always last.
  const groupNames = [...groups.keys()]
    .filter((name) => name !== UNGROUPED_LABEL)
    .sort((a, b) => a.localeCompare(b));
  if (groups.has(UNGROUPED_LABEL)) groupNames.push(UNGROUPED_LABEL);

  els.accountBoard.innerHTML = groupNames.map((name) => {
    const rows = groups.get(name).map(renderAccountRow).join("");
    const collapsed = isAccountGroupCollapsed(name);
    return `
      <section class="account-group ${collapsed ? "collapsed" : ""}" data-group="${escapeHtml(name)}">
        <button type="button" class="account-group-head" aria-expanded="${!collapsed}">
          <span class="collapse-indicator" aria-hidden="true"></span>
          <h3>${escapeHtml(name)}</h3>
          <span class="account-group-count">${groups.get(name).length}</span>
        </button>
        <div class="account-group-rows">${rows}</div>
      </section>
    `;
  }).join("");
  // Flash classes are one-shot: rows just rendered play their animation once,
  // and the next render won't re-add it.
  accountsState.flash.clear();
  refreshIcons();
}

function sortAccounts(accounts) {
  const list = [...accounts];
  if (accountsState.sort === "name-asc") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (accountsState.sort === "name-desc") {
    list.sort((a, b) => b.name.localeCompare(a.name));
  } else {
    // Runout soonest first; accounts with no date sink to the bottom.
    list.sort((a, b) => {
      const da = a.runout_date || "9999-12-31";
      const db = b.runout_date || "9999-12-31";
      return da.localeCompare(db) || a.name.localeCompare(b.name);
    });
  }
  return list;
}

// Buckets: out (no date or <= 0 days), low (1–4 days), stocked (5+ days).
function runoutBucket(dateStr) {
  if (!dateStr) return "out";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${dateStr}T00:00:00`) - today) / 86400000);
  if (days <= 0) return "out";
  if (days <= 4) return "low";
  return "stocked";
}

function renderAccountMetrics() {
  const counts = { stocked: 0, low: 0, out: 0 };
  for (const account of accountsState.accounts) counts[runoutBucket(account.runout_date)]++;
  els.accountMetrics.innerHTML = `
    <div class="metric account-metric-stocked">
      <strong>${counts.stocked}</strong>
      <span>Stocked · 5+ days</span>
    </div>
    <div class="metric account-metric-low">
      <strong>${counts.low}</strong>
      <span>Running low · 1–4 days</span>
    </div>
    <div class="metric account-metric-out">
      <strong>${counts.out}</strong>
      <span>Out of content</span>
    </div>
  `;
}

// Distinct per-account color. Hues are hand-spread across the wheel (not the
// golden angle, which clustered too many greens/blues), with saturation and
// lightness varied per index and dimmed on later cycles so repeats differ.
const ACCOUNT_HUES = [212, 8, 158, 280, 45, 330, 100, 188, 28, 255, 342, 72, 130, 312];

function accountColor(index) {
  const hue = ACCOUNT_HUES[index % ACCOUNT_HUES.length];
  const cycle = Math.floor(index / ACCOUNT_HUES.length);
  const sat = 58 + (index % 3) * 10;            // 58 / 68 / 78
  const light = Math.max(42, 62 - cycle * 12 - (index % 2) * 6);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

const OVERALL_METRICS = {
  posted: [["views", "Views"], ["likes", "Likes"], ["comments", "Comments"], ["posts", "Posts"]],
  growth: [["views", "Views"], ["likes", "Likes"], ["comments", "Comments"], ["shares", "Shares"]]
};
const WINDOW_OPTIONS = [14, 30, 90];
const CHART_SOURCES = [["posted", "By post date"], ["growth", "Daily gained"], ["followers", "Followers"]];

// Follower stats need a TikTok permission that only accounts connected (or
// reconnected) after July 2026 have. Hide all follower UI until real data
// exists so nobody is nagged to re-authorize.
function hasFollowerData() {
  if (accountsState.accounts.some((a) => a.follower_count != null)) return true;
  const overview = accountsState.overview;
  return !!overview && overview.accounts.some((a) => a.growth?.followers?.some((v) => v != null));
}

function lastNonNull(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) return values[i];
  }
  return null;
}

// Per-account series for the overall chart, pulled from the overview payload.
function overallContributors(metric) {
  const overview = accountsState.overview;
  if (!overview) return [];
  const source = accountsState.chartSource;

  // Stable colors keyed by account id (sorted) so they don't shift with UI sort.
  const colorOf = {};
  [...accountsState.accounts].sort((a, b) => a.id - b.id).forEach((a, i) => { colorOf[a.id] = accountColor(i); });

  const contributors = [];
  for (const acct of overview.accounts) {
    let perDay = null;
    if (source === "followers") perDay = acct.growth?.followers || null;
    else if (source === "growth") perDay = acct.growth?.[metric] || null;
    else perDay = acct.posted?.[metric] || null;
    if (!perDay) continue;

    if (source === "followers") {
      const latest = lastNonNull(perDay);
      if (latest == null) continue;
      contributors.push({ id: acct.id, name: acct.name, color: colorOf[acct.id] || accountColor(0), perDay, total: latest, absolute: true });
    } else {
      const total = perDay.reduce((s, x) => s + (Number(x) || 0), 0);
      if (total > 0) contributors.push({ id: acct.id, name: acct.name, color: colorOf[acct.id] || accountColor(0), perDay, total });
    }
  }
  contributors.sort((a, b) => b.total - a.total);
  return contributors;
}

// Top-of-page overall chart: every account's contribution to the selected
// metric over the selected window, as stacked bars or lines. Three sources:
// "by post date" (video totals on their post day), "daily gained" (snapshot
// diffs), and absolute follower counts.
function renderAccountOverall() {
  if (!els.accountOverall) return;
  const followersAvailable = hasFollowerData();
  if (!followersAvailable && accountsState.chartSource === "followers") accountsState.chartSource = "posted";
  const source = accountsState.chartSource;
  const metric = source === "followers" ? "followers" : accountsState.overallMetric;
  const days = accountsState.overview?.days || accountsState.windowDays;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const axis0 = today.getTime() - (days - 1) * 86400000;
  // Thin the x-axis labels on long windows so they stay readable.
  const labelStep = Math.max(1, Math.ceil(days / 14));
  const labels = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(axis0 + i * 86400000);
    labels.push(i % labelStep === 0 || i === days - 1 ? `${d.getMonth() + 1}/${d.getDate()}` : "");
  }

  const contributors = overallContributors(metric);

  const stacked = source !== "followers" && accountsState.overallChartMode === "bar";
  let maxTotal = 1;
  if (stacked) {
    const dayTotals = new Array(days).fill(0);
    for (const c of contributors) c.perDay.forEach((v, p) => { dayTotals[p] += Number(v) || 0; });
    maxTotal = Math.max(1, ...dayTotals);
  } else {
    for (const c of contributors) {
      for (const v of c.perDay) if (v != null) maxTotal = Math.max(maxTotal, Number(v) || 0);
    }
  }
  const grand = contributors.reduce((s, c) => s + c.total, 0);

  const windowTabs = WINDOW_OPTIONS.map((d) =>
    `<button type="button" class="overall-window-btn ${d === accountsState.windowDays ? "active" : ""}" data-days="${d}">${d}d</button>`
  ).join("");
  const sources = followersAvailable ? CHART_SOURCES : CHART_SOURCES.filter(([k]) => k !== "followers");
  const sourceTabs = sources.map(([k, label]) =>
    `<button type="button" class="overall-source-btn ${k === source ? "active" : ""}" data-source="${k}">${label}</button>`
  ).join("");
  const metricTabs = source === "followers" ? "" : OVERALL_METRICS[source].map(([k, label]) =>
    `<button type="button" class="overall-tab ${k === metric ? "active" : ""}" data-metric="${k}">${label}</button>`
  ).join("");

  const fracs = [1, 0.75, 0.5, 0.25, 0];
  const yAxis = fracs.map((f) =>
    `<span style="top:${((1 - f) * 100).toFixed(1)}%">${formatCount(Math.round(maxTotal * f))}</span>`
  ).join("");
  const mode = source === "followers" ? "line" : accountsState.overallChartMode;
  const chartW = (els.accountOverall?.offsetWidth || 800) - 44;
  const chartSvg = mode === "line"
    ? lineChartSvg(contributors, maxTotal, days, chartW)
    : stackedBarsSvg(contributors, maxTotal, days);
  const emptyMessage = source === "growth"
    ? "No daily-growth history yet — it starts accruing with every sync from now on."
    : source === "followers"
      ? "No follower data yet — hit Reconnect on each account to grant the new stats permission, then Sync."
      : `No ${escapeHtml(metric)} recorded in this window yet. Sync accounts to populate this.`;
  const chart = contributors.length
    ? `<div class="overall-yaxis">${yAxis}</div>${chartSvg}`
    : `<p class="detail-empty overall-empty">${emptyMessage}</p>`;
  const modeToggle = source === "followers" ? "" : `<div class="chart-mode-toggle">
    <button type="button" class="chart-mode-btn ${mode === "bar" ? "active" : ""}" data-mode="bar" title="Stacked bars"><i data-lucide="bar-chart-3" style="width:14px;height:14px"></i></button>
    <button type="button" class="chart-mode-btn ${mode === "line" ? "active" : ""}" data-mode="line" title="Line graph"><i data-lucide="trending-up" style="width:14px;height:14px"></i></button>
  </div>`;
  const legend = contributors.map((c) =>
    `<span class="overall-legend-item" data-acct="${c.id}"><i style="background:${c.color}"></i>${escapeHtml(c.name)} <strong>${formatCount(c.total)}</strong></span>`
  ).join("");
  const totalLabel = source === "followers" ? "followers" : (source === "growth" ? `${escapeHtml(metric)} gained` : escapeHtml(metric));

  els.accountOverall.innerHTML = `
    <div class="overall-head">
      <div>
        <span class="control-label">All accounts · last ${days} days</span>
        <p class="overall-total"><strong>${formatCount(grand)}</strong> ${totalLabel}</p>
      </div>
      <div class="overall-controls">
        <div class="overall-windows segmented">${windowTabs}</div>
        <div class="overall-sources segmented">${sourceTabs}</div>
        ${metricTabs ? `<div class="overall-tabs segmented">${metricTabs}</div>` : ""}
        ${modeToggle}
      </div>
    </div>
    <div class="overall-chart ${contributors.length ? "has-axis" : ""}">${chart}</div>
    ${contributors.length ? `<div class="overall-axis">${labels.map((l) => `<span>${l}</span>`).join("")}</div>` : ""}
    ${legend ? `<div class="overall-legend">${legend}</div>` : ""}
    ${renderTopVideos()}
  `;
  refreshIcons();
}

// 6/24-style label for a unix-seconds timestamp.
function videoDate(createTime) {
  if (!createTime) return "";
  const d = new Date(createTime * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Cross-account leaderboard: best videos in the window, ranked by views.
function renderTopVideos() {
  const videos = accountsState.topVideos;
  if (!videos.length) return "";
  const cards = videos.map((v, i) => {
    const title = v.title ? escapeHtml(v.title) : "Untitled video";
    const when = videoDate(v.create_time);
    const cover = v.cover_url
      ? `<img src="${escapeHtml(v.cover_url)}" alt="" loading="lazy" onerror="this.remove()">`
      : "";
    const inner = `
      <span class="video-card-rank">#${i + 1}</span>
      <div class="video-card-cover">${cover}</div>
      <div class="video-card-body">
        <span class="video-card-title">${title}</span>
        <span class="video-card-account">${escapeHtml(v.account_name || "")}${when ? ` · ${when}` : ""}</span>
        <span class="video-card-stats"><strong>${formatCount(v.views)}</strong> views · ${formatCount(v.likes)} likes</span>
      </div>`;
    return v.share_url
      ? `<a class="video-card" href="${escapeHtml(v.share_url)}" target="_blank" rel="noreferrer">${inner}</a>`
      : `<div class="video-card">${inner}</div>`;
  }).join("");
  return `
    <div class="top-videos">
      <span class="control-label">Top videos · last ${accountsState.windowDays} days</span>
      <div class="top-videos-row">${cards}</div>
    </div>
  `;
}

function stackedBarsSvg(contributors, maxTotal, days) {
  const W = 700;
  const H = 150;
  const gap = days > 60 ? 1 : days > 20 ? 3 : 6;
  const bw = (W - (days - 1) * gap) / days;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = ((1 - f) * H).toFixed(1);
    return `<line class="overall-grid" x1="0" y1="${y}" x2="${W}" y2="${y}" vector-effect="non-scaling-stroke"></line>`;
  }).join("");
  let rects = "";
  for (let p = 0; p < days; p++) {
    let yTop = H;
    for (const c of contributors) {
      const v = c.perDay[p];
      if (!v) continue;
      const h = (v / maxTotal) * H;
      yTop -= h;
      rects += `<rect data-acct="${c.id}" data-tip="${escapeHtml(`${c.name}: ${formatCount(v)}`)}" x="${(p * (bw + gap)).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${c.color}"></rect>`;
    }
  }
  return `<svg class="overall-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${grid}${rects}</svg>`;
}

function lineChartSvg(contributors, maxTotal, days, containerW) {
  const W = containerW || 800;
  const H = 220;
  const pad = 12;
  const plotH = H - pad * 2;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = (pad + (1 - f) * plotH).toFixed(1);
    return `<line class="overall-grid" x1="0" y1="${y}" x2="${W}" y2="${y}"></line>`;
  }).join("");
  const dotR = days > 30 ? 2 : 3;
  let paths = "";
  let dots = "";
  for (const c of contributors) {
    // null = no data that day (e.g. follower counts between syncs): break the
    // line there instead of drawing a misleading zero.
    const pts = [];
    for (let p = 0; p < days; p++) {
      const v = c.perDay[p];
      if (v == null) { pts.push(null); continue; }
      const x = days > 1 ? (p / (days - 1)) * W : W / 2;
      const y = pad + plotH - ((Number(v) || 0) / maxTotal) * plotH;
      pts.push({ x, y, v });
    }
    let d = "";
    let prev = null;
    for (const pt of pts) {
      if (!pt) { prev = null; continue; }
      if (!prev) {
        d += `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      } else {
        const tension = (pt.x - prev.x) * 0.3;
        d += ` C${(prev.x + tension).toFixed(1)},${prev.y.toFixed(1)} ${(pt.x - tension).toFixed(1)},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }
      prev = pt;
    }
    if (d) paths += `<path data-acct="${c.id}" fill="none" stroke="${c.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${d}" opacity="0.85"></path>`;
    for (const pt of pts) {
      if (!pt) continue;
      dots += `<circle data-acct="${c.id}" data-tip="${escapeHtml(`${c.name}: ${formatCount(pt.v)}`)}" cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${dotR}" fill="${c.color}" stroke="var(--bg)" stroke-width="1.5"></circle>`;
    }
  }
  return `<svg class="overall-bars overall-lines" viewBox="0 0 ${W} ${H}" role="img">${grid}${paths}${dots}</svg>`;
}

// Group collapse state, remembered per group name in localStorage.
function isAccountGroupCollapsed(name) {
  try {
    return localStorage.getItem(`keystone-account-group-${name}`) === "collapsed";
  } catch {
    return false;
  }
}

function setAccountGroupCollapsed(name, collapsed) {
  try {
    localStorage.setItem(`keystone-account-group-${name}`, collapsed ? "collapsed" : "open");
  } catch {
    // Collapse state just won't persist if storage is unavailable.
  }
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
  // "soon" matches the summary tiles' "running low" bucket (1–4 days).
  if (days <= 4) return { className: "soon", label: `${days} days left`, title };
  if (days <= 7) return { className: "week", label: `${days} days left`, title };
  return { className: "ok", label: `${days} days left`, title };
}

function renderAccountRow(account) {
  const runout = runoutState(account.runout_date);
  const links = [];
  if (account.ae_project_url) links.push(`<a href="${escapeHtml(account.ae_project_url)}" target="_blank" rel="noreferrer">AE Project</a>`);
  if (account.tutorial_url) links.push(`<a href="${escapeHtml(account.tutorial_url)}" target="_blank" rel="noreferrer">Tutorial</a>`);
  const expanded = accountsState.expanded.has(account.id);
  const flash = accountsState.flash.has(account.id);
  return `
    <article class="account-row ${expanded ? "expanded" : ""}${flash ? " just-synced" : ""}" data-account-id="${account.id}">
      ${renderAccountAvatar(account)}
      <div class="account-main">
        <div class="account-headline">
          <span class="expand-indicator" aria-hidden="true"></span>
          <span class="account-name">${escapeHtml(account.name)}</span>
          <span class="runout-badge runout-${runout.className}" title="${escapeHtml(runout.title)}">${escapeHtml(runout.label)}</span>
          ${account.upload_url ? `<a class="account-upload-btn" href="${escapeHtml(account.upload_url)}" target="_blank" rel="noreferrer" title="Open the upload link">Upload</a>` : ""}
        </div>
        ${renderAccountInlineStats(account)}
        ${links.length ? `<div class="account-links">${links.join("")}</div>` : ""}
      </div>
      <div class="account-actions">
        <button type="button" data-action="sync-account" title="Sync engagement metrics from TikTok"><i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Sync</button>
        <button type="button" data-action="edit-account"><i data-lucide="pencil" style="width:13px;height:13px"></i> Edit</button>
      </div>
      ${expanded ? renderAccountExpanded(account) : ""}
    </article>
  `;
}

// Compact 1.2K / 3.4M formatting for big counts.
function formatCount(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

const METRICS_WINDOW_LABEL = "Last 14 days";

// Red/green change vs the previous 14-day window. "▲ new" when there was no
// prior activity, nothing when both windows are zero.
function renderDelta(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (cur === 0 && prev === 0) return "";
  if (prev === 0) return `<span class="delta delta-up" title="No activity in the prior 14 days">▲ new</span>`;
  const pct = (cur - prev) / prev * 100;
  const dir = pct > 0.5 ? "up" : (pct < -0.5 ? "down" : "flat");
  const arrow = dir === "up" ? "▲" : (dir === "down" ? "▼" : "▬");
  return `<span class="delta delta-${dir}" title="vs previous 14 days">${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
}

function renderAccountAvatar(account) {
  if (account.avatar) {
    return `<div class="account-avatar"><img src="${escapeHtml(account.avatar)}" alt="${escapeHtml(account.name)}" loading="lazy"></div>`;
  }
  const initial = escapeHtml((account.name || "?").trim().charAt(0).toUpperCase() || "?");
  return `<div class="account-avatar account-avatar-placeholder">${initial}</div>`;
}

function renderAccountInlineStats(account) {
  if (account.post_count == null) return "";
  if (account.post_count === 0) {
    return `<div class="account-inline-stats"><span class="account-inline-posts">No posts · last 14 days</span></div>`;
  }
  const followers = account.follower_count != null
    ? `<span><strong>${formatCount(account.follower_count)}</strong> followers</span>`
    : "";
  return `
    <div class="account-inline-stats">
      ${followers}
      <span><strong>${formatCount(account.total_views)}</strong> views ${renderDelta(account.total_views, account.prev_views)}</span>
      <span><strong>${formatCount(account.total_likes)}</strong> likes ${renderDelta(account.total_likes, account.prev_likes)}</span>
      <span class="account-inline-posts">${formatCount(account.post_count)} posts · 14d</span>
    </div>
  `;
}

function renderAccountExpanded(account) {
  const cred = (label, value) => `
    <div class="account-credential">
      <span class="account-credential-label">${label}</span>
      <span class="account-credential-value">${value ? escapeHtml(value) : "<span class='detail-empty'>—</span>"}</span>
    </div>
  `;
  const tiktok = account.tiktok_connected
    ? `<div class="account-tiktok-row">
        <span class="account-tiktok-status">● TikTok connected</span>
        <a class="account-verify-link" href="/api/tiktok/connect?account=${account.id}">Reconnect</a>
        <button type="button" class="account-tiktok-disconnect" data-action="disconnect-tiktok">Disconnect</button>
      </div>`
    : `<div class="account-tiktok-row"><a class="account-verify-link" href="/api/tiktok/connect?account=${account.id}">Connect TikTok →</a></div>`;
  return `
    <div class="account-detail">
      ${renderAccountMetricsPanel(account)}
      ${tiktok}
      <div class="account-credentials">
        ${cred("Username", account.username)}
        ${cred("Email", account.email)}
        ${cred("Password", account.password)}
      </div>
    </div>
  `;
}

function renderAccountMetricsPanel(account) {
  if (account.post_count == null) {
    return `<p class="detail-empty account-metrics-empty">No engagement data yet — connect TikTok and hit Sync.</p>`;
  }
  const posts = Number(account.post_count) || 0;
  const stamp = account.metrics_synced_at
    ? `<p class="account-metrics-stamp">Synced ${escapeHtml(shortDateTime(account.metrics_synced_at))}</p>`
    : "";
  if (posts === 0) {
    return `
      <p class="account-metrics-heading">${METRICS_WINDOW_LABEL}</p>
      <p class="detail-empty account-metrics-empty">No posts in the last 14 days.</p>
      ${stamp}
    `;
  }
  const views = Number(account.total_views) || 0;
  const prevPosts = Number(account.prev_post_count) || 0;
  const prevViews = Number(account.prev_views) || 0;
  const avg = posts ? Math.round(views / posts) : 0;
  const prevAvg = prevPosts ? Math.round(prevViews / prevPosts) : 0;
  const engagement = views ? (Number(account.total_likes) || 0) / views * 100 : 0;
  const prevEngagement = prevViews ? (Number(account.prev_likes) || 0) / prevViews * 100 : 0;
  const stat = (label, value, cur, prev) => `
    <div class="account-stat">
      <strong>${value}</strong>
      <span>${label}</span>
      ${renderDelta(cur, prev)}
    </div>
  `;
  const source = account.metrics_source === "tiktok" ? "via TikTok" : "";
  const followers = account.follower_count != null
    ? `<div class="account-stat account-stat-followers"><strong>${formatCount(account.follower_count)}</strong><span>Followers</span></div>`
    : "";
  return `
    <p class="account-metrics-heading">${METRICS_WINDOW_LABEL} <span class="account-metrics-sub">vs previous 14${source ? ` · ${source}` : ""}</span></p>
    <div class="account-metrics-grid">
      ${followers}
      ${stat("Views", formatCount(views), views, prevViews)}
      ${stat("Likes", formatCount(account.total_likes), account.total_likes, account.prev_likes)}
      ${stat("Comments", formatCount(account.total_comments), account.total_comments, account.prev_comments)}
      ${stat("Shares", formatCount(account.total_shares), account.total_shares, account.prev_shares)}
      ${stat("Posts", formatCount(posts), posts, prevPosts)}
      ${stat("Avg views", formatCount(avg), avg, prevAvg)}
      ${stat("Engagement", `${engagement.toFixed(1)}%`, engagement, prevEngagement)}
    </div>
    ${renderAccountCharts(account, { engagement })}
    ${renderAccountTopVideos(account)}
    ${stamp}
  `;
}

// Best videos for one account in the current window, fetched when the row is
// expanded (see ensureAccountVideos).
function renderAccountTopVideos(account) {
  const videos = accountsState.accountVideos[account.id];
  if (!videos || !videos.length) return "";
  const items = videos.map((v, i) => {
    const title = v.title ? escapeHtml(v.title) : "Untitled video";
    const when = videoDate(v.create_time);
    const label = v.share_url
      ? `<a href="${escapeHtml(v.share_url)}" target="_blank" rel="noreferrer">${title}</a>`
      : title;
    return `
      <li>
        <span class="account-video-rank">#${i + 1}</span>
        <span class="account-video-title">${label}${when ? `<em>${when}</em>` : ""}</span>
        <span class="account-video-stats"><strong>${formatCount(v.views)}</strong> views · ${formatCount(v.likes)} likes · ${formatCount(v.comments)} comments</span>
      </li>
    `;
  }).join("");
  return `
    <div class="account-top-videos">
      <p class="account-metrics-heading">Top videos · last ${accountsState.windowDays} days</p>
      <ol class="account-video-list">${items}</ol>
    </div>
  `;
}

async function ensureAccountVideos(id) {
  if (accountsState.accountVideos[id]) return;
  try {
    const data = await api(`/api/tiktok-accounts/${id}/videos?days=${accountsState.windowDays}&limit=5`);
    accountsState.accountVideos[id] = data.videos || [];
  } catch {
    accountsState.accountVideos[id] = [];
  }
}

function renderAccountCharts(account, { engagement }) {
  let daily = null;
  try { daily = JSON.parse(account.metrics_daily); } catch { /* no daily series */ }
  const likes = Number(account.total_likes) || 0;
  const comments = Number(account.total_comments) || 0;
  const shares = Number(account.total_shares) || 0;
  const donutSegments = [
    { value: likes, color: "var(--author-brandon)", label: "Likes" },
    { value: comments, color: "var(--warning)", label: "Comments" },
    { value: shares, color: "var(--good)", label: "Shares" }
  ];
  return `
    <div class="account-charts">
      ${daily ? `
        <div class="chart chart-wide">
          <span class="chart-label">Views by post date · 14d</span>
          ${barsSvg(daily.views, "var(--due-upcoming)")}
          ${dayAxis(daily.start, daily.views.length)}
        </div>
        <div class="chart chart-wide">
          <span class="chart-label">Likes by post date · 14d</span>
          ${barsSvg(daily.likes, "var(--author-tommy)")}
        </div>` : ""}
      <div class="chart chart-donut">
        <span class="chart-label">Engagement mix</span>
        ${donutSvg(donutSegments, `${engagement.toFixed(1)}%`)}
        <div class="chart-legend">
          ${donutSegments.map((s) => `<span><i style="background:${s.color}"></i>${s.label} ${formatCount(s.value)}</span>`).join("")}
        </div>
      </div>
    </div>
  `;
}

// Dependency-free SVG bar chart. Bars stretch to the container via viewBox.
function barsSvg(values, color) {
  const n = values.length || 1;
  const max = Math.max(1, ...values.map((v) => Number(v) || 0));
  const W = 300;
  const H = 72;
  const gap = 3;
  const bw = (W - (n - 1) * gap) / n;
  const rects = values.map((v, i) => {
    const val = Number(v) || 0;
    const h = val > 0 ? Math.max(2, Math.round((val / max) * (H - 4))) : 1;
    const x = i * (bw + gap);
    return `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h}" rx="1" fill="${color}" opacity="${val > 0 ? 1 : 0.18}"></rect>`;
  }).join("");
  return `<svg class="bars-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${rects}</svg>`;
}

function dayAxis(startIso, count) {
  const start = new Date(`${startIso}T00:00:00`);
  const first = `${start.getMonth() + 1}/${start.getDate()}`;
  const endD = new Date(start.getTime() + (count - 1) * 86400000);
  const last = `${endD.getMonth() + 1}/${endD.getDate()}`;
  return `<div class="chart-axis"><span>${first}</span><span>${last}</span></div>`;
}

function donutSvg(segments, centerLabel) {
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1;
  const R = 30;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = segments.map((s) => {
    const len = ((Number(s.value) || 0) / total) * C;
    const el = `<circle cx="40" cy="40" r="${R}" fill="none" stroke="${s.color}" stroke-width="11" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 40 40)"></circle>`;
    offset += len;
    return el;
  }).join("");
  return `<svg class="donut-svg" viewBox="0 0 80 80" role="img">
    <circle cx="40" cy="40" r="${R}" fill="none" stroke="var(--line)" stroke-width="11"></circle>
    ${arcs}
    <text x="40" y="42" text-anchor="middle" dominant-baseline="middle" class="donut-center">${escapeHtml(centerLabel)}</text>
  </svg>`;
}

async function onAccountBoardClick(event) {
  // Collapsing/expanding a group section.
  const groupHead = event.target.closest(".account-group-head");
  if (groupHead) {
    const section = groupHead.closest(".account-group");
    const collapsed = section.classList.toggle("collapsed");
    groupHead.setAttribute("aria-expanded", String(!collapsed));
    setAccountGroupCollapsed(section.dataset.group, collapsed);
    return;
  }

  // Let real links (Connect/Reconnect, AE/Tutorial) navigate without toggling.
  if (event.target.closest("a")) return;

  const row = event.target.closest(".account-row");
  if (!row) return;
  const id = Number(row.dataset.accountId);
  const account = accountsState.accounts.find((item) => item.id === id);
  if (event.target.closest("[data-action='edit-account']")) {
    openAccountDialog(account);
    return;
  }
  if (event.target.closest("[data-action='sync-account']")) {
    await syncAccount(id, event.target.closest("[data-action='sync-account']"));
    return;
  }
  if (event.target.closest("[data-action='disconnect-tiktok']")) {
    if (!window.confirm("Disconnect TikTok for this account? Engagement metrics will stop updating.")) return;
    await api(`/api/tiktok/disconnect/${id}`, { method: "POST" });
    await loadAccounts();
    showNotice("TikTok disconnected.");
    return;
  }
  // Otherwise, toggle the credentials panel for this account.
  if (accountsState.expanded.has(id)) {
    accountsState.expanded.delete(id);
  } else {
    accountsState.expanded.add(id);
    await ensureAccountVideos(id);
  }
  renderAccounts();
}

function openAccountDialog(account = null) {
  accountsState.editing = account;
  els.accountDialogTitle.textContent = account ? "Edit account" : "Add account";
  els.accountDialogMode.textContent = account ? `Account #${account.id}` : "New TikTok account";
  els.accountId.value = account?.id || "";
  els.accountName.value = account?.name || "";
  els.accountAeUrl.value = account?.ae_project_url || "";
  els.accountTutorialUrl.value = account?.tutorial_url || "";
  els.accountUploadUrl.value = account?.upload_url || "";
  els.accountUsername.value = account?.username || "";
  els.accountEmail.value = account?.email || "";
  els.accountPassword.value = account?.password || "";
  els.accountScheduledThrough.value = account?.scheduled_through || "";
  els.accountGroup.value = account?.group_name || "";
  populateGroupOptions();
  accountsState.avatar = account?.avatar || "";
  renderAvatarPreview();
  els.deleteAccount.hidden = !account;
  els.accountDialog.showModal();
}

// Offer existing group names as autocomplete in the dialog's Group field.
function populateGroupOptions() {
  const names = [...new Set(
    accountsState.accounts.map((account) => account.group_name).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
  els.accountGroupList.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}


async function saveAccount(event) {
  event.preventDefault();
  const id = els.accountId.value;

  const name = els.accountName.value.trim();

  const payload = {
    name,
    ae_project_url: els.accountAeUrl.value.trim(),
    tutorial_url: els.accountTutorialUrl.value.trim(),
    upload_url: els.accountUploadUrl.value.trim(),
    username: els.accountUsername.value.trim(),
    email: els.accountEmail.value.trim(),
    password: els.accountPassword.value,
    scheduled_through: els.accountScheduledThrough.value || "",
    group_name: els.accountGroup.value.trim(),
    avatar: accountsState.avatar || ""
  };
  if (!payload.name) {
    showNotice("Enter an account name.", "bad");
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

async function syncAccount(id, button = null) {
  try {
    button?.classList.add("syncing");
    if (button) button.disabled = true;
    await api(`/api/tiktok-accounts/${id}/sync`, { method: "POST" });
    accountsState.flash.add(id);
    await loadAccounts();
    showNotice("Sync complete.", "good");
  } catch (error) {
    showNotice(error.message, "bad");
    button?.classList.remove("syncing");
    if (button) button.disabled = false;
  }
}

const RATE_LIMIT_RE = /rate_limit_exceeded|rate limit/i;

// Sync All runs client-side, one account at a time with a short gap, so the
// progress panel shows exactly where the run is and TikTok's API isn't hit
// with bursts. Rows light up as their fresh numbers land. The run stops at
// the first rate-limit error — continuing would only burn more quota.
async function syncAllAccountsAction() {
  if (accountsState.syncing) return;
  const targets = accountsState.accounts.filter((account) => account.tiktok_connected);
  const skipped = accountsState.accounts.length - targets.length;
  if (!targets.length) {
    showNotice("No TikTok-connected accounts to sync — connect an account first.", "bad");
    return;
  }

  accountsState.syncing = true;
  els.syncAllAccounts.disabled = true;
  els.syncAllAccounts.classList.add("syncing");
  const progress = { done: 0, ok: 0, failed: 0, failures: [], active: new Set() };
  renderSyncProgress(progress, targets.length);
  let rateLimited = false;

  try {
    for (const account of targets) {
      progress.active.add(account.name);
      renderSyncProgress(progress, targets.length);
      try {
        const data = await api(`/api/tiktok-accounts/${account.id}/sync`, { method: "POST" });
        const index = accountsState.accounts.findIndex((a) => a.id === account.id);
        if (index >= 0 && data.account) accountsState.accounts[index] = data.account;
        progress.ok++;
        accountsState.flash.add(account.id);
      } catch (error) {
        progress.failed++;
        progress.failures.push(`${account.name}: ${error.message}`);
        if (RATE_LIMIT_RE.test(error.message)) rateLimited = true;
      }
      progress.done++;
      progress.active.delete(account.name);
      renderSyncProgress(progress, targets.length);
      renderAccounts(); // fresh numbers appear row by row as each sync lands
      if (rateLimited) break;
      await sleep(500); // breathing room between accounts for TikTok's limits
    }
  } finally {
    accountsState.syncing = false;
    els.syncAllAccounts.disabled = false;
    els.syncAllAccounts.classList.remove("syncing");
    els.syncProgress.hidden = true;
  }

  await loadAccounts(); // refresh the overall chart + leaderboards once at the end
  const skippedNote = skipped ? ` (${skipped} not connected, skipped)` : "";
  if (rateLimited) {
    showNotice(`TikTok's rate limit was hit — synced ${progress.ok} of ${targets.length} before stopping${skippedNote}. Everything synced so far is saved. Wait a while and run Sync All again; if it fails immediately, the app's daily TikTok quota is used up until it resets (midnight UTC).`, "bad");
  } else if (progress.failed) {
    const detail = progress.failures.slice(0, 3).join(" · ") + (progress.failures.length > 3 ? " · …" : "");
    showNotice(`Synced ${progress.ok} of ${targets.length}${skippedNote} — ${progress.failed} failed: ${detail}`, "bad");
  } else {
    showNotice(`All ${progress.ok} account${progress.ok === 1 ? "" : "s"} synced${skippedNote}.`, "good");
  }
}

function renderSyncProgress(progress, total) {
  if (!els.syncProgress) return;
  const pct = total ? Math.round((progress.done / total) * 100) : 0;
  const active = [...progress.active];
  const current = active.length
    ? `Syncing ${active.slice(0, 3).map(escapeHtml).join(", ")}${active.length > 3 ? "…" : ""}`
    : "Finishing up…";
  els.syncProgress.hidden = false;
  els.syncProgress.innerHTML = `
    <div class="sync-progress-head">
      <span class="sync-progress-label"><span class="sync-progress-spinner"></span> ${current}</span>
      <span class="sync-progress-tally">${progress.done}/${total}${progress.failed ? ` · ${progress.failed} failed` : ""}</span>
    </div>
    <div class="sync-progress-bar"><i style="width:${pct}%"></i></div>
  `;
}

// ===================================================================
// Sidebar Chat — left-side collapsible panel with channels + DMs.
// ===================================================================

let _audioCtx = null;
function playPing() {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const ctx = _audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

function dmChannel(user1, user2) {
  return `dm:${[user1, user2].sort().join(":")}`;
}

function renderChatChannels() {
  const user = state.currentUser;
  const allUsers = ["Tommy", "Brandon", "Mac"];
  const channels = [
    { id: "general", label: "General" }
  ];
  if (user) {
    for (const other of allUsers) {
      if (other !== user) channels.push({ id: dmChannel(user, other), label: other });
    }
  }
  els.chatChannels.innerHTML = channels.map((ch) => {
    const count = state.chatChannelCounts[ch.id] || 0;
    const seen = state.chatSeenCounts[ch.id] ?? 0;
    const unread = count > seen;
    return `<button type="button" class="chat-channel-btn${ch.id === state.chatChannel ? " active" : ""}" data-channel="${escapeHtml(ch.id)}">${escapeHtml(ch.label)}${unread ? '<span class="chat-channel-unread"></span>' : ""}</button>`;
  }).join("");
}

async function loadChatMessages() {
  if (els.chatSidebar.classList.contains("collapsed")) return;
  const data = await api(`/api/chat/${encodeURIComponent(state.chatChannel)}/messages`);
  state.chatMessages = data.messages || [];
  state.chatLastSeenCount = state.chatMessages.length;
  state.chatKnownCount = state.chatMessages.length;
  state.chatSeenCounts[state.chatChannel] = state.chatMessages.length;
  state.chatChannelCounts[state.chatChannel] = state.chatMessages.length;
  els.chatBadge.classList.remove("visible");
  renderChatMessages();
  renderChatChannels();
}

function renderChatMessages() {
  const msgs = state.chatMessages;
  if (!msgs.length) {
    els.chatSidebarMessages.innerHTML = `<p class="chat-sidebar-empty">No messages yet.</p>`;
    return;
  }
  let html = "";
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    const time = msg.created_at ? new Date(msg.created_at + "Z").toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const sameAsPrev = prev && prev.author === msg.author;
    const sameAsNext = next && next.author === msg.author;
    if (!sameAsPrev) {
      html += `<div class="chat-msg-group">
        <div class="chat-sidebar-msg-head">
          <strong class="author-name author-${authorSlug(msg.author)}">${escapeHtml(msg.author || "")}</strong>
          <span><time>${time}</time></span>
        </div>`;
    }
    html += `<div class="chat-sidebar-msg-line" data-msg-id="${msg.id}">
      <p>${escapeHtml(msg.body)}</p>
      <span class="chat-sidebar-msg-actions">${sameAsPrev ? `<time>${time}</time>` : ""}<button type="button" class="chat-sidebar-msg-delete" title="Delete">&times;</button></span>
    </div>`;
    if (!sameAsNext) html += `</div>`;
  }
  els.chatSidebarMessages.innerHTML = html;
  els.chatSidebarMessages.scrollTop = els.chatSidebarMessages.scrollHeight;
}

async function postChatMessage(e) {
  e.preventDefault();
  const body = els.chatSidebarInput.value.trim();
  if (!body) return;
  els.chatSidebarInput.value = "";
  await api(`/api/chat/${encodeURIComponent(state.chatChannel)}/messages`, {
    method: "POST",
    body: { body }
  });
  await loadChatMessages();
}

