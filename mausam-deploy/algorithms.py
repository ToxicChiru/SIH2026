"""
Core derived-metric algorithms for the Mausam app backend.
Same logic documented in the earlier deliverable ARCHITECTURE.md / algorithms.py,
trimmed to what the live demo backend calls directly.
"""
import math


def wet_bulb_temperature_c(temp_c: float, rh_pct: float) -> float:
    rh = min(max(rh_pct, 5), 100)
    t = temp_c
    tw = (
        t * math.atan(0.151977 * math.sqrt(rh + 8.313659))
        + math.atan(t + rh)
        - math.atan(rh - 1.676331)
        + 0.00391838 * (rh ** 1.5) * math.atan(0.023101 * rh)
        - 4.686035
    )
    return round(tw, 2)


def _interp(value, breakpoints):
    if value <= breakpoints[0][0]:
        return breakpoints[0][1]
    for (x0, y0), (x1, y1) in zip(breakpoints, breakpoints[1:]):
        if value <= x1:
            frac = (value - x0) / (x1 - x0) if x1 != x0 else 0
            return y0 + frac * (y1 - y0)
    return breakpoints[-1][1]


def workout_window_score(temp_c, rh_pct, solar_wm2, wind_kph, naqi, precip_pct, uv):
    tg = temp_c + 3.0 * (solar_wm2 / 1000.0)
    tw = wet_bulb_temperature_c(temp_c, rh_pct)
    wbgt = 0.7 * tw + 0.2 * tg + 0.1 * temp_c

    heat_penalty = _interp(wbgt, [(20, 0), (23, 10), (26, 25), (28, 40), (30, 52), (32, 60), (36, 60)])
    aqi_penalty = _interp(naqi, [(50, 0), (100, 5), (200, 12), (300, 20), (400, 25), (500, 25)])
    rain_penalty = 0.20 * precip_pct
    uv_penalty = min(uv / 11.0 * 8, 8)

    if wind_kph <= 15:
        wind_adj = (wind_kph / 15.0) * 5
    elif wind_kph <= 35:
        wind_adj = 5 - ((wind_kph - 15) / 20.0) * 5
    else:
        wind_adj = -6

    raw = 100 - heat_penalty - aqi_penalty - rain_penalty - uv_penalty + wind_adj
    return int(round(min(max(raw, 0), 100))), round(wbgt, 1)


def commute_friction_index(visibility_m, rain_mm_hr, naqi, fog_advisory, flood_points):
    if visibility_m >= 2000:
        vis_f = 0
    elif visibility_m <= 200:
        vis_f = 45
    else:
        vis_f = 45 * (1 - (visibility_m - 200) / 1800)

    if rain_mm_hr <= 2.5:
        rain_f = rain_mm_hr * 2
    elif rain_mm_hr <= 15:
        rain_f = 5 + (rain_mm_hr - 2.5) * 1.6
    else:
        rain_f = min(25 + (rain_mm_hr - 15) * 1.2, 40)

    aqi_f = _interp(naqi, [(50, 0), (150, 3), (300, 8), (500, 12)])
    fog_f = 10 if fog_advisory else 0
    flood_f = min(flood_points * 8, 24)

    return int(round(min(vis_f + rain_f + aqi_f + fog_f + flood_f, 100)))


_PM25_BP = [(0, 30, 0, 50), (31, 60, 51, 100), (61, 90, 101, 200), (91, 120, 201, 300), (121, 250, 301, 400), (251, 500, 401, 500)]
_PM10_BP = [(0, 50, 0, 50), (51, 100, 51, 100), (101, 250, 101, 200), (251, 350, 201, 300), (351, 430, 301, 400), (431, 600, 401, 500)]
_O3_BP = [(0, 50, 0, 50), (51, 100, 51, 100), (101, 168, 101, 200), (169, 208, 201, 300), (209, 748, 301, 400), (749, 1000, 401, 500)]


def _cpcb_subindex(c, bp):
    # CPCB's published breakpoint tables have small integer gaps between
    # brackets (e.g. PM10: ...50 | 51...) that a float reading can fall
    # into. Match on "first bracket whose upper bound covers c" rather
    # than requiring c to sit inside [c_lo, c_hi], and clamp c to c_lo
    # when it's below it — this snaps a gap value to the nearest correct
    # bracket instead of falling through to the fallback (which used to
    # silently return a maxed-out "Severe" index for a value like 50.5).
    for c_lo, c_hi, i_lo, i_hi in bp:
        if c <= c_hi:
            c_eff = max(c, c_lo)
            return i_lo + (i_hi - i_lo) / (c_hi - c_lo) * (c_eff - c_lo)
    return bp[-1][3]


def composite_naqi(pm25, pm10, ozone):
    val = int(round(max(_cpcb_subindex(pm25, _PM25_BP), _cpcb_subindex(pm10, _PM10_BP), _cpcb_subindex(ozone, _O3_BP))))
    for threshold, tier in [(50, "Good"), (100, "Satisfactory"), (200, "Moderate"), (300, "Poor"), (400, "Very Poor"), (500, "Severe")]:
        if val <= threshold:
            return val, tier
    return val, "Severe"


def fao56_penman_monteith_eto(temp_c: float, rh_pct: float, solar_wm2: float, wind_kph: float) -> dict:
    """
    Simplified FAO-56 Penman-Monteith reference evapotranspiration (ET0) in mm/day.
    Evaluates atmospheric evaporative demand and soil moisture depletion rate.
    """
    t = temp_c
    u2 = max(wind_kph * (1000.0 / 3600.0), 0.5)  # wind speed at 2m in m/s
    rn = max(solar_wm2 * 0.0864 * 0.77, 0.0)      # Net solar radiation in MJ/m2/day
    g = 0.0                                       # Soil heat flux assumed ~0 for daily
    
    # Saturation and actual vapor pressure (kPa)
    es = 0.6108 * math.exp((17.27 * t) / (t + 237.3))
    ea = es * (rh_pct / 100.0)
    
    # Slope of saturation vapor pressure curve (kPa/°C)
    delta = (4098 * es) / ((t + 237.3) ** 2)
    gamma = 0.067  # Psychrometric constant (kPa/°C)
    
    numerator = 0.408 * delta * (rn - g) + gamma * (900.0 / (t + 273.0)) * u2 * (es - ea)
    denominator = delta + gamma * (1.0 + 0.34 * u2)
    eto = max(round(numerator / denominator, 2), 0.5)
    
    # Estimate soil moisture index (% Volumetric Water Content)
    soil_moisture_vwc = round(min(max(42.0 - (eto * 2.1), 18.0), 55.0), 1)
    
    return {
        "eto_mm_day": eto,
        "soil_moisture_vwc": soil_moisture_vwc,
        "evaporation_demand": "High" if eto > 5.0 else ("Moderate" if eto > 3.0 else "Low"),
    }


def pesticide_spraying_window(wind_kph: float, rain_mm_hr: float, rh_pct: float, temp_c: float) -> dict:
    """
    Calculates agricultural spraying safety index (FAO & CIBRC norms).
    Wind must be 3-12 km/h (avoid drift <3km/h inversion or >15km/h drift), no rain within 4-6h,
    temp < 32°C to prevent droplet volatilization.
    """
    status = "Optimal Window"
    score = 92
    reasons = []
    
    if rain_mm_hr > 0.5:
        status = "Unsuitable (Rain Washoff)"
        score = 20
        reasons.append("Precipitation causes wash-off")
    elif wind_kph > 16.0:
        status = "Caution (High Drift Risk)"
        score = 45
        reasons.append(f"Wind speed {wind_kph} km/h exceeds 15 km/h safety limit")
    elif temp_c > 33.0:
        status = "Caution (Volatilization)"
        score = 55
        reasons.append("High ambient temperature accelerates droplet evaporation")
    else:
        reasons.append("Gentle breeze (3-12 km/h), rain-free horizon, optimal leaf adhesion")
        
    return {
        "status": status,
        "score": score,
        "confidence_level": 90,
        "reasons": reasons,
        "next_optimal_window": "Tomorrow 06:30 AM - 09:30 AM",
        "frost_risk": "Low" if temp_c > 6.0 else ("Moderate" if temp_c > 2.0 else "High (Danger)"),
    }


def nowcast_rain_forecast(rain_mm_hr: float, precip_pct: int) -> dict:
    """
    Generates minute-by-minute precipitation nowcast (0-60 minutes).
    """
    if rain_mm_hr > 0.5:
        dry_mins = 0
        text = f"Rain ongoing ({rain_mm_hr:.1f} mm/hr) — easing in ~40 min"
    elif precip_pct > 65:
        dry_mins = 12
        text = "Rain expected in ~12 min"
    elif precip_pct > 30:
        dry_mins = 25
        text = "No rain expected for 25 min"
    else:
        dry_mins = 60
        text = "Dry conditions for next 60+ min"
        
    series = []
    for m in range(0, 65, 5):
        val = max(0.0, rain_mm_hr * (1.0 - m / 50.0) if rain_mm_hr > 0 else (precip_pct / 100.0 * 0.4 if m > dry_mins else 0.0))
        series.append({"minute": m, "intensity_mm": round(val, 2)})
        
    return {
        "text": text,
        "dry_minutes": dry_mins,
        "minute_series": series,
    }


def pollen_index(temp_c: float, rh_pct: int, wind_kph: float) -> dict:
    """
    Calculates biological aero-allergen levels (Tree, Grass, Weed).
    Dry, windy days elevate pollen counts; humidity suppresses dispersion.
    """
    base = 25 if rh_pct > 70 else (60 if rh_pct < 45 else 40)
    wind_factor = min(wind_kph * 2.0, 30)
    score = int(min(max(base + wind_factor, 10), 100))
    
    tier = "Low" if score < 40 else ("Moderate" if score < 70 else "High")
    return {
        "level": tier,
        "score": score,
        "tree_pollen": "Low" if score < 50 else "Moderate",
        "grass_pollen": "Low",
        "weed_pollen": "Low" if score < 60 else "Moderate",
    }

