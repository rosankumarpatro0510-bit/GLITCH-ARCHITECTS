/* ==========================================================================
   GLITCH ARCHITECTURE — live adapter: Open-Meteo model fields
   --------------------------------------------------------------------------
   Why this shape: sampleAtmosphere() in core.js is SYNCHRONOUS and is called
   for every map cell and every lead hour. Instead of making the whole engine
   async, this adapter prefetches a small grid of model nodes around the
   selected point, caches it, and answers sample() synchronously from cache.
   If there is no cached data near a point (offline, API down, far from the
   selected location) sample() returns null and core.js keeps using its
   synthetic field. Nothing breaks; the UI is told which fields are live.

   Provides:  cape, cin, rh850, rainRate, soilSat, shear
   Does NOT provide: iwv, iwvTrend, convergence, ctt, cttTrend  (stay synthetic)

   Data: Open-Meteo.com — free for NON-COMMERCIAL use, CC BY 4.0 attribution
   required, < 10,000 calls/day. Grid is ~0.25° (~25 km): it is NOT hyper-local.
   ========================================================================== */
(function (global) {
  'use strict';
  const GA = global.GA, U = GA.U;

  const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const STEP = 0.25;                 // degrees between grid nodes
  const REACH = 0.4;                 // max distance (deg) a node may influence a point
  const TTL_MS = 30 * 60 * 1000;     // refetch after 30 minutes
  const TIMEOUT_MS = 9000;
  const SOIL_POROSITY = 0.45;        // HEURISTIC: m3/m3 treated as "full". Calibrate!

  const HOURLY = [
    'cape', 'convective_inhibition', 'relative_humidity_850hPa', 'precipitation',
    'soil_moisture_3_to_9cm',
    'wind_speed_10m', 'wind_direction_10m', 'wind_speed_500hPa', 'wind_direction_500hPa'
  ];

  const cache = new Map();           // centre key -> { fetchedAt, nodes: [...] }
  const inflight = new Map();
  let lastError = null;

  function centre(lat, lon) {
    return { lat: U.round(Math.round(lat / STEP) * STEP, 2), lon: U.round(Math.round(lon / STEP) * STEP, 2) };
  }

  /* ------------------------------------------------------------- fetching */
  async function load(c) {
    const lats = [], lons = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      lats.push(U.round(c.lat + i * STEP, 2)); lons.push(U.round(c.lon + j * STEP, 2));
    }
    const qs = new URLSearchParams({
      latitude: lats.join(','), longitude: lons.join(','),
      hourly: HOURLY.join(','),
      wind_speed_unit: 'ms', timeformat: 'unixtime', timezone: 'UTC', forecast_days: '2'
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT + '?' + qs, { signal: ctrl.signal });
      if (!res.ok) throw new Error('Open-Meteo HTTP ' + res.status);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];   // multi-location => array
      if (list.length !== lats.length) throw new Error('unexpected Open-Meteo response shape');
      return list.map((item, k) => {
        if (!item.hourly || !item.hourly.time) throw new Error('Open-Meteo response has no hourly block');
        return { lat: lats[k], lon: lons[k], series: item.hourly };
      });
    } finally { clearTimeout(timer); }
  }

  /** Prefetch around a point. Resolves true only when NEW data arrived. */
  function ensure(lat, lon) {
    const c = centre(lat, lon), key = c.lat + ',' + c.lon;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.fetchedAt < TTL_MS) return Promise.resolve(false);
    if (inflight.has(key)) return inflight.get(key);
    const p = load(c)
      .then(nodes => { cache.set(key, { fetchedAt: Date.now(), nodes }); lastError = null; return true; })
      .catch(err => { lastError = err; console.warn('[live] Open-Meteo unavailable:', err.message); return false; })
      .then(v => { inflight.delete(key); return v; });
    inflight.set(key, p);
    return p;
  }

  /* ------------------------------------------------------------- sampling */
  function valueAt(node, h, name) {
    const s = node.series, arr = s[name];
    if (!arr) return null;
    const i = Math.round((Date.now() / 1000 + h * 3600 - s.time[0]) / 3600);
    if (i < 0 || i >= arr.length) return null;
    const v = arr[i];
    return (v == null || Number.isNaN(v)) ? null : v;
  }

  function toUV(speed, dirDeg) {          // meteorological "from" direction
    const r = dirDeg * Math.PI / 180;
    return { u: -speed * Math.sin(r), v: -speed * Math.cos(r) };
  }

  // Each derive() returns a value for one node, or null if inputs are missing.
  const DERIVE = {
    cape:     (n, h) => valueAt(n, h, 'cape'),
    cin:      (n, h) => { const v = valueAt(n, h, 'convective_inhibition'); return v == null ? null : Math.abs(v); },
    rh850:    (n, h) => valueAt(n, h, 'relative_humidity_850hPa'),
    rainRate: (n, h) => valueAt(n, h, 'precipitation'),          // mm in preceding hour ~ mm/h
    soilSat:  (n, h) => { const v = valueAt(n, h, 'soil_moisture_3_to_9cm'); return v == null ? null : U.clamp(v / SOIL_POROSITY, 0, 1); },
    shear:    (n, h) => {                                        // |V500 - V10m| ~ 0-6 km bulk shear proxy
      const a = valueAt(n, h, 'wind_speed_500hPa'), ad = valueAt(n, h, 'wind_direction_500hPa');
      const b = valueAt(n, h, 'wind_speed_10m'),    bd = valueAt(n, h, 'wind_direction_10m');
      if ([a, ad, b, bd].some(x => x == null)) return null;
      const A = toUV(a, ad), B = toUV(b, bd);
      return Math.hypot(A.u - B.u, A.v - B.v);
    }
  };

  function nearestNodes(lat, lon) {
    const k = Math.cos(lat * Math.PI / 180) || 0.2, out = [];
    cache.forEach(e => e.nodes.forEach(n => {
      const d = Math.hypot(n.lat - lat, (n.lon - lon) * k);
      if (d <= REACH) out.push({ n, d });
    }));
    return out.sort((a, b) => a.d - b.d).slice(0, 4);
  }

  /** Synchronous. Returns { cape, cin, rh850, rainRate, soilSat, shear } (only the
   *  fields that exist) or null when nothing cached is near this point. */
  function sample(lat, lon, hourOffset) {
    const near = nearestNodes(lat, lon);
    if (!near.length) return null;
    const out = {};
    Object.keys(DERIVE).forEach(field => {
      let sw = 0, sv = 0;
      near.forEach(({ n, d }) => {
        const v = DERIVE[field](n, hourOffset || 0);
        if (v == null) return;
        const w = 1 / Math.pow(Math.max(d, 0.02), 2);           // inverse-distance weight
        sw += w; sv += w * v;
      });
      if (sw) out[field] = sv / sw;
    });
    return Object.keys(out).length ? out : null;
  }

  const hasData = (lat, lon) => nearestNodes(lat, lon).length > 0;
  const status = () => ({ error: lastError ? String(lastError.message || lastError) : null, cached: cache.size });

  GA.live = { ensure, sample, hasData, status, FIELDS: Object.keys(DERIVE) };
})(window);
