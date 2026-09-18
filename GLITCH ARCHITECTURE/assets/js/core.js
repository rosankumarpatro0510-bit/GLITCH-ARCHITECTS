/* ==========================================================================
   GLITCH ARCHITECTURE — core engine
   --------------------------------------------------------------------------
   IMPORTANT / HONESTY NOTE
   This file contains a DEMONSTRATION nowcasting model. It is a deterministic,
   physically-motivated synthetic field generator plus a transparent weighted
   scoring model. It is NOT trained on observations and it does NOT ingest live
   satellite or radar data in this build.

   Everything it produces is labelled DEMO in the interface. The architecture
   is designed so that `Engine.sampleAtmosphere()` can be swapped for a real
   ingest adapter (INSAT-3D/3DR, IMD AWS, GPM IMERG, ERA5) without touching any
   view code — see docs/ARCHITECTURE.md.

   Because the scoring model is an explicit linear-with-interactions surrogate,
   the per-feature contributions shown in the Explainability module are the
   model's ACTUAL contributions, not invented numbers. When a trained XGBoost
   model is plugged in, these are replaced by real SHAP values from the
   inference service.
   ========================================================================== */

(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- utils */
  const U = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    round: (v, d = 0) => { const p = Math.pow(10, d); return Math.round(v * p) / p; },
    fmt(v, d = 0) {
      if (v === null || v === undefined || Number.isNaN(v)) return '—';
      return U.round(v, d).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    compact(v) {
      if (v === null || v === undefined || Number.isNaN(v)) return '—';
      const a = Math.abs(v);
      if (a >= 1e7) return U.round(v / 1e7, 2) + ' cr';
      if (a >= 1e5) return U.round(v / 1e5, 2) + ' L';
      if (a >= 1e3) return U.round(v / 1e3, 1) + 'k';
      return String(Math.round(v));
    },
    dms(lat, lon) {
      const f = (v, p, n) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? p : n}`;
      return `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`;
    },
    timeHHMM(d) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    },
    ago(ts) {
      const s = Math.floor((Date.now() - ts) / 1000);
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s / 60) + ' min ago';
      if (s < 86400) return Math.floor(s / 3600) + ' h ago';
      return Math.floor(s / 86400) + ' d ago';
    },
    esc(s) {
      return String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    uid() { return 'r' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  };

  /* ------------------------------------------------- deterministic hashing */
  // Same coordinates + same hour => same field. Makes demos reproducible and
  // makes the map spatially coherent instead of random noise.
  function hash32(x) {
    x = (x ^ 61) ^ (x >>> 16);
    x = (x + (x << 3)) | 0;
    x = x ^ (x >>> 4);
    x = Math.imul(x, 0x27d4eb2d);
    x = x ^ (x >>> 15);
    return x >>> 0;
  }
  function rand2(ix, iy, salt) {
    return hash32(Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(salt | 0, 2246822519)) / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }

  // 2-D value noise over lat/lon at a given cell size (degrees)
  function noise(lat, lon, cell, salt) {
    const x = lon / cell, y = lat / cell;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = rand2(x0, y0, salt), b = rand2(x0 + 1, y0, salt);
    const c = rand2(x0, y0 + 1, salt), d = rand2(x0 + 1, y0 + 1, salt);
    return U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy);
  }
  function fbm(lat, lon, salt, oct = 3, cell = 2.2) {
    let v = 0, amp = 0.55, c = cell, norm = 0;
    for (let i = 0; i < oct; i++) { v += amp * noise(lat, lon, c, salt + i * 71); norm += amp; amp *= 0.5; c *= 0.42; }
    return v / norm;
  }

  /* ------------------------------------------------------- terrain proxies */
  // Coarse orographic proxy. Real deployment replaces this with SRTM/Cartosat
  // DEM lookups; the interface labels it as a modelled proxy either way.
  const RANGES = [
    { name: 'Himalaya',        lat: 30.5, lon: 79.5, rx: 13, ry: 3.2, h: 4600, s: 34 },
    { name: 'Western Ghats',   lat: 14.5, lon: 75.0, rx: 1.8, ry: 8.5, h: 1200, s: 22 },
    { name: 'Eastern Ghats',   lat: 17.5, lon: 82.5, rx: 2.4, ry: 5.0, h: 850,  s: 14 },
    { name: 'Vindhya–Satpura', lat: 22.3, lon: 78.5, rx: 7.5, ry: 1.7, h: 800,  s: 12 },
    { name: 'Aravalli',        lat: 25.5, lon: 73.5, rx: 2.0, ry: 3.6, h: 700,  s: 11 },
    { name: 'Alps',            lat: 46.5, lon: 10.0, rx: 6.0, ry: 2.0, h: 3200, s: 30 },
    { name: 'Rockies',         lat: 43.0, lon: -110.0, rx: 6.5, ry: 12.0, h: 3000, s: 25 },
    { name: 'Andes',           lat: -20.0, lon: -68.0, rx: 3.5, ry: 30.0, h: 4200, s: 32 },
    { name: 'Japanese Alps',   lat: 36.2, lon: 137.8, rx: 1.8, ry: 2.2, h: 2400, s: 26 }
  ];

  function terrainAt(lat, lon) {
    let elev = 40 + fbm(lat, lon, 11, 3, 3.0) * 260;
    let slope = 1 + fbm(lat, lon, 23, 2, 1.4) * 5;
    let range = null;
    for (const r of RANGES) {
      const dx = (lon - r.lon) / r.rx, dy = (lat - r.lat) / r.ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1.35) {
        const w = Math.exp(-d * d * 2.1);
        elev += r.h * w;
        slope += r.s * w;
        if (w > 0.28 && (!range || w > range.w)) range = { name: r.name, w: w };
      }
    }
    const coastal = Math.abs(fbm(lat, lon, 91, 2, 4.0) - 0.5) < 0.06;
    // drainage susceptibility: flat + low + high upstream accumulation = worse
    const flat = U.clamp(1 - slope / 22, 0, 1);
    const low = U.clamp(1 - elev / 900, 0, 1);
    const accum = fbm(lat, lon, 137, 3, 1.1);
    const drainage = U.clamp(0.22 * flat + 0.3 * low + 0.48 * accum, 0, 1);
    const urban = U.clamp(fbm(lat, lon, 211, 2, 0.9) * 0.75 + (Math.abs(lat) < 40 ? 0.15 : 0.05), 0, 1);
    return {
      elevation: Math.round(elev),
      slope: U.round(slope, 1),
      range: range ? range.name : null,
      drainage: U.round(drainage, 3),
      urbanisation: U.round(urban, 3),
      coastal
    };
  }

  /* ---------------------------------------------------------- steering */
  // One steering field, used both to advect the weather field forward in time
  // and to draw the cell-motion arrow, so the two can never disagree.
  function steering(lat, lon) {
    const trop = Math.abs(lat) < 23;
    const base = trop ? 250 : 65;                       // easterlies / westerlies
    const jitter = (fbm(lat, lon, 613, 2, 3.0) - 0.5) * 70;
    const bearing = (base + jitter + 360) % 360;
    const speed = 8 + fbm(lat, lon, 617, 2, 2.0) * 34;  // km/h
    const rad = bearing * Math.PI / 180;
    return {
      bearing, speed,
      vLat: (speed * Math.cos(rad)) / 111,
      vLon: (speed * Math.sin(rad)) / (111 * Math.cos(lat * Math.PI / 180) || 1)
    };
  }

  /* ------------------------------------------------- synthetic atmosphere */
  // Seasonal + diurnal + spatial. Produces the nine indicators the brief lists.
  function sampleAtmosphere(lat, lon, hourOffset, opts) {
    opts = opts || {};
    const now = new Date(Date.now() + hourOffset * 3600e3);
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400e3);
    const hr = now.getHours() + now.getMinutes() / 60;
    const salt = Math.floor(Date.now() / 3600e3) % 997; // re-rolls hourly

    // seasonal monsoon weighting for the Indian domain, generic elsewhere
    const monsoon = (lat > 5 && lat < 37 && lon > 66 && lon < 98)
      ? U.clamp(Math.sin(((doy - 150) / 185) * Math.PI), 0, 1)
      : U.clamp(0.35 + 0.35 * Math.sin(((doy - 80) / 182) * Math.PI) * (lat >= 0 ? 1 : -1), 0, 1);

    const tropical = U.clamp(1 - Math.abs(lat) / 55, 0, 1);
    const t = terrainAt(lat, lon);

    // diurnal convective cycle — peaks late afternoon
    const diurnal = U.clamp(0.35 + 0.65 * Math.sin(Math.max(0, (hr - 8)) / 16 * Math.PI), 0, 1);

    // The weather field is advected by the steering flow, so looking N hours
    // ahead samples the air that is currently upstream. This is what makes the
    // timeline evolve instead of sitting flat, and it keeps the Prediction
    // page's cell-motion arrow consistent with the numbers beside it.
    const st = steering(lat, lon);
    const sLat = lat - st.vLat * hourOffset;
    const sLon = lon - st.vLon * hourOffset;

    const nA = fbm(sLat, sLon, salt + 1, 3, 2.4);
    const nB = fbm(sLat, sLon, salt + 37, 3, 1.5);
    const nC = fbm(sLat, sLon, salt + 73, 2, 0.8);
    const drift = 0.5 + 0.5 * Math.sin((hourOffset + salt % 7) * 0.55); // tendency phase

    // --- indicators ---------------------------------------------------
    let iwv = 12 + 46 * (0.45 * tropical + 0.35 * monsoon + 0.2 * nA) + (t.coastal ? 5 : 0);
    let iwvTrend = (nB - 0.42) * 6 * drift;                         // mm / 3h
    let cape = 120 + 3600 * (0.5 * nA + 0.28 * diurnal * tropical + 0.22 * monsoon) * (0.6 + 0.6 * diurnal);
    let cin = 145 * (1 - 0.7 * diurnal) * (0.4 + 0.9 * nC);
    let shear = 3 + 26 * (0.45 * nB + 0.3 * (1 - tropical) + 0.25 * nC);
    let conv = -6 + 22 * (0.55 * nC + 0.25 * nA + 0.2 * monsoon) + t.slope * 0.22; // 1e-5 s^-1
    let ctt = -20 - 62 * (0.6 * nA + 0.4 * diurnal * tropical);
    let cttTrend = -(nC - 0.4) * 14 * drift;                         // K / 30 min
    let rain = Math.max(0, (nA * nB * 3.1 - 0.22)) * 52 * (0.35 + 0.65 * monsoon);
    let rh850 = 45 + 52 * (0.5 * nA + 0.3 * monsoon + 0.2 * tropical);
    let soil = U.clamp(0.25 + 0.5 * monsoon + 0.35 * (nB - 0.5), 0, 1);

    // orographic enhancement of moisture convergence and rainfall
    if (t.slope > 10) { conv += t.slope * 0.35; rain *= 1 + t.slope / 55; }

    // scenario overrides from the What-if simulator
    if (opts.scenario) {
      const s = opts.scenario;
      rain *= (1 + (s.rain || 0) / 100);
      cape *= (1 + (s.storm || 0) / 100);
      shear *= (1 + (s.storm || 0) / 200);
      iwv *= (1 + (s.moisture || 0) / 100);
      iwvTrend += (s.moisture || 0) / 22;
      soil = U.clamp(soil + (s.soil || 0) / 100, 0, 1);
      cin *= (1 - U.clamp((s.storm || 0) / 180, 0, 0.85));
    }

    return {
      at: now,
      hourOffset,
      iwv: U.round(U.clamp(iwv, 5, 82), 1),
      iwvTrend: U.round(iwvTrend, 1),
      cape: Math.round(U.clamp(cape, 0, 6200)),
      cin: Math.round(U.clamp(cin, 0, 260)),
      shear: U.round(U.clamp(shear, 0, 42), 1),
      convergence: U.round(conv, 1),
      ctt: Math.round(U.clamp(ctt, -92, 12)),
      cttTrend: U.round(cttTrend, 1),
      rainRate: U.round(U.clamp(rain, 0, 160), 1),
      rh850: Math.round(U.clamp(rh850, 12, 100)),
      soilSat: U.round(soil, 2),
      terrain: t
    };
  }

  /* ----------------------------------------------------- scoring surrogate */
  // Each hazard score = sigma( bias + Σ wᵢ·φᵢ(x) ). Because the form is
  // explicit, wᵢ·φᵢ IS the feature contribution. We report it as such and
  // never dress it up as a trained SHAP value.
  function sig(z) { return 1 / (1 + Math.exp(-z)); }
  function nrm(v, lo, hi) { return U.clamp((v - lo) / (hi - lo), 0, 1); }

  // --- calibration -------------------------------------------------------
  // Each model's `pivot` is the weighted-mean feature level at which it scores
  // 50. These are not guesses: they were measured by sampling the field over
  // ~1200 random global points and lead times and reading off the upper
  // percentiles (see tools/calibrate.js). They differ per hazard because the
  // hazards are not equally common — cloudburst conditions sit much lower on
  // the feature scale than thunderstorm conditions, so a shared pivot would
  // make cloudbursts impossible and thunderstorms constant.
  //
  // Targets: roughly p50 -> low 20s, p90 -> low 40s, p98 -> low 60s (High).
  // A monitoring console that reads "severe" everywhere is useless, and one
  // that never leaves "minimal" is equally useless.
  //
  // When a trained model replaces this surrogate, calibration comes from
  // observed event frequencies instead, and these constants are dropped.
  function calibrate(model) {
    const W = model.features.reduce((s, f) => s + f.w, 0);
    model.totalWeight = W;
    model.bias = -W * model.pivot;
    return model;
  }

  const MODELS = {
    thunderstorm: {
      label: 'Thunderstorm',
      key: 'thunderstorm',
      colour: 'var(--hz-storm)',
      pivot: 0.450,
      features: [
        { id: 'cape', name: 'Convective available potential energy', short: 'High instability (CAPE)', w: 3.35,
          phi: a => nrm(a.cape, 200, 3800), fmt: a => a.cape + ' J/kg',
          plus: 'The atmosphere holds a lot of buoyant energy for updraughts.',
          minus: 'Instability is limited, so deep updraughts are less likely.' },
        { id: 'cin', name: 'Convective inhibition', short: 'Reduced capping (CIN)', w: 1.75,
          phi: a => 1 - nrm(a.cin, 10, 190), fmt: a => a.cin + ' J/kg',
          plus: 'The cap holding convection down has weakened.',
          minus: 'A strong cap is suppressing convection for now.' },
        { id: 'conv', name: 'Low-level convergence', short: 'Low-level convergence', w: 2.15,
          phi: a => nrm(a.convergence, -2, 26), fmt: a => a.convergence + '×10⁻⁵ s⁻¹',
          plus: 'Air is piling up near the surface and being forced upward.',
          minus: 'Low-level flow is divergent, which discourages lift.' },
        { id: 'shear', name: '0–6 km bulk wind shear', short: 'Wind shear', w: 1.25,
          phi: a => nrm(a.shear, 5, 30), fmt: a => a.shear + ' m/s',
          plus: 'Shear can organise and sustain storm structure.',
          minus: 'Weak shear favours short-lived, disorganised cells.' },
        { id: 'cttTrend', name: 'Cloud-top temperature trend', short: 'Rapid cloud-top cooling', w: 1.95,
          phi: a => nrm(-a.cttTrend, 0, 9), fmt: a => (a.cttTrend > 0 ? '+' : '') + a.cttTrend + ' K/30min',
          plus: 'Cloud tops are cooling quickly — the sign of a growing updraught.',
          minus: 'Cloud tops are warming or steady, suggesting decay.' },
        { id: 'ctt', name: 'Cloud-top temperature', short: 'Cold cloud tops', w: 1.1,
          phi: a => nrm(-a.ctt, 20, 80), fmt: a => a.ctt + ' °C',
          plus: 'Very cold tops indicate deep convection.',
          minus: 'Cloud tops are relatively warm — shallow cloud.' }
      ]
    },
    cloudburst: {
      label: 'Cloudburst',
      key: 'cloudburst',
      colour: 'var(--hz-cloud)',
      pivot: 0.262,
      features: [
        { id: 'iwv', name: 'Integrated water vapour', short: 'Deep moisture column', w: 2.9,
          phi: a => nrm(a.iwv, 25, 68), fmt: a => a.iwv + ' mm',
          plus: 'There is an unusually deep column of moisture to rain out.',
          minus: 'The moisture column is thin, limiting total rainfall.' },
        { id: 'iwvTrend', name: 'IWV tendency', short: 'Rapid moisture increase', w: 2.25,
          phi: a => nrm(a.iwvTrend, -1, 6), fmt: a => (a.iwvTrend > 0 ? '+' : '') + a.iwvTrend + ' mm/3h',
          plus: 'Moisture is being advected in quickly.',
          minus: 'Moisture is steady or decreasing.' },
        { id: 'rain', name: 'Rainfall intensity', short: 'High rainfall intensity', w: 2.6,
          phi: a => nrm(a.rainRate, 4, 70), fmt: a => a.rainRate + ' mm/h',
          plus: 'Current rates are already in the heavy-rain band.',
          minus: 'Current rainfall rates are light.' },
        { id: 'conv', name: 'Low-level convergence', short: 'Moisture convergence', w: 1.8,
          phi: a => nrm(a.convergence, -2, 26), fmt: a => a.convergence + '×10⁻⁵ s⁻¹',
          plus: 'Converging flow is feeding moisture into one area.',
          minus: 'Flow is not concentrating moisture here.' },
        { id: 'orog', name: 'Orographic lift (slope)', short: 'Terrain-forced lift', w: 1.6,
          phi: a => nrm(a.terrain.slope, 3, 28), fmt: a => a.terrain.slope + '° mean slope',
          plus: 'Steep terrain forces moist air upward and can anchor a cell.',
          minus: 'Terrain here is gentle, so orographic forcing is small.' },
        { id: 'cttTrend', name: 'Cloud-top cooling rate', short: 'Rapid cloud-top cooling', w: 1.45,
          phi: a => nrm(-a.cttTrend, 0, 9), fmt: a => (a.cttTrend > 0 ? '+' : '') + a.cttTrend + ' K/30min',
          plus: 'Explosive vertical growth is under way.',
          minus: 'No rapid vertical growth detected.' }
      ]
    },
    flashflood: {
      label: 'Flash flood',
      key: 'flashflood',
      colour: 'var(--hz-flood)',
      pivot: 0.475,
      features: [
        { id: 'rain', name: 'Rainfall intensity', short: 'High rainfall intensity', w: 3.1,
          phi: a => nrm(a.rainRate, 3, 62), fmt: a => a.rainRate + ' mm/h',
          plus: 'Rain is falling faster than the ground and drains can take it.',
          minus: 'Rainfall rates are below runoff-generating thresholds.' },
        { id: 'drain', name: 'Drainage susceptibility', short: 'Poor drainage / low-lying', w: 2.45,
          phi: a => a.terrain.drainage, fmt: a => U.round(a.terrain.drainage * 100, 0) + ' / 100 index',
          plus: 'Water collects here rather than draining away.',
          minus: 'Local drainage capacity is comparatively good.' },
        { id: 'soil', name: 'Soil saturation', short: 'Already-saturated ground', w: 2.05,
          phi: a => a.soilSat, fmt: a => U.round(a.soilSat * 100, 0) + '% saturated',
          plus: 'Saturated soil means almost all new rain becomes runoff.',
          minus: 'Dry soil can still absorb a share of the rainfall.' },
        { id: 'slope', name: 'Catchment slope', short: 'Steep upstream slope', w: 1.5,
          phi: a => nrm(a.terrain.slope, 2, 26), fmt: a => a.terrain.slope + '°',
          plus: 'Steep ground concentrates runoff quickly into channels.',
          minus: 'Gentle slopes slow the rise of water.' },
        { id: 'urban', name: 'Impervious surface fraction', short: 'Built-up / sealed surface', w: 1.4,
          phi: a => a.terrain.urbanisation, fmt: a => U.round(a.terrain.urbanisation * 100, 0) + '% built-up',
          plus: 'Sealed surfaces stop infiltration and speed up runoff.',
          minus: 'Permeable land cover absorbs some rainfall.' },
        { id: 'iwv', name: 'Integrated water vapour', short: 'Moisture available for more rain', w: 1.15,
          phi: a => nrm(a.iwv, 25, 68), fmt: a => a.iwv + ' mm',
          plus: 'More moisture is available to keep rain going.',
          minus: 'Limited moisture caps how long rain can last.' }
      ]
    }
  };

  const BANDS = [
    { min: 0,  key: 'none', label: 'Minimal',  cls: 'sev-none', bg: 'bg-none', colour: '#5E7385' },
    { min: 20, key: 'low',  label: 'Low',      cls: 'sev-low',  bg: 'bg-low',  colour: '#3FA66A' },
    { min: 40, key: 'mod',  label: 'Moderate', cls: 'sev-mod',  bg: 'bg-mod',  colour: '#E0A33E' },
    { min: 62, key: 'high', label: 'High',     cls: 'sev-high', bg: 'bg-high', colour: '#E2703A' },
    { min: 80, key: 'sev',  label: 'Severe',   cls: 'sev-sev',  bg: 'bg-sev',  colour: '#D2423F' }
  ];
  function band(score) {
    let b = BANDS[0];
    for (const x of BANDS) if (score >= x.min) b = x;
    return b;
  }

  Object.values(MODELS).forEach(calibrate);

  function scoreHazard(model, atm) {
    let z = model.bias;
    const contribs = [];
    for (const f of model.features) {
      const phi = U.clamp(f.phi(atm), 0, 1);
      // Contribution is measured against the same pivot the bias is built from,
      // so the signed bars below add up to the logit the model actually used.
      const c = f.w * (phi - model.pivot);
      z += f.w * phi;
      contribs.push({
        id: f.id, name: f.name, short: f.short, value: f.fmt(atm),
        phi: U.round(phi, 3), contribution: U.round(c, 3),
        note: c >= 0 ? f.plus : f.minus
      });
    }
    const score = U.round(sig(z) * 100, 1);
    contribs.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    const raisers = contribs.filter(c => c.contribution > 0);
    return {
      key: model.key, label: model.label, colour: model.colour,
      score, band: band(score), contribs,
      // the strongest indicator actually pushing the score up, which is not
      // always the largest bar — sometimes the biggest mover is a suppressor
      leadDriver: raisers[0] || null,
      leadSuppressor: contribs.filter(c => c.contribution < 0)[0] || null
    };
  }

  /* --------------------------------------------------- confidence + status */
  // Confidence falls with lead time and with sparse "data availability".
  function dataStatus(lat, lon) {
    const n = fbm(lat, lon, 401, 2, 6.0);
    const inIndia = lat > 6 && lat < 37 && lon > 67 && lon < 98;
    const feeds = [
      { id: 'sat',   name: 'Geostationary IR / WV', src: inIndia ? 'INSAT-3DR (adapter not connected)' : 'Global GEO composite (adapter not connected)', ok: true,  cadence: '15 min' },
      { id: 'radar', name: 'Doppler radar (DWR)',   src: inIndia ? 'IMD DWR network' : 'National radar network', ok: n > 0.35, cadence: '10 min' },
      { id: 'aws',   name: 'Surface stations',      src: 'AWS / ARG rain gauges',    ok: n > 0.22, cadence: '15 min' },
      { id: 'nwp',   name: 'NWP fields',            src: 'GFS 0.25° / WRF nest',     ok: true,  cadence: '6 h' },
      { id: 'dem',   name: 'Terrain & drainage',    src: 'SRTM 30 m derived',        ok: true,  cadence: 'static' },
      { id: 'osm',   name: 'Infrastructure',        src: 'OpenStreetMap extract',    ok: n > 0.15, cadence: 'weekly' }
    ];
    const live = feeds.filter(f => f.ok).length;
    return { feeds, coverage: U.round(live / feeds.length, 2), degraded: live < feeds.length };
  }

  function confidenceFor(hourOffset, status, atm) {
    const lead = 1 - U.clamp((hourOffset - 0.5) / 9, 0, 0.55);
    const cov = 0.55 + 0.45 * status.coverage;
    // sharply-defined situations are easier to call than borderline ones
    const decisive = 0.85 + 0.15 * U.clamp(Math.abs(atm.cape - 1400) / 1800, 0, 1);
    return U.round(U.clamp(lead * cov * decisive * 100, 18, 92), 0);
  }

  /* ------------------------------------------------------ assessment build */
  function assess(lat, lon, hourOffset, opts) {
    opts = opts || {};
    const atm = sampleAtmosphere(lat, lon, hourOffset || 0, opts);
    const status = dataStatus(lat, lon);
    const hazards = {
      thunderstorm: scoreHazard(MODELS.thunderstorm, atm),
      cloudburst: scoreHazard(MODELS.cloudburst, atm),
      flashflood: scoreHazard(MODELS.flashflood, atm)
    };
    const list = Object.values(hazards);
    const top = list.reduce((a, b) => (b.score > a.score ? b : a));
    // overall = dominant hazard, nudged up when several hazards co-occur
    const others = list.filter(h => h !== top).reduce((s, h) => s + h.score, 0) / (list.length - 1);
    const overall = U.round(U.clamp(top.score * 0.82 + others * 0.18 + (others > 55 ? 4 : 0), 0, 100), 1);
    return {
      lat, lon, atm, status, hazards, list,
      dominant: top,
      overall, overallBand: band(overall),
      confidence: confidenceFor(hourOffset || 0, status, atm),
      simulated: !!opts.scenario,
      generatedAt: Date.now()
    };
  }

  /* ---------------------------------------------- timeline & storm motion */
  function timeline(lat, lon, hours, opts) {
    const out = [];
    for (let h = 0; h <= (hours || 6); h++) out.push(assess(lat, lon, h, opts));
    return out;
  }

  function motion(lat, lon) {
    const st = steering(lat, lon);
    return {
      bearing: Math.round(st.bearing), speedKmh: U.round(st.speed, 0),
      compass: ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(st.bearing / 22.5) % 16]
    };
  }

  /* --------------------------------------------------------- risk lattice */
  // Hyper-local cells around a point, used to draw risk zones on the map.
  function lattice(lat, lon, radiusKm, step, hazardKey, opts) {
    const cells = [];
    const dLat = step / 111;
    const dLon = step / (111 * Math.cos(lat * Math.PI / 180) || 1);
    const n = Math.ceil(radiusKm / step);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        if (i * i + j * j > n * n) continue;
        const la = lat + i * dLat, lo = lon + j * dLon;
        const atm = sampleAtmosphere(la, lo, (opts && opts.hourOffset) || 0, opts);
        let s;
        if (hazardKey && MODELS[hazardKey]) s = scoreHazard(MODELS[hazardKey], atm).score;
        else {
          const a = scoreHazard(MODELS.thunderstorm, atm).score;
          const b = scoreHazard(MODELS.cloudburst, atm).score;
          const c = scoreHazard(MODELS.flashflood, atm).score;
          s = Math.max(a, b, c) * 0.85 + ((a + b + c) / 3) * 0.15;
        }
        cells.push({ lat: la, lon: lo, score: U.round(s, 1), band: band(s), rain: atm.rainRate, elev: atm.terrain.elevation });
      }
    }
    return cells;
  }

  /* ----------------------------------------------------- exposure estimate */
  // Synthetic OSM-style inventory. In deployment this is an Overpass API query
  // clipped to the risk polygon; the UI says so explicitly either way.
  const ASSET_TYPES = [
    { id: 'population', name: 'Residents', unit: 'people', icon: 'users', osm: 'WorldPop 100 m raster' },
    { id: 'roads',      name: 'Road length', unit: 'km',   icon: 'road',  osm: 'highway=*' },
    { id: 'schools',    name: 'Schools',     unit: '',     icon: 'school', osm: 'amenity=school' },
    { id: 'hospitals',  name: 'Hospitals & clinics', unit: '', icon: 'hospital', osm: 'amenity=hospital|clinic' },
    { id: 'bridges',    name: 'Bridges & culverts',  unit: '', icon: 'bridge',   osm: 'man_made=bridge' },
    { id: 'power',      name: 'Power substations',   unit: '', icon: 'power',    osm: 'power=substation' },
    { id: 'water',      name: 'Water & sanitation sites', unit: '', icon: 'water', osm: 'man_made=water_works' },
    { id: 'emergency',  name: 'Fire & emergency stations', unit: '', icon: 'siren', osm: 'amenity=fire_station' },
    { id: 'shelters',   name: 'Designated shelters', unit: '', icon: 'shelter',  osm: 'amenity=shelter' },
    { id: 'telecom',    name: 'Telecom towers', unit: '', icon: 'tower', osm: 'man_made=mast' }
  ];

  function exposure(lat, lon, radiusKm, riskScore, opts) {
    const t = terrainAt(lat, lon);
    const areaKm2 = Math.PI * radiusKm * radiusKm;
    const baseDens = 90 + t.urbanisation * 9200 * (Math.abs(lat) < 40 ? 1 : 0.45);
    const pop = baseDens * areaKm2;
    // Fraction of the radius that actually falls inside moderate-or-worse
    // cells. Capped below 1 because a uniform hit across a whole circle is not
    // how convective footprints behave.
    const share = U.clamp((riskScore - 22) / 78, 0, 1) * 0.86;
    const u = t.urbanisation;
    const raw = {
      population: pop,
      roads: areaKm2 * (0.6 + u * 7.4),
      schools: areaKm2 * (0.012 + u * 0.28),
      hospitals: areaKm2 * (0.002 + u * 0.06),
      bridges: areaKm2 * (0.006 + u * 0.05 + t.slope * 0.002),
      power: areaKm2 * (0.002 + u * 0.035),
      water: areaKm2 * (0.001 + u * 0.018),
      emergency: areaKm2 * (0.0012 + u * 0.016),
      shelters: areaKm2 * (0.004 + u * 0.05),
      telecom: areaKm2 * (0.004 + u * 0.09)
    };
    const status = dataStatus(lat, lon);
    const osmOk = status.feeds.find(f => f.id === 'osm').ok;
    return ASSET_TYPES.map(a => {
      const total = raw[a.id];
      const exposed = total * share * (0.65 + fbm(lat + a.id.length, lon, 811, 2, 1.2) * 0.5);
      return {
        ...a,
        total: a.id === 'population' ? Math.round(total) : U.round(total, a.id === 'roads' ? 1 : 0),
        exposed: a.id === 'population' ? Math.round(exposed) : Math.max(0, U.round(exposed, a.id === 'roads' ? 1 : 0)),
        available: osmOk || a.id === 'population'
      };
    });
  }

  /* --------------------------------------------------------- safety advice */
  const SAFETY = {
    thunderstorm: [
      'Move indoors to a substantial building. A vehicle with a metal roof is a reasonable second choice.',
      'Stay away from tall isolated trees, open fields, rooftops and water bodies.',
      'Unplug sensitive electronics and avoid corded phones and plumbing during the storm.',
      'Wait 30 minutes after the last thunder before going back outside.'
    ],
    cloudburst: [
      'Move uphill and away from stream channels, gullies and nullahs immediately — do not wait for water to rise.',
      'Cloudburst rainfall can exceed 100 mm in an hour, so road drains will overflow quickly.',
      'Avoid parking under or near steep cut slopes; saturated slopes fail with little warning.',
      'Keep a charged phone, torch and any essential medicines within reach.'
    ],
    flashflood: [
      'Never walk or drive through moving water. 15 cm can knock you off your feet, 60 cm can float a car.',
      'Move to the highest floor available, but do not enter a closed attic without an exit route.',
      'Switch off mains electricity at the board if water is entering the building and it is safe to reach.',
      'Assume any floodwater is contaminated; wash and cover any cuts afterwards.'
    ],
    general: [
      'Follow IMD and your State Disaster Management Authority for official warnings.',
      'Agree a family meeting point and an out-of-area contact before severe weather arrives.',
      'Keep an emergency kit: water, dry food, torch, power bank, first aid, documents in a waterproof bag.',
      'In India, dial 112 for emergencies and 1078 for the NDMA helpline.'
    ]
  };

  /* -------------------------------------------------------------- glossary */
  const GLOSSARY = {
    cape: { term: 'CAPE', full: 'Convective Available Potential Energy',
      text: 'CAPE measures how much energy a rising parcel of air would gain if it kept rising, in joules per kilogram. Think of it as fuel for updraughts. Below about 1000 J/kg convection is usually weak; above about 2500 J/kg the atmosphere can support strong, deep thunderstorms.' },
    cin: { term: 'CIN', full: 'Convective Inhibition',
      text: 'CIN is the energy needed to push air through a warm layer that acts like a lid. High CIN means storms are held back even when CAPE is large. When CIN falls through the afternoon, stored instability can be released suddenly.' },
    iwv: { term: 'IWV', full: 'Integrated Water Vapour',
      text: 'IWV is the total water vapour in a column of atmosphere above a point, expressed as the depth of liquid water it would make if it all condensed — in millimetres. High and rapidly rising IWV is one of the strongest precursors of extreme rainfall and cloudbursts.' },
    ctt: { term: 'CTT', full: 'Cloud-Top Temperature',
      text: 'CTT is measured by satellite infrared channels. Colder tops mean taller clouds. A rapid drop in CTT — several kelvin in half an hour — means a cumulonimbus is growing explosively, which usually precedes heavy rain and lightning.' },
    shear: { term: 'Wind shear', full: '0–6 km bulk wind shear',
      text: 'Shear is the change in wind speed and direction with height. It tilts a storm so the downdraught does not kill the updraught, which lets storms organise and last longer. Around 15–20 m/s supports organised multicell storms.' },
    convergence: { term: 'Low-level convergence', full: 'Horizontal mass convergence near the surface',
      text: 'When surface air flows inward faster than it flows out, it has nowhere to go but up. That forced lift is often the trigger that turns available instability into an actual storm.' },
    iwvtrend: { term: 'IWV tendency', full: 'Rate of change of column moisture',
      text: 'The three-hourly change in IWV. A sharp increase means moisture is being advected in quickly, loading the atmosphere for heavy rainfall.' },
    drainage: { term: 'Drainage susceptibility', full: 'Flood susceptibility index',
      text: 'A terrain-derived index combining slope, elevation and upstream flow accumulation. High values mark places where water collects rather than drains, which is where flash flooding concentrates.' },
    nowcast: { term: 'Nowcast', full: 'Short-range forecast',
      text: 'A nowcast covers roughly the next 0–6 hours. It leans on current observations and extrapolation rather than full numerical weather prediction, because that is where observations still beat models.' },
    shap: { term: 'SHAP', full: 'SHapley Additive exPlanations',
      text: 'SHAP assigns each input feature a signed contribution to a single prediction, based on cooperative game theory. It shows what drove one specific output. It describes association within the model, not proven physical causation.' }
  };

  /* ------------------------------------------------------------- geocoding */
  // Offline gazetteer first (works with no network, which matters for a demo
  // room), then Nominatim when the browser has connectivity.
  const GAZETTEER = [
    ['Kolkata', 'West Bengal, India', 22.5726, 88.3639],
    ['Bhubaneswar', 'Odisha, India', 20.2961, 85.8245],
    ['Cuttack', 'Odisha, India', 20.4625, 85.8830],
    ['Puri', 'Odisha, India', 19.8135, 85.8312],
    ['Rourkela', 'Odisha, India', 22.2604, 84.8536],
    ['Berhampur', 'Odisha, India', 19.3150, 84.7941],
    ['Balasore', 'Odisha, India', 21.4942, 86.9336],
    ['Siliguri', 'West Bengal, India', 26.7271, 88.3953],
    ['Darjeeling', 'West Bengal, India', 27.0360, 88.2627],
    ['Digha', 'West Bengal, India', 21.6270, 87.5090],
    ['Mumbai', 'Maharashtra, India', 19.0760, 72.8777],
    ['Pune', 'Maharashtra, India', 18.5204, 73.8567],
    ['Nagpur', 'Maharashtra, India', 21.1458, 79.0882],
    ['Delhi', 'India', 28.6139, 77.2090],
    ['Gurugram', 'Haryana, India', 28.4595, 77.0266],
    ['Jaipur', 'Rajasthan, India', 26.9124, 75.7873],
    ['Lucknow', 'Uttar Pradesh, India', 26.8467, 80.9462],
    ['Varanasi', 'Uttar Pradesh, India', 25.3176, 82.9739],
    ['Patna', 'Bihar, India', 25.5941, 85.1376],
    ['Guwahati', 'Assam, India', 26.1445, 91.7362],
    ['Shillong', 'Meghalaya, India', 25.5788, 91.8933],
    ['Cherrapunji', 'Meghalaya, India', 25.3000, 91.7000],
    ['Itanagar', 'Arunachal Pradesh, India', 27.0844, 93.6053],
    ['Gangtok', 'Sikkim, India', 27.3389, 88.6065],
    ['Dehradun', 'Uttarakhand, India', 30.3165, 78.0322],
    ['Joshimath', 'Uttarakhand, India', 30.5550, 79.5646],
    ['Kedarnath', 'Uttarakhand, India', 30.7346, 79.0669],
    ['Shimla', 'Himachal Pradesh, India', 31.1048, 77.1734],
    ['Manali', 'Himachal Pradesh, India', 32.2396, 77.1887],
    ['Leh', 'Ladakh, India', 34.1526, 77.5771],
    ['Srinagar', 'Jammu & Kashmir, India', 34.0837, 74.7973],
    ['Chennai', 'Tamil Nadu, India', 13.0827, 80.2707],
    ['Coimbatore', 'Tamil Nadu, India', 11.0168, 76.9558],
    ['Bengaluru', 'Karnataka, India', 12.9716, 77.5946],
    ['Mangaluru', 'Karnataka, India', 12.9141, 74.8560],
    ['Hyderabad', 'Telangana, India', 17.3850, 78.4867],
    ['Visakhapatnam', 'Andhra Pradesh, India', 17.6868, 83.2185],
    ['Kochi', 'Kerala, India', 9.9312, 76.2673],
    ['Wayanad', 'Kerala, India', 11.6854, 76.1320],
    ['Thiruvananthapuram', 'Kerala, India', 8.5241, 76.9366],
    ['Ahmedabad', 'Gujarat, India', 23.0225, 72.5714],
    ['Surat', 'Gujarat, India', 21.1702, 72.8311],
    ['Bhopal', 'Madhya Pradesh, India', 23.2599, 77.4126],
    ['Raipur', 'Chhattisgarh, India', 21.2514, 81.6296],
    ['Ranchi', 'Jharkhand, India', 23.3441, 85.3096],
    ['Dhaka', 'Bangladesh', 23.8103, 90.4125],
    ['Kathmandu', 'Nepal', 27.7172, 85.3240],
    ['Colombo', 'Sri Lanka', 6.9271, 79.8612],
    ['Karachi', 'Pakistan', 24.8607, 67.0011],
    ['Singapore', 'Singapore', 1.3521, 103.8198],
    ['Jakarta', 'Indonesia', -6.2088, 106.8456],
    ['Manila', 'Philippines', 14.5995, 120.9842],
    ['Tokyo', 'Japan', 35.6762, 139.6503],
    ['Osaka', 'Japan', 34.6937, 135.5023],
    ['Seoul', 'South Korea', 37.5665, 126.9780],
    ['Bangkok', 'Thailand', 13.7563, 100.5018],
    ['Hanoi', 'Vietnam', 21.0278, 105.8342],
    ['Shanghai', 'China', 31.2304, 121.4737],
    ['Hong Kong', 'China', 22.3193, 114.1694],
    ['Sydney', 'Australia', -33.8688, 151.2093],
    ['Brisbane', 'Australia', -27.4698, 153.0251],
    ['Auckland', 'New Zealand', -36.8485, 174.7633],
    ['London', 'United Kingdom', 51.5074, -0.1278],
    ['Paris', 'France', 48.8566, 2.3522],
    ['Zurich', 'Switzerland', 47.3769, 8.5417],
    ['Valencia', 'Spain', 39.4699, -0.3763],
    ['Milan', 'Italy', 45.4642, 9.1900],
    ['Berlin', 'Germany', 52.5200, 13.4050],
    ['Athens', 'Greece', 37.9838, 23.7275],
    ['Istanbul', 'Türkiye', 41.0082, 28.9784],
    ['Dubai', 'United Arab Emirates', 25.2048, 55.2708],
    ['Nairobi', 'Kenya', -1.2921, 36.8219],
    ['Lagos', 'Nigeria', 6.5244, 3.3792],
    ['Cape Town', 'South Africa', -33.9249, 18.4241],
    ['Cairo', 'Egypt', 30.0444, 31.2357],
    ['New York', 'United States', 40.7128, -74.0060],
    ['Houston', 'United States', 29.7604, -95.3698],
    ['Miami', 'United States', 25.7617, -80.1918],
    ['Denver', 'United States', 39.7392, -104.9903],
    ['San Francisco', 'United States', 37.7749, -122.4194],
    ['Mexico City', 'Mexico', 19.4326, -99.1332],
    ['Bogotá', 'Colombia', 4.7110, -74.0721],
    ['Lima', 'Peru', -12.0464, -77.0428],
    ['São Paulo', 'Brazil', -23.5505, -46.6333],
    ['Rio de Janeiro', 'Brazil', -22.9068, -43.1729],
    ['Buenos Aires', 'Argentina', -34.6037, -58.3816],
    ['Toronto', 'Canada', 43.6532, -79.3832]
  ].map(r => ({ name: r[0], region: r[1], lat: r[2], lon: r[3], source: 'built-in gazetteer' }));

  function parseCoords(q) {
    const m = String(q).trim().match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { name: U.dms(lat, lon), region: 'Coordinate input', lat, lon, source: 'coordinates' };
  }

  function localSearch(q) {
    const s = String(q).trim().toLowerCase();
    if (!s) return [];
    return GAZETTEER
      .map(p => {
        const n = p.name.toLowerCase(), r = p.region.toLowerCase();
        let sc = -1;
        if (n === s) sc = 100;
        else if (n.startsWith(s)) sc = 80;
        else if (n.includes(s)) sc = 60;
        else if (r.includes(s)) sc = 35;
        return sc > 0 ? { ...p, _s: sc } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b._s - a._s)
      .slice(0, 8);
  }

  async function geocode(q) {
    const coord = parseCoords(q);
    if (coord) return { results: [coord], online: false };
    const local = localSearch(q);
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 4500);
      const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q=' + encodeURIComponent(q);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(to);
      if (!res.ok) throw new Error('geocoder ' + res.status);
      const data = await res.json();
      const remote = data.map(d => ({
        name: (d.name || d.display_name.split(',')[0]).trim(),
        region: d.display_name.split(',').slice(1).join(',').trim(),
        lat: parseFloat(d.lat), lon: parseFloat(d.lon),
        source: 'OpenStreetMap Nominatim'
      }));
      const seen = new Set();
      const merged = [...remote, ...local].filter(p => {
        const k = p.lat.toFixed(2) + ',' + p.lon.toFixed(2);
        if (seen.has(k)) return false; seen.add(k); return true;
      }).slice(0, 8);
      return { results: merged, online: true };
    } catch (e) {
      return { results: local, online: false, error: e.message };
    }
  }

  async function reverse(lat, lon) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 4000);
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) throw new Error('reverse ' + res.status);
      const d = await res.json();
      const a = d.address || {};
      const name = a.suburb || a.village || a.town || a.city_district || a.city || a.county || a.state || 'Selected point';
      const region = [a.district, a.state, a.country].filter(Boolean).join(', ');
      return { name, region: region || U.dms(lat, lon), lat, lon, source: 'OpenStreetMap Nominatim' };
    } catch (e) {
      // nearest gazetteer entry as a readable fallback
      let best = null, bd = Infinity;
      for (const g of GAZETTEER) {
        const d = Math.hypot(g.lat - lat, g.lon - lon);
        if (d < bd) { bd = d; best = g; }
      }
      const label = bd < 1.2 ? `Near ${best.name}` : 'Selected point';
      return { name: label, region: bd < 1.2 ? best.region : U.dms(lat, lon), lat, lon, source: 'offline fallback' };
    }
  }

  /* ------------------------------------------------------------- distances */
  function haversine(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  /* ------------------------------------------------------------- exported */
  global.GA = {
    U, MODELS, BANDS, band, ASSET_TYPES, SAFETY, GLOSSARY, GAZETTEER,
    sampleAtmosphere, terrainAt, assess, timeline, motion, lattice,
    exposure, dataStatus, scoreHazard, haversine,
    geocode, reverse, localSearch, parseCoords, fbm
  };
})(window);
