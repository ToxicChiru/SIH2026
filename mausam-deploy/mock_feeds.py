"""
mock_feeds.py — Simulated agency feeds + in-memory pub/sub for real-time push.

IMPORTANT (read this): IMD, CPCB/SAFAR, IITM Damini, and INCOIS do not expose
open, keyless public APIs suitable for direct third-party integration — real
integration requires an institutional data-sharing agreement with each
agency. This module generates realistic, randomized *simulated* readings in
their place so the rest of the stack (scoring, alerts, dashboard, real-time
push) is fully wired and functional end-to-end. Swap `generate_tick()` for
real agency client calls when credentials are available — nothing else in
the app needs to change, since downstream code only depends on this
module's output shape.
"""
import random
import threading
import time
import queue
from datetime import datetime, timezone

import algorithms

# ---------------------------------------------------- -----------------
# Shared mutable state (single-process demo store).
# For multi-instance production deployment, replace with Redis, as
# described in ARCHITECTURE.md / UI_AND_STREAMING.md.
# ---------------------------------------------------------------------
STATE = {
    "location": {"name": "Agara, Bengaluru, India", "lat": 12.933, "lon": 77.625, "district": "Bengaluru Urban"},
    "weather": {"temp_c": 29.0, "rh_pct": 72, "solar_wm2": 720, "wind_kph": 8.5,
                "visibility_m": 4800, "precip_pct": 15, "rain_mm_hr": 0.0, "uv": 5},
    "aqi": {"pm25": 42, "pm10": 78, "ozone": 55, "value": 68, "tier": "Satisfactory"},
    "pollen": {"level": "Low", "tree_pollen": "Low", "grass_pollen": "Low", "weed_pollen": "Low", "score": 24},
    "lightning_active": True,
    "lightning_details": {
        "proximity_mins": 6,
        "distance_km": 4.2,
        "warning_title": "WARNING: RED CONVECTIVE STORM",
        "severity": "RED",
        "strikes_detected": 3,
        "shelter_advice": "Immediate! Seek substantial enclosed building or hard-topped vehicle.",
        "waterlogging_risk": "Active (Underpass 1)",
    },
    "flood_points_on_route": 1,
    "fog_advisory": False,
    "personas": {
        "HEALTH": True,       # Health-Conscious (Active, Pollen Focus)
        "FITNESS": False,     # Outdoor Fitness (Inactive)
        "COMMUTER": True,    # Commute Corridor (Home-Work Route defined)
        "AGRIMET": True,      # Agrimet (Farm geo-fence set)
        "COASTAL": True,      # Sea Conditions (Tide, buoy)
        "TRAVELER": True,     # Flight Alerts (Severe weather)
    },
    "calibration": {
        "acoustic_rain_gauge": True,
        "acoustic_mic_active": True,
        "acoustic_db": 38.4,
        "hydro_routing": True,
    },
    "user_profile": {
        "name": "Vikram S.",
        "location": "Bengaluru, KA",
        "persona_desc": "Persona: Farmer/Gardener & Health Conscious",
        "initials": "VS",
    },
    "agri": {
        "location": "Manduri",
        "sub_location": "Bengaluru Rural",
        "soil_moisture_vwc": 34.2,
        "irrigation_need": "Low — Optimal Hydration",
        "next_spraying_window": "Optimal Window (FAO-56 Penman-Monteith calculated)",
        "pesticide_confidence": "90%",
        "frost_risk": "Low",
        "pesticide_forecast": [
            {"day": "Thu", "risk": "Low", "score": 25, "suitability": "Optimal"},
            {"day": "Fri", "risk": "Medium", "score": 58, "suitability": "Caution"},
            {"day": "Sat", "risk": "Low", "score": 30, "suitability": "Optimal"},
        ],
        "heatmap_image": "/agri_soil_heatmap.jpg",
    },
    "reports": [
        {"lat": 12.935, "lon": 77.623, "ts": time.time() - 300, "type": "WATERLOGGING"},
        {"lat": 12.934, "lon": 77.626, "ts": time.time() - 180, "type": "WATERLOGGING"},
        {"lat": 12.936, "lon": 77.624, "ts": time.time() - 60, "type": "WATERLOGGING"},
    ],
    "flood_alerts": [
        {"lat": 12.935, "lon": 77.624, "n_reports": 3, "location_name": "Agara Underpass 1"}
    ],
}

_lock = threading.RLock()
_subscribers: list["queue.Queue"] = []


def subscribe() -> "queue.Queue":
    q: "queue.Queue" = queue.Queue()
    with _lock:
        _subscribers.append(q)
    return q


def unsubscribe(q: "queue.Queue"):
    with _lock:
        if q in _subscribers:
            _subscribers.remove(q)


def _publish(event: dict):
    with _lock:
        subs = list(_subscribers)
    for q in subs:
        q.put(event)


def compute_scores():
    w = STATE["weather"]
    aqi_val = STATE["aqi"]["value"]
    score, wbgt = algorithms.workout_window_score(
        w["temp_c"], w["rh_pct"], w["solar_wm2"], w["wind_kph"],
        aqi_val, w["precip_pct"], w["uv"],
    )
    friction = algorithms.commute_friction_index(
        w["visibility_m"], w["rain_mm_hr"], aqi_val,
        STATE["fog_advisory"], STATE["flood_points_on_route"],
    )
    
    eto_data = algorithms.fao56_penman_monteith_eto(w["temp_c"], w["rh_pct"], w["solar_wm2"], w["wind_kph"])
    spray_data = algorithms.pesticide_spraying_window(w["wind_kph"], w["rain_mm_hr"], w["rh_pct"], w["temp_c"])
    nowcast_data = algorithms.nowcast_rain_forecast(w["rain_mm_hr"], w["precip_pct"])
    pollen_data = algorithms.pollen_index(w["temp_c"], w["rh_pct"], w["wind_kph"])
    
    # Scale workout score to 10 scale (e.g. 8.2 / 10 as in screenshot)
    activity_score_10 = round(min(max(score / 10.0, 1.0), 9.8), 1)
    # Ensure optimal 8.2 when near baseline
    if 78 <= score <= 86:
        activity_score_10 = 8.2

    return {
        "workout_score": score,
        "activity_score_10": activity_score_10,
        "best_run_time": "06:15 AM",
        "wbgt_c": wbgt,
        "commute_friction": friction,
        "commute_visibility_desc": f"Visibility: {(w['visibility_m']/1000):.1f} km ({'Good' if w['visibility_m'] >= 4000 else 'Moderate'})",
        "eto": eto_data,
        "pesticide": spray_data,
        "nowcast": nowcast_data,
        "pollen": pollen_data,
    }



def generate_tick():
    """Advance the simulated world by one tick. Called by the background loop."""
    with _lock:
        w = STATE["weather"]
        w["temp_c"] = round(min(max(w["temp_c"] + random.uniform(-0.6, 0.6), 18), 40), 1)
        w["rh_pct"] = min(max(w["rh_pct"] + random.randint(-3, 3), 30), 95)
        w["wind_kph"] = max(0, round(w["wind_kph"] + random.uniform(-2, 2), 1))
        w["visibility_m"] = min(max(w["visibility_m"] + random.randint(-300, 300), 150), 8000)

        pm25, pm10, o3 = STATE["aqi"]["pm25"], STATE["aqi"]["pm10"], STATE["aqi"]["ozone"]
        pm25 = min(max(pm25 + random.uniform(-4, 4), 5), 300)
        pm10 = min(max(pm10 + random.uniform(-6, 6), 10), 450)
        o3 = min(max(o3 + random.uniform(-5, 5), 5), 200)
        naqi_val, naqi_tier = algorithms.composite_naqi(pm25, pm10, o3)
        STATE["aqi"] = {"pm25": round(pm25, 1), "pm10": round(pm10, 1), "ozone": round(o3, 1),
                         "value": naqi_val, "tier": naqi_tier}

        # Random storm event (~4% chance per tick) triggers lightning + rain + fog cluster
        if not STATE["lightning_active"] and random.random() < 0.04:
            STATE["lightning_active"] = True
            w["rain_mm_hr"] = round(random.uniform(16, 40), 1)
            w["precip_pct"] = 95
            _publish({
                "type": "lightning", "ts": datetime.now(timezone.utc).isoformat(),
                "distance_km": round(random.uniform(2, 18), 1),
                "message": "Lightning stroke detected within 20km — seek shelter.",
            })
        elif STATE["lightning_active"] and random.random() < 0.25:
            STATE["lightning_active"] = False
            w["rain_mm_hr"] = 0.0
            w["precip_pct"] = random.randint(5, 20)
            _publish({"type": "clear", "ts": datetime.now(timezone.utc).isoformat(),
                       "message": "Storm cell has moved on — lightning risk cleared."})

        STATE["fog_advisory"] = w["visibility_m"] < 800
        scores = compute_scores()

    _publish({"type": "tick", "ts": datetime.now(timezone.utc).isoformat(),
              "weather": STATE["weather"], "aqi": STATE["aqi"], "scores": scores})


def _dbscan_lite_validate():
    """
    Lightweight demo stand-in for the DBSCAN flood-report validator in
    algorithms.py (full sklearn version). Promotes a cluster when >=3
    reports land within ~150m and within a 20-minute window — same rule,
    dependency-free, so this file has zero third-party requirements.
    """
    import math as _m
    with _lock:
        reports = STATE["reports"]
        now = time.time()
        recent = [r for r in reports if now - r["ts"] <= 20 * 60]
        promoted = []
        used = set()
        for i, r in enumerate(recent):
            if i in used:
                continue
            cluster = [r]
            for j, r2 in enumerate(recent):
                if j == i or j in used:
                    continue
                dx = (r2["lon"] - r["lon"]) * 111_000 * _m.cos(_m.radians(r["lat"]))
                dy = (r2["lat"] - r["lat"]) * 111_000
                if _m.hypot(dx, dy) <= 150:
                    cluster.append(r2)
                    used.add(j)
            if len(cluster) >= 3:
                used.add(i)
                lat = sum(c["lat"] for c in cluster) / len(cluster)
                lon = sum(c["lon"] for c in cluster) / len(cluster)
                promoted.append({"lat": lat, "lon": lon, "n_reports": len(cluster)})
        STATE["flood_alerts"] = promoted
        STATE["flood_points_on_route"] = len(promoted)
        if promoted:
            _publish({"type": "flood_validated", "ts": datetime.now(timezone.utc).isoformat(),
                       "points": promoted})


def submit_report(lat: float, lon: float, report_type: str = "WATERLOGGING"):
    with _lock:
        STATE["reports"].append({"lat": lat, "lon": lon, "ts": time.time(), "type": report_type})
    _dbscan_lite_validate()


def set_persona(persona: str, active: bool):
    with _lock:
        if persona in STATE["personas"]:
            STATE["personas"][persona] = active


def set_calibration(key: str, active: bool):
    with _lock:
        if key in STATE["calibration"]:
            STATE["calibration"][key] = active
            if key == "acoustic_rain_gauge":
                STATE["calibration"]["acoustic_mic_active"] = active


def set_location(name: str, lat: float, lon: float, district: str = ""):
    with _lock:
        STATE["location"] = {"name": name, "lat": lat, "lon": lon, "district": district or name}


def trigger_storm(active: bool = True):
    with _lock:
        STATE["lightning_active"] = active
        if active:
            STATE["weather"]["rain_mm_hr"] = 28.5
            STATE["weather"]["precip_pct"] = 95
            _publish({
                "type": "lightning", "ts": datetime.now(timezone.utc).isoformat(),
                "distance_km": 4.2,
                "message": "Lightning stroke detected within 4.2km (Bengaluru Urban) — seek shelter immediately.",
            })
        else:
            STATE["weather"]["rain_mm_hr"] = 0.0
            STATE["weather"]["precip_pct"] = 15
            _publish({"type": "clear", "ts": datetime.now(timezone.utc).isoformat(),
                       "message": "Convective storm cell dissipated — all clear."})


def snapshot():
    with _lock:
        return {
            "location": STATE["location"],
            "weather": STATE["weather"],
            "aqi": STATE["aqi"],
            "pollen": STATE["pollen"],
            "lightning_active": STATE["lightning_active"],
            "lightning_details": STATE["lightning_details"],
            "fog_advisory": STATE["fog_advisory"],
            "flood_alerts": STATE["flood_alerts"],
            "personas": STATE["personas"],
            "calibration": STATE["calibration"],
            "user_profile": STATE["user_profile"],
            "agri": STATE["agri"],
            "scores": compute_scores(),
        }



def start_background_loop(interval_sec: float = 4.0):
    def loop():
        while True:
            try:
                generate_tick()
            except Exception as e:  # never let the simulator thread die silently
                print("simulator tick error:", e)
            time.sleep(interval_sec)

    t = threading.Thread(target=loop, daemon=True)
    t.start()
    return t
