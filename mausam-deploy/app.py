"""
app.py — Mausam App backend (deployable demo build)

Run locally:
    pip install -r requirements.txt
    python app.py
    → open http://localhost:8000

Run with Docker:
    docker build -t mausam-app .
    docker run -p 8000:8000 mausam-app

This is a genuinely functional, runnable, deployable server: live simulated
weather/AQI ticks, persona toggles, crowdsourced flood reporting with a
DBSCAN-style validator, and real-time push via Server-Sent Events (no extra
infra required). It is intentionally a single-process Flask app so it runs
anywhere with just Python — see README.md for the path to the full
Postgres/PostGIS + Redis + Kafka architecture documented separately when
you're ready to scale beyond a single-user demo.
"""
import json
import time

from flask import Flask, jsonify, request, Response, send_from_directory, make_response

import mock_feeds
import database

app = Flask(__name__, static_folder="static", static_url_path="")


# ---------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------------
# Authentication & User Database API
# ---------------------------------------------------------------------
def _get_current_user():
    token = request.cookies.get("mausam_session") or request.headers.get("X-Session-Token")
    if token:
        return database.get_user_by_token(token)
    return None


@app.route("/api/auth/register", methods=["POST"])
def api_register():
    body = request.get_json(force=True)
    username = body.get("username", "")
    email = body.get("email", "")
    password = body.get("password", "")
    full_name = body.get("full_name", username)
    location = body.get("location", "Bengaluru, KA")
    
    if not username or not email or not password:
        return jsonify({"ok": False, "error": "Username, email, and password required."}), 400
        
    res = database.register_user(username, email, password, full_name, location)
    if not res["ok"]:
        return jsonify(res), 400
        
    # Update active demo profile to match newly registered user
    initials = "".join([part[0].upper() for part in res["user"]["full_name"].split()[:2]])
    mock_feeds.STATE["user_profile"] = {
        "name": res["user"]["full_name"],
        "location": res["user"]["location"],
        "persona_desc": f"Persona: {res['user']['role']}",
        "initials": initials or "VS",
    }
    mock_feeds.STATE["personas"] = res["user"]["personas"]
    
    resp = make_response(jsonify(res))
    resp.set_cookie("mausam_session", res["token"], max_age=30*86400, httponly=False)
    return resp


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    body = request.get_json(force=True)
    account = body.get("username_or_email", "")
    password = body.get("password", "")
    
    if not account or not password:
        return jsonify({"ok": False, "error": "Username/Email and password required."}), 400
        
    res = database.authenticate_user(account, password)
    if not res["ok"]:
        return jsonify(res), 401
        
    initials = "".join([part[0].upper() for part in res["user"]["full_name"].split()[:2]])
    mock_feeds.STATE["user_profile"] = {
        "name": res["user"]["full_name"],
        "location": res["user"]["location"],
        "persona_desc": f"Persona: {res['user']['role']}",
        "initials": initials or "VS",
    }
    mock_feeds.STATE["personas"] = res["user"]["personas"]
    
    resp = make_response(jsonify(res))
    resp.set_cookie("mausam_session", res["token"], max_age=30*86400, httponly=False)
    return resp



@app.route("/api/auth/me")
def api_me():
    user = _get_current_user()
    if user:
        return jsonify({"ok": True, "authenticated": True, "user": user})
    return jsonify({"ok": True, "authenticated": False, "user": mock_feeds.STATE["user_profile"]})


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    resp = make_response(jsonify({"ok": True}))
    resp.set_cookie("mausam_session", "", max_age=0)
    return resp


@app.route("/api/users")
def api_list_users():
    users = database.list_users()
    # Strip sensitive fields
    return jsonify({"ok": True, "users": [
        {
            "id": u["id"],
            "username": u["username"],
            "full_name": u["full_name"],
            "role": u["role"],
            "location": u["location"],
            "avatar_url": u["avatar_url"],
        }
        for u in users
    ]})


# ---------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------
@app.route("/api/state")
def api_state():
    user = _get_current_user()
    snap = mock_feeds.snapshot()
    if user:
        snap["current_user"] = user
    return jsonify(snap)



@app.route("/api/personas", methods=["POST"])
def api_set_persona():
    body = request.get_json(force=True)
    persona = body.get("persona")
    active = bool(body.get("active"))
    mock_feeds.set_persona(persona, active)
    user = _get_current_user()
    if user:
        database.update_user_personas(user["id"], mock_feeds.STATE["personas"])
    return jsonify({"ok": True, "personas": mock_feeds.STATE["personas"]})


@app.route("/api/onboarding", methods=["POST"])
def api_onboarding():
    body = request.get_json(force=True)
    personas = body.get("personas", {})
    for p, act in personas.items():
        mock_feeds.set_persona(p, bool(act))
    user = _get_current_user()
    if user:
        database.update_user_personas(user["id"], mock_feeds.STATE["personas"])
    return jsonify({"ok": True, "personas": mock_feeds.STATE["personas"]})



@app.route("/api/calibration", methods=["POST"])
def api_set_calibration():
    body = request.get_json(force=True)
    key = body.get("key")
    active = bool(body.get("active"))
    mock_feeds.set_calibration(key, active)
    return jsonify({"ok": True, "calibration": mock_feeds.STATE["calibration"]})


@app.route("/api/location", methods=["POST"])
def api_set_location():
    body = request.get_json(force=True)
    name = body.get("name", "Agara, Bengaluru, India")
    lat = float(body.get("lat", 12.933))
    lon = float(body.get("lon", 77.625))
    district = body.get("district", "Bengaluru Urban")
    mock_feeds.set_location(name, lat, lon, district)
    return jsonify({"ok": True, "location": mock_feeds.STATE["location"]})


@app.route("/api/trigger_storm", methods=["POST"])
def api_trigger_storm():
    body = request.get_json(force=True) if request.is_json else {}
    active = bool(body.get("active", not mock_feeds.STATE["lightning_active"]))
    mock_feeds.trigger_storm(active)
    return jsonify({"ok": True, "lightning_active": mock_feeds.STATE["lightning_active"]})


@app.route("/api/weather/live")
def api_weather_live():
    """
    Fetches live weather from Open-Meteo API for current lat/lon,
    updating the state with real observations if reachable.
    """
    import requests
    lat = mock_feeds.STATE["location"]["lat"]
    lon = mock_feeds.STATE["location"]["lon"]
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,precipitation&timezone=auto"
        resp = requests.get(url, timeout=3.0)
        if resp.status_code == 200:
            data = resp.json().get("current", {})
            with mock_feeds._lock:
                mock_feeds.STATE["weather"]["temp_c"] = round(data.get("temperature_2m", mock_feeds.STATE["weather"]["temp_c"]), 1)
                mock_feeds.STATE["weather"]["rh_pct"] = int(data.get("relative_humidity_2m", mock_feeds.STATE["weather"]["rh_pct"]))
                mock_feeds.STATE["weather"]["wind_kph"] = round(data.get("wind_speed_10m", mock_feeds.STATE["weather"]["wind_kph"]), 1)
                mock_feeds.STATE["weather"]["rain_mm_hr"] = round(data.get("precipitation", 0.0), 1)
            return jsonify({"ok": True, "live": True, "state": mock_feeds.snapshot()})
    except Exception as e:
        pass
    return jsonify({"ok": True, "live": False, "state": mock_feeds.snapshot()})


@app.route("/api/report", methods=["POST"])
def api_submit_report():
    body = request.get_json(force=True)
    lat = float(body.get("lat", mock_feeds.STATE["location"]["lat"]))
    lon = float(body.get("lon", mock_feeds.STATE["location"]["lon"]))
    report_type = body.get("type", "WATERLOGGING")
    depth = body.get("depth", "WHEEL")
    mock_feeds.submit_report(lat, lon, report_type)
    user = _get_current_user()
    database.record_flood_report(user["id"] if user else None, lat, lon, report_type, depth)
    return jsonify({"ok": True, "flood_alerts": mock_feeds.STATE["flood_alerts"]})



@app.route("/api/healthz")
def healthz():
    return jsonify({"status": "ok"})



# ---------------------------------------------------------------------
# Real-time push (Server-Sent Events)
# ---------------------------------------------------------------------
@app.route("/api/stream")
def stream():
    q = mock_feeds.subscribe()

    def gen():
        try:
            # Send an initial snapshot immediately so the client doesn't
            # wait for the next tick to render.
            yield f"data: {json.dumps({'type': 'snapshot', **mock_feeds.snapshot()})}\n\n"
            last_heartbeat = time.time()
            while True:
                try:
                    event = q.get(timeout=15)
                    yield f"data: {json.dumps(event)}\n\n"
                except Exception:
                    pass
                if time.time() - last_heartbeat > 20:
                    yield ": heartbeat\n\n"
                    last_heartbeat = time.time()
        finally:
            mock_feeds.unsubscribe(q)

    return Response(gen(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


mock_feeds.start_background_loop(interval_sec=4.0)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, threaded=True, debug=False)
