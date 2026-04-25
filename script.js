const STORAGE_KEY = "madeira-crew-planner-v1";

const defaultData = {
  members: ["You", "Friend 1", "Friend 2", "Friend 3"],
  activities: [],
};

let appData = loadData();
let map = null;
let mapPickMode = false;
let tempPickMarker = null;
const markerByActivityId = new Map();

const memberForm = document.querySelector("#member-form");
const memberNameInput = document.querySelector("#member-name");
const memberList = document.querySelector("#member-list");
const activityForm = document.querySelector("#activity-form");
const activityList = document.querySelector("#activity-list");
const clearDataButton = document.querySelector("#clear-data");
const pickOnMapButton = document.querySelector("#place-on-map");
const activityTemplate = document.querySelector("#activity-template");

const fields = {
  title: document.querySelector("#activity-title"),
  day: document.querySelector("#activity-day"),
  time: document.querySelector("#activity-time"),
  notes: document.querySelector("#activity-notes"),
  location: document.querySelector("#activity-location"),
  lat: document.querySelector("#activity-lat"),
  lng: document.querySelector("#activity-lng"),
};

init();

function init() {
  setupMap();
  setupHandlers();
  renderAll();
}

function setupMap() {
  map = L.map("map").setView([32.7607, -16.9595], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  map.on("click", (event) => {
    if (!mapPickMode) {
      return;
    }
    const { lat, lng } = event.latlng;
    fields.lat.value = lat.toFixed(5);
    fields.lng.value = lng.toFixed(5);
    if (tempPickMarker) {
      tempPickMarker.remove();
    }
    tempPickMarker = L.marker([lat, lng]).addTo(map).bindPopup("Selected point").openPopup();
    mapPickMode = false;
    pickOnMapButton.textContent = "Pick on Map";
  });
}

function setupHandlers() {
  fields.day.addEventListener("click", openDayPicker);
  fields.day.addEventListener("focus", openDayPicker);

  memberForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = memberNameInput.value.trim();
    if (!name) {
      return;
    }
    if (appData.members.includes(name)) {
      memberNameInput.value = "";
      return;
    }
    appData.members.push(name);
    memberNameInput.value = "";
    saveAndRender();
  });

  pickOnMapButton.addEventListener("click", () => {
    mapPickMode = !mapPickMode;
    pickOnMapButton.textContent = mapPickMode ? "Click map to set point" : "Pick on Map";
  });

  activityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = fields.title.value.trim();
    const day = fields.day.value.trim();
    const time = fields.time.value.trim();
    const notes = fields.notes.value.trim();
    const location = fields.location.value.trim();
    const lat = Number(fields.lat.value.trim());
    const lng = Number(fields.lng.value.trim());

    if (!title || !day || !time) {
      return;
    }

    const newActivity = {
      id: crypto.randomUUID(),
      title,
      day,
      time,
      notes,
      location,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      comments: [],
      createdAt: new Date().toISOString(),
    };

    appData.activities.push(newActivity);
    activityForm.reset();
    if (tempPickMarker) {
      tempPickMarker.remove();
      tempPickMarker = null;
    }
    saveAndRender();
  });

  clearDataButton.addEventListener("click", () => {
    const accepted = window.confirm("Reset all members, activities, comments, and map pins?");
    if (!accepted) {
      return;
    }
    appData = structuredClone(defaultData);
    saveAndRender();
  });
}

function saveAndRender() {
  saveData(appData);
  renderAll();
}

function renderAll() {
  renderMembers();
  renderActivities();
  renderMapPins();
}

function renderMembers() {
  memberList.innerHTML = "";
  appData.members.forEach((member) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = member;
    memberList.appendChild(chip);
  });
}

function renderActivities() {
  activityList.innerHTML = "";
  if (!appData.activities.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No activities yet. Add your first stop and attach a location pin.";
    activityList.appendChild(empty);
    return;
  }

  const activities = [...appData.activities].sort(compareActivitiesByDayThenTime);
  activities.forEach((activity) => {
    const node = activityTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.activityId = activity.id;

    node.querySelector(".activity-title").textContent = activity.title;
    node.querySelector(".meta").textContent = `${formatDayDisplay(activity.day)} at ${activity.time}${
      activity.location ? ` • ${activity.location}` : ""
    }`;
    node.querySelector(".notes").textContent = activity.notes || "No notes yet.";

    node.querySelector(".delete-activity").addEventListener("click", () => {
      appData.activities = appData.activities.filter((item) => item.id !== activity.id);
      saveAndRender();
    });

    renderCommentBlock(node, activity);
    activityList.appendChild(node);
  });
}

function renderCommentBlock(cardNode, activity) {
  const mentionsHost = cardNode.querySelector(".mentions");
  const commentList = cardNode.querySelector(".comment-list");
  const commentForm = cardNode.querySelector(".comment-form");
  const commentInput = commentForm.querySelector("textarea");

  const mentionSet = new Set();
  activity.comments.forEach((comment) => extractMentions(comment.text).forEach((name) => mentionSet.add(name)));
  mentionsHost.innerHTML = "";

  if (mentionSet.size) {
    [...mentionSet].forEach((name) => {
      const mention = document.createElement("span");
      mention.className = "mention";
      mention.textContent = `@${name}`;
      mentionsHost.appendChild(mention);
    });
  }

  commentList.innerHTML = "";
  activity.comments.forEach((comment) => {
    const line = document.createElement("div");
    line.className = "comment";
    line.textContent = `${comment.author}: ${comment.text}`;
    commentList.appendChild(line);
  });

  commentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = commentInput.value.trim();
    if (!text) {
      return;
    }
    const author = appData.members[0] || "You";
    activity.comments.push({
      id: crypto.randomUUID(),
      author,
      text,
      createdAt: new Date().toISOString(),
    });
    saveAndRender();
  });
}

function renderMapPins() {
  markerByActivityId.forEach((marker) => marker.remove());
  markerByActivityId.clear();

  appData.activities.forEach((activity) => {
    if (!Number.isFinite(activity.lat) || !Number.isFinite(activity.lng)) {
      return;
    }
    const marker = L.marker([activity.lat, activity.lng]).addTo(map);
    marker.bindPopup(
      `<strong>${escapeHtml(activity.title)}</strong><br>${escapeHtml(formatDayDisplay(activity.day))} ${escapeHtml(
        activity.time
      )}<br>${escapeHtml(activity.location || "No place name")}`
    );
    markerByActivityId.set(activity.id, marker);
  });
}

function extractMentions(text) {
  const mentionMatches = text.match(/@([A-Za-z0-9 _.-]{1,24})/g) || [];
  return mentionMatches.map((tag) => tag.slice(1).trim());
}

function openDayPicker() {
  if (typeof fields.day.showPicker === "function") {
    fields.day.showPicker();
  }
}

function compareActivitiesByDayThenTime(a, b) {
  const dateA = normalizeDayForSort(a.day);
  const dateB = normalizeDayForSort(b.day);
  if (dateA !== dateB) {
    return dateA.localeCompare(dateB);
  }
  return String(a.time || "").localeCompare(String(b.time || ""));
}

function normalizeDayForSort(dayText) {
  const raw = String(dayText || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return raw;
}

function formatDayDisplay(dayText) {
  const normalized = normalizeDayForSort(dayText);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return String(dayText || "");
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return structuredClone(defaultData);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.members) || !Array.isArray(parsed.activities)) {
      return structuredClone(defaultData);
    }
    return parsed;
  } catch {
    return structuredClone(defaultData);
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
