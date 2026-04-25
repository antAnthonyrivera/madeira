const STORAGE_KEY = "trip-planner-local-v3";
const DEFAULT_MEMBERS = ["Anthony", "Vivian", "Jason", "Darrell"];
const DEFAULT_TRIP = { id: "madeira-default", name: "Madeira" };

let map = null;
let mapPickMode = false;
let tempPickMarker = null;
let selectedDay = "";
let wmsDiscoveredLayers = [];
const wmsLayerMap = new Map();
const markerByActivityId = new Map();

let state = loadState();

const currentUserSelect = document.querySelector("#current-user");
const memberList = document.querySelector("#member-list");
const tripSelector = document.querySelector("#trip-selector");
const addTripButton = document.querySelector("#add-trip-btn");
const notificationList = document.querySelector("#notification-list");
const selectedDayInput = document.querySelector("#selected-day");
const dailyActivityList = document.querySelector("#daily-activity-list");
const activityForm = document.querySelector("#activity-form");
const clearDataButton = document.querySelector("#clear-data");
const pickOnMapButton = document.querySelector("#place-on-map");
const activityTagsHost = document.querySelector("#activity-tags");
const openWmsModalButton = document.querySelector("#open-wms-modal");
const wmsModal = document.querySelector("#wms-modal");
const closeWmsModalButton = document.querySelector("#close-wms-modal");
const closeWmsModalTopButton = document.querySelector("#close-wms-modal-top");
const loadWmsLayersButton = document.querySelector("#load-wms-layers");
const addSelectedLayersButton = document.querySelector("#add-selected-layers");
const wmsUrlInput = document.querySelector("#wms-url-input");
const wmsError = document.querySelector("#wms-error");
const wmsLayerSelector = document.querySelector("#wms-layer-selector");
const wmsLayerOptions = document.querySelector("#wms-layer-options");
const activeLayerList = document.querySelector("#active-layer-list");

const fields = {
  title: document.querySelector("#activity-title"),
  day: document.querySelector("#activity-day"),
  time: document.querySelector("#activity-time"),
  category: document.querySelector("#activity-category"),
  notes: document.querySelector("#activity-notes"),
  location: document.querySelector("#activity-location"),
  lat: document.querySelector("#activity-lat"),
  lng: document.querySelector("#activity-lng"),
};

init();

function init() {
  setupMap();
  setupHandlers();
  selectedDayInput.value = todayIso();
  selectedDay = selectedDayInput.value;
  renderAll();
}

function setupMap() {
  map = L.map("map").setView([32.7607, -16.9595], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  map.on("click", (event) => {
    if (!mapPickMode) return;
    const { lat, lng } = event.latlng;
    fields.lat.value = lat.toFixed(5);
    fields.lng.value = lng.toFixed(5);
    if (tempPickMarker) tempPickMarker.remove();
    tempPickMarker = L.marker([lat, lng]).addTo(map).bindPopup("Selected point").openPopup();
    mapPickMode = false;
    pickOnMapButton.textContent = "Pick on Map";
  });
}

function setupHandlers() {
  fields.day.addEventListener("click", openDayPicker);
  fields.day.addEventListener("focus", openDayPicker);
  selectedDayInput.addEventListener("click", openSelectedDayPicker);
  selectedDayInput.addEventListener("focus", openSelectedDayPicker);
  selectedDayInput.addEventListener("change", () => {
    selectedDay = selectedDayInput.value;
    renderDailyActivities();
  });

  currentUserSelect.addEventListener("change", () => {
    state.activeUser = currentUserSelect.value;
    saveState();
    renderNotifications();
  });

  tripSelector.addEventListener("change", () => {
    state.currentTripId = tripSelector.value;
    saveState();
    renderAll();
  });

  addTripButton.addEventListener("click", () => {
    const name = window.prompt("Trip name");
    if (!name || !name.trim()) return;
    const trip = { id: crypto.randomUUID(), name: name.trim() };
    state.trips.push(trip);
    state.currentTripId = trip.id;
    saveState();
    renderAll();
  });

  openWmsModalButton.addEventListener("click", () => {
    resetWmsModalState();
    wmsModal.classList.remove("hidden");
  });
  wmsModal.addEventListener("click", (event) => {
    if (event.target === wmsModal) {
      wmsModal.classList.add("hidden");
    }
  });
  closeWmsModalButton.addEventListener("click", () => wmsModal.classList.add("hidden"));
  closeWmsModalTopButton.addEventListener("click", () => wmsModal.classList.add("hidden"));
  loadWmsLayersButton.addEventListener("click", loadWmsLayersFromUrl);
  addSelectedLayersButton.addEventListener("click", addSelectedWmsLayers);

  pickOnMapButton.addEventListener("click", () => {
    mapPickMode = !mapPickMode;
    pickOnMapButton.textContent = mapPickMode ? "Click map to set point" : "Pick on Map";
  });

  activityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const activity = {
      id: crypto.randomUUID(),
      tripId: state.currentTripId,
      title: fields.title.value.trim(),
      day: fields.day.value.trim(),
      time: fields.time.value.trim(),
      category: fields.category.value,
      notes: fields.notes.value.trim(),
      location: fields.location.value.trim(),
      lat: Number.isFinite(Number(fields.lat.value)) ? Number(fields.lat.value) : null,
      lng: Number.isFinite(Number(fields.lng.value)) ? Number(fields.lng.value) : null,
      taggedMembers: selectedTaggedMembers(),
      createdAt: new Date().toISOString(),
    };
    if (!activity.title || !activity.day || !activity.time) return;
    state.activities.push(activity);
    createTagNotifications(activity);
    activityForm.reset();
    if (tempPickMarker) {
      tempPickMarker.remove();
      tempPickMarker = null;
    }
    selectedDayInput.value = activity.day;
    selectedDay = activity.day;
    saveState();
    renderAll();
  });

  clearDataButton.addEventListener("click", () => {
    if (!window.confirm("Reset all activities, layers, and notifications?")) return;
    state = defaultState();
    selectedDayInput.value = todayIso();
    selectedDay = selectedDayInput.value;
    wmsLayerMap.forEach((entry) => map.removeLayer(entry.layer));
    wmsLayerMap.clear();
    saveState();
    renderAll();
  });
}

function renderAll() {
  renderTripSelector();
  renderCurrentUserOptions();
  renderMembers();
  renderTagMemberCheckboxes();
  renderDailyActivities();
  renderNotifications();
  renderMapPins();
  renderActiveLayersPanel();
}

function renderTripSelector() {
  tripSelector.innerHTML = "";
  state.trips.forEach((trip) => {
    const option = document.createElement("option");
    option.value = trip.id;
    option.textContent = trip.name;
    if (trip.id === state.currentTripId) option.selected = true;
    tripSelector.appendChild(option);
  });
}

function renderCurrentUserOptions() {
  currentUserSelect.innerHTML = "";
  state.members.forEach((member) => {
    const option = document.createElement("option");
    option.value = member;
    option.textContent = member;
    if (member === state.activeUser) option.selected = true;
    currentUserSelect.appendChild(option);
  });
}

function renderMembers() {
  memberList.innerHTML = "";
  state.members.forEach((member) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = member;
    memberList.appendChild(chip);
  });
}

function renderTagMemberCheckboxes() {
  activityTagsHost.innerHTML = "";
  state.members.forEach((member) => {
    const label = document.createElement("label");
    label.className = "chip";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = member;
    checkbox.name = "tag-member";
    label.appendChild(checkbox);
    label.append(member);
    activityTagsHost.appendChild(label);
  });
}

function renderDailyActivities() {
  dailyActivityList.innerHTML = "";
  const filtered = state.activities
    .filter((activity) => activity.tripId === state.currentTripId)
    .filter((activity) => !selectedDay || activity.day === selectedDay)
    .sort(compareActivitiesByDayThenTime);
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No activities for selected day.";
    dailyActivityList.appendChild(empty);
    return;
  }
  filtered.forEach((activity) => {
    const card = document.createElement("article");
    card.className = "layer-item";
    const heading = document.createElement("p");
    heading.innerHTML = `<strong>${activity.category} ${escapeHtml(activity.title)}</strong>`;
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${formatDayDisplay(activity.day)} at ${activity.time}${
      activity.location ? ` • ${activity.location}` : ""
    }`;
    const notes = document.createElement("p");
    notes.textContent = activity.notes || "No details";
    const tags = document.createElement("p");
    tags.className = "meta";
    tags.textContent = activity.taggedMembers.length
      ? `Tagged: ${activity.taggedMembers.join(", ")}`
      : "Tagged: none";
    card.append(heading, meta, notes, tags);
    dailyActivityList.appendChild(card);
  });
}

function renderNotifications() {
  notificationList.innerHTML = "";
  const unhandled = state.notifications.filter(
    (notification) =>
      notification.userName === state.activeUser &&
      !notification.handled &&
      notification.tripId === state.currentTripId
  );
  if (!unhandled.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No notifications.";
    notificationList.appendChild(empty);
    return;
  }
  unhandled
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach((notification) => {
      const activity = state.activities.find((item) => item.id === notification.activityId);
      const card = document.createElement("div");
      card.className = "notification-card";
      const message = document.createElement("p");
      message.textContent = `${notification.fromUser} tagged you on ${
        activity ? activity.title : "an activity"
      }.`;
      const button = document.createElement("button");
      button.className = "small";
      button.textContent = "Mark addressed";
      button.addEventListener("click", () => {
        notification.handled = true;
        saveState();
        renderNotifications();
      });
      card.append(message, button);
      notificationList.appendChild(card);
    });
}

function renderMapPins() {
  markerByActivityId.forEach((marker) => marker.remove());
  markerByActivityId.clear();
  state.activities.forEach((activity) => {
    if (activity.tripId !== state.currentTripId) return;
    if (!Number.isFinite(activity.lat) || !Number.isFinite(activity.lng)) return;
    const marker = L.marker([activity.lat, activity.lng]).addTo(map);
    marker.bindPopup(
      `<strong>${escapeHtml(activity.title)}</strong><br>${escapeHtml(formatDayDisplay(activity.day))} ${escapeHtml(
        activity.time
      )}<br>${escapeHtml(activity.location || "No place name")}`
    );
    markerByActivityId.set(activity.id, marker);
  });
}

async function loadWmsLayersFromUrl() {
  const baseUrl = wmsUrlInput.value.trim();
  if (!baseUrl) {
    showWmsError("Enter a WMS URL.");
    return;
  }
  clearWmsError();
  wmsLayerSelector.classList.add("hidden");
  wmsLayerOptions.innerHTML = "";
  try {
    const response = await fetch(buildGetCapabilitiesUrl(baseUrl));
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const xmlText = await response.text();
    const xml = new DOMParser().parseFromString(xmlText, "text/xml");
    if (xml.querySelector("parsererror")) throw new Error("Could not parse WMS capabilities.");
    wmsDiscoveredLayers = extractNamedLayers(xml);
    if (!wmsDiscoveredLayers.length) throw new Error("No selectable layers found at that URL.");
    renderWmsLayerOptions();
    wmsLayerSelector.classList.remove("hidden");
  } catch (error) {
    showWmsError(error.message || "Unable to load WMS layers.");
  }
}

function renderWmsLayerOptions() {
  wmsLayerOptions.innerHTML = "";
  wmsDiscoveredLayers.forEach((layer) => {
    const label = document.createElement("label");
    label.className = "layer-item wms-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = layer.name;
    checkbox.dataset.title = layer.title || layer.name;
    label.appendChild(checkbox);
    label.append(` ${layer.title || layer.name}`);
    wmsLayerOptions.appendChild(label);
  });
}

function addSelectedWmsLayers() {
  const selected = [...wmsLayerOptions.querySelectorAll("input[type='checkbox']:checked")];
  if (!selected.length) {
    showWmsError("Select at least one layer.");
    return;
  }
  const url = wmsUrlInput.value.trim();
  selected.forEach((input) => {
    if (wmsLayerMap.has(input.value)) return;
    const layer = L.tileLayer.wms(url, { layers: input.value, format: "image/png", transparent: true }).addTo(map);
    wmsLayerMap.set(input.value, {
      name: input.value,
      title: input.dataset.title || input.value,
      layer,
      visible: true,
    });
  });
  renderActiveLayersPanel();
  wmsModal.classList.add("hidden");
}

function renderActiveLayersPanel() {
  activeLayerList.innerHTML = "";
  if (!wmsLayerMap.size) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No WMS layers active.";
    activeLayerList.appendChild(empty);
    return;
  }
  wmsLayerMap.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "layer-item";
    const top = document.createElement("p");
    top.innerHTML = `<strong>${escapeHtml(entry.title)}</strong>`;
    const row = document.createElement("div");
    row.className = "row";
    const toggle = document.createElement("button");
    toggle.className = "small";
    toggle.textContent = entry.visible ? "Hide" : "Show";
    toggle.addEventListener("click", () => {
      entry.visible = !entry.visible;
      if (entry.visible) entry.layer.addTo(map);
      else map.removeLayer(entry.layer);
      renderActiveLayersPanel();
    });
    const remove = document.createElement("button");
    remove.className = "small danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      map.removeLayer(entry.layer);
      wmsLayerMap.delete(entry.name);
      renderActiveLayersPanel();
    });
    row.append(toggle, remove);
    item.append(top, row);
    activeLayerList.appendChild(item);
  });
}

function buildGetCapabilitiesUrl(url) {
  return `${url}${url.includes("?") ? "&" : "?"}service=WMS&request=GetCapabilities`;
}

function extractNamedLayers(xmlDoc) {
  return [...xmlDoc.querySelectorAll("Layer")]
    .map((layerNode) => {
      const nameNode = layerNode.querySelector(":scope > Name");
      if (!nameNode?.textContent) return null;
      const titleNode = layerNode.querySelector(":scope > Title");
      return {
        name: nameNode.textContent.trim(),
        title: titleNode?.textContent?.trim() || nameNode.textContent.trim(),
      };
    })
    .filter(Boolean);
}

function showWmsError(message) {
  wmsError.textContent = message;
  wmsError.classList.remove("hidden");
}

function clearWmsError() {
  wmsError.textContent = "";
  wmsError.classList.add("hidden");
}

function resetWmsModalState() {
  clearWmsError();
  wmsLayerSelector.classList.add("hidden");
  wmsLayerOptions.innerHTML = "";
  wmsDiscoveredLayers = [];
}

function selectedTaggedMembers() {
  return [...activityTagsHost.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
}

function createTagNotifications(activity) {
  activity.taggedMembers
    .filter((name) => name !== state.activeUser)
    .forEach((userName) => {
      state.notifications.push({
        id: crypto.randomUUID(),
        userName,
        fromUser: state.activeUser,
        activityId: activity.id,
        tripId: activity.tripId,
        handled: false,
        createdAt: new Date().toISOString(),
      });
    });
}

function defaultState() {
  return {
    trips: [DEFAULT_TRIP],
    currentTripId: DEFAULT_TRIP.id,
    members: [...DEFAULT_MEMBERS],
    activeUser: DEFAULT_MEMBERS[0],
    activities: [],
    notifications: [],
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.activities) || !Array.isArray(parsed.members)) return defaultState();
    const trips = Array.isArray(parsed.trips) && parsed.trips.length ? parsed.trips : [DEFAULT_TRIP];
    const currentTripId = trips.some((trip) => trip.id === parsed.currentTripId)
      ? parsed.currentTripId
      : trips[0].id;
    return {
      trips,
      currentTripId,
      members: parsed.members.length ? parsed.members : [...DEFAULT_MEMBERS],
      activeUser: parsed.activeUser || DEFAULT_MEMBERS[0],
      activities: parsed.activities.map((activity) => ({
        ...activity,
        tripId: activity.tripId || currentTripId,
      })),
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications.map((notification) => ({
            ...notification,
            tripId: notification.tripId || currentTripId,
          }))
        : [],
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function openDayPicker() {
  if (typeof fields.day.showPicker === "function") fields.day.showPicker();
}

function openSelectedDayPicker() {
  if (typeof selectedDayInput.showPicker === "function") selectedDayInput.showPicker();
}

function compareActivitiesByDayThenTime(a, b) {
  const dayCompare = normalizeDayForSort(a.day).localeCompare(normalizeDayForSort(b.day));
  if (dayCompare !== 0) return dayCompare;
  return String(a.time || "").localeCompare(String(b.time || ""));
}

function normalizeDayForSort(dayText) {
  const raw = String(dayText || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
}

function formatDayDisplay(dayText) {
  const normalized = normalizeDayForSort(dayText);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return String(dayText || "");
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
