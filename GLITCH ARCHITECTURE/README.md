# Glitch Architecture

A hyper-local severe-weather nowcasting and disaster-response console for thunderstorms, cloudbursts and flash floods. Built as a Smart India Hackathon prototype.

---

## Read this first

This is a **demonstration prototype**, not an operational warning system.

- The risk engine is a deterministic, physically-motivated **synthetic** field generator plus a transparent weighted scoring model. It is **not trained on observations**.
- **No live satellite, radar, rain-gauge or NWP data is ingested.** The adapter interfaces are specified and documented; the endpoints are not connected.
- **No accuracy, skill score or lead-time figure is claimed anywhere**, because no verification run has been performed. You will not find a "94% accurate" badge in this repository, and that is deliberate.
- Alerts are generated from demonstration thresholds and are labelled `DEMO` or `SIMULATED`. None of them is a government warning.
- Routes are compared by modelled exposure. A lower-exposure route is described as _comparatively lower risk_ — **never as safe**.
- Citizen reports are public observations and are never promoted into the model as measurements.

For official severe-weather warnings in India, follow the **India Meteorological Department (IMD)**, the **National Disaster Management Authority (NDMA)** and your **State Disaster Management Authority**. Emergency number **112**. NDMA helpline **1078**.

---

## Running it

No build step, no dependencies to install.

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from the filesystem also works, though some browsers restrict `file://` for the geolocation and speech APIs.

### What needs network, and what doesn't

| Feature                        | Online                                       | Offline                                                                                            |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Risk engine, all ten modules   | ✅                                           | ✅                                                                                                 |
| Map basemap                    | OpenStreetMap raster tiles via Leaflet       | falls back to a built-in canvas **grid view** (graticule, terrain shading, risk cells, no imagery) |
| Place search                   | OpenStreetMap Nominatim + built-in gazetteer | 88-entry built-in gazetteer + coordinate parsing                                                   |
| Reverse geocoding on map click | Nominatim                                    | nearest-gazetteer fallback                                                                         |
| Voice                          | browser Web Speech API                       | unavailable, states so                                                                             |

The offline fallbacks exist because a hackathon demo should not die on venue wifi.

---

## Layout

```
index.html              landing page
app.html                console shell
assets/css/base.css     design tokens, typography, landing
assets/css/console.css  console layout and components
assets/js/core.js       risk engine, atmosphere model, geocoding, glossary
assets/js/state.js      store, alerts, citizen reports, route builder
assets/js/map.js        map abstraction (Leaflet + canvas fallback)
assets/js/views.js      the ten module views
assets/js/assistant.js  chatbot intents, i18n, voice
assets/js/app.js        shell, router, search, assistant dock
tools/calibrate.js      measures the field distribution used to set model pivots
docs/                   architecture, data sources, demo script
```

---

## The ten modules

| Module             | What it does                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Situation overview | Overall + per-hazard scores, 12 atmospheric indicators, window, confidence, feed status       |
| Risk map           | Global pan/zoom to a 2 km risk lattice, 8 toggleable layers                                   |
| Prediction         | Hour-by-hour evolution to 6 h, per-hazard outlooks, cell motion, per-step confidence          |
| Why this risk      | Signed per-feature contributions + plain-language reading                                     |
| Impact analysis    | Residents, roads, schools, hospitals, bridges, substations, emergency facilities in footprint |
| Safe routes        | Corridor comparison by hazard exposure with segment-level explanation                         |
| Alert centre       | Categorised alerts with area, window, severity, reason, action, provenance                    |
| What-if simulator  | Five drivers + four presets; risk, exposure, routing and alerts all respond                   |
| Citizen reports    | Nine hazard types, photo, moderation states, corroboration logic                              |
| Data & limits      | What is real, what is not connected, planned sources                                          |

Plus a context-aware assistant (chat + voice) reachable from anywhere in the console.

---

## Model transparency

The scoring model is an explicit weighted surrogate:

```
score = sigmoid( Σ wᵢ·φᵢ(x) − W·pivot ) × 100
```

Because that form is transparent, the contribution bars in the **Why this risk** module are the model's _actual_ per-feature contributions (`wᵢ·(φᵢ − pivot)`), not a post-hoc approximation. They sum to the logit the model used.

Per-hazard `pivot` constants were measured empirically, not guessed — run `node tools/calibrate.js` to reproduce the distribution they came from. Targets: median conditions land in the low 20s, p90 in the low 40s, p98 in the low 60s.

When a trained gradient-boosted model replaces the surrogate, these bars are replaced by **SHAP** values from the inference service (`TreeExplainer` over the same feature vector). The panel layout does not change; only the source of the numbers does. A sequence model would surface temporal attention weights instead.

**These are associations inside a model, not proven physical causes.**

---

## Languages

| Language        | Answer pack    | Notes                               |
| --------------- | -------------- | ----------------------------------- |
| English (en-IN) | full           |                                     |
| Hindi (hi-IN)   | full           |                                     |
| Bengali (bn-IN) | full           |                                     |
| Odia (or-IN)    | safety phrases | longer answers fall back to English |
| Tamil (ta-IN)   | safety phrases | longer answers fall back to English |

Odia and Tamil ship **core safety phrases only**, and the interface says so. Five shallow machine-translated languages would be worse than three solid ones plus two honest partials — in a safety context, a garbled evacuation instruction is a hazard in itself. Adding a full pack means adding one object to `T` and one to `SAFETY_LOCAL` in `assistant.js`; nothing else changes.

Voice support is detected per device. Where no voice is installed for the selected language, the assistant reads the answer in English and **tells you it did that** rather than mangling the pronunciation.
