/**
 * Mausam v2.0 — Web & Mobile Application Frontend
 * Synchronizes 5-phone showcase, interactive glitch-free mobile app,
 * and desktop portal with SQLite database authentication.
 */

let STATE = null;
let CURRENT_USER = null;
let currentViewMode = "showcase"; // 'showcase' | 'single' | 'desktop'
let activeSingleTab = "home";     // 'home' | 'alerts' | 'agri' | 'profile'

// Leaflet Map Instances & Layers
let alertsLeafletMap = null;
let singleAlertsLeafletMap = null;
let desktopLeafletMap = null;

let alertsTileLayer = null;
let singleAlertsTileLayer = null;
let desktopTileLayer = null;
let currentMapStyle = 'street';

const MAP_TILE_URLS = {
  street: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};

let stormLayerGroup = null;
let singleStormLayerGroup = null;
let desktopStormLayerGroup = null;

let eventSource = null;

// ========================================================
// INITIALIZATION
// ========================================================
document.addEventListener("DOMContentLoaded", () => {
  setupViewModeButtons();
  setupLocationSelector();
  setupGpsButtons();
  setupStormToggleButton();
  setupSyncLiveButton();
  startClockUpdater();

  // Load initial backend state & auth status
  checkAuth();
  fetchState();
  connectSSE();

  // Seamlessly attempt browser GPS geolocation on startup
  if (navigator.geolocation) {
    setTimeout(() => detectUserLocation(true), 400);
  }
});

function startClockUpdater() {
  function update() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll(".sb-time").forEach(el => el.textContent = timeStr);
  }
  update();
  setInterval(update, 30000);
}

// ========================================================
// AUTHENTICATION & SQLITE DATABASE CONTROLLERS
// ========================================================
async function checkAuth() {
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    if (data.ok && data.user) {
      CURRENT_USER = data.user;
      updateAuthUI(data.user);
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }
}

function updateAuthUI(user) {
  if (!user) return;
  const name = user.full_name || user.name || "Vikram S.";
  const loc = user.location || "Bengaluru, KA";

  // Top bar user button
  const topEl = document.getElementById("topBarUserName");
  if (topEl) topEl.textContent = name;

  // Single mobile view user labels
  const sLabel = document.getElementById("sAuthStatusLabel");
  if (sLabel) sLabel.textContent = name;

  const sName = document.getElementById("sProfName");
  if (sName) sName.innerHTML = `${name} <span class="chev-small">›</span>`;

  const sLoc = document.getElementById("sProfLoc");
  if (sLoc) sLoc.textContent = `• ${loc}`;

  // Showcase profile name
  const profName = document.getElementById("profName");
  if (profName) profName.innerHTML = `${name} <span class="chev-small">›</span>`;

  // Desktop portal user card
  const dtName = document.getElementById("dtUserName");
  if (dtName) dtName.textContent = name;

  const dtLoc = document.getElementById("dtUserLoc");
  if (dtLoc) dtLoc.textContent = `${loc} • ${user.role || 'Active Member'}`;

  // Initials monogram vector avatar (no real photo)
  const words = name.trim().split(/\s+/);
  const initials = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();

  const initEls = ["profInitials", "sProfInitials", "dtUserInitials"];
  initEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });
}


function switchAuthTab(tab) {
  const btnLogin = document.getElementById("tabBtnLogin");
  const btnReg = document.getElementById("tabBtnRegister");
  const formLogin = document.getElementById("formLogin");
  const formReg = document.getElementById("formRegister");
  const errBox = document.getElementById("authErrorMsg");

  if (errBox) errBox.classList.add("hidden");

  if (tab === "login") {
    btnLogin.classList.add("active");
    btnReg.classList.remove("active");
    formLogin.classList.remove("hidden");
    formReg.classList.add("hidden");
  } else {
    btnLogin.classList.remove("active");
    btnReg.classList.add("active");
    formLogin.classList.add("hidden");
    formReg.classList.remove("hidden");
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const account = document.getElementById("loginAccountInput").value;
  const password = document.getElementById("loginPasswordInput").value;
  const errBox = document.getElementById("authErrorMsg");

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username_or_email: account, password }),
    });
    const data = await res.json();
    if (data.ok) {
      CURRENT_USER = data.user;
      updateAuthUI(data.user);
      if (data.user.personas && STATE) {
        STATE.personas = data.user.personas;
        renderAllViews();
      }
      closeModal("modalAuth");
      showToast(`👋 Welcome back, ${data.user.full_name}! Loaded from SQLite.`);
    } else {
      if (errBox) {
        errBox.textContent = data.error || "Login failed.";
        errBox.classList.remove("hidden");
      }
    }
  } catch (err) {
    if (errBox) {
      errBox.textContent = "Network error communicating with server.";
      errBox.classList.remove("hidden");
    }
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const fullName = document.getElementById("regFullNameInput").value;
  const username = document.getElementById("regUsernameInput").value;
  const email = document.getElementById("regEmailInput").value;
  const location = document.getElementById("regLocationInput").value;
  const password = document.getElementById("regPasswordInput").value;
  const errBox = document.getElementById("authErrorMsg");

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        username,
        email,
        location,
        password,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      CURRENT_USER = data.user;
      updateAuthUI(data.user);
      if (data.user.personas && STATE) {
        STATE.personas = data.user.personas;
        renderAllViews();
      }
      closeModal("modalAuth");
      showToast(`🎉 Account created for ${data.user.full_name} in SQLite DB!`);
    } else {
      if (errBox) {
        errBox.textContent = data.error || "Registration failed.";
        errBox.classList.remove("hidden");
      }
    }
  } catch (err) {
    if (errBox) {
      errBox.textContent = "Error saving to SQLite database.";
      errBox.classList.remove("hidden");
    }
  }
}

async function quickLogin(username) {
  const errBox = document.getElementById("authErrorMsg");
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username_or_email: username, password: "password123" }),
    });
    const data = await res.json();
    if (data.ok) {
      CURRENT_USER = data.user;
      updateAuthUI(data.user);
      if (data.user.personas && STATE) {
        STATE.personas = data.user.personas;
        renderAllViews();
      }
      closeModal("modalAuth");
      showToast(`⚡ Switched to demo user: ${data.user.full_name} (Loaded from SQLite)`);
    }
  } catch (err) {
    if (errBox) {
      errBox.textContent = "Could not load demo user.";
      errBox.classList.remove("hidden");
    }
  }
}

// ========================================================
// VIEW MODE CONTROLLERS
// ========================================================
function setupViewModeButtons() {
  const btnShowcase = document.getElementById("btnViewShowcase");
  const btnSingle = document.getElementById("btnViewSingle");
  const btnDesktop = document.getElementById("btnViewDesktop");

  btnShowcase.addEventListener("click", () => setViewMode("showcase"));
  btnSingle.addEventListener("click", () => setViewMode("single"));
  btnDesktop.addEventListener("click", () => setViewMode("desktop"));

  document.getElementById("btnOpenOnboarding").addEventListener("click", () => {
    openModal("modalOnboarding");
  });
}

function setViewMode(mode) {
  currentViewMode = mode;
  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === mode);
  });

  const showcase = document.getElementById("showcaseView");
  const single = document.getElementById("singleView");
  const desktop = document.getElementById("desktopView");

  showcase.classList.toggle("hidden", mode !== "showcase");
  single.classList.toggle("hidden", mode !== "single");
  desktop.classList.toggle("hidden", mode !== "desktop");

  if (mode === "single") {
    setSingleTab(activeSingleTab);
  } else if (mode === "desktop") {
    renderDesktopPortal();
    setTimeout(() => {
      initDesktopMap();
      if (desktopLeafletMap) desktopLeafletMap.invalidateSize();
    }, 100);
  } else if (mode === "showcase") {
    setTimeout(() => {
      initAlertsMap();
      if (alertsLeafletMap) alertsLeafletMap.invalidateSize();
    }, 100);
  }
}

// ========================================================
// GLITCH-FREE SINGLE MOBILE APP NAVIGATION
// ========================================================
function setSingleTab(tab) {
  activeSingleTab = tab;

  // Toggle visibility of the 4 dedicated pre-rendered screens
  const tabs = ["home", "alerts", "agri", "profile"];
  tabs.forEach(t => {
    const el = document.getElementById(`sTab_${t}`);
    if (el) el.classList.toggle("hidden", t !== tab);
  });

  // Update mobile tab bar buttons
  document.querySelectorAll("#singleView .phone-tabbar .ptab").forEach(b => {
    const isAct = b.dataset.tab === tab;
    b.className = "ptab" + (isAct ? " active" : "");
    if (isAct) {
      if (tab === "home") b.classList.add("t-blue");
      if (tab === "alerts") b.classList.add("t-red");
      if (tab === "agri") b.classList.add("t-green");
      if (tab === "profile") b.classList.add("t-purple");
    }
  });

  if (tab === "alerts") {
    setTimeout(() => {
      initSingleAlertsMap();
      if (singleAlertsLeafletMap) singleAlertsLeafletMap.invalidateSize();
    }, 60);
  }
}

function switchSingleScreen(tab) {
  setViewMode("single");
  setSingleTab(tab);
}

// ========================================================
// FETCH STATE & SSE STREAM
// ========================================================
async function fetchState() {
  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    STATE = data;
    if (data.current_user) {
      CURRENT_USER = data.current_user;
      updateAuthUI(data.current_user);
    }
    renderAllViews();
    initAlertsMap();
  } catch (err) {
    console.error("Failed to fetch state:", err);
  }
}

function connectSSE() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource("/api/stream");

  const badge = document.getElementById("streamStatus");

  eventSource.onopen = () => {
    badge.textContent = "LIVE FEED";
    document.getElementById("streamBadge").style.borderColor = "rgba(47, 174, 99, 0.3)";
  };

  eventSource.onmessage = (e) => {
    try {
      const evt = JSON.parse(e.data);
      if (evt.type === "snapshot") {
        STATE = evt;
        renderAllViews();
      } else if (evt.type === "tick") {
        if (!STATE) return;
        STATE.weather = evt.weather;
        STATE.aqi = evt.aqi;
        STATE.scores = evt.scores;
        renderAllViews();
      } else if (evt.type === "lightning") {
        STATE.lightning_active = true;
        showToast("⚡ Severe Storm Alert: Lightning detected nearby!");
        renderAlertsModule();
        renderDesktopPortal();
      } else if (evt.type === "clear") {
        STATE.lightning_active = false;
        showToast("🌤️ Convective storm cell cleared.");
        renderAlertsModule();
        renderDesktopPortal();
      } else if (evt.type === "flood_validated") {
        STATE.flood_alerts = evt.points;
        showToast("🌊 Underpass flood point validated & promoted!");
        renderAlertsModule();
        renderDesktopPortal();
      }
    } catch (err) {
      // Heartbeat or ignore
    }
  };

  eventSource.onerror = () => {
    badge.textContent = "RECONNECTING";
    document.getElementById("streamBadge").style.borderColor = "rgba(224, 65, 56, 0.4)";
  };
}

// ========================================================
// RENDER ALL SCREENS ACROSS SHOWCASE, MOBILE & DESKTOP
// ========================================================
function renderAllViews() {
  if (!STATE) return;

  // Sync location dropdown with active location
  const sel = document.getElementById("locationSelect");
  if (sel && STATE.location && STATE.location.name) {
    let found = false;
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === STATE.location.name) {
        sel.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) {
      let opt = document.getElementById("optCurrentGps");
      if (!opt) {
        opt = document.createElement("option");
        opt.id = "optCurrentGps";
        sel.insertBefore(opt, sel.firstChild);
      }
      opt.value = STATE.location.name;
      opt.dataset.lat = STATE.location.lat;
      opt.dataset.lon = STATE.location.lon;
      opt.textContent = `📍 ${STATE.location.name}`;
      sel.value = STATE.location.name;
    }
  }

  renderHomeModule();
  renderAlertsModule();
  renderOnboardingModule();
  renderAgriModule();
  renderProfileModule();
  renderDesktopPortal();
}

// 1. Home Module (Both Showcase & Single Mobile)
function renderHomeModule() {
  const w = STATE.weather;
  const a = STATE.aqi;
  const s = STATE.scores;
  const loc = STATE.location;

  // NAQI values
  ["homeNaqiVal", "sHomeNaqiVal"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = a.value;
  });

  const colors = {
    "Good": { bg: "#2fae63", text: "#fff" },
    "Satisfactory": { bg: "#f5c518", text: "#221c00" },
    "Moderate": { bg: "#f2994a", text: "#fff" },
    "Poor": { bg: "#eb5757", text: "#fff" },
    "Very Poor": { bg: "#9b51e0", text: "#fff" },
    "Severe": { bg: "#7d1c1c", text: "#fff" },
  };
  const c = colors[a.tier] || colors["Satisfactory"];

  ["homeNaqiBadge", "sHomeNaqiBadge"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = a.tier;
      el.style.background = c.bg;
      el.style.color = c.text;
    }
  });

  // Dominant pollutant driver
  const driverName = a.prominent || "PM2.5";
  ["homeNaqiDriver", "sHomeNaqiDriver"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${driverName} Dominant`;
  });

  const pointerPct = Math.min(Math.max((a.value / 200) * 80 + 10, 5), 95);
  ["homeNaqiPointer", "sHomeNaqiPointer"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.left = `${pointerPct}%`;
  });

  // Weather & Location - Exact high-precision temperature
  const tempStr = (w.temp_c !== undefined && w.temp_c !== null) 
    ? `${w.temp_c % 1 === 0 ? w.temp_c.toFixed(0) : w.temp_c.toFixed(1)}°C` 
    : "--°C";

  ["homeTemp", "sHomeTemp"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = tempStr;
  });

  const condIco = w.condition_icon || "☁️";
  ["homeWeatherIcon", "sHomeWeatherIcon"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = condIco;
  });

  const condDesc = w.condition_desc || "Partly Cloudy";
  const feelsLike = (w.feels_like_c !== undefined) ? w.feels_like_c : w.temp_c;
  const feelsStr = (feelsLike !== undefined && feelsLike !== null) 
    ? `${feelsLike % 1 === 0 ? feelsLike.toFixed(0) : feelsLike.toFixed(1)}°C` 
    : "";
  const condLine = `${condDesc} • Feels like ${feelsStr}`;
  ["homeWeatherCond", "sHomeWeatherCond"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = condLine;
  });

  ["homeLoc", "sHomeLoc"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = loc.name;
  });

  // Health Metrics
  const uvText = `${w.uv}, ${w.uv <= 2 ? 'Low' : (w.uv <= 5 ? 'Moderate' : 'High')}`;
  ["homeUv", "sHomeUv"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = uvText;
  });

  ["homeHumidity", "sHomeHumidity"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${w.rh_pct}%`;
  });

  if (s.pollen) {
    ["homePollen", "sHomePollen"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = s.pollen.level;
    });
  }

  // Daily Activity Gauge (Concentric Arc Dynamic Fill)
  const scoreVal = parseFloat(s.activity_score_10) || 3.9;
  ["homeActivityScore", "sHomeActivityScore"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${scoreVal.toFixed(scoreVal % 1 === 0 ? 0 : 1)}/10`;
  });

  const totalLen = 113.1;
  const pct = Math.min(Math.max(scoreVal / 10, 0), 1);
  const targetOffset = totalLen * (1 - pct);
  ["homeSpeedoFill", "sHomeSpeedoFill"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.strokeDashoffset = targetOffset.toFixed(1);
  });

  ["homeBestTime", "sHomeBestTime"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `Best time for run: ${s.best_run_time}`;
  });

  // Commute Visibility
  ["homeVisibility", "sHomeVisibility"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = s.commute_visibility_desc;
  });

  // Nowcast
  if (s.nowcast) {
    ["homeNowcast", "sHomeNowcast"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = s.nowcast.text;
    });
  }
}

// 2. Alerts Module
function renderAlertsModule() {
  const ld = STATE.lightning_details || {};
  const isStorm = STATE.lightning_active;

  // Header storm button
  const stormBtnText = document.getElementById("stormBtnText");
  if (stormBtnText) {
    stormBtnText.textContent = isStorm ? "Storm: Active" : "Storm: Cleared";
  }

  // Warning Banner Titles
  ["alertsWarningTitle", "sAlertsWarningTitle"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = isStorm ? ld.warning_title : "STATUS: NORMAL CONDITIONS";
  });

  document.querySelectorAll(".alert-banner-red").forEach(bannerEl => {
    bannerEl.style.background = isStorm ? "var(--red-primary)" : "#2fae63";
    bannerEl.style.boxShadow = isStorm ? "0 4px 12px rgba(224, 65, 56, 0.35)" : "0 4px 12px rgba(47, 174, 99, 0.35)";
  });

  // Lightning Proximity Time
  ["alertsLightningTime", "sAlertsLightningTime"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = isStorm ? `${ld.proximity_mins} mins` : "None (< 30km)";
      el.style.color = isStorm ? "var(--red-primary)" : "var(--green-primary)";
    }
  });

  // Waterlogging
  const hasFlood = STATE.flood_alerts && STATE.flood_alerts.length > 0;
  const floodText = hasFlood ? (STATE.flood_alerts[0].location_name || "Active (Underpass 1)") : "No Active Waterlogging";
  ["alertsWaterlogging", "sAlertsWaterlogging"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = floodText;
      el.style.color = hasFlood ? "var(--red-primary)" : "var(--green-primary)";
    }
  });

  // Shelter
  ["alertsShelter", "sAlertsShelter"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = isStorm ? "Immediate!" : "Safe outdoors";
      el.style.color = isStorm ? "var(--red-primary)" : "var(--green-primary)";
    }
  });

  updateStormMapOverlays();
}

// 3. Onboarding Module
function renderOnboardingModule() {
  const personas = STATE.personas || {};
  for (const [key, active] of Object.entries(personas)) {
    const toggle1 = document.getElementById(`obToggle_${key}`);
    if (toggle1) toggle1.className = `ob-toggle ${active ? "toggle-on" : "toggle-off"}`;

    const toggle2 = document.getElementById(`mObToggle_${key}`);
    if (toggle2) toggle2.className = `ob-toggle ${active ? "toggle-on" : "toggle-off"}`;
  }
}

// 4. Agri Module
function renderAgriModule() {
  const agri = STATE.agri || {};
  ["agriLocMain", "sAgriLocMain"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = agri.location || "Manduri";
  });
  ["agriLocSub", "sAgriLocSub"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = agri.sub_location || "Bengaluru Rural";
  });
}

// 5. Profile Module
function renderProfileModule() {
  const personas = STATE.personas || {};
  for (const [key, active] of Object.entries(personas)) {
    // Showcase toggles
    const t1 = document.getElementById(`profToggle_${key}`);
    if (t1) t1.className = `pref-toggle ${active ? "toggle-on" : "toggle-off"}`;

    // Single mobile toggles
    const t2 = document.getElementById(`sProfToggle_${key}`);
    if (t2) t2.className = `pref-toggle ${active ? "toggle-on" : "toggle-off"}`;

    // Descriptions
    let desc = active ? "Active" : "Inactive";
    if (key === "HEALTH") desc = active ? "Active, Pollen Focus" : "Inactive";
    if (key === "FITNESS") desc = active ? "Active, Run Safe" : "Inactive";
    if (key === "COMMUTER") desc = active ? "Home-Work Route defined" : "Inactive";
    if (key === "AGRIMET") desc = active ? "Farm geo-fence set" : "Inactive";

    const s1 = document.getElementById(`pSub_${key}`);
    if (s1) s1.textContent = desc;

    const s2 = document.getElementById(`sPSub_${key}`);
    if (s2) s2.textContent = desc;
  }

  // Calibration Microphone
  const cal = STATE.calibration || {};
  const isMic = !!cal.acoustic_rain_gauge;
  ["calToggle_mic", "sCalToggle_mic"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = `pref-toggle ${isMic ? "toggle-on" : "toggle-off"}`;
  });

  const micText = isMic ? "(Microphone: Active)" : "(Microphone: Muted)";
  ["calMicText", "sCalMicText"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = micText;
  });
}

// 6. Desktop Portal View (Interactive & Live Synced)
function renderDesktopPortal() {
  if (!STATE) return;
  const w = STATE.weather;
  const a = STATE.aqi;
  const s = STATE.scores;
  const loc = STATE.location;
  const isStorm = STATE.lightning_active;

  const dTemp = document.getElementById("dtTemp");
  if (dTemp) {
    dTemp.textContent = (w.temp_c !== undefined && w.temp_c !== null)
      ? `${w.temp_c % 1 === 0 ? w.temp_c.toFixed(0) : w.temp_c.toFixed(1)}°C`
      : "--°C";
  }

  const dCond = document.getElementById("dtWeatherCond");
  if (dCond) {
    const condDesc = w.condition_desc || "Partly Cloudy";
    const feelsLike = (w.feels_like_c !== undefined) ? w.feels_like_c : w.temp_c;
    const feelsStr = (feelsLike !== undefined && feelsLike !== null)
      ? `${feelsLike % 1 === 0 ? feelsLike.toFixed(0) : feelsLike.toFixed(1)}°C`
      : "";
    dCond.textContent = `${condDesc} • Feels like ${feelsStr}`;
  }

  const dArt = document.getElementById("dtWeatherIcon");
  if (dArt) dArt.textContent = w.condition_icon || "☁️";

  const dLoc = document.getElementById("dtLoc");
  if (dLoc) dLoc.textContent = loc.name;

  const dHum = document.getElementById("dtHumidity");
  if (dHum) dHum.textContent = `${w.rh_pct}%`;

  const dWind = document.getElementById("dtWind");
  if (dWind) {
    const dirStr = w.wind_dir ? ` ${w.wind_dir}` : "";
    dWind.textContent = `${w.wind_kph.toFixed(1)} km/h${dirStr}`;
  }

  const dVis = document.getElementById("dtVis");
  if (dVis) dVis.textContent = `${(w.visibility_m/1000).toFixed(1)} km`;

  const dUv = document.getElementById("dtUv");
  if (dUv) dUv.textContent = `${w.uv} (${w.uv <= 5 ? 'Mod' : 'High'})`;

  const dNaqi = document.getElementById("dtNaqiVal");
  if (dNaqi) dNaqi.textContent = a.value;

  const dBadge = document.getElementById("dtNaqiBadge");
  if (dBadge) {
    dBadge.textContent = a.tier;
    const colors = {
      "Good": "#2fae63", "Satisfactory": "#f5c518", "Moderate": "#f2994a",
      "Poor": "#eb5757", "Very Poor": "#9b51e0", "Severe": "#7d1c1c"
    };
    dBadge.style.background = colors[a.tier] || "#f5c518";
  }

  const dDriver = document.getElementById("dtNaqiDriver");
  if (dDriver) {
    const rawVal = a.raw_pollutants && a.prominent_key && a.raw_pollutants[a.prominent_key];
    const rawStr = rawVal ? ` (${rawVal} µg/m³)` : "";
    dDriver.textContent = `Primary driver: ${a.prominent || 'PM2.5'}${rawStr}`;
  }

  const dScore = document.getElementById("dtActivityScore");
  if (dScore) dScore.textContent = `${s.activity_score_10} / 10`;

  // Desktop Storm Toggle Button
  const dtStormBtn = document.getElementById("dtStormToggleBtn");
  if (dtStormBtn) {
    dtStormBtn.textContent = isStorm ? "⚡ Convective Storm: Active" : "🌤️ Storm Cell: Cleared";
    dtStormBtn.style.background = isStorm ? "#c82820" : "#2fae63";
  }

  // Hazards
  const dLt = document.getElementById("dtLightning");
  if (dLt) {
    dLt.textContent = isStorm ? "6 mins (4.2 km)" : "Clear (< 30 km)";
    dLt.style.color = isStorm ? "var(--red-primary)" : "var(--green-primary)";
  }

  const dWl = document.getElementById("dtWaterlogging");
  if (dWl) {
    const hasFlood = STATE.flood_alerts && STATE.flood_alerts.length > 0;
    dWl.textContent = hasFlood ? "Active (Agara Underpass 1)" : "None";
    dWl.style.color = hasFlood ? "var(--red-primary)" : "var(--green-primary)";
  }

  const dSh = document.getElementById("dtShelter");
  if (dSh) {
    dSh.textContent = isStorm ? "Immediate Enclosure Recommended" : "Safe";
    dSh.style.color = isStorm ? "var(--red-primary)" : "var(--green-primary)";
  }

  // Context profile buttons in Desktop Portal
  const personas = STATE.personas || {};
  for (const [key, active] of Object.entries(personas)) {
    const btn = document.getElementById(`dtBtn_${key}`);
    if (btn) {
      btn.className = `dt-toggle-btn ${active ? "active" : ""}`;
      btn.textContent = active ? "Active" : "Inactive";
    }
  }

  // Calibration Microphone in Desktop Portal
  const cal = STATE.calibration || {};
  const calMicBtn = document.getElementById("dtBtn_CAL_MIC");
  if (calMicBtn) {
    const isMic = !!cal.acoustic_rain_gauge;
    calMicBtn.className = `dt-toggle-btn ${isMic ? "active" : ""}`;
    calMicBtn.textContent = isMic ? "Active" : "Inactive";
  }

  // User card in desktop
  if (CURRENT_USER) {
    updateAuthUI(CURRENT_USER);
  }
}

// ========================================================
// LEAFLET MAPS INITIALIZATION & RADAR CONVECTIVE CELLS
// ========================================================
function initAlertsMap() {
  const mapContainer = document.getElementById("alertsMapLeaflet");
  if (!mapContainer || alertsLeafletMap) return;

  alertsLeafletMap = L.map('alertsMapLeaflet', {
    center: [12.9716, 77.5946],
    zoom: 11,
    zoomControl: false,
    scrollWheelZoom: true,
    dragging: true,
    doubleClickZoom: true,
    attributionControl: false,
  });

  alertsTileLayer = L.tileLayer(MAP_TILE_URLS[currentMapStyle], {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
  }).addTo(alertsLeafletMap);

  stormLayerGroup = L.layerGroup().addTo(alertsLeafletMap);
  updateStormMapOverlays();
}

function initSingleAlertsMap() {
  const mapContainer = document.getElementById("singleAlertsMapLeaflet");
  if (!mapContainer || singleAlertsLeafletMap) return;

  singleAlertsLeafletMap = L.map('singleAlertsMapLeaflet', {
    center: [12.9716, 77.5946],
    zoom: 11,
    zoomControl: false,
    scrollWheelZoom: true,
    dragging: true,
    doubleClickZoom: true,
    attributionControl: false,
  });

  singleAlertsTileLayer = L.tileLayer(MAP_TILE_URLS[currentMapStyle], {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
  }).addTo(singleAlertsLeafletMap);

  singleStormLayerGroup = L.layerGroup().addTo(singleAlertsLeafletMap);
  updateStormMapOverlays();
}

function initDesktopMap() {
  const mapContainer = document.getElementById("desktopMapLeaflet");
  if (!mapContainer || desktopLeafletMap) return;

  desktopLeafletMap = L.map('desktopMapLeaflet', {
    center: [12.9716, 77.5946],
    zoom: 11,
    zoomControl: true,
    scrollWheelZoom: true,
    dragging: true,
    doubleClickZoom: true,
    attributionControl: false,
  });

  desktopTileLayer = L.tileLayer(MAP_TILE_URLS[currentMapStyle], {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
  }).addTo(desktopLeafletMap);

  desktopStormLayerGroup = L.layerGroup().addTo(desktopLeafletMap);
  updateStormMapOverlays();
}

function toggleMapStyle() {
  currentMapStyle = (currentMapStyle === 'street') ? 'satellite' : 'street';
  const newUrl = MAP_TILE_URLS[currentMapStyle];

  if (desktopTileLayer) desktopTileLayer.setUrl(newUrl);
  if (alertsTileLayer) alertsTileLayer.setUrl(newUrl);
  if (singleAlertsTileLayer) singleAlertsTileLayer.setUrl(newUrl);

  const btn = document.getElementById("btnToggleMapStyle");
  if (btn) btn.textContent = (currentMapStyle === 'street') ? '🛰️ Satellite Radar' : '🗺️ Street Radar';
  showToast(currentMapStyle === 'street' ? '🗺️ Basemap: High-Res Street Radar' : '🛰️ Basemap: Satellite Doppler Imagery');
}

function updateStormMapOverlays() {
  const isStorm = STATE ? STATE.lightning_active : true;
  const centerLat = 12.9716;
  const centerLon = 77.5946;

  const targetLayers = [stormLayerGroup, singleStormLayerGroup, desktopStormLayerGroup];

  targetLayers.forEach(layer => {
    if (!layer) return;
    layer.clearLayers();

    // 1. Center Radar Station Beacon
    const centerIcon = L.divIcon({
      className: 'radar-station-marker',
      html: '<div class="radar-station-badge"><span class="radar-ping"></span><span class="radar-ico">📡</span> DWR Bengaluru Central</div>',
      iconSize: [160, 26],
      iconAnchor: [80, 13],
    });
    L.marker([centerLat, centerLon], { icon: centerIcon, zIndexOffset: 1000 }).addTo(layer);

    // 2. Animated Rotating Doppler Radar Sweep Cone
    const sweepIcon = L.divIcon({
      className: 'radar-sweep-marker',
      html: '<div class="radar-sweep-cone"></div>',
      iconSize: [280, 280],
      iconAnchor: [140, 140],
    });
    L.marker([centerLat, centerLon], { icon: sweepIcon, interactive: false, zIndexOffset: 200 }).addTo(layer);

    // 3. Always Visible Surveillance Radar Range Rings
    L.circle([centerLat, centerLon], {
      radius: 25000,
      color: '#3b7fe0',
      weight: 1.5,
      dashArray: '5, 5',
      fillColor: '#3b7fe0',
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(layer);

    L.circle([centerLat, centerLon], {
      radius: 12500,
      color: isStorm ? '#e03228' : '#2fae63',
      weight: 2,
      dashArray: isStorm ? null : '4, 4',
      fillColor: isStorm ? '#e03228' : '#2fae63',
      fillOpacity: isStorm ? 0.22 : 0.07,
      interactive: false,
    }).addTo(layer);

    // 4. City District Labels
    const mkSubLabel = (lat, lon, text) => {
      const icon = L.divIcon({
        className: 'custom-sub-marker',
        html: `<div style="font-size:9.5px;font-weight:700;color:#1e2433;background:rgba(255,255,255,0.9);padding:1px 6px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.2);white-space:nowrap;">${text}</div>`,
        iconSize: [70, 18],
        iconAnchor: [35, 9],
      });
      L.marker([lat, lon], { icon }).addTo(layer);
    };
    mkSubLabel(13.100, 77.596, "Yelahanka");
    mkSubLabel(12.969, 77.749, "Whitefield");
    mkSubLabel(12.845, 77.660, "Electronic City");

    if (isStorm) {
      // Convective core thunderstorm cell (High dBZ Reflectivity)
      L.circle([centerLat, centerLon], {
        radius: 6500,
        color: '#ff9900',
        weight: 2,
        fillColor: '#ffcc00',
        fillOpacity: 0.45,
        interactive: false,
      }).addTo(layer);

      // Severe precipitation core (60+ dBZ)
      L.circle([centerLat + 0.012, centerLon - 0.01], {
        radius: 3200,
        color: '#c82820',
        weight: 2,
        fillColor: '#e03228',
        fillOpacity: 0.6,
        interactive: false,
      }).addTo(layer);

      // Lightning Strikes with pulse animation
      const mkStrike = (lat, lon, delay, title) => {
        return L.marker([lat, lon], {
          icon: L.divIcon({
            className: 'strike-marker',
            html: `<div title="${title}" style="font-size:24px;filter:drop-shadow(0 0 8px #ffe600);animation:strikePulse ${delay}s infinite;cursor:pointer;">⚡</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
          zIndexOffset: 900,
        }).bindPopup(`<strong>⚡ Severe Cloud-to-Ground Strike</strong><br>${title}<br>Distance: 4.2 km`);
      };
      mkStrike(12.985, 77.585, 1.2, "Shivajinagar Strike").addTo(layer);
      mkStrike(12.945, 77.635, 1.5, "Koramangala Strike").addTo(layer);
      mkStrike(12.970, 77.620, 0.9, "MG Road Strike").addTo(layer);
    } else {
      // Scattered light precipitation echoes (Clear conditions)
      L.circle([centerLat - 0.02, centerLon + 0.04], {
        radius: 4000,
        color: '#2fae63',
        weight: 1,
        fillColor: '#63e293',
        fillOpacity: 0.18,
        interactive: false,
      }).addTo(layer);
    }

    // Flood hazards / Waterlogging clusters
    if (STATE && STATE.flood_alerts) {
      STATE.flood_alerts.forEach(f => {
        const floodIcon = L.divIcon({
          className: 'flood-marker',
          html: '<div style="background:#e04138;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:2px solid #fff;cursor:pointer;" title="Waterlogged Roadway">🌊</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([f.lat, f.lon], { icon: floodIcon, zIndexOffset: 800 })
          .bindPopup(`<strong>🌊 Waterlogging Hazard</strong><br>${f.desc || 'Agara Underpass 1'}<br>Estimated Depth: ${f.depth || '25-30 cm'}`)
          .addTo(layer);
      });
    }

    // Live User GPS / Monitored Location Beacon Marker
    if (STATE && STATE.location) {
      const uLat = STATE.location.lat;
      const uLon = STATE.location.lon;
      const uName = STATE.location.name || "Live Location";
      const uTemp = (STATE.weather && STATE.weather.temp_c !== undefined) ? `${STATE.weather.temp_c}°C` : "";
      const uAqi = (STATE.aqi && STATE.aqi.value !== undefined) ? ` • NAQI ${STATE.aqi.value} (${STATE.aqi.tier})` : "";

      const userGpsIcon = L.divIcon({
        className: 'user-gps-marker',
        html: `<div class="user-gps-beacon"><span class="gps-pulse"></span><span class="gps-pin-dot">📍</span></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      L.marker([uLat, uLon], { icon: userGpsIcon, zIndexOffset: 1200 })
        .bindPopup(`<strong>📍 Monitored Location</strong><br>${uName}<br>Live: ${uTemp}${uAqi}`)
        .addTo(layer);
    }
  });
}

function recenterAlertsMap() {
  if (alertsLeafletMap) {
    const lat = (STATE && STATE.location) ? STATE.location.lat : 12.9716;
    const lon = (STATE && STATE.location) ? STATE.location.lon : 77.5946;
    alertsLeafletMap.flyTo([lat, lon], 12, { duration: 1.0 });
    showToast(`📍 Map recentered on ${STATE && STATE.location ? STATE.location.name : 'Radar'}`);
  }
}

function recenterSingleMap() {
  if (singleAlertsLeafletMap) {
    const lat = (STATE && STATE.location) ? STATE.location.lat : 12.9716;
    const lon = (STATE && STATE.location) ? STATE.location.lon : 77.5946;
    singleAlertsLeafletMap.flyTo([lat, lon], 12, { duration: 1.0 });
    showToast(`📍 Mobile radar map recentered on ${STATE && STATE.location ? STATE.location.name : 'Radar'}`);
  }
}

function recenterDesktopMap() {
  if (desktopLeafletMap) {
    const lat = (STATE && STATE.location) ? STATE.location.lat : 12.9716;
    const lon = (STATE && STATE.location) ? STATE.location.lon : 77.5946;
    desktopLeafletMap.flyTo([lat, lon], 12, { duration: 1.0 });
    showToast(`📍 Desktop radar map recentered on ${STATE && STATE.location ? STATE.location.name : 'Radar'}`);
  }
}

// ========================================================
// USER ACTIONS, INTERACTIVE TOGGLES & BACKEND SYNC
// ========================================================
async function togglePersonaKey(key, el) {
  if (!STATE) return;
  const isCurrentlyOn = STATE.personas[key];
  const newState = !isCurrentlyOn;

  // Optimistic UI update across all 3 views
  STATE.personas[key] = newState;
  renderAllViews();

  try {
    const res = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: key, active: newState }),
    });
    showToast(`Persona ${key} set to ${newState ? "Active" : "Inactive"} (Saved in DB)`);
  } catch (err) {
    console.error("Failed to toggle persona:", err);
  }
}

async function toggleOnboardPersona(key) {
  togglePersonaKey(key);
}

async function completeOnboarding() {
  showToast("🎉 Personalized Journey Started! Preferences saved in DB.");
  closeModal("modalOnboarding");
  switchSingleScreen("home");
}

async function saveOnboardingModal() {
  closeModal("modalOnboarding");
  showToast("✅ Persona preferences saved successfully.");
}

async function toggleAcousticRainGauge(el) {
  if (!STATE) return;
  const cal = STATE.calibration;
  const newState = !cal.acoustic_rain_gauge;
  cal.acoustic_rain_gauge = newState;
  renderAllViews();

  try {
    await fetch("/api/calibration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "acoustic_rain_gauge", active: newState }),
    });
    showToast(`Acoustic Rain Gauge ${newState ? "Activated (Listening)" : "Muted"}`);
  } catch (err) {
    console.error("Failed to update calibration:", err);
  }
}

function setupStormToggleButton() {
  const btn = document.getElementById("btnToggleStorm");
  btn.addEventListener("click", toggleStorm);
}

async function toggleStorm() {
  if (!STATE) return;
  const next = !STATE.lightning_active;
  try {
    const res = await fetch("/api/trigger_storm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    const data = await res.json();
    STATE.lightning_active = data.lightning_active;
    renderAllViews();
    showToast(next ? "⚡ RED CONVECTIVE STORM TRIGGERED" : "🌤️ Convective Storm Dissipated");
  } catch (err) {
    console.error("Failed to toggle storm:", err);
  }
}

let isGpsTracking = false;
let gpsWatchId = null;
let liveUpdateTimer = null;

function setupGpsButtons() {
  const btnDetect = document.getElementById("btnDetectGps");
  if (btnDetect) {
    btnDetect.addEventListener("click", () => detectUserLocation(false));
  }

  const btnTrack = document.getElementById("btnTrackGps");
  if (btnTrack) {
    btnTrack.addEventListener("click", toggleLiveLocationTracking);
  }
}

async function detectUserLocation(silent = false) {
  if (!navigator.geolocation) {
    showToast("⚠️ Geolocation is not supported by your browser.");
    return;
  }

  if (!silent) {
    showToast("📍 Requesting high-precision GPS position from device...");
  }

  const btnDetect = document.getElementById("btnDetectGps");
  if (btnDetect) btnDetect.classList.add("loading-pulse");

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      if (btnDetect) btnDetect.classList.remove("loading-pulse");
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;

      if (!silent) {
        showToast(`📍 GPS lock: ${lat.toFixed(4)}°, ${lon.toFixed(4)}° (±${Math.round(accuracy)}m). Geocoding...`);
      }

      await applyNewCoordinates(lat, lon, accuracy);
    },
    (err) => {
      if (btnDetect) btnDetect.classList.remove("loading-pulse");
      console.warn("Geolocation error:", err);
      let msg = "Could not acquire location.";
      if (err.code === 1) msg = "Location permission denied. Please allow location access in your browser.";
      else if (err.code === 2) msg = "GPS position unavailable. Check device location services.";
      else if (err.code === 3) msg = "Location request timed out.";
      showToast(`⚠️ ${msg}`);
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    }
  );
}

async function applyNewCoordinates(lat, lon, accuracy = null) {
  try {
    // 1. Reverse geocode via backend
    let locName = `GPS Location (${lat.toFixed(3)}°, ${lon.toFixed(3)}°)`;
    let district = "Local District";

    try {
      const geoRes = await fetch(`/api/reverse_geocode?lat=${lat}&lon=${lon}`);
      const geoData = await geoRes.json();
      if (geoData.ok && geoData.name) {
        locName = geoData.name;
        district = geoData.district || district;
      }
    } catch (e) {
      console.warn("Reverse geocode fallback:", e);
    }

    // 2. Add or update option in dropdown
    const sel = document.getElementById("locationSelect");
    if (sel) {
      let opt = document.getElementById("optCurrentGps");
      if (!opt) {
        opt = document.createElement("option");
        opt.id = "optCurrentGps";
        sel.insertBefore(opt, sel.firstChild);
      }
      opt.value = locName;
      opt.dataset.lat = lat;
      opt.dataset.lon = lon;
      opt.textContent = `📍 ${locName}`;
      sel.value = locName;
    }

    // 3. Update backend state & pull real-time weather & NAQI
    const res = await fetch("/api/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: locName, lat, lon, district, fetch_live: true }),
    });
    const data = await res.json();
    if (data.ok && data.state) {
      STATE = data.state;
      renderAllViews();
    } else {
      await syncLiveWeather(lat, lon);
    }

    // 4. Smoothly Pan Leaflet Maps
    [alertsLeafletMap, singleAlertsLeafletMap, desktopLeafletMap].forEach(m => {
      if (m) m.flyTo([lat, lon], 12, { duration: 1.2 });
    });

    const accStr = accuracy ? ` (±${Math.round(accuracy)}m)` : "";
    showToast(`✅ Live weather & NAQI updated for ${locName}${accStr}`);
  } catch (err) {
    console.error("Failed to apply new coordinates:", err);
    showToast("⚠️ Could not synchronize live weather for your location.");
  }
}

function toggleLiveLocationTracking() {
  const btnTrack = document.getElementById("btnTrackGps");
  const txt = document.getElementById("trackGpsText");

  if (!navigator.geolocation) {
    showToast("⚠️ Geolocation not supported in this browser.");
    return;
  }

  isGpsTracking = !isGpsTracking;

  if (isGpsTracking) {
    // Start tracking
    if (btnTrack) btnTrack.classList.add("tracking-active");
    if (txt) txt.textContent = "Live GPS: ON";
    showToast("🛰️ Continuous Live GPS Tracking & Weather Updates: ACTIVE");

    detectUserLocation(true);

    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        // Check if moved significantly (> 150m)
        if (STATE && STATE.location) {
          const dLat = Math.abs(lat - STATE.location.lat);
          const dLon = Math.abs(lon - STATE.location.lon);
          if (dLat > 0.0015 || dLon > 0.0015) {
            applyNewCoordinates(lat, lon, pos.coords.accuracy);
          }
        }
      },
      (err) => console.warn("Watch position error:", err),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
    );

    // Periodic weather refresh every 60s while tracking
    if (liveUpdateTimer) clearInterval(liveUpdateTimer);
    liveUpdateTimer = setInterval(() => {
      if (isGpsTracking && STATE && STATE.location) {
        syncLiveWeather(STATE.location.lat, STATE.location.lon);
      }
    }, 60000);
  } else {
    // Stop tracking
    if (gpsWatchId !== null) {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
    }
    if (liveUpdateTimer) {
      clearInterval(liveUpdateTimer);
      liveUpdateTimer = null;
    }
    if (btnTrack) btnTrack.classList.remove("tracking-active");
    if (txt) txt.textContent = "Live GPS: OFF";
    showToast("⏸️ Live GPS Tracking Paused");
  }
}

async function syncLiveWeather(lat, lon) {
  const targetLat = lat !== undefined ? lat : (STATE ? STATE.location.lat : 12.933);
  const targetLon = lon !== undefined ? lon : (STATE ? STATE.location.lon : 77.625);

  try {
    const res = await fetch(`/api/weather/live?lat=${targetLat}&lon=${targetLon}`);
    const data = await res.json();
    if (data.ok && data.state) {
      STATE = data.state;
      renderAllViews();
    }
  } catch (err) {
    console.error("Live sync failed:", err);
  }
}

function setupLocationSelector() {
  const sel = document.getElementById("locationSelect");
  if (!sel) return;
  sel.addEventListener("change", async () => {
    const opt = sel.options[sel.selectedIndex];
    const name = opt.value;
    const lat = parseFloat(opt.dataset.lat);
    const lon = parseFloat(opt.dataset.lon);

    showToast(`📍 Loading live Open-Meteo & NAQI for ${name}...`);

    try {
      const res = await fetch("/api/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lat, lon, fetch_live: true }),
      });
      const data = await res.json();
      if (data.ok && data.state) {
        STATE = data.state;
      } else {
        STATE.location = { name, lat, lon };
      }
      renderAllViews();

      if (alertsLeafletMap) alertsLeafletMap.flyTo([lat, lon], 12, { duration: 1.0 });
      if (singleAlertsLeafletMap) singleAlertsLeafletMap.flyTo([lat, lon], 12, { duration: 1.0 });
      if (desktopLeafletMap) desktopLeafletMap.flyTo([lat, lon], 12, { duration: 1.0 });

      showToast(`📍 Switched to ${name} — live weather synced`);
    } catch (err) {
      console.error("Failed to change location:", err);
    }
  });
}

function setupSyncLiveButton() {
  const btn = document.getElementById("btnSyncLive");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    showToast("🔄 Syncing live Open-Meteo & CAMS air quality...");
    const lat = (STATE && STATE.location) ? STATE.location.lat : 12.933;
    const lon = (STATE && STATE.location) ? STATE.location.lon : 77.625;
    try {
      const res = await fetch(`/api/weather/live?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data.ok && data.state) {
        STATE = data.state;
        renderAllViews();
        showToast(data.live ? "✅ Real-time Open-Meteo & CAMS data synchronized!" : "ℹ️ Live sync complete");
      }
    } catch (err) {
      showToast("⚠️ Could not reach live weather API — using simulated feeds");
    }
  });
}

function openNaqiBreakdownModal() {
  if (!STATE || !STATE.aqi) return;
  const a = STATE.aqi;
  const raw = a.raw_pollutants || {};
  const subs = a.sub_indices || {};

  const scoreEl = document.getElementById("nbModalScore");
  if (scoreEl) scoreEl.textContent = a.value;

  const badgeEl = document.getElementById("nbModalBadge");
  if (badgeEl) {
    badgeEl.textContent = a.tier;
    const colors = {
      "Good": { bg: "#2fae63", text: "#fff" },
      "Satisfactory": { bg: "#f5c518", text: "#221c00" },
      "Moderate": { bg: "#f2994a", text: "#fff" },
      "Poor": { bg: "#eb5757", text: "#fff" },
      "Very Poor": { bg: "#9b51e0", text: "#fff" },
      "Severe": { bg: "#7d1c1c", text: "#fff" },
    };
    const c = colors[a.tier] || colors["Good"];
    badgeEl.style.background = c.bg;
    badgeEl.style.color = c.text;
  }

  const driverEl = document.getElementById("nbModalDriver");
  if (driverEl) driverEl.textContent = a.prominent || "PM2.5";

  const advEl = document.getElementById("nbModalAdvisory");
  if (advEl) advEl.textContent = a.advisory || "Air quality is considered satisfactory.";

  function updatePollutant(key, rawVal, unit, maxScale) {
    const rawEl = document.getElementById(`nbVal_${key}`);
    if (rawEl) rawEl.textContent = rawVal !== undefined ? `${rawVal} ${unit}` : "--";

    const subVal = subs[key] !== undefined ? Math.round(subs[key]) : (rawVal || 0);
    const subEl = document.getElementById(`nbSub_${key}`);
    if (subEl) subEl.textContent = subVal;

    const barEl = document.getElementById(`nbBar_${key}`);
    if (barEl) {
      const pct = Math.min(Math.max((subVal / maxScale) * 100, 4), 100);
      barEl.style.width = `${pct}%`;
      let barColor = "#2fae63";
      if (subVal > 50) barColor = "#f5c518";
      if (subVal > 100) barColor = "#f2994a";
      if (subVal > 200) barColor = "#eb5757";
      if (subVal > 300) barColor = "#9b51e0";
      if (subVal > 400) barColor = "#7d1c1c";
      barEl.style.background = barColor;
    }

    const tierEl = document.getElementById(`nbTier_${key}`);
    if (tierEl) {
      let t = "Good";
      if (subVal > 50) t = "Satisfactory";
      if (subVal > 100) t = "Moderate";
      if (subVal > 200) t = "Poor";
      if (subVal > 300) t = "Very Poor";
      if (subVal > 400) t = "Severe";
      tierEl.textContent = t;
    }
  }

  updatePollutant("pm25", raw.pm25 !== undefined ? raw.pm25 : a.pm25, "µg/m³", 300);
  updatePollutant("pm10", raw.pm10 !== undefined ? raw.pm10 : a.pm10, "µg/m³", 400);
  updatePollutant("no2", raw.no2, "µg/m³", 250);
  updatePollutant("so2", raw.so2, "µg/m³", 250);
  updatePollutant("co", raw.co !== undefined ? raw.co : (raw.co_mg_m3 !== undefined ? raw.co_mg_m3 : a.co), "mg/m³", 20);
  updatePollutant("ozone", raw.ozone !== undefined ? raw.ozone : a.ozone, "µg/m³", 200);

  // Global cross indices
  const eaqiEl = document.getElementById("nbVal_eaqi");
  if (eaqiEl) eaqiEl.textContent = a.european_aqi ? `${a.european_aqi}` : "44 (Fair)";

  const usaqiEl = document.getElementById("nbVal_usaqi");
  if (usaqiEl) usaqiEl.textContent = a.us_aqi ? `${a.us_aqi}` : "65 (Moderate)";

  const cpcbEl = document.getElementById("nbVal_cpcb");
  if (cpcbEl) cpcbEl.textContent = `${a.value} (${a.tier})`;

  openModal("modalNaqiBreakdown");
}

// ========================================================
// MODAL & POPUP CONTROLLERS
// ========================================================
function openModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.add("hidden");
    const anyOpen = document.querySelector(".modal-backdrop:not(.hidden)");
    if (!anyOpen) {
      document.body.style.overflow = "";
    }
  }
}

function handleBackdropClick(e, id) {
  if (e && e.target && (e.target.id === id || e.target.classList.contains("modal-backdrop"))) {
    closeModal(id);
  }
}

// Global keydown listener for Escape key to dismiss any open modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.key === "Esc") {
    document.querySelectorAll(".modal-backdrop:not(.hidden)").forEach(m => {
      closeModal(m.id);
    });
  }
});

function expandHeatmapModal() {
  openModal("modalHeatmap");
}

function openFloodReportingModal() {
  openModal("modalFloodReport");
}

async function submitFloodReportAction() {
  const depth = document.getElementById("waterDepthSelect").value;
  closeModal("modalFloodReport");
  showToast("📍 Submitting flood observation to SQLite DB...");

  try {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: STATE.location.lat + (Math.random() - 0.5) * 0.003,
        lon: STATE.location.lon + (Math.random() - 0.5) * 0.003,
        type: "WATERLOGGING",
        depth: depth,
      }),
    });
    const data = await res.json();
    STATE.flood_alerts = data.flood_alerts;
    renderAllViews();
    showToast(`🌊 Hazard recorded in DB! Active clusters: ${data.flood_alerts.length}`);
  } catch (err) {
    console.error("Failed to submit report:", err);
  }
}

// Informative popups
function showHealthDetails() {
  showToast("☀️ UV 5 (Moderate) • Humidity 72% • Pollen: Low dispersion");
}

function showWorkoutDetails() {
  showToast("🏃 Optimal workout window: 06:15 AM - 08:30 AM (Score 8.2/10)");
}

function showCommuteDetails() {
  showToast("🚗 Commute Visibility: 4.8 km (Good) • 1 Waterlogged underpass");
}

function showNowcastDetails() {
  showToast("🌧️ Minute-by-Minute: No convective rain expected for 25 min");
}

function expandStormAdvisory() {
  showToast("⚠️ Convective Storm Advisory: 65 km/h gusts and frequent lightning strikes.");
}

function showLightningAlertInfo() {
  showToast("⚡ Lightning stroke within 4.2 km detected — seek safe indoor shelter!");
}

function showFloodDetails() {
  showToast("🌊 Agara Underpass 1: 30cm water depth detected via DBSCAN clustering.");
}

function showShelterAdvisory() {
  showToast("🏠 Immediate Shelter: Avoid open fields, metal fences, and tall isolated trees.");
}

function switchAgriLocation() {
  showToast("🌾 Farm plots: Manduri Plot A, Doddaballapura Plot B");
}

function showPesticideDetails() {
  showToast("🌿 Pesticide Application Confidence: 90% (Low drift, dry canopy)");
}

function showSprayingDetails() {
  showToast("🌱 Spraying recommendation: Tomorrow 06:30 AM - 09:30 AM");
}

function showFrostDetails() {
  showToast("❄️ Frost Risk: Low (Minimum surface temperature 19°C)");
}

function showUserProfileEditor() {
  openModal("modalAuth");
}

// Toast notification display
function showToast(msg) {
  const toast = document.getElementById("globalToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove("hidden");
  toast.style.opacity = "1";
  toast.style.transform = "translateX(-50%) translateY(0)";

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-10px)";
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 3500);
}

// Password Visibility Toggle
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === "password";
  input.type = isPass ? "text" : "password";
  const icon = btn.querySelector(".pw-eye-icon");
  if (icon) icon.textContent = isPass ? "🙈" : "👁️";
  btn.setAttribute("title", isPass ? "Hide password" : "Show password");
  showToast(isPass ? "👁️ Password displayed" : "🔒 Password masked");
}

// Fit 5 Screens Toggle for Showcase
function toggleShowcaseFit() {
  const sc = document.getElementById("showcaseView");
  const btn = document.getElementById("btnFitShowcase");
  if (!sc) return;
  const isFit = sc.classList.toggle("showcase-fit-mode");
  if (btn) btn.classList.toggle("active", isFit);
  showToast(isFit ? "🔍 Fit-to-Screen: All 5 screens fitted" : "🔍 Full Size: Standard scale");
}

// Make functions available globally on window
window.setViewMode = setViewMode;
window.setSingleTab = setSingleTab;
window.switchSingleScreen = switchSingleScreen;
window.togglePersonaKey = togglePersonaKey;
window.toggleOnboardPersona = toggleOnboardPersona;
window.completeOnboarding = completeOnboarding;
window.saveOnboardingModal = saveOnboardingModal;
window.toggleAcousticRainGauge = toggleAcousticRainGauge;
window.toggleStorm = toggleStorm;
window.openModal = openModal;
window.closeModal = closeModal;
window.handleBackdropClick = handleBackdropClick;
window.expandHeatmapModal = expandHeatmapModal;
window.openFloodReportingModal = openFloodReportingModal;
window.submitFloodReportAction = submitFloodReportAction;
window.switchAuthTab = switchAuthTab;
window.handleLoginSubmit = handleLoginSubmit;
window.handleRegisterSubmit = handleRegisterSubmit;
window.quickLogin = quickLogin;
window.togglePasswordVisibility = togglePasswordVisibility;
window.toggleShowcaseFit = toggleShowcaseFit;
window.toggleMapStyle = toggleMapStyle;
window.recenterAlertsMap = recenterAlertsMap;
window.recenterSingleMap = recenterSingleMap;
window.recenterDesktopMap = recenterDesktopMap;
window.showHealthDetails = showHealthDetails;
window.showWorkoutDetails = showWorkoutDetails;
window.showCommuteDetails = showCommuteDetails;
window.showNowcastDetails = showNowcastDetails;
window.expandStormAdvisory = expandStormAdvisory;
window.showLightningAlertInfo = showLightningAlertInfo;
window.showFloodDetails = showFloodDetails;
window.showShelterAdvisory = showShelterAdvisory;
window.switchAgriLocation = switchAgriLocation;
window.showPesticideDetails = showPesticideDetails;
window.showSprayingDetails = showSprayingDetails;
window.showFrostDetails = showFrostDetails;
window.showUserProfileEditor = showUserProfileEditor;
window.detectUserLocation = detectUserLocation;
window.toggleLiveLocationTracking = toggleLiveLocationTracking;
window.openNaqiBreakdownModal = openNaqiBreakdownModal;
window.syncLiveWeather = syncLiveWeather;
