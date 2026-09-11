# ⛈️ Mausam — Next-Gen Hyperlocal Weather & Convective Hazard Intelligence

> **Smart India Hackathon 2026 (SIH2026) Submission**  
> An adaptive, dual-platform meteorological intelligence system available as an **Interactive Mobile Application (with 5-Screen Reference Showcase)** and a full-featured **Desktop Operations Portal**.

---

## 🌟 Overview

**Mausam** delivers real-time weather analytics and life-safety hazard intelligence tailored to specific user contexts. Built with a high-performance Python/Flask backend and a modern vanilla CSS/JS responsive frontend, it seamlessly scales from single mobile devices to comprehensive desktop command consoles.

### ✨ Key Capabilities

1. **Doppler Convective Radar & Lightning Nowcasting**:
   - Live Doppler Weather Radar (DWR) simulation with permanent surveillance range rings (25 km & 12.5 km).
   - Animated rotating Doppler radar sweep cone.
   - High-reflectivity convective storm core (high dBZ) with animated severe lightning strike markers (`⚡`) and safety radius calculations.
   - Seamless tile switching between **High-Resolution Street Radar** and **Satellite Doppler Imagery** (powered by keyless, watermark-free ESRI tiles).

2. **Persona-Adaptive Intelligence Engine**:
   - Dynamically tailors UI cards, advisory notifications, and hazard thresholds to user personas:
     - 🩺 **Health-Conscious**: Pollen dispersion, UV exposure, and NAQI respiratory alerts.
     - 🏃 **Outdoor Fitness**: Optimal workout window scoring (0–10) based on temperature, humidity, and wet-bulb globe temperature (WBGT).
     - 🚗 **Commuter Corridor**: Route visibility, fog advisories, and waterlogged underpass alerts.
     - 🌾 **Agrimet / Farmers**: FAO-56 Penman-Monteith reference evapotranspiration ($ET_0$), spraying windows, and thermal soil moisture isotherms.
     - 🛟 **Coastal / Marine**: Sea state, tide, and wave buoy metrics.
     - ✈️ **Traveler / Aviation**: Severe convective weather transit advisories.

3. **Civil Hazard Crowdsourcing & DBSCAN Clustering**:
   - Citizens report localized roadway waterlogging and submerged underpasses.
   - Spatial-temporal clustering algorithm validates reports (3+ corroborations within 150m and 20 min) and automatically elevates them to official civil hazard advisories.

4. **SQLite Account Authentication & Salted PBKDF2/SHA-256**:
   - Full user authentication with sign-in, registration, and password visibility toggles.
   - User profile, city coordinates, and persona preferences stored in `mausam.db`.
   - 1-Click demo accounts for rapid evaluation (Vikram S. - Farmer, Priya Sharma - Agri-Scientist, Arjun Patel - Fitness Runner).

5. **Acoustic Rain Gauge Calibration**:
   - Smartphone microphone acoustic sensing simulated to calibrate surface precipitation intensity against radar reflectivity.

---

## 📱 Three Integrated Display Formats

- **📱 5-Screen Mobile Showcase**: Side-by-side synchronized view of all 5 core mobile modules (*Home, Convective Alerts, Onboarding, Agrometeorology, Profile*).
- **📲 Interactive Mobile App**: Glitch-free single phone view with bottom navigation bar, live tab switching, and touch-friendly controls.
- **💻 Desktop Operations Portal**: Wide-screen command center featuring atmospheric state, NAQI dial, interactive Doppler radar, active hazard board, agrometeorology NDVI viewer, and live persona toggles.

---

## 🚀 Quickstart

### Running with Python (Fastest)

```bash
cd mausam-deploy
pip install -r requirements.txt
python app.py
```

Open **`http://localhost:8000`** in your browser.

### Running with Docker

```bash
cd mausam-deploy
docker build -t mausam-sih2026 .
docker run -p 8000:8000 mausam-sih2026
```

### Running with Docker Compose

```bash
cd mausam-deploy
docker compose up --build
```

---

## 📂 Project Structure

```
SIH2026/
├── README.md                 # Project documentation & SIH2026 architecture
├── .gitignore                # Git ignore rules
└── mausam-deploy/
    ├── app.py                # Flask server, REST API, and SSE event streaming
    ├── algorithms.py         # Meteorological calculations (WBGT, NAQI, FAO-56, DBSCAN)
    ├── database.py           # SQLite database schema, user accounts & authentication
    ├── mock_feeds.py         # Real-time simulated meteorological telemetry feeds
    ├── requirements.txt      # Python dependencies
    ├── Dockerfile            # Container definition
    ├── docker-compose.yml    # Multi-container service configuration
    ├── mausam.db             # Seeded SQLite database
    └── static/
        ├── index.html        # Single-page application markup (Showcase, Mobile, Portal)
        ├── styles.css        # Vanilla CSS design system with rich dark aesthetic
        ├── app.js            # Frontend reactive state controller & Leaflet map engine
        ├── icon.svg          # Mausam platform icon
        ├── manifest.json     # PWA manifest
        └── agri_soil_heatmap.jpg  # High-res NDVI multispectral farm heatmap
```

---

## 👥 Authors & Team
- **Repository**: [ToxicChiru/SIH2026](https://github.com/ToxicChiru/SIH2026)
- **Built for**: Smart India Hackathon 2026
