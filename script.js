const DEFAULT_MEMBERS = ["Anthony", "Vivian", "Jason", "Darrell"];
const SUPABASE_CONFIG_KEY = "madeira-supabase-config-v1";
const ACTIVE_USER_KEY = "madeira-active-user-v1";
const CURRENT_TRIP_KEY = "madeira-current-trip-v1";

let supabase = null;
let realtimeChannel = null;
let isConnected = false;
let map = null;
let mapPickMode = false;
let tempPickMarker = null;
let wmsLayer = null;
const markerByActivityId = new Map();

let members = [...DEFAULT_MEMBERS];
let trips = [];
let activities = [];
let comments = [];
let votes = [];
let notificationActions = [];
let activeUser = localStorage.getItem(ACTIVE_USER_KEY) || DEFAULT_MEMBERS[0];
let currentTripId = localStorage.getItem(CURRENT_TRIP_KEY) || null;

const currentUserSelect = document.querySelector("#current-user");
const notificationList = document.querySelector("#notification-list");
const supabaseForm = document.querySelector("#supabase-form");
const supabaseUrlInput = document.querySelector("#supabase-url");
const supabaseAnonInput = document.querySelector("#supabase-anon-key");
const connectionStatus = document.querySelector("#connection-status");
const tripSelector = document.querySelector("#trip-selector");
const newTripButton = document.querySelector("#new-trip-btn");
const totalTripCost = document.querySelector("#total-trip-cost");
const costPerPerson = document.querySelector("#cost-per-person");
const wmsUrlInput = document.querySelector("#wms-url");
const wmsLayerNameInput = document.querySelector("#wms-layer-name");
const applyWmsOverlayButton = document.querySelector("#apply-wms-overlay");
const activityForm = document.querySelector("#activity-form");
const activityList = document.querySelector("#activity-list");
const clearDataButton = document.querySelector("#clear-data");
const pickOnMapButton = document.querySelector("#place-on-map");
const activityTemplate = document.querySelector("#activity-template");
const tripModal = document.querySelector("#trip-modal");
const tripForm = document.querySelector("#trip-form");
const closeTripModalButton = document.querySelector("#close-trip-modal");
const setupBanner = document.querySelector("#setup-banner");

const fields = {
  title: document.querySelector("#activity-title"),
  day: document.querySelector("#activity-day"),
  time: document.querySelector("#activity-time"),
  cost: document.querySelector("#activity-cost"),
  notes: document.querySelector("#activity-notes"),
  location: document.querySelector("#activity-location"),
  lat: document.querySelector("#activity-lat"),
  lng: document.querySelector("#activity-lng"),
};

const tripFields = {
  name: document.querySelector("#trip-name"),
  startDate: document.querySelector("#trip-start-date"),
  endDate: document.querySelector("#trip-end-date"),
  currency: document.querySelector("#trip-currency"),
};

init();

function init() {
  setupMap();
  setupHandlers();
  hydrateSupabaseConfig();
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

  currentUserSelect.addEventListener("change", () => {
    activeUser = currentUserSelect.value;
    localStorage.setItem(ACTIVE_USER_KEY, activeUser);
    renderNotifications();
  });

  tripSelector.addEventListener("change", async () => {
    currentTripId = tripSelector.value || null;
    localStorage.setItem(CURRENT_TRIP_KEY, currentTripId || "");
    syncActivityDateBounds();
    await refreshAllData();
  });

  newTripButton.addEventListener("click", () => {
    if (!tripModal) {
      return;
    }
    tripModal.classList.remove("hidden");
  });

  if (closeTripModalButton && tripModal && tripForm) {
    closeTripModalButton.addEventListener("click", () => {
      tripModal.classList.add("hidden");
      tripForm.reset();
    });
  }

  if (tripForm && tripModal) {
    tripForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!isConnected) {
        setConnectionStatus("Connect Supabase first.", "warn");
        return;
      }
      const payload = {
        name: tripFields.name.value.trim(),
        start_date: tripFields.startDate.value || null,
        end_date: tripFields.endDate.value || null,
        base_currency: tripFields.currency.value || "EUR",
      };
      if (!payload.name) {
        return;
      }
      const { data, error } = await supabase.from("trips").insert(payload).select("id").single();
      if (error) {
        setConnectionStatus(error.message, "warn");
        return;
      }
      currentTripId = data.id;
      localStorage.setItem(CURRENT_TRIP_KEY, currentTripId);
      tripModal.classList.add("hidden");
      tripForm.reset();
      await refreshAllData();
    });
  }

  applyWmsOverlayButton.addEventListener("click", () => {
    const url = wmsUrlInput.value.trim();
    const layerName = wmsLayerNameInput.value.trim();
    if (!url || !layerName) {
      return;
    }
    applyWmsOverlay(url, layerName);
  });

  supabaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = supabaseUrlInput.value.trim();
    const anonKey = supabaseAnonInput.value.trim();
    if (!url || !anonKey) {
      setConnectionStatus("Enter both Supabase URL and anon key.", "warn");
      return;
    }
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey }));
    await connectSupabase(url, anonKey);
  });

  pickOnMapButton.addEventListener("click", () => {
    mapPickMode = !mapPickMode;
    pickOnMapButton.textContent = mapPickMode ? "Click map to set point" : "Pick on Map";
  });

  activityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isConnected) {
      setConnectionStatus("Connect Supabase first.", "warn");
      return;
    }
    if (!currentTripId) {
      setConnectionStatus("Create/select a trip first.", "warn");
      return;
    }

    const payload = {
      title: fields.title.value.trim(),
      day: fields.day.value.trim(),
      time: fields.time.value.trim(),
      cost: Number(fields.cost.value || 0),
      notes: fields.notes.value.trim(),
      location: fields.location.value.trim(),
      lat: Number.isFinite(Number(fields.lat.value)) ? Number(fields.lat.value) : null,
      lng: Number.isFinite(Number(fields.lng.value)) ? Number(fields.lng.value) : null,
      created_by: activeUser,
      trip_id: currentTripId,
    };
    if (!payload.title || !payload.day || !payload.time) {
      return;
    }

    const { error } = await supabase.from("activities").insert(payload);
    if (error) {
      setConnectionStatus(error.message, "warn");
      return;
    }

    activityForm.reset();
    fields.cost.value = "0";
    if (tempPickMarker) {
      tempPickMarker.remove();
      tempPickMarker = null;
    }
    syncActivityDateBounds();
    await refreshAllData();
  });

  clearDataButton.addEventListener("click", async () => {
    if (!isConnected || !currentTripId) {
      return;
    }
    const accepted = window.confirm("Delete all activities, comments, votes, and mention actions for this trip?");
    if (!accepted) {
      return;
    }
    const ids = activities.map((item) => item.id);
    if (ids.length) {
      await supabase.from("votes").delete().in("activity_id", ids);
      await supabase.from("comments").delete().in("activity_id", ids);
      await supabase.from("activities").delete().in("id", ids);
    }
    await refreshAllData();
  });
}

function hydrateSupabaseConfig() {
  const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
  if (!raw) {
    setConnectionStatus("Not connected", "");
    renderCurrentUserOptions();
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    supabaseUrlInput.value = parsed.url || "";
    supabaseAnonInput.value = parsed.anonKey || "";
    if (parsed.url && parsed.anonKey) {
      connectSupabase(parsed.url, parsed.anonKey);
    }
  } catch {
    setConnectionStatus("Not connected", "");
    renderCurrentUserOptions();
  }
}

async function connectSupabase(url, anonKey) {
  if (!window.supabase) {
    setConnectionStatus("Supabase library failed to load.", "warn");
    return;
  }
  supabase = window.supabase.createClient(url, anonKey);
  setConnectionStatus("Connecting...", "");
  const { error } = await supabase.from("members").select("name").limit(1);
  if (error) {
    isConnected = false;
    setConnectionStatus(`Connection failed: ${error.message}`, "warn");
    return;
  }
  isConnected = true;
  setConnectionStatus("Connected to shared board.", "ok");
  clearSetupBanner();
  const migrationOk = await checkMigrationHealth();
  if (!migrationOk) {
    return;
  }
  await ensureDefaultMembers();
  await ensureDefaultTrip();
  await refreshAllData();
  subscribeRealtime();
}

async function checkMigrationHealth() {
  const checks = await Promise.all([
    supabase.from("trips").select("id").limit(1),
    supabase.from("votes").select("id").limit(1),
    supabase.from("activities").select("id,trip_id,cost").limit(1),
  ]);
  const failed = checks.find((result) => result.error);
  if (!failed) {
    clearSetupBanner();
    return true;
  }
  const message = failed.error?.message || "Schema validation failed.";
  showSetupBanner(
    `Database migration missing or incomplete. Re-run supabase-schema.sql in Supabase SQL Editor, then reconnect. (${message})`
  );
  setConnectionStatus("Migration required. Run schema SQL.", "warn");
  return false;
}

function subscribeRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }
  realtimeChannel = supabase
    .channel("madeira-board-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "members" }, () => refreshAllData())
    .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => refreshAllData())
    .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => refreshAllData())
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => refreshAllData())
    .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, () => refreshAllData())
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_actions" },
      () => refreshAllData()
    )
    .subscribe();
}

async function ensureDefaultMembers() {
  const rows = DEFAULT_MEMBERS.map((name) => ({ name }));
  await supabase.from("members").upsert(rows, { onConflict: "name", ignoreDuplicates: true });
}

async function ensureDefaultTrip() {
  const { data } = await supabase.from("trips").select("id").order("created_at", { ascending: true }).limit(1);
  if (data && data.length) {
    if (!currentTripId) {
      currentTripId = data[0].id;
      localStorage.setItem(CURRENT_TRIP_KEY, currentTripId);
    }
    return;
  }
  const { data: created } = await supabase
    .from("trips")
    .insert({ name: "Madeira", base_currency: "EUR" })
    .select("id")
    .single();
  currentTripId = created.id;
  localStorage.setItem(CURRENT_TRIP_KEY, currentTripId);
}

async function refreshAllData() {
  if (!isConnected) {
    return;
  }

  const [membersResult, tripsResult] = await Promise.all([
    supabase.from("members").select("name").order("name", { ascending: true }),
    supabase.from("trips").select("*").order("created_at", { ascending: true }),
  ]);
  if (membersResult.error || tripsResult.error) {
    setConnectionStatus("Refresh failed. Check schema/RLS setup.", "warn");
    return;
  }
  members = membersResult.data.map((item) => item.name);
  trips = tripsResult.data;

  if (!trips.length) {
    activities = [];
    comments = [];
    votes = [];
    notificationActions = [];
    renderAll();
    return;
  }

  if (!trips.some((trip) => trip.id === currentTripId)) {
    currentTripId = trips[0].id;
    localStorage.setItem(CURRENT_TRIP_KEY, currentTripId);
  }

  if (!members.includes(activeUser)) {
    activeUser = members[0] || DEFAULT_MEMBERS[0];
    localStorage.setItem(ACTIVE_USER_KEY, activeUser);
  }

  const activitiesResult = await supabase
    .from("activities")
    .select("*")
    .eq("trip_id", currentTripId);
  if (activitiesResult.error) {
    setConnectionStatus("Refresh failed. Could not load activities.", "warn");
    return;
  }
  activities = activitiesResult.data;

  const activityIds = activities.map((item) => item.id);
  if (!activityIds.length) {
    comments = [];
    votes = [];
    notificationActions = [];
    renderAll();
    return;
  }

  const [commentsResult, votesResult] = await Promise.all([
    supabase.from("comments").select("*").in("activity_id", activityIds),
    supabase.from("votes").select("*").in("activity_id", activityIds),
  ]);
  if (commentsResult.error || votesResult.error) {
    setConnectionStatus("Refresh failed. Could not load comments or votes.", "warn");
    return;
  }
  comments = commentsResult.data;
  votes = votesResult.data;

  const commentIds = comments.map((item) => item.id);
  if (!commentIds.length) {
    notificationActions = [];
  } else {
    const actionsResult = await supabase.from("notification_actions").select("*").in("comment_id", commentIds);
    if (actionsResult.error) {
      setConnectionStatus("Refresh failed. Could not load notifications.", "warn");
      return;
    }
    notificationActions = actionsResult.data;
  }

  renderAll();
}

function renderAll() {
  renderCurrentUserOptions();
  renderTripSelector();
  renderBudgetSummary();
  syncActivityDateBounds();
  renderActivities();
  renderNotifications();
  renderMapPins();
}

function renderCurrentUserOptions() {
  currentUserSelect.innerHTML = "";
  (members.length ? members : DEFAULT_MEMBERS).forEach((member) => {
    const option = document.createElement("option");
    option.value = member;
    option.textContent = member;
    if (member === activeUser) {
      option.selected = true;
    }
    currentUserSelect.appendChild(option);
  });
}

function renderTripSelector() {
  tripSelector.innerHTML = "";
  trips.forEach((trip) => {
    const option = document.createElement("option");
    option.value = trip.id;
    option.textContent = trip.name;
    if (trip.id === currentTripId) {
      option.selected = true;
    }
    tripSelector.appendChild(option);
  });
}

function renderBudgetSummary() {
  const currentTrip = getCurrentTrip();
  const currency = currentTrip?.base_currency || "EUR";
  const total = activities.reduce((sum, activity) => sum + Number(activity.cost || 0), 0);
  const perPerson = members.length ? total / members.length : total;
  totalTripCost.textContent = `${currency} ${total.toFixed(2)}`;
  costPerPerson.textContent = `${currency} ${perPerson.toFixed(2)}`;
}

function renderActivities() {
  activityList.innerHTML = "";
  if (!activities.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No activities yet for this trip.";
    activityList.appendChild(empty);
    return;
  }

  const sorted = [...activities].sort(compareActivitiesByDayThenTime);
  const currentTrip = getCurrentTrip();
  const currency = currentTrip?.base_currency || "EUR";

  sorted.forEach((activity) => {
    const node = activityTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.activityId = activity.id;
    node.querySelector(".activity-title").textContent = activity.title;
    node.querySelector(".meta").textContent = `${formatDayDisplay(activity.day)} at ${activity.time}${
      activity.location ? ` • ${activity.location}` : ""
    }`;
    node.querySelector(".cost").textContent = `Cost: ${currency} ${Number(activity.cost || 0).toFixed(2)}`;
    node.querySelector(".notes").textContent = activity.notes || "No notes yet.";

    const activityVotes = votes.filter((vote) => vote.activity_id === activity.id);
    node.querySelector(".vote-count").textContent = `${activityVotes.length} vote${activityVotes.length === 1 ? "" : "s"}`;
    const voters = activityVotes.map((vote) => vote.user_name).join(", ");
    node.querySelector(".vote-users").textContent = voters ? `Liked by: ${voters}` : "No votes yet.";

    node.querySelector(".vote-activity").addEventListener("click", async () => {
      if (!isConnected) {
        return;
      }
      const existing = activityVotes.find((vote) => vote.user_name === activeUser);
      if (existing) {
        await supabase.from("votes").delete().eq("id", existing.id);
      } else {
        await supabase.from("votes").insert({ activity_id: activity.id, user_name: activeUser });
      }
      await refreshAllData();
    });

    node.querySelector(".delete-activity").addEventListener("click", async () => {
      if (!isConnected) {
        return;
      }
      await supabase.from("activities").delete().eq("id", activity.id);
      await refreshAllData();
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
  const activityComments = comments.filter((item) => item.activity_id === activity.id);

  const mentionSet = new Set();
  activityComments.forEach((comment) => {
    extractMentions(comment.text).forEach((name) => mentionSet.add(name));
  });
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
  activityComments
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach((comment) => {
      const line = document.createElement("div");
      line.className = "comment";
      line.textContent = `${comment.author}: ${comment.text}`;
      commentList.appendChild(line);
    });

  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = commentInput.value.trim();
    if (!text || !isConnected) {
      return;
    }
    await supabase.from("comments").insert({
      activity_id: activity.id,
      author: activeUser,
      text,
    });
    commentInput.value = "";
    await refreshAllData();
  });
}

function renderNotifications() {
  notificationList.innerHTML = "";
  const unhandled = comments.filter((comment) => {
    const mentions = extractMentions(comment.text);
    if (!mentions.includes(activeUser)) {
      return false;
    }
    return !notificationActions.some(
      (action) => action.comment_id === comment.id && action.user_name === activeUser
    );
  });

  if (!unhandled.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No notifications.";
    notificationList.appendChild(empty);
    return;
  }

  unhandled
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach((comment) => {
      const activity = activities.find((item) => item.id === comment.activity_id);
      const card = document.createElement("div");
      card.className = "notification-card";
      const message = document.createElement("p");
      message.textContent = `${comment.author} tagged you on ${
        activity ? activity.title : "an activity"
      }: "${comment.text}"`;
      const button = document.createElement("button");
      button.className = "small";
      button.textContent = "Mark addressed";
      button.addEventListener("click", async () => {
        if (!isConnected) {
          return;
        }
        await supabase.from("notification_actions").upsert(
          {
            comment_id: comment.id,
            user_name: activeUser,
          },
          { onConflict: "comment_id,user_name" }
        );
        await refreshAllData();
      });
      card.appendChild(message);
      card.appendChild(button);
      notificationList.appendChild(card);
    });
}

function renderMapPins() {
  markerByActivityId.forEach((marker) => marker.remove());
  markerByActivityId.clear();
  activities.forEach((activity) => {
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

function syncActivityDateBounds() {
  const currentTrip = getCurrentTrip();
  if (!currentTrip) {
    fields.day.removeAttribute("min");
    fields.day.removeAttribute("max");
    return;
  }
  if (currentTrip.start_date) {
    fields.day.min = currentTrip.start_date;
  } else {
    fields.day.removeAttribute("min");
  }
  if (currentTrip.end_date) {
    fields.day.max = currentTrip.end_date;
  } else {
    fields.day.removeAttribute("max");
  }
}

function applyWmsOverlay(url, layerName) {
  if (wmsLayer) {
    map.removeLayer(wmsLayer);
  }
  wmsLayer = L.tileLayer.wms(url, {
    layers: layerName,
    format: "image/png",
    transparent: true,
  });
  wmsLayer.addTo(map);
}

function getCurrentTrip() {
  return trips.find((trip) => trip.id === currentTripId) || null;
}

function openDayPicker() {
  if (typeof fields.day.showPicker === "function") {
    fields.day.showPicker();
  }
}

function compareActivitiesByDayThenTime(a, b) {
  const dayCompare = normalizeDayForSort(a.day).localeCompare(normalizeDayForSort(b.day));
  if (dayCompare !== 0) {
    return dayCompare;
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

function extractMentions(text) {
  const mentionMatches = String(text || "").match(/@([A-Za-z0-9 _.-]{1,24})/g) || [];
  return mentionMatches.map((tag) => tag.slice(1).trim());
}

function setConnectionStatus(message, stateClass) {
  connectionStatus.textContent = message;
  connectionStatus.className = "status-text";
  if (stateClass) {
    connectionStatus.classList.add(stateClass);
  }
}

function showSetupBanner(message) {
  if (!setupBanner) {
    return;
  }
  setupBanner.textContent = message;
  setupBanner.classList.remove("hidden");
}

function clearSetupBanner() {
  if (!setupBanner) {
    return;
  }
  setupBanner.textContent = "";
  setupBanner.classList.add("hidden");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
