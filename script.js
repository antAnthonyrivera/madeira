const SUPABASE_URL = "https://rwibuoccrcgrozysfwfw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_l5KJxT_og6A7VKKK2-5MOg_wtBEDb7F";
const GEMINI_EDGE_FUNCTION_URL = "https://rwibuoccrcgrozysfwfw.functions.supabase.co/gemini-proxy";
const GEMINI_API_KEY_CACHE_KEY = "trip-planner-gemini-key";
const DEFAULT_MEMBERS = ["Anthony", "Vivian", "Jason", "Darrell"];
const DEFAULT_TRIP = { id: "00000000-0000-4000-8000-000000000001", name: "Madeira" };
const DEFAULT_WMS_URL = "";

let map = null;
let selectedDay = "";
let selectedDayWeather = null;
let wmsDiscoveredLayers = [];
const wmsLayerMap = new Map();
const markerByActivityId = new Map();
let pendingPinActivityId = null;

const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let state = defaultState();
let realtimeChannel = null;
let syncInFlight = false;
let syncQueued = false;
let geminiApiKey = "";
let supportsLayersCollapsedColumn = true;

const selectedTripBrand = document.querySelector("#selected-trip-brand");
const appHeader = document.querySelector(".app-header");
const syncStatusPill = document.querySelector("#sync-status");
const tripList = document.querySelector("#trip-list");
const tripMemberList = document.querySelector("#trip-member-list");
const newMemberNameInput = document.querySelector("#new-member-name");
const addMemberButton = document.querySelector("#add-member-btn");
const addTripButton = document.querySelector("#add-trip-btn");
const notificationList = document.querySelector("#notification-list");
const rangeStartInput = document.querySelector("#range-start");
const rangeEndInput = document.querySelector("#range-end");
const weatherForecast = document.querySelector("#weather-forecast");
const mapWeatherBadge = document.querySelector("#map-weather-badge");
const dailyActivityList = document.querySelector("#daily-activity-list");
const activitiesTitle = document.querySelector("#activities-title");
const notificationFilter = document.querySelector("#notification-filter");
const currentUserSelect = document.querySelector("#current-user-select");
const notificationBell = document.querySelector("#notification-bell");
const notificationDot = document.querySelector("#notification-dot");
const notificationPanel = document.querySelector("#notification-panel");
const tripDropdownToggle = document.querySelector("#trip-dropdown-toggle");
const tripDropdown = document.querySelector("#trip-dropdown");
const weatherDropdownToggle = document.querySelector("#weather-dropdown-toggle");
const weatherDropdown = document.querySelector("#weather-dropdown");
const rangeDropdownToggle = document.querySelector("#range-dropdown-toggle");
const rangeDropdown = document.querySelector("#range-dropdown");
const activeLayerList = document.querySelector("#active-layer-list");
const layersSection = document.querySelector(".layers-section");
const toggleLayersCollapseButton = document.querySelector("#toggle-layers-collapse");
const presetTodayButton = document.querySelector("#preset-today");
const presetWeekendButton = document.querySelector("#preset-weekend");
const presetWholeTripButton = document.querySelector("#preset-whole-trip");
const applyRangeButton = document.querySelector("#apply-range-btn");

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
const activityModalTitle = document.querySelector("#activity-modal-title");
const closeActivityModalButton = document.querySelector("#close-activity-modal");
const activityForm = document.querySelector("#activity-form");
const saveActivityButton = document.querySelector("#save-activity-btn");
const activityTagsHost = document.querySelector("#activity-tags");
const geocodeAddressButton = document.querySelector("#geocode-address");
const activityLocStatus = document.querySelector("#activity-loc-status");
let editingActivityId = null;
const magicAiImportButton = document.querySelector("#magic-ai-import-btn");
const tripIntelligenceButton = document.querySelector("#trip-intelligence-btn");
const magicImportModal = document.querySelector("#magic-import-modal");
const closeMagicImportModalButton = document.querySelector("#close-magic-import-modal");
const magicImportText = document.querySelector("#magic-import-text");
const runMagicImportButton = document.querySelector("#run-magic-import");
const magicImportStatus = document.querySelector("#magic-import-status");
const magicImportMode = document.querySelector("#magic-import-mode");
const tripIntelligenceModal = document.querySelector("#trip-intelligence-modal");
const closeTripIntelligenceModalButton = document.querySelector("#close-trip-intelligence-modal");
const runTripIntelligenceButton = document.querySelector("#run-trip-intelligence");
const tripIntelligenceOutput = document.querySelector("#trip-intelligence-output");

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

void init();

async function init() {
  setupMap();
  setupHandlers();
  updateHeaderOffsetVar();
  if (DEFAULT_WMS_URL) {
    wmsUrlInput.value = DEFAULT_WMS_URL;
  }
  selectedDay = todayIso();
  rangeStartInput.value = selectedDay;
  rangeEndInput.value = selectedDay;
  ensureValidTripIds();
  await bootstrapRemoteState();
  await refreshStateFromRemote();
  setupRealtimeSubscriptions();
  setSyncStatus("saved");
  updateWeatherForecast();
  renderAll();
}

function setupMap() {
  map = L.map("map").setView([32.7607, -16.9595], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  map.on("click", (event) => {
    if (!pendingPinActivityId) return;
    const { lat, lng } = event.latlng;
    const target = state.activities.find((activity) => activity.id === pendingPinActivityId);
    if (target) {
      target.lat = Number(lat.toFixed(5));
      target.lng = Number(lng.toFixed(5));
      target.pinHidden = false;
      saveState();
      renderAll();
    }
    pendingPinActivityId = null;
  });
}

function setupHandlers() {
  rangeStartInput.addEventListener("change", () => {
    selectedDay = rangeStartInput.value || todayIso();
    updateWeatherForecast();
    renderDailyActivities();
  });

  rangeEndInput.addEventListener("change", () => {
    renderDailyActivities();
  });

  presetTodayButton.addEventListener("click", () => {
    applyPresetToday();
  });
  presetWeekendButton.addEventListener("click", () => {
    applyPresetWeekend();
  });
  presetWholeTripButton.addEventListener("click", () => {
    applyPresetWholeTrip();
  });
  applyRangeButton.addEventListener("click", () => {
    selectedDay = normalizeDayForSort(rangeStartInput.value || todayIso());
    updateWeatherForecast();
    renderDailyActivities();
    closeAllDropdowns();
  });

  notificationFilter.addEventListener("change", () => {
    renderNotifications();
  });
  currentUserSelect.addEventListener("change", () => {
    state.currentUserName = currentUserSelect.value;
    saveState();
    renderAll();
  });
  notificationBell.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDropdown("notifications");
  });
  tripDropdownToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDropdown("trips");
  });
  weatherDropdownToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDropdown("weather");
  });
  rangeDropdownToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDropdown("range");
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".dropdown-wrap")) return;
    closeAllDropdowns();
  });
  window.addEventListener("resize", updateHeaderOffsetVar);
  window.addEventListener("orientationchange", updateHeaderOffsetVar);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateHeaderOffsetVar);
  }

  addTripButton.addEventListener("click", () => {
    const name = window.prompt("Trip name");
    if (!name || !name.trim()) return;
    const trip = { id: crypto.randomUUID(), name: name.trim() };
    state.trips.push(trip);
    state.currentTripId = trip.id;
    saveState();
    closeAllDropdowns();
    renderAll();
  });
  addMemberButton.addEventListener("click", () => {
    const name = String(newMemberNameInput.value || "").trim();
    if (!name) return;
    const tripMembers = getCurrentTripMembers();
    if (!tripMembers.includes(name)) {
      tripMembers.push(name);
    }
    if (!state.members.includes(name)) {
      state.members.push(name);
    }
    state.currentUserName = state.currentUserName || name;
    newMemberNameInput.value = "";
    saveState();
    renderAll();
  });
  toggleLayersCollapseButton.addEventListener("click", () => {
    const current = getCurrentUserPreferences();
    current.layersCollapsed = !Boolean(current.layersCollapsed);
    saveState();
    renderAll();
  });

  openWmsModalButton.addEventListener("click", () => {
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

  magicAiImportButton.addEventListener("click", () => {
    magicImportStatus.textContent = "";
    magicImportModal.classList.remove("hidden");
  });
  closeMagicImportModalButton.addEventListener("click", () => {
    magicImportModal.classList.add("hidden");
  });
  magicImportModal.addEventListener("click", (event) => {
    if (event.target === magicImportModal) magicImportModal.classList.add("hidden");
  });
  runMagicImportButton.addEventListener("click", runMagicImport);

  tripIntelligenceButton.addEventListener("click", () => {
    tripIntelligenceOutput.innerHTML = `<p class="meta">Click "Generate Summary" to analyze this trip.</p>`;
    tripIntelligenceModal.classList.remove("hidden");
  });
  closeTripIntelligenceModalButton.addEventListener("click", () => {
    tripIntelligenceModal.classList.add("hidden");
  });
  tripIntelligenceModal.addEventListener("click", (event) => {
    if (event.target === tripIntelligenceModal) tripIntelligenceModal.classList.add("hidden");
  });
  runTripIntelligenceButton.addEventListener("click", runTripIntelligence);

  openActivityModalButton.addEventListener("click", () => {
    editingActivityId = null;
    renderTagMemberCheckboxes();
    fields.day.value = selectedDay || todayIso();
    fields.time.value = "";
    fields.title.value = "";
    fields.notes.value = "";
    fields.location.value = "";
    fields.address.value = "";
    fields.lat.value = "";
    fields.lng.value = "";
    fields.category.value = "🏔️";
    setActivityLocStatus("", "");
    activityModalTitle.textContent = "Add Activity";
    saveActivityButton.textContent = "Create Activity";
    activityModal.classList.remove("hidden");
  });
  closeActivityModalButton.addEventListener("click", () => {
    activityModal.classList.add("hidden");
    editingActivityId = null;
  });

  fields.day.addEventListener("click", openDayPicker);
  fields.day.addEventListener("focus", openDayPicker);

  geocodeAddressButton.addEventListener("click", geocodeAddress);
  activityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const existing = editingActivityId ? state.activities.find((item) => item.id === editingActivityId) : null;
    const activity = {
      id: existing?.id || crypto.randomUUID(),
      tripId: existing?.tripId || state.currentTripId,
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
      pinHidden: existing ? Boolean(existing.pinHidden) : false,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    if (!activity.title || !activity.day || !activity.time) return;
    if (existing) {
      const previousTags = new Set(existing.taggedMembers || []);
      Object.assign(existing, activity);
      createTagNotifications(existing, previousTags);
    } else {
      state.activities.push(activity);
      createTagNotifications(activity);
    }
    saveState();
    activityModal.classList.add("hidden");
    activityForm.reset();
    editingActivityId = null;
    saveActivityButton.textContent = "Create Activity";
    selectedDay = activity.day;
    rangeStartInput.value = activity.day;
    rangeEndInput.value = activity.day;
    setActivityLocStatus("", "");
    renderAll();
  });

}

function renderAll() {
  renderTripHeader();
  renderTripList();
  renderTripMembers();
  renderCurrentUserOptions();
  renderLayersSectionState();
  renderNotifications();
  renderMapPins();
  renderActiveLayersPanel();
  renderDailyActivities();
  updateWeatherForecast();
}

function closeAllDropdowns() {
  tripDropdown.classList.add("hidden");
  weatherDropdown.classList.add("hidden");
  rangeDropdown.classList.add("hidden");
  notificationPanel.classList.add("hidden");
}

function toggleDropdown(kind) {
  const targets = {
    trips: tripDropdown,
    weather: weatherDropdown,
    range: rangeDropdown,
    notifications: notificationPanel,
  };
  const target = targets[kind];
  if (!target) return;
  const wasHidden = target.classList.contains("hidden");
  closeAllDropdowns();
  if (wasHidden) target.classList.remove("hidden");
}

function getRangeActivities() {
  const start = normalizeDayForSort(rangeStartInput.value || selectedDay);
  const end = normalizeDayForSort(rangeEndInput.value || selectedDay);
  const low = start <= end ? start : end;
  const high = start <= end ? end : start;
  return state.activities
    .filter((activity) => activity.tripId === state.currentTripId)
    .filter((activity) => {
      const day = normalizeDayForSort(activity.day);
      return day >= low && day <= high;
    });
}

function renderTripHeader() {
  const activeTrip = state.trips.find((trip) => trip.id === state.currentTripId) || state.trips[0] || DEFAULT_TRIP;
  selectedTripBrand.textContent = activeTrip.name;
}

function renderTripList() {
  tripList.innerHTML = "";
  state.trips.forEach((trip) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `trip-row${trip.id === state.currentTripId ? " active" : ""}`;
    const label = document.createElement("span");
    label.textContent = trip.name;
    row.appendChild(label);
    if (trip.id === state.currentTripId) {
      const pill = document.createElement("span");
      pill.className = "active-pill";
      pill.textContent = "Active";
      row.appendChild(pill);
    }
    row.addEventListener("click", () => {
      state.currentTripId = trip.id;
      saveState();
      closeAllDropdowns();
      renderAll();
    });
    tripList.appendChild(row);
  });
}

function getCurrentTripMembers() {
  if (!state.tripMembersByTripId || typeof state.tripMembersByTripId !== "object") {
    state.tripMembersByTripId = {};
  }
  const existing = state.tripMembersByTripId[state.currentTripId];
  if (Array.isArray(existing) && existing.length) return existing;
  const fallback = [...state.members];
  state.tripMembersByTripId[state.currentTripId] = fallback;
  return state.tripMembersByTripId[state.currentTripId];
}

function getCurrentUserPreferences() {
  if (!state.userPreferencesByName || typeof state.userPreferencesByName !== "object") {
    state.userPreferencesByName = {};
  }
  const key = state.currentUserName || "default";
  if (!state.userPreferencesByName[key] || typeof state.userPreferencesByName[key] !== "object") {
    state.userPreferencesByName[key] = { layersCollapsed: false };
  }
  return state.userPreferencesByName[key];
}

function renderLayersSectionState() {
  const collapsed = Boolean(getCurrentUserPreferences().layersCollapsed);
  layersSection.classList.toggle("collapsed", collapsed);
  toggleLayersCollapseButton.textContent = collapsed ? "Expand" : "Collapse";
}

function renderTripMembers() {
  tripMemberList.innerHTML = "";
  const members = getCurrentTripMembers();
  if (!members.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No people added yet.";
    tripMemberList.appendChild(empty);
    return;
  }
  members.forEach((member) => {
    const row = document.createElement("div");
    row.className = "member-row";
    const name = document.createElement("span");
    name.textContent = member;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "member-remove-btn";
    remove.textContent = "Remove";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = getCurrentTripMembers().filter((item) => item !== member);
      state.tripMembersByTripId[state.currentTripId] = next;
      if (state.currentUserName === member) {
        state.currentUserName = next[0] || "";
      }
      saveState();
      renderAll();
    });
    row.append(name, remove);
    tripMemberList.appendChild(row);
  });
}

function renderCurrentUserOptions() {
  currentUserSelect.innerHTML = "";
  const members = getCurrentTripMembers();
  if (!members.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No members";
    currentUserSelect.appendChild(option);
    return;
  }
  if (!state.currentUserName || !members.includes(state.currentUserName)) {
    state.currentUserName = members[0];
  }
  members.forEach((member) => {
    const option = document.createElement("option");
    option.value = member;
    option.textContent = member;
    if (member === state.currentUserName) option.selected = true;
    currentUserSelect.appendChild(option);
  });
}

function renderTagMemberCheckboxes() {
  activityTagsHost.innerHTML = "";
  getCurrentTripMembers().forEach((member) => {
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

function openActivityModalForEdit(activityId) {
  const activity = state.activities.find((item) => item.id === activityId);
  if (!activity) return;
  editingActivityId = activity.id;
  renderTagMemberCheckboxes();
  fields.title.value = activity.title || "";
  fields.day.value = normalizeDayForSort(activity.day) || todayIso();
  fields.time.value = activity.time || "";
  fields.category.value = activity.category || "🏔️";
  fields.notes.value = activity.notes || "";
  fields.location.value = activity.location || "";
  fields.address.value = activity.address || "";
  fields.lat.value = Number.isFinite(activity.lat) ? String(activity.lat) : "";
  fields.lng.value = Number.isFinite(activity.lng) ? String(activity.lng) : "";
  const selected = new Set(activity.taggedMembers || []);
  activityTagsHost.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = selected.has(input.value);
  });
  saveActivityButton.textContent = "Update Activity";
  activityModalTitle.textContent = "Edit Activity";
  setActivityLocStatus("", "");
  activityModal.classList.remove("hidden");
}

function renderDailyActivities() {
  dailyActivityList.innerHTML = "";
  const filtered = getRangeActivities().sort(compareActivitiesByDayThenTime);
  activitiesTitle.textContent = `Activities (${filtered.length})`;

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No activities in selected date range.";
    dailyActivityList.appendChild(empty);
    return;
  }

  filtered.forEach((activity) => {
    const card = document.createElement("article");
    card.className = "layer-item activity-openable";
    card.dataset.activityId = activity.id;
    const activityWeather = getActivityWeatherSnapshot(activity);
    const accentStrip = document.createElement("div");
    accentStrip.className = `category-strip ${categoryAccentClass(activity.category)}`;
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
    const confidence = document.createElement("p");
    confidence.className = "meta";
    confidence.textContent = `Weather confidence: ${weatherConfidenceLabel(activityWeather)}`;
    const actions = document.createElement("div");
    actions.className = "activity-row-actions";
    const setPinButton = document.createElement("button");
    setPinButton.type = "button";
    setPinButton.className = "icon-btn";
    setPinButton.textContent = "Set Pin";
    setPinButton.addEventListener("click", (event) => {
      event.stopPropagation();
      pendingPinActivityId = activity.id;
      map.setView([32.7607, -16.9595], Math.max(map.getZoom(), 10));
      setActivityLocStatus("Click on the map to set this pin.", "ok");
    });
    actions.append(setPinButton);
    card.addEventListener("click", () => {
      openActivityModalForEdit(activity.id);
    });
    card.append(accentStrip, heading, meta, notes, tags, confidence, actions);
    dailyActivityList.appendChild(card);
  });
}

function renderNotifications() {
  notificationList.innerHTML = "";
  const allUnhandled = getUnhandledNotificationsForCurrentTrip();
  notificationDot.textContent = allUnhandled.length > 99 ? "99+" : String(allUnhandled.length);
  notificationDot.classList.toggle("hidden", allUnhandled.length === 0);
  const unhandled = allUnhandled.filter((notification) => {
    if (notificationFilter.value === "mine") {
      return notification.userName === state.currentUserName;
    }
    return true;
  });
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
      message.textContent = `${notification.userName} was tagged on ${activity ? activity.title : "an activity"}.`;
      const jumpButton = document.createElement("button");
      jumpButton.type = "button";
      jumpButton.className = "notif-link";
      jumpButton.textContent = "Go to activity";
      jumpButton.addEventListener("click", () => {
        if (!activity) return;
        selectedDay = activity.day;
        rangeStartInput.value = activity.day;
        rangeEndInput.value = activity.day;
        if (activity.pinHidden && Number.isFinite(activity.lat) && Number.isFinite(activity.lng)) {
          activity.pinHidden = false;
          saveState();
        }
        renderAll();
        focusActivityCard(activity.id);
        openActivityPopup(activity);
      });
      const button = document.createElement("button");
      button.className = "small";
      button.textContent = "Mark addressed";
      button.addEventListener("click", () => {
        notification.handled = true;
        saveState();
        renderNotifications();
      });
      card.append(message, jumpButton, button);
      notificationList.appendChild(card);
    });
}

function focusActivityCard(activityId) {
  const selector = `[data-activity-id="${activityId}"]`;
  const card = dailyActivityList.querySelector(selector);
  if (!card) return;
  card.classList.add("activity-row-highlight");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => card.classList.remove("activity-row-highlight"), 1600);
}

function openActivityPopup(activity) {
  if (!activity) return;
  if (!Number.isFinite(activity.lat) || !Number.isFinite(activity.lng)) return;
  const marker = markerByActivityId.get(activity.id);
  if (!marker) return;
  map.setView([activity.lat, activity.lng], Math.max(map.getZoom(), 12));
  marker.openPopup();
}

function renderMapPins() {
  markerByActivityId.forEach((marker) => marker.remove());
  markerByActivityId.clear();
  state.activities.forEach((activity) => {
    if (activity.tripId !== state.currentTripId) return;
    if (activity.pinHidden) return;
    if (!Number.isFinite(activity.lat) || !Number.isFinite(activity.lng)) return;
    const marker = L.marker([activity.lat, activity.lng], {
      icon: L.divIcon({
        className: "activity-pin-icon-wrap",
        html: `<span class="activity-pin-icon" style="background:${pinColorForCategory(activity.category)}"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
      draggable: true,
    }).addTo(map);
    marker.on("dragend", () => {
      const position = marker.getLatLng();
      activity.lat = Number(position.lat.toFixed(5));
      activity.lng = Number(position.lng.toFixed(5));
      activity.pinHidden = false;
      saveState();
      marker.bindPopup(
        `<strong>${escapeHtml(activity.title)}</strong><br>${escapeHtml(formatDayDisplay(activity.day))} ${escapeHtml(
          activity.time
        )}<br>${escapeHtml(activity.location || activity.address || "No place name")}`
      );
    });
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

function createTagNotifications(activity, previousTags = new Set()) {
  activity.taggedMembers.forEach((userName) => {
    if (previousTags.has(userName)) return;
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

function getUnhandledNotificationsForCurrentTrip() {
  const currentTripActivityIds = new Set(
    state.activities.filter((activity) => activity.tripId === state.currentTripId).map((activity) => activity.id)
  );
  const tripMembers = new Set(getCurrentTripMembers());
  return state.notifications.filter(
    (notification) =>
      !notification.handled &&
      notification.tripId === state.currentTripId &&
      tripMembers.has(notification.userName) &&
      currentTripActivityIds.has(notification.activityId)
  );
}

function defaultState() {
  return {
    trips: [DEFAULT_TRIP],
    currentTripId: DEFAULT_TRIP.id,
    members: [...DEFAULT_MEMBERS],
    currentUserName: DEFAULT_MEMBERS[0],
    tripMembersByTripId: {
      [DEFAULT_TRIP.id]: [...DEFAULT_MEMBERS],
    },
    userPreferencesByName: {
      [DEFAULT_MEMBERS[0]]: { layersCollapsed: false },
    },
    activities: [],
    notifications: [],
  };
}

function ensureValidTripIds() {
  const tripIdMap = new Map();
  state.trips = (state.trips || []).map((trip, index) => {
    const rawId = String(trip?.id || "").trim();
    if (isUuid(rawId)) return { id: rawId, name: trip?.name || `Trip ${index + 1}` };
    const replacement = crypto.randomUUID();
    tripIdMap.set(rawId, replacement);
    return { id: replacement, name: trip?.name || `Trip ${index + 1}` };
  });
  if (!state.trips.length) {
    state.trips = [{ ...DEFAULT_TRIP }];
  }
  const rawCurrentTripId = String(state.currentTripId || "").trim();
  if (tripIdMap.has(rawCurrentTripId)) {
    state.currentTripId = tripIdMap.get(rawCurrentTripId);
  }
  if (!state.trips.some((trip) => trip.id === state.currentTripId)) {
    state.currentTripId = state.trips[0].id;
  }
  state.activities = (state.activities || []).map((activity) => {
    const rawTripId = String(activity.tripId || "").trim();
    return {
      ...activity,
      tripId: tripIdMap.get(rawTripId) || (isUuid(rawTripId) ? rawTripId : state.currentTripId),
    };
  });
  state.notifications = (state.notifications || []).map((notification) => {
    const rawTripId = String(notification.tripId || "").trim();
    return {
      ...notification,
      tripId: tripIdMap.get(rawTripId) || (isUuid(rawTripId) ? rawTripId : state.currentTripId),
    };
  });
  const nextTripMembers = {};
  const currentTripMembersSource = state.tripMembersByTripId || {};
  Object.entries(currentTripMembersSource).forEach(([tripId, members]) => {
    const mappedTripId = tripIdMap.get(String(tripId || "").trim()) || tripId;
    nextTripMembers[mappedTripId] = Array.isArray(members) ? members : [];
  });
  state.trips.forEach((trip) => {
    if (!Array.isArray(nextTripMembers[trip.id]) || !nextTripMembers[trip.id].length) {
      nextTripMembers[trip.id] = [...DEFAULT_MEMBERS];
    }
  });
  state.tripMembersByTripId = nextTripMembers;
  const currentMembers = nextTripMembers[state.currentTripId] || [];
  if (!state.currentUserName || !currentMembers.includes(state.currentUserName)) {
    state.currentUserName = currentMembers[0] || "";
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function loadState() {
  return defaultState();
}

function saveState() {
  queueRemoteSync();
}

function queueRemoteSync() {
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  syncInFlight = true;
  let syncSucceeded = false;
  setSyncStatus("saving");
  void syncStateToRemote()
    .then(() => {
      syncSucceeded = true;
    })
    .catch((error) => {
      console.error("State sync failed", error);
      setSyncStatus("error");
    })
    .finally(async () => {
      syncInFlight = false;
      if (syncQueued) {
        syncQueued = false;
        queueRemoteSync();
        return;
      }
      if (syncSucceeded) {
        await refreshStateFromRemote();
        setSyncStatus("saved");
      }
      renderAll();
    });
}

async function bootstrapRemoteState() {
  if (!supabaseClient) return;
  const { data: trips, error: tripsError } = await supabaseClient.from("trips").select("id").limit(1);
  if (!tripsError && (!trips || !trips.length)) {
    await supabaseClient.from("trips").insert([{ id: DEFAULT_TRIP.id, name: DEFAULT_TRIP.name }]);
  }
  const memberRows = DEFAULT_MEMBERS.map((name) => ({ name, layers_collapsed: false }));
  const membersUpsert = await supabaseClient.from("members").upsert(memberRows, { onConflict: "name" });
  if (membersUpsert.error && isMissingLayersCollapsedError(membersUpsert.error)) {
    supportsLayersCollapsedColumn = false;
    await supabaseClient.from("members").upsert(
      DEFAULT_MEMBERS.map((name) => ({ name })),
      { onConflict: "name" }
    );
  }
}

async function refreshStateFromRemote() {
  if (!supabaseClient) return;
  const [tripsRes, activitiesRes, notificationsRes, membersRes] = await Promise.all([
    supabaseClient.from("trips").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("activities").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("notifications").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("members").select("*").order("created_at", { ascending: true }),
  ]);
  if (tripsRes.error || activitiesRes.error || notificationsRes.error || membersRes.error) {
    console.error("Failed to refresh remote state", {
      trips: tripsRes.error,
      activities: activitiesRes.error,
      notifications: notificationsRes.error,
      members: membersRes.error,
    });
    return;
  }
  const trips = (tripsRes.data || []).map((trip) => ({ id: trip.id, name: trip.name }));
  const currentTripId = trips.some((trip) => trip.id === state.currentTripId) ? state.currentTripId : trips[0]?.id || DEFAULT_TRIP.id;
  const nextTripMembers = { ...(state.tripMembersByTripId || {}) };
  trips.forEach((trip) => {
    const existing = Array.isArray(nextTripMembers[trip.id]) ? nextTripMembers[trip.id] : [];
    nextTripMembers[trip.id] = existing.length ? existing : [...DEFAULT_MEMBERS];
  });
  const currentMembers = Array.isArray(nextTripMembers[currentTripId]) ? nextTripMembers[currentTripId] : [...DEFAULT_MEMBERS];
  const nextCurrentUser =
    currentMembers.includes(state.currentUserName) && state.currentUserName ? state.currentUserName : currentMembers[0] || "";
  state = {
    trips: trips.length ? trips : [DEFAULT_TRIP],
    currentTripId,
    members: (membersRes.data || []).map((member) => member.name).filter(Boolean),
    currentUserName: nextCurrentUser,
    tripMembersByTripId: nextTripMembers,
    userPreferencesByName: (membersRes.data || []).reduce((acc, member) => {
      if (!member?.name) return acc;
      acc[member.name] = { layersCollapsed: Boolean(member.layers_collapsed) };
      return acc;
    }, {}),
    activities: (activitiesRes.data || []).map((row) => ({
      id: row.id,
      tripId: row.trip_id || currentTripId,
      title: row.title || "",
      day: normalizeDayForSort(row.day),
      time: row.time || "",
      category: row.category || "🏔️",
      notes: row.notes || "",
      location: row.location || "",
      address: row.address || "",
      lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
      lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
      taggedMembers: Array.isArray(row.tagged_members) ? row.tagged_members : [],
      pinHidden: Boolean(row.pin_hidden),
      createdAt: row.created_at || new Date().toISOString(),
    })),
    notifications: (notificationsRes.data || []).map((row) => ({
      id: row.id,
      userName: row.user_name,
      fromUser: row.from_user,
      activityId: row.activity_id,
      tripId: row.trip_id || currentTripId,
      handled: Boolean(row.handled),
      createdAt: row.created_at || new Date().toISOString(),
    })),
  };
}

async function syncStateToRemote() {
  if (!supabaseClient) return;
  const memberRows = state.members.map((name) =>
    supportsLayersCollapsedColumn
      ? {
          name,
          layers_collapsed: Boolean(state.userPreferencesByName?.[name]?.layersCollapsed),
        }
      : { name }
  );
  let membersWrite = await supabaseClient.from("members").upsert(memberRows, { onConflict: "name" });
  if (membersWrite.error && isMissingLayersCollapsedError(membersWrite.error)) {
    supportsLayersCollapsedColumn = false;
    membersWrite = await supabaseClient.from("members").upsert(
      state.members.map((name) => ({ name })),
      { onConflict: "name" }
    );
  }
  throwIfSupabaseError(membersWrite.error, "saving members");

  const tripRows = state.trips.map((trip) => ({ id: trip.id, name: trip.name }));
  const tripsWrite = await supabaseClient.from("trips").upsert(tripRows, { onConflict: "id" });
  throwIfSupabaseError(tripsWrite.error, "saving trips");

  const activityRows = state.activities.map((activity) => ({
    id: activity.id,
    trip_id: activity.tripId,
    title: activity.title,
    day: normalizeDayForSort(activity.day),
    time: activity.time,
    category: activity.category,
    notes: activity.notes || null,
    location: activity.location || null,
    address: activity.address || null,
    lat: Number.isFinite(activity.lat) ? activity.lat : null,
    lng: Number.isFinite(activity.lng) ? activity.lng : null,
    tagged_members: Array.isArray(activity.taggedMembers) ? activity.taggedMembers : [],
    pin_hidden: Boolean(activity.pinHidden),
    created_at: activity.createdAt || new Date().toISOString(),
  }));
  const activitiesWrite = await supabaseClient.from("activities").upsert(activityRows, { onConflict: "id" });
  throwIfSupabaseError(activitiesWrite.error, "saving activities");

  const notifRows = state.notifications.map((notification) => ({
    id: notification.id,
    user_name: notification.userName,
    from_user: notification.fromUser || "Activity tagged",
    activity_id: notification.activityId,
    trip_id: notification.tripId || state.currentTripId,
    handled: Boolean(notification.handled),
    created_at: notification.createdAt || new Date().toISOString(),
  }));
  const notificationsWrite = await supabaseClient.from("notifications").upsert(notifRows, { onConflict: "id" });
  throwIfSupabaseError(notificationsWrite.error, "saving notifications");

  const [remoteTrips, remoteActivities, remoteNotifications] = await Promise.all([
    supabaseClient.from("trips").select("id"),
    supabaseClient.from("activities").select("id"),
    supabaseClient.from("notifications").select("id"),
  ]);
  if (!remoteTrips.error) {
    const localTripIds = new Set(state.trips.map((trip) => trip.id));
    const deleteTripIds = (remoteTrips.data || []).map((row) => row.id).filter((id) => !localTripIds.has(id));
    if (deleteTripIds.length) {
      const deleteTrips = await supabaseClient.from("trips").delete().in("id", deleteTripIds);
      throwIfSupabaseError(deleteTrips.error, "removing stale trips");
    }
  }
  if (!remoteActivities.error) {
    const localActivityIds = new Set(state.activities.map((activity) => activity.id));
    const deleteActivityIds = (remoteActivities.data || []).map((row) => row.id).filter((id) => !localActivityIds.has(id));
    if (deleteActivityIds.length) {
      const deleteActivities = await supabaseClient.from("activities").delete().in("id", deleteActivityIds);
      throwIfSupabaseError(deleteActivities.error, "removing stale activities");
    }
  }
  if (!remoteNotifications.error) {
    const localNotifIds = new Set(state.notifications.map((notification) => notification.id));
    const deleteNotifIds = (remoteNotifications.data || []).map((row) => row.id).filter((id) => !localNotifIds.has(id));
    if (deleteNotifIds.length) {
      const deleteNotifications = await supabaseClient.from("notifications").delete().in("id", deleteNotifIds);
      throwIfSupabaseError(deleteNotifications.error, "removing stale notifications");
    }
  }
}

function throwIfSupabaseError(error, context) {
  if (!error) return;
  throw new Error(`Supabase error while ${context}: ${error.message || "Unknown error"}`);
}

function isMissingLayersCollapsedError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("layers_collapsed") && message.includes("could not find");
}

function setSyncStatus(status) {
  if (!syncStatusPill) return;
  syncStatusPill.classList.remove("sync-status-saving", "sync-status-saved", "sync-status-error");
  if (status === "saving") {
    syncStatusPill.textContent = "Saving...";
    syncStatusPill.classList.add("sync-status-saving");
    return;
  }
  if (status === "error") {
    syncStatusPill.textContent = "Sync error";
    syncStatusPill.classList.add("sync-status-error");
    return;
  }
  syncStatusPill.textContent = "Saved";
  syncStatusPill.classList.add("sync-status-saved");
}

function updateHeaderOffsetVar() {
  if (!appHeader) return;
  const rect = appHeader.getBoundingClientRect();
  const height = Math.max(48, Math.ceil(rect.height));
  document.documentElement.style.setProperty("--header-offset", `${height}px`);
}

function setupRealtimeSubscriptions() {
  if (!supabaseClient) return;
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }
  realtimeChannel = supabaseClient
    .channel("planner-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, async () => {
      await refreshStateFromRemote();
      renderAll();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, async () => {
      await refreshStateFromRemote();
      renderAll();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, async () => {
      await refreshStateFromRemote();
      renderAll();
    })
    .subscribe();
}

async function updateWeatherForecast() {
  if (!selectedDay || !/^\d{4}-\d{2}-\d{2}$/.test(String(selectedDay))) {
    selectedDayWeather = null;
    weatherForecast.innerHTML = `<p class="meta">Pick a valid date (YYYY-MM-DD) to load weather forecast.</p>`;
    mapWeatherBadge.textContent = "Weather: --";
    return;
  }
  weatherForecast.innerHTML = `<p class="meta">Loading weather forecast...</p>`;
  mapWeatherBadge.textContent = "Weather: loading...";
  try {
    const params = new URLSearchParams({
      latitude: "32.6669",
      longitude: "-16.9241",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,cloud_cover_mean",
      hourly: "weather_code,precipitation_probability,cloud_cover,wind_gusts_10m,temperature_2m",
      timezone: "auto",
      start_date: selectedDay,
      end_date: selectedDay,
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Forecast request failed (${response.status})`);
    }
    const payload = await response.json();
    const daily = payload.daily;
    if (!daily || !daily.time || !daily.time.length) {
      throw new Error("No forecast returned for this date.");
    }
    const summary = weatherCodeToSummary(daily.weather_code?.[0]);
    const tempMin = daily.temperature_2m_min?.[0];
    const tempMax = daily.temperature_2m_max?.[0];
    const rainProb = daily.precipitation_probability_max?.[0];
    const rainSum = daily.precipitation_sum?.[0];
    const cloud = daily.cloud_cover_mean?.[0];
    const hourly = payload.hourly || {};
    selectedDayWeather = {
      weatherCode: Number(daily.weather_code?.[0]),
      rainProbability: Number(rainProb),
      cloudCover: Number(cloud),
      windGust: Number(hourly.wind_gusts_10m?.[0]),
      hourly: {
        time: Array.isArray(hourly.time) ? hourly.time : [],
        weatherCode: Array.isArray(hourly.weather_code) ? hourly.weather_code : [],
        rainProbability: Array.isArray(hourly.precipitation_probability)
          ? hourly.precipitation_probability
          : [],
        cloudCover: Array.isArray(hourly.cloud_cover) ? hourly.cloud_cover : [],
        windGust: Array.isArray(hourly.wind_gusts_10m) ? hourly.wind_gusts_10m : [],
      },
    };
    weatherForecast.innerHTML = `
      <strong>${summary}</strong>
      <p class="meta">Temp: ${roundOrDash(cToF(tempMin))} to ${roundOrDash(cToF(tempMax))} °F</p>
      <p class="meta">Rain chance: ${roundOrDash(rainProb)}% • Rain: ${roundOrDash(rainSum)} mm</p>
      <p class="meta">Cloud cover: ${roundOrDash(cloud)}% • Gusts: ${roundOrDash(selectedDayWeather.windGust)} km/h</p>
    `;
    mapWeatherBadge.textContent = `${summary} • ${roundOrDash(cToF(tempMax))}°F`;
  } catch (error) {
    selectedDayWeather = null;
    weatherForecast.innerHTML = `<p class="meta">Weather unavailable: ${escapeHtml(
      error.message || "Unknown error"
    )}</p>`;
    mapWeatherBadge.textContent = "Weather: unavailable";
  }
}

function openDayPicker() {
  if (typeof fields.day.showPicker === "function") fields.day.showPicker();
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

function applyPresetToday() {
  const today = todayIso();
  rangeStartInput.value = today;
  rangeEndInput.value = today;
  selectedDay = today;
  updateWeatherForecast();
  renderDailyActivities();
}

function applyPresetWeekend() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const toSaturday = (6 - day + 7) % 7;
  start.setDate(start.getDate() + toSaturday);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  rangeStartInput.value = startIso;
  rangeEndInput.value = endIso;
  selectedDay = startIso;
  updateWeatherForecast();
  renderDailyActivities();
}

function applyPresetWholeTrip() {
  const tripActivities = state.activities
    .filter((activity) => activity.tripId === state.currentTripId)
    .sort(compareActivitiesByDayThenTime);
  if (!tripActivities.length) {
    applyPresetToday();
    return;
  }
  const firstDay = normalizeDayForSort(tripActivities[0].day);
  const lastDay = normalizeDayForSort(tripActivities[tripActivities.length - 1].day);
  rangeStartInput.value = firstDay;
  rangeEndInput.value = lastDay;
  selectedDay = firstDay;
  updateWeatherForecast();
  renderDailyActivities();
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

function weatherCodeToSummary(code) {
  switch (Number(code)) {
    case 0:
      return "Clear sky (sunny)";
    case 1:
    case 2:
      return "Partly cloudy";
    case 3:
      return "Overcast";
    case 45:
    case 48:
      return "Fog";
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
      return "Drizzle";
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
      return "Rain";
    case 71:
    case 73:
    case 75:
    case 77:
      return "Snow";
    case 80:
    case 81:
    case 82:
      return "Rain showers";
    case 85:
    case 86:
      return "Snow showers";
    case 95:
    case 96:
    case 99:
      return "Thunderstorm";
    default:
      return "Mixed/unknown conditions";
  }
}

function roundOrDash(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return Math.round(value * 10) / 10;
}

function cToF(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return NaN;
  return (value * 9) / 5 + 32;
}

function getActivityWeatherSnapshot(activity) {
  if (!selectedDayWeather?.hourly?.time?.length) return selectedDayWeather;
  const targetHour = parseActivityHour(activity.time);
  const targetStamp = `${activity.day}T${String(targetHour).padStart(2, "0")}:00`;
  const times = selectedDayWeather.hourly.time;
  let index = times.indexOf(targetStamp);
  if (index === -1) {
    index = findClosestHourlyIndex(times, targetStamp);
  }
  if (index < 0) return selectedDayWeather;
  return {
    weatherCode: Number(selectedDayWeather.hourly.weatherCode[index]),
    rainProbability: Number(selectedDayWeather.hourly.rainProbability[index]),
    cloudCover: Number(selectedDayWeather.hourly.cloudCover[index]),
    windGust: Number(selectedDayWeather.hourly.windGust[index]),
  };
}

function parseActivityHour(timeText) {
  const match = String(timeText || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 12;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return minute >= 30 ? Math.min(hour + 1, 23) : hour;
}

function findClosestHourlyIndex(times, targetStamp) {
  const target = new Date(targetStamp).getTime();
  if (Number.isNaN(target)) return -1;
  let bestIndex = -1;
  let bestDiff = Number.POSITIVE_INFINITY;
  times.forEach((timeValue, idx) => {
    const ts = new Date(timeValue).getTime();
    if (Number.isNaN(ts)) return;
    const diff = Math.abs(ts - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = idx;
    }
  });
  return bestIndex;
}

function weatherClassForCode(code) {
  const numeric = Number(code);
  if ([0, 1].includes(numeric)) return "weather-clear";
  if ([2, 3, 45, 48].includes(numeric)) return "weather-cloudy";
  if (
    [
      51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 71, 73, 75, 77, 85, 86,
    ].includes(numeric)
  )
    return "weather-rainy";
  if ([95, 96, 99].includes(numeric)) return "weather-storm";
  return "weather-cloudy";
}

function weatherConfidenceLabel(snapshot) {
  if (!snapshot) return "Unknown";
  const rain = snapshot.rainProbability;
  const cloud = snapshot.cloudCover;
  const gust = snapshot.windGust;
  let risk = 0;
  if (rain >= 70) risk += 3;
  else if (rain >= 45) risk += 2;
  else if (rain >= 25) risk += 1;

  if (gust >= 55) risk += 3;
  else if (gust >= 40) risk += 2;
  else if (gust >= 30) risk += 1;

  if (cloud >= 90) risk += 2;
  else if (cloud >= 70) risk += 1;

  if (risk >= 5) return "High";
  if (risk >= 3) return "Medium";
  return "Low";
}

function pinColorForCategory(category) {
  switch (category) {
    case "🏔️":
      return "#8b5cf6";
    case "🏖️":
      return "#0ea5e9";
    case "🍽️":
      return "#f97316";
    case "🚗":
      return "#64748b";
    case "🌅":
      return "#f43f5e";
    case "📸":
      return "#22c55e";
    default:
      return "#2563eb";
  }
}

function categoryAccentClass(category) {
  switch (category) {
    case "🏔️":
      return "accent-hike";
    case "🏖️":
      return "accent-beach";
    case "🍽️":
      return "accent-food";
    case "🚗":
      return "accent-drive";
    case "🌅":
      return "accent-sunset";
    case "📸":
      return "accent-photo";
    default:
      return "accent-default";
  }
}

async function runMagicImport() {
  const text = magicImportText.value.trim();
  if (!text) {
    magicImportStatus.textContent = "Paste some source text first.";
    magicImportStatus.className = "status-text warn";
    return;
  }
  const apiKey = await ensureGeminiApiKey();
  if (!apiKey && !GEMINI_EDGE_FUNCTION_URL) {
    magicImportStatus.textContent = "Gemini API key is required.";
    magicImportStatus.className = "status-text warn";
    return;
  }
  magicImportStatus.textContent = "Transforming text with AI...";
  magicImportStatus.className = "status-text";
  const prompt = `Extract trip planning data from this text and return ONLY strict JSON:
{
  "trips":[{"name":"string","startDate":"YYYY-MM-DD or empty"}],
  "activities":[{"tripName":"string or empty","title":"string","day":"YYYY-MM-DD","time":"HH:MM","notes":"string","location":"string","category":"emoji"}]
}
Use emojis only from: 🏔️ 🏖️ 🍽️ 🚗 🌅 📸.
If no trip found, leave tripName empty.
Text:
${text}`;
  try {
    const raw = await callGemini(prompt, apiKey);
    const parsed = extractJsonPayload(raw);
    if (!parsed || !Array.isArray(parsed.activities)) {
      throw new Error("AI response format invalid.");
    }
    applyMagicImportPayload(parsed, magicImportMode.value);
    saveState();
    renderAll();
    magicImportStatus.textContent = `Imported ${parsed.activities.length} activities.`;
    magicImportStatus.className = "status-text ok";
  } catch (error) {
    magicImportStatus.textContent = `Import failed: ${error.message || "Unknown error"}`;
    magicImportStatus.className = "status-text warn";
  }
}

async function runTripIntelligence() {
  const apiKey = await ensureGeminiApiKey();
  if (!apiKey && !GEMINI_EDGE_FUNCTION_URL) {
    tripIntelligenceOutput.innerHTML = `<p class="meta">Gemini API key is required.</p>`;
    return;
  }
  const activeTrip = state.trips.find((trip) => trip.id === state.currentTripId);
  const activities = state.activities
    .filter((activity) => activity.tripId === state.currentTripId)
    .sort(compareActivitiesByDayThenTime)
    .map(
      (activity) =>
        `- ${activity.day} ${activity.time} ${activity.category} ${activity.title} (${activity.location || "No location"})${
          activity.notes ? ` | ${activity.notes}` : ""
        }`
    );
  if (!activities.length) {
    tripIntelligenceOutput.innerHTML = `<p class="meta">No activities to analyze for this trip yet.</p>`;
    return;
  }
  tripIntelligenceOutput.innerHTML = `<p class="meta">Analyzing itinerary...</p>`;
  const prompt = `You are a travel strategist. Analyze this itinerary and respond with JSON only:
{"summaryHeader":"string","summaryBullets":["string"],"missingHeader":"string","missingBullets":["string"]}
Trip: ${activeTrip?.name || "Unknown"}
Activities:
${activities.join("\n")}`;
  try {
    const raw = await callGemini(prompt, apiKey);
    const parsed = extractJsonPayload(raw);
    const summaryHeader = escapeHtml(parsed.summaryHeader || "High-Level Summary");
    const missingHeader = escapeHtml(parsed.missingHeader || "Major Missing Suggestion");
    const summaryBullets = Array.isArray(parsed.summaryBullets) ? parsed.summaryBullets : [];
    const missingBullets = Array.isArray(parsed.missingBullets) ? parsed.missingBullets : [];
    tripIntelligenceOutput.innerHTML = `
      <p><strong>${summaryHeader}</strong></p>
      <ul class="ai-bullet-list">${summaryBullets
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("") || "<li>No summary returned.</li>"}</ul>
      <p style="margin-top:0.5rem;"><strong>${missingHeader}</strong></p>
      <ul class="ai-bullet-list">${missingBullets
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("") || "<li>No suggestion returned.</li>"}</ul>
    `;
  } catch (error) {
    tripIntelligenceOutput.innerHTML = `<p class="meta">Unable to generate summary: ${escapeHtml(
      error.message || "Unknown error"
    )}</p>`;
  }
}

function applyMagicImportPayload(payload, mode = "current") {
  const tripByName = new Map(state.trips.map((trip) => [trip.name.toLowerCase(), trip]));
  let forcedTrip = null;
  if (mode === "new") {
    const suggestedName = String(payload?.trips?.[0]?.name || "").trim();
    const name = suggestedName || `Imported Trip ${new Date().toLocaleDateString()}`;
    forcedTrip = { id: crypto.randomUUID(), name };
    state.trips.push(forcedTrip);
    state.currentTripId = forcedTrip.id;
    tripByName.set(name.toLowerCase(), forcedTrip);
  }
  if (Array.isArray(payload.trips)) {
    payload.trips.forEach((tripInput) => {
      const name = String(tripInput?.name || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!tripByName.has(key) && mode !== "current") {
        const trip = { id: crypto.randomUUID(), name };
        state.trips.push(trip);
        tripByName.set(key, trip);
      }
    });
  }
  const activityInputs = Array.isArray(payload.activities) ? payload.activities : [];
  const needsYear = activityInputs.some((item) => !hasExplicitYear(item?.day));
  const importYear = needsYear ? promptForImportYear() : null;
  if (needsYear && !importYear) {
    throw new Error("Import cancelled: a valid year is required for dates without explicit year.");
  }

  activityInputs.forEach((item) => {
    const title = String(item?.title || "").trim();
    const day = normalizeImportDay(item?.day, importYear);
    const time = normalizeTimeText(item?.time || "");
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !time) return;
    const tripName = String(item?.tripName || "").trim().toLowerCase();
    const trip =
      forcedTrip ||
      (tripName && tripByName.get(tripName)) ||
      state.trips.find((t) => t.id === state.currentTripId) ||
      state.trips[0];
    const category = normalizeCategoryEmoji(item?.category);
    state.activities.push({
      id: crypto.randomUUID(),
      tripId: trip.id,
      title,
      day,
      time,
      category,
      notes: String(item?.notes || "").trim(),
      location: String(item?.location || "").trim(),
      address: "",
      lat: null,
      lng: null,
      taggedMembers: [],
      pinHidden: false,
      createdAt: new Date().toISOString(),
    });
  });
}

function hasExplicitYear(dayValue) {
  return /\b\d{4}\b/.test(String(dayValue || ""));
}

function promptForImportYear() {
  const currentYear = new Date().getFullYear();
  const entered = window.prompt("Some imported dates are missing a year. Enter the trip year (YYYY):", String(currentYear));
  if (!entered) return "";
  const clean = String(entered).trim();
  if (!/^\d{4}$/.test(clean)) return "";
  return clean;
}

function normalizeImportDay(dayValue, fallbackYear = "") {
  const raw = String(dayValue || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}\/\d{1,2}$/.test(raw) && fallbackYear) {
    const [month, day] = raw.split("/").map((part) => Number(part));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${fallbackYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (/^\d{1,2}-\d{1,2}$/.test(raw) && fallbackYear) {
    const [month, day] = raw.split("-").map((part) => Number(part));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${fallbackYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const withYear = !hasExplicitYear(raw) && fallbackYear ? `${raw} ${fallbackYear}` : raw;
  const normalized = normalizeDayForSort(withYear);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeCategoryEmoji(raw) {
  const allowed = new Set(["🏔️", "🏖️", "🍽️", "🚗", "🌅", "📸"]);
  const value = String(raw || "").trim();
  return allowed.has(value) ? value : "📸";
}

function normalizeTimeText(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function ensureGeminiApiKey() {
  if (GEMINI_EDGE_FUNCTION_URL) return "";
  if (geminiApiKey) return geminiApiKey;
  const cached = window.localStorage.getItem(GEMINI_API_KEY_CACHE_KEY);
  if (cached && cached.trim()) {
    geminiApiKey = cached.trim();
    return geminiApiKey;
  }
  const value = window.prompt("Enter Gemini API key (AI Studio key):");
  if (!value || !value.trim()) return "";
  geminiApiKey = value.trim();
  window.localStorage.setItem(GEMINI_API_KEY_CACHE_KEY, geminiApiKey);
  return geminiApiKey;
}

async function callGemini(prompt, apiKey) {
  if (GEMINI_EDGE_FUNCTION_URL) {
    const proxyResponse = await fetch(GEMINI_EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!proxyResponse.ok) {
      throw new Error(`Gemini proxy failed (${proxyResponse.status})`);
    }
    const proxyPayload = await proxyResponse.json();
    const proxyText = String(proxyPayload?.text || "").trim();
    if (!proxyText) throw new Error("Gemini proxy returned empty response.");
    return proxyText;
  }
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const maxAttempts = 4;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (response.ok) {
      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
      if (!text.trim()) throw new Error("Gemini returned empty response.");
      return text;
    }
    if (response.status === 503 || response.status === 429) {
      lastError = new Error(`Gemini temporarily unavailable (${response.status}).`);
      const delayMs = 450 * Math.pow(2, attempt - 1);
      await waitMs(delayMs);
      continue;
    }
    throw new Error(`Gemini request failed (${response.status})`);
  }
  throw lastError || new Error("Gemini unavailable. Please try again.");
}

function waitMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extractJsonPayload(rawText) {
  const cleaned = String(rawText || "").trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : cleaned;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) throw new Error("JSON not found in AI response.");
  return JSON.parse(candidate.slice(start, end + 1));
}
