const STORAGE_KEY = "uoft-roadmap-checklist-v1";

let roadmapData = null;
let checkedLeaves = loadCheckedLeaves();

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
    const response = await fetch("roadmap.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    roadmapData = await response.json();
    renderRoadmap();
    updatedElement.textContent = `Loaded ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    console.error(error);
    roadmapElement.innerHTML = "";
    errorElement.hidden = false;
    updatedElement.textContent = "Could not load roadmap.json";
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
  const status = hasChildren ? getGroupStatus(task.children) : { complete: isChecked(task.id) ? 1 : 0, total: 1, percent: isChecked(task.id) ? 100 : 0 };
  const complete = status.complete === status.total && status.total > 0;
  const partial = status.complete > 0 && !complete;
  const description = task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : "";
  const children = hasChildren ? `<div class="children">${task.children.map(renderTask).join("")}</div>` : "";

  return `<div class="task ${hasChildren ? "has-children" : ""} ${complete ? "is-complete" : ""}">
    <input class="task-control" type="checkbox" data-task-id="${escapeHtml(task.id)}" ${complete ? "checked" : ""} ${hasChildren ? "disabled" : ""} ${partial ? "data-partial=\"true\"" : ""} aria-label="${escapeHtml(task.id)} ${escapeHtml(task.title)}">
    <div class="task-main"><span class="task-id">${escapeHtml(task.id)}</span><span class="task-title">${escapeHtml(task.title || "Untitled task")}</span></div>
    ${description}${children}
  </div>`;
}

roadmapElement.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-task-id]");
  if (!checkbox || checkbox.disabled) return;
  if (checkbox.checked) checkedLeaves.add(checkbox.dataset.taskId);
  else checkedLeaves.delete(checkbox.dataset.taskId);
  saveCheckedLeaves();
  renderRoadmap();
});

function getGroupStatus(items) {
  const status = items.reduce((result, item) => {
    const itemStatus = item.children?.length ? getGroupStatus(item.children) : { complete: isChecked(item.id) ? 1 : 0, total: 1 };
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

function isChecked(id) { return checkedLeaves.has(id); }

function loadCheckedLeaves() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); }
  catch { return new Set(); }
}

function saveCheckedLeaves() { localStorage.setItem(STORAGE_KEY, JSON.stringify([...checkedLeaves])); }

function resetProgress() {
  if (!checkedLeaves.size || confirm("Reset all checklist progress?")) {
    checkedLeaves.clear();
    saveCheckedLeaves();
    if (roadmapData) renderRoadmap();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character]));
}
