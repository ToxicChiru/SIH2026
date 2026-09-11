# Mausam App — Deployable Demo Build

A genuinely runnable, deployable version of the Next-Gen Mausam App: a Flask
backend serving a live REST API + real-time Server-Sent Events stream, and a
single-page web frontend that renders four persona-adaptive screens (Home,
Alerts, Agri, Profile) from live data.

**Tested and verified working** in this exact form: server boot, all REST
endpoints, persona toggling, crowdsourced flood-report clustering (3+ reports
within ~150m/20min auto-promote to a validated alert — the DBSCAN-style rule
from the architecture doc, reimplemented dependency-free here), and the SSE
push stream, all exercised end-to-end before delivery.

## What this is — and isn't

**Is:** a complete, working full-stack application you can run right now with
one command, with real (not decorative) logic behind every score — the same
wet-bulb/WBGT, workout-window, commute-friction, and NAQI math from the
earlier `algorithms.py` deliverable, actually wired to a live UI.

**Isn't:** connected to real IMD/CPCB-SAFAR/Damini/INCOIS data. Those
agencies don't expose open, keyless public APIs — real integration needs an
institutional data-sharing agreement with each one, which is outside what I
can set up for you. `mock_feeds.py` simulates realistic readings in their
place so the rest of the stack — scoring, alerting, the dashboard, real-time
push — is fully wired and provably functional. Swapping in real feeds later
means replacing `generate_tick()`'s random-walk with real API calls; nothing
downstream needs to change, because everything else depends only on this
module's output shape.

It's also a single-process, single-user demo (no login, no Postgres) — the
`schema.sql` and Redis/Kafka architecture from the earlier deliverables are
the documented path to multi-user production scale; this build is the
fastest way to have something real and clickable today.

## Run it

### Option A — plain Python (fastest)
```bash
pip install -r requirements.txt
python app.py
```
Open **http://localhost:8000**

### Option B — Docker
```bash
docker build -t mausam-app .
docker run -p 8000:8000 mausam-app
```

### Option C — Docker Compose (same thing, one command)
```bash
docker compose up --build
```

## Deploying it somewhere real

This is a standard containerized web app — it deploys anywhere that runs a
Docker image or a Python web process:

- **Railway / Render / Fly.io**: point them at this repo; they auto-detect
  the `Dockerfile` and give you a public URL. No config beyond exposing port
  8000.
- **A VPS**: `docker compose up -d` behind Nginx/Caddy for TLS.
- **Kubernetes**: the image is stateless (single replica only, for now — the
  in-memory `STATE` dict in `mock_feeds.py` isn't shared across pods; move
  it to Redis first if you need >1 replica, per the pub/sub design in
  `UI_AND_STREAMING.md`).

## What's inside

| File | Role |
|---|---|
| `app.py` | Flask app: REST endpoints + `/api/stream` (SSE) + serves the frontend |
| `mock_feeds.py` | Simulated agency feeds, in-memory state, pub/sub, flood-cluster validator |
| `algorithms.py` | Wet-bulb (Stull), WBGT, workout score, commute friction, composite NAQI |
| `static/index.html`, `app.js`, `styles.css` | The live single-page frontend |
| `Dockerfile`, `docker-compose.yml` | Containerized deploy |

## API reference

- `GET /api/state` — full current snapshot (weather, AQI, scores, personas, flood alerts)
- `POST /api/personas` — `{"persona": "FITNESS", "active": true}` — toggle a persona
- `POST /api/report` — `{"lat": .., "lon": .., "type": "WATERLOGGING"}` — submit a crowdsourced report
- `GET /api/stream` — Server-Sent Events: `tick` (weather/AQI update), `lightning`, `clear`, `flood_validated`
- `GET /api/healthz` — liveness check

## Known limitation worth knowing about

The demo runs a single **development-friendly** Flask process by default
(`python app.py`). For anything beyond your own testing, use the Docker
image — it runs under `gunicorn` with threaded workers so the long-lived SSE
connection doesn't block other requests, which the plain dev server does
under concurrent load.
