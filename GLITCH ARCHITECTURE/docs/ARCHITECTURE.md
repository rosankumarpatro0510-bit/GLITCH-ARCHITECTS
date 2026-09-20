# Architecture

## Principle

Everything above the data layer is written against a **fixed assessment contract**. Views never touch a data source. That means the demonstration model can be replaced with real ingest without editing a single view file.

```
┌──────────────────────────────────────────────────────┐
│  views.js · app.js        (ten modules, router, UI)  │
├──────────────────────────────────────────────────────┤
│  state.js                 (store, alerts, reports)   │
├──────────────────────────────────────────────────────┤
│  core.js  assess()        ← THE CONTRACT             │
│           scoreHazard() · timeline() · lattice()     │
├──────────────────────────────────────────────────────┤
│  core.js  sampleAtmosphere()  ← THE SWAP POINT       │
│           (currently synthetic)                      │
└──────────────────────────────────────────────────────┘
```

## The contract

`assess(lat, lon, hourOffset, opts)` returns:

```js
{
  lat, lon,
  atm: { cape, cin, iwv, iwvTrend, shear, convergence,
         ctt, cttTrend, rainRate, rh850, soilSat,
         terrain: { elevation, slope, range, drainage, urbanisation, coastal } },
  status: { feeds[], coverage, degraded },
  hazards: { thunderstorm, cloudburst, flashflood },   // each: {score, band, contribs[], leadDriver, leadSuppressor}
  list, dominant, overall, overallBand, confidence, simulated, generatedAt
}
```

Anything that satisfies this shape works with the whole application.

## Swapping in real data

Replace exactly one function: `sampleAtmosphere(lat, lon, hourOffset, opts)`. It must return the `atm` object above.

```js
// core.js — replace the synthetic generator with:
async function sampleAtmosphere(lat, lon, hourOffset, opts) {
  const [sat, radar, nwp, dem] = await Promise.all([
    Adapters.insat.nearest(lat, lon, hourOffset),   // CTT, CTT trend, IWV
    Adapters.dwr.nearest(lat, lon),                 // rainRate, reflectivity
    Adapters.gfs.interp(lat, lon, hourOffset),      // CAPE, CIN, shear, convergence, rh850
    Adapters.dem.lookup(lat, lon)                   // elevation, slope, drainage
  ]);
  return merge(sat, radar, nwp, dem);
}
```

`dataStatus()` already models per-feed availability and drives the degraded-state UI, so partial adapter failure degrades gracefully rather than blanking the console. The Prediction page's feed matrix reads straight from it.

### Making it async

`assess()` is currently synchronous. With real adapters, promote `assess`, `timeline` and `lattice` to async and `await` them in `state.recompute()`. The views already re-render from a single `render()` call, so nothing else changes. The `lattice()` call needs batching — one request per 2 km cell is not viable, so query a tile and interpolate.

## Replacing the scoring model

`scoreHazard(model, atm)` returns `{score, band, contribs[], leadDriver, leadSuppressor}`. To use a trained model, call the inference service and map its response into the same shape:

```js
async function scoreHazard(model, atm) {
  const r = await fetch('/api/v1/infer', {
    method: 'POST',
    body: JSON.stringify({ hazard: model.key, features: vectorise(atm) })
  }).then(r => r.json());
  return {
    key: model.key, label: model.label, colour: model.colour,
    score: r.probability * 100,
    band: band(r.probability * 100),
    contribs: r.shap.map(s => ({          // real SHAP values from TreeExplainer
      id: s.feature, name: FEATURE_NAMES[s.feature],
      short: FEATURE_SHORT[s.feature], value: fmtFeature(s.feature, atm),
      contribution: s.value,
      note: s.value >= 0 ? PLUS[s.feature] : MINUS[s.feature]
    })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    leadDriver: /* strongest positive */, leadSuppressor: /* strongest negative */
  };
}
```

The Explainability view renders `contribs` generically. It does not know or care whether the numbers came from the surrogate or from SHAP.

**Calibration note.** The surrogate's per-hazard `pivot` constants exist only because the synthetic field has no ground truth. A trained model calibrates against observed event frequencies instead (reliability diagrams, isotonic or Platt scaling), and the pivots are deleted.

## Routing

`state.buildRoutes(from, to)` requests up to three real road alternatives from the public OSRM routing service and scores every returned road-geometry point against the same risk field:

```js
const r = await fetch(`${OSRM}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=3&geometries=geojson`);
const corridors = (await r.json()).routes.map(x => x.geometry.coordinates);
// convert [lon, lat] points, then score each road corridor exactly as now
```

The map draws the returned road geometries, while the route cards rank them by mean and peak modelled exposure. A lower-exposure route is still not a guarantee that the road is safe or open.

## Exposure

`exposure()` currently models asset counts from land-cover and population-density proxies. In deployment it becomes an Overpass query clipped to the risk polygon:

```
[out:json][timeout:25];
(
  node["amenity"~"hospital|clinic|school|fire_station|shelter"](poly:"...");
  way["highway"](poly:"...");
  node["power"="substation"](poly:"...");
);
out count;
```

Population comes from a WorldPop 100 m raster zonal sum. The `available` flag per asset type already drives the "no data" state, which matters because OSM coverage is genuinely thin in rural India — the UI must show a gap as a gap, never as a zero.

## Map backends

`GAMap.create(el, opts)` returns one of two objects with an identical interface (`setView`, `cells`, `circle`, `marker`, `line`, `fit`, `onClick`, `onMove`, `clear`, `destroy`):

- **Leaflet** when `window.L` is present and the tile CDN is reachable.
- **Canvas grid view** otherwise — draws graticule, terrain shading from the same `terrainAt()` proxy the model uses, gazetteer, and all overlay primitives. Labelled `grid view · no basemap` on screen.

View code calls the same methods either way.

## Assistant

`assistant.js` answers from three sources and nothing else: current dashboard state, a fixed glossary, and a fixed safety library. There is no generative model and no weather API behind it — it structurally *cannot* invent a live observation.

Intents are scanned top-down in `INTENTS`, most specific first. `hazardInQuery()` extracts the hazard the user actually named so a thunderstorm question never gets answered with flash-flood advice.

Adding a language: one entry in `LANGS` with an honest `coverage` value, one object in `T`, one in `SAFETY_LOCAL`. Mark `coverage: 'safety'` unless the full pack is genuinely reviewed by a speaker.

## State and persistence

`localStorage` under `ga.state.v1` holds the selected location, citizen reports, language and layer toggles. There is no server. In deployment, reports POST to a moderation queue with rate limiting, device attestation and spam scoring before they are visible to anyone else.
