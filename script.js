const STORAGE_KEY = "trip-planner-local-v4";
const DEFAULT_MEMBERS = ["Anthony", "Vivian", "Jason", "Darrell"];
const DEFAULT_TRIP = { id: "madeira-default", name: "Madeira" };
const DEFAULT_WMS_URL = "https://view.eumetsat.int/geoserver/wms";

let map = null;
let mapPickMode = false;
let tempPickMarker = null;
let selectedDay = "";
let wmsDiscoveredLayers = [];
const wmsLayerMap = new Map();
const markerByActivityId = new Map();

let state = loadState();

const tripSelector = document.querySelector("#trip-selector");
const addTripButton = document.querySelector("#add-trip-btn");
const memberList = document.querySelector("#member-list");
const notificationList = document.querySelector("#notification-list");
const selectedDayInput = document.querySelector("#selected-day");
const dailyActivityList = document.querySelector("#daily-activity-list");
const clearDataButton = document.querySelector("#clear-data");
const activeLayerList = document.querySelector("#active-layer-list");

const mapAddMenuToggle = document.querySelector("#map-add-menu-toggle");
const mapAddMenu = document.querySelector("#map-add-menu");

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

const openActivityModalButton = document.querySelector("#open-activity-modal");
const activityModal = document.querySelector("#activity-modal");
const closeActivityModalButton = document.querySelector("#close-activity-modal");
const activityForm = document.querySelector("#activity-form");
const activityTagsHost = document.querySelector("#activity-tags");
const geocodeAddressButton = document.querySelector("#geocode-address");
const placeOnMapButton = document.querySelector("#place-on-map");
const activityLocStatus = document.querySelector("#activity-loc-status");

const fields = {
  title: document.querySelector("#activity-title"),
  day: document.querySelector("#activity-day"),
  time: document.querySelector("#activity-time"),
  category: document.querySelector("#activity-category"),
  notes: document.querySelector("#activity-notes"),
  location: document.querySelector("#activity-location"),
  address: document.querySelector("#activity-address"),
  lat: document.querySelector("#activity-lat"),
  lng: document.querySelector("#activity-lng"),
};

init();

function init() {
  setupMap();
  setupHandlers();
  wmsUrlInput.value = DEFAULT_WMS_URL;
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
    setActivityLocStatus(`Pinned ${lat.toFixed(5)}, ${lng.toFixed(5)}`, "ok");
    if (tempPickMarker) tempPickMarker.remove();
    tempPickMarker = L.marker([lat, lng]).addTo(map).bindPopup("Selected point").openPopup();
    mapPickMode = false;
    placeOnMapButton.textContent = "Pick on Map";
  });
}

function setupHandlers() {
  selectedDayInput.addEventListener("click", openSelectedDayPicker);
  selectedDayInput.addEventListener("focus", openSelectedDayPicker);
  selectedDayInput.addEventListener("change", () => {
    selectedDay = selectedDayInput.value;
    renderDailyActivities();
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

  mapAddMenuToggle.addEventListener("click", () => {
    mapAddMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", (event) => {
    if (!mapAddMenu.contains(event.target) && event.target !== mapAddMenuToggle) {
      mapAddMenu.classList.add("hidden");
    }
  });

  openWmsModalButton.addEventListener("click", () => {
    mapAddMenu.classList.add("hidden");
    resetWmsModalState();
    wmsModal.classList.remove("hidden");
  });
  closeWmsModalButton.addEventListener("click", () => wmsModal.classList.add("hidden"));
  closeWmsModalTopButton.addEventListener("click", () => wmsModal.classList.add("hidden"));
  wmsModal.addEventListener("click", (event) => {
    if (event.target === wmsModal) wmsModal.classList.add("hidden");
  });
  loadWmsLayersButton.addEventListener("click", loadWmsLayersFromUrl);
  addSelectedLayersButton.addEventListener("click", addSelectedWmsLayers);

  openActivityModalButton.addEventListener("click", () => {
    mapAddMenu.classList.add("hidden");
    renderTagMemberCheckboxes();
    fields.day.value = selectedDay || todayIso();
    fields.time.value = "";
    setActivityLocStatus("", "");
    activityModal.classList.remove("hidden");
  });
  closeActivityModalButton.addEventListener("click", () => activityModal.classList.add("hidden"));
  activityModal.addEventListener("click", (event) => {
    if (event.target === activityModal) activityModal.classList.add("hidden");
  });

  fields.day.addEventListener("click", openDayPicker);
  fields.day.addEventListener("focus", openDayPicker);

  geocodeAddressButton.addEventListener("click", geocodeAddress);
  placeOnMapButton.addEventListener("click", () => {
    mapPickMode = !mapPickMode;
    placeOnMapButton.textContent = mapPickMode ? "Click map to set point" : "Pick on Map";
    if (mapPickMode) {
      setActivityLocStatus("Click on the map to set coordinates.", "");
    }
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
      address: fields.address.value.trim(),
      lat: Number.isFinite(Number(fields.lat.value)) ? Number(fields.lat.value) : null,
      lng: Number.isFinite(Number(fields.lng.value)) ? Number(fields.lng.value) : null,
      taggedMembers: selectedTaggedMembers(),
      createdAt: new Date().toISOString(),
    };
    if (!activity.title || !activity.day || !activity.time) return;
    state.activities.push(activity);
    createTagNotifications(activity);
    saveState();
    activityModal.classList.add("hidden");
    activityForm.reset();
    selectedDayInput.value = activity.day;
    selectedDay = activity.day;
    if (tempPickMarker) {
      tempPickMarker.remove();
      tempPickMarker = null;
    }
    setActivityLocStatus("", "");
    renderAll();
  });

  clearDataButton.addEventListener("click", () => {
    if (!window.confirm("Reset activities, notifications, and map layers for all trips?")) return;
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
  renderMembers();
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
      !notification.handled && notification.tripId === state.currentTripId
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
      )}<br>${escapeHtml(activity.location || activity.address || "No place name")}`
    );
    markerByActivityId.set(activity.id, marker);
  });
}

async function geocodeAddress() {
  const query = fields.address.value.trim();
  if (!query) {
    setActivityLocStatus("Enter an address to geocode.", "warn");
    return;
  }
  setActivityLocStatus("Geocoding...", "");
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Geocode failed (${response.status})`);
    const data = await response.json();
    if (!data.length) throw new Error("No result found for that address.");
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    fields.lat.value = lat.toFixed(5);
    fields.lng.value = lng.toFixed(5);
    fields.location.value = fields.location.value || data[0].display_name.split(",")[0];
    map.setView([lat, lng], 12);
    if (tempPickMarker) tempPickMarker.remove();
    tempPickMarker = L.marker([lat, lng]).addTo(map).bindPopup("Geocoded location").openPopup();
    setActivityLocStatus(`Address resolved: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, "ok");
  } catch (error) {
    setActivityLocStatus(error.message || "Unable to geocode address.", "warn");
  }
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
  const sorted = [...wmsDiscoveredLayers].sort((a, b) => scoreLayer(b) - scoreLayer(a));
  sorted.forEach((layer) => {
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
    const layer = L.tileLayer.wms(url, {
      layers: input.value,
      format: "image/png",
      transparent: true,
      opacity: 0.55,
    }).addTo(map);
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

function setActivityLocStatus(message, stateClass) {
  activityLocStatus.textContent = message;
  activityLocStatus.className = "status-text";
  if (stateClass) activityLocStatus.classList.add(stateClass);
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
    .forEach((userName) => {
      state.notifications.push({
        id: crypto.randomUUID(),
        userName,
        fromUser: "Activity tagged",
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
      activities: parsed.activities.map((activity) => ({ ...activity, tripId: activity.tripId || currentTripId })),
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications.map((item) => ({ ...item, tripId: item.tripId || currentTripId }))
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

function scoreLayer(layer) {
  const text = `${layer.title} ${layer.name}`.toLowerCase();
  let score = 0;
  if (text.includes("cloud")) score += 5;
  if (text.includes("precip")) score += 5;
  if (text.includes("rain")) score += 5;
  if (text.includes("weather")) score += 3;
  if (text.includes("mask")) score += 2;
  if (text.includes("top")) score += 1;
  return score;
}
