const DEFAULT_MEMBERS = ["Anthony", "Vivian", "Jason", "Darrell"];
const SUPABASE_CONFIG_KEY = "madeira-supabase-config-v1";
const ACTIVE_USER_KEY = "madeira-active-user-v1";

let supabase = null;
let realtimeChannel = null;
let isConnected = false;
let map = null;
let mapPickMode = false;
let tempPickMarker = null;
const markerByActivityId = new Map();

let members = [...DEFAULT_MEMBERS];
let activities = [];
let comments = [];
let notificationActions = [];
let activeUser = localStorage.getItem(ACTIVE_USER_KEY) || DEFAULT_MEMBERS[0];

const memberForm = document.querySelector("#member-form");
const memberNameInput = document.querySelector("#member-name");
const memberList = document.querySelector("#member-list");
const currentUserSelect = document.querySelector("#current-user");
const notificationList = document.querySelector("#notification-list");
const supabaseForm = document.querySelector("#supabase-form");
const supabaseUrlInput = document.querySelector("#supabase-url");
const supabaseAnonInput = document.querySelector("#supabase-anon-key");
const connectionStatus = document.querySelector("#connection-status");
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

  memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isConnected) {
      setConnectionStatus("Connect Supabase first.", "warn");
      return;
    }
    const name = memberNameInput.value.trim();
    if (!name) {
      return;
    }
    if (members.includes(name)) {
      memberNameInput.value = "";
      return;
    }
    const { error } = await supabase.from("members").insert({ name });
    if (error) {
      setConnectionStatus(error.message, "warn");
      return;
    }
    memberNameInput.value = "";
    await refreshAllData();
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

    const payload = {
      title,
      day,
      time,
      notes,
      location,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      created_by: activeUser,
    };
    const { error } = await supabase.from("activities").insert(payload);
    if (error) {
      setConnectionStatus(error.message, "warn");
      return;
    }

    activityForm.reset();
    if (tempPickMarker) {
      tempPickMarker.remove();
      tempPickMarker = null;
    }
    await refreshAllData();
  });

  clearDataButton.addEventListener("click", async () => {
    if (!isConnected) {
      setConnectionStatus("Connect Supabase first.", "warn");
      return;
    }
    const accepted = window.confirm("Delete all activities, comments, and mention actions?");
    if (!accepted) {
      return;
    }
    await supabase.from("notification_actions").delete().neq("id", 0);
    await supabase.from("comments").delete().neq("id", 0);
    await supabase.from("activities").delete().neq("id", "00000000-0000-0000-0000-000000000000");
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
  await ensureDefaultMembers();
  await refreshAllData();
  subscribeRealtime();
}

function subscribeRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }
  realtimeChannel = supabase
    .channel("madeira-board-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "activities" },
      () => refreshAllData()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "comments" },
      () => refreshAllData()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "members" },
      () => refreshAllData()
    )
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

async function refreshAllData() {
  if (!isConnected) {
    return;
  }
  const [membersResult, activitiesResult, commentsResult, actionsResult] = await Promise.all([
    supabase.from("members").select("name").order("name", { ascending: true }),
    supabase.from("activities").select("*"),
    supabase.from("comments").select("*"),
    supabase.from("notification_actions").select("*"),
  ]);
  if (membersResult.error || activitiesResult.error || commentsResult.error || actionsResult.error) {
    setConnectionStatus("Refresh failed. Check schema/RLS setup.", "warn");
    return;
  }

  members = membersResult.data.map((item) => item.name);
  activities = activitiesResult.data;
  comments = commentsResult.data;
  notificationActions = actionsResult.data;

  if (!members.includes(activeUser)) {
    activeUser = members[0] || DEFAULT_MEMBERS[0];
    localStorage.setItem(ACTIVE_USER_KEY, activeUser);
  }

  renderAll();
}

function renderAll() {
  renderCurrentUserOptions();
  renderMembers();
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

function renderMembers() {
  memberList.innerHTML = "";
  (members.length ? members : DEFAULT_MEMBERS).forEach((member) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = member;
    memberList.appendChild(chip);
  });
}

function renderActivities() {
  activityList.innerHTML = "";
  if (!activities.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No activities yet. Add your first stop and attach a location pin.";
    activityList.appendChild(empty);
    return;
  }

  const sorted = [...activities].sort(compareActivitiesByDayThenTime);
  sorted.forEach((activity) => {
    const node = activityTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.activityId = activity.id;
    node.querySelector(".activity-title").textContent = activity.title;
    node.querySelector(".meta").textContent = `${formatDayDisplay(activity.day)} at ${activity.time}${
      activity.location ? ` • ${activity.location}` : ""
    }`;
    node.querySelector(".notes").textContent = activity.notes || "No notes yet.";

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

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
