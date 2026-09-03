const STORAGE_KEY = "checked_tasks";

let roadmapData = null;
let checkedTasks = loadCheckedTasks();

const roadmapElement = document.querySelector("#roadmap");
const errorElement = document.querySelector("#error-state");
const titleElement = document.querySelector("#roadmap-title");
const programElement = document.querySelector("#program-label");
const updatedElement = document.querySelector("#last-updated");

document.querySelector("#reload-button").addEventListener("click", loadRoadmap);
document.querySelector("#reset-button").addEventListener("click", resetProgress);

loadRoadmap();

async function loadRoadmap() {
  errorElement.hidden = true;
  updatedElement.textContent = "Loading roadmap.json...";

  try {
    const response = await fetch("/roadmap.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    roadmapData = await response.json();
    await addTaskHashes(roadmapData.stages.flatMap((stage) => stage.tasks || []));

    const currentHashes = new Set(getLeafTasks(roadmapData).map((task) => task.hash));
    checkedTasks = new Set([...checkedTasks].filter((hash) => currentHashes.has(hash)));
    const serverTasks = await loadServerTasks();
    checkedTasks = new Set([...checkedTasks, ...serverTasks].filter((hash) => currentHashes.has(hash)));
    saveCheckedTasks();
    await syncCheckedTasks();

    renderRoadmap();
    updatedElement.textContent = `Loaded and backed up at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    console.error(error);
    roadmapElement.innerHTML = "";
    errorElement.hidden = false;
    updatedElement.textContent = "Could not load roadmap.json";
  }
}

async function addTaskHashes(tasks) {
  for (const task of tasks) {
    task.hash = await hashTask(task);
    if (task.children?.length) await addTaskHashes(task.children);
  }
}

async function hashTask(task) {
  const fingerprint = JSON.stringify({
    title: task.title || "",
    description: task.description || "",
    resources: task.resources || []
  });
  const bytes = new TextEncoder().encode(fingerprint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadServerTasks() {
  try {
    const response = await fetch("/api/checked-tasks", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.checked_tasks) ? data.checked_tasks.filter(isSha256) : [];
  } catch (error) {
    console.warn("MySQL backup unavailable; continuing with localStorage.", error);
    return [];
  }
}

async function syncCheckedTasks() {
  try {
    await fetch("/api/checked-tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked_tasks: [...checkedTasks] })
    });
  } catch (error) {
    console.warn("Could not sync checked_tasks to MySQL.", error);
  }
}

function renderRoadmap() {
  titleElement.innerHTML = `${escapeHtml(roadmapData.title || "Roadmap checklist")}<span class="title-mark">.</span>`;
  programElement.textContent = [roadmapData.university, roadmapData.funding].filter(Boolean).join(" / ");
  roadmapElement.innerHTML = roadmapData.stages.map(renderStage).join("");
  roadmapElement.querySelectorAll("input[data-partial]").forEach((checkbox) => { checkbox.indeterminate = true; });
  updateOverallProgress();
}

function renderStage(stage) {
  const status = getGroupStatus(stage.tasks || []);
  const tasks = (stage.tasks || []).map(renderTask).join("");

  return `<article class="stage">
    <div class="stage-header">
      <div class="stage-heading">
        <span class="stage-number">${escapeHtml(stage.number ?? "")}</span>
        <div><h2>${escapeHtml(stage.title || "Untitled stage")}</h2><p class="target">Target: ${escapeHtml(stage.target || "No target set")}</p></div>
      </div>
      <div class="stage-progress">
        <span class="stage-progress-label">${status.complete} / ${status.total} tasks</span>
        <div class="progress-bar"><span style="width: ${status.percent}%"></span></div>
      </div>
    </div>
    <div class="tasks">
      <label class="task stage-task ${status.complete === status.total && status.total > 0 ? "is-complete" : ""}">
        <input class="task-control" type="checkbox" ${status.complete === status.total && status.total > 0 ? "checked" : ""} disabled aria-label="Stage ${escapeHtml(stage.number ?? "")} completion">
        <span class="task-main"><span class="task-id">S${escapeHtml(stage.number ?? "")}</span><span class="task-title">Complete all stage tasks</span></span>
      </label>
      ${tasks}
    </div>
  </article>`;
}

function renderTask(task) {
  const hasChildren = Array.isArray(task.children) && task.children.length > 0;
  const checked = isChecked(task.hash);
  const status = hasChildren ? getGroupStatus(task.children) : { complete: checked ? 1 : 0, total: 1, percent: checked ? 100 : 0 };
  const complete = status.complete === status.total && status.total > 0;
  const partial = status.complete > 0 && !complete;
  const description = task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : "";
  const resources = (task.resources || []).filter((resource) => /^https?:\/\//i.test(resource.url || ""));
  const resourceLinks = resources.length ? `<div class="task-resources">${resources.map((resource) => `<a href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">${escapeHtml(resource.label || "Open resource")} -&gt;</a>`).join("")}</div>` : "";
  const children = hasChildren ? `<div class="children">${task.children.map(renderTask).join("")}</div>` : "";

  return `<div class="task ${hasChildren ? "has-children" : ""} ${complete ? "is-complete" : ""}">
    <input class="task-control" type="checkbox" data-task-hash="${task.hash}" ${complete ? "checked" : ""} ${hasChildren ? "disabled" : ""} ${partial ? "data-partial=\"true\"" : ""} aria-label="${escapeHtml(task.id)} ${escapeHtml(task.title)}">
    <div class="task-main"><span class="task-id">${escapeHtml(task.id)}</span><span class="task-title">${escapeHtml(task.title || "Untitled task")}</span></div>
    ${description}${resourceLinks}${children}
  </div>`;
}

roadmapElement.addEventListener("change", async (event) => {
  const checkbox = event.target.closest("input[data-task-hash]");
  if (!checkbox || checkbox.disabled) return;
  if (checkbox.checked) checkedTasks.add(checkbox.dataset.taskHash);
  else checkedTasks.delete(checkbox.dataset.taskHash);
  saveCheckedTasks();
  renderRoadmap();
  await syncCheckedTasks();
});

function getGroupStatus(items) {
  const status = items.reduce((result, item) => {
    const itemStatus = item.children?.length ? getGroupStatus(item.children) : { complete: isChecked(item.hash) ? 1 : 0, total: 1 };
    result.complete += itemStatus.complete;
    result.total += itemStatus.total;
    return result;
  }, { complete: 0, total: 0 });
  status.percent = status.total ? Math.round((status.complete / status.total) * 100) : 0;
  return status;
}

function updateOverallProgress() {
  const status = getGroupStatus(roadmapData.stages.flatMap((stage) => stage.tasks || []));
  document.querySelector("#overall-percent").textContent = `${status.percent}%`;
  document.querySelector("#overall-count").textContent = `${status.complete} / ${status.total} tasks`;
  document.querySelector("#progress-ring").style.setProperty("--progress", `${status.percent}%`);
}

function getLeafTasks(data) {
  const leaves = [];
  const visit = (tasks) => tasks.forEach((task) => task.children?.length ? visit(task.children) : leaves.push(task));
  data.stages.forEach((stage) => visit(stage.tasks || []));
  return leaves;
}

function isChecked(hash) { return checkedTasks.has(hash); }

function loadCheckedTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored.filter(isSha256) : []);
  } catch { return new Set(); }
}

function saveCheckedTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify([...checkedTasks])); }

async function resetProgress() {
  if (checkedTasks.size && !confirm("Reset all checklist progress?")) return;
  checkedTasks.clear();
  saveCheckedTasks();
  if (roadmapData) renderRoadmap();
  await syncCheckedTasks();
}

function isSha256(value) { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value); }

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character]));
}
