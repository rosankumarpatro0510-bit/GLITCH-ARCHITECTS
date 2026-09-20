/* ==========================================================================
   GLITCH ARCHITECTURE — application state, alerts, citizen reports
   ========================================================================== */

(function (global) {
  'use strict';
  const GA = global.GA, U = GA.U;

  /* ------------------------------------------------------------ icon set */
  const I = {
    _w: (d, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra || ''}>${d}</svg>`,
    gauge: () => I._w('<path d="M12 21a9 9 0 1 0-9-9"/><path d="M12 12l5-3"/><circle cx="12" cy="12" r="1.4"/>'),
    map: () => I._w('<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3z"/><path d="M9 3v15M15 6v15"/>'),
    clock: () => I._w('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    impact: () => I._w('<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M10 21v-6h4v6"/>'),
    route: () => I._w('<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H14a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h.5" transform="translate(0 2)"/>'),
    flask: () => I._w('<path d="M9 3v6l-5 9a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M8 3h8"/><path d="M7 15h10"/>'),
    people: () => I._w('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.2"/><path d="M18 20a5.6 5.6 0 0 0-2.5-4.6"/>'),
    siren: () => I._w('<path d="M6 18v-5a6 6 0 0 1 12 0v5"/><path d="M4 18h16v3H4z"/><path d="M12 3V1M20 6l1.4-1.4M4 6 2.6 4.6"/>'),
    brain: () => I._w('<path d="M9.5 3.5A3 3 0 0 0 6.7 7 3 3 0 0 0 5 12a3 3 0 0 0 1.7 5A3 3 0 0 0 12 19V4a2.5 2.5 0 0 0-2.5-.5z"/><path d="M14.5 3.5A3 3 0 0 1 17.3 7 3 3 0 0 1 19 12a3 3 0 0 1-1.7 5A3 3 0 0 1 12 19"/>'),
    chat: () => I._w('<path d="M21 15a2 2 0 0 1-2 2H8l-4 3V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>'),
    mic: () => I._w('<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>'),
    search: () => I._w('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    pin: () => I._w('<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'),
    layers: () => I._w('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
    info: () => I._w('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    warn: () => I._w('<path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    x: () => I._w('<path d="M18 6 6 18M6 6l12 12"/>'),
    send: () => I._w('<path d="m4 12 16-8-5 16-3.5-6z"/>'),
    menu: () => I._w('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    plus: () => I._w('<path d="M12 5v14M5 12h14"/>'),
    check: () => I._w('<path d="m4 12 5 5L20 6"/>'),
    camera: () => I._w('<path d="M3 8h3l2-3h8l2 3h3v12H3z"/><circle cx="12" cy="13" r="3.6"/>'),
    road: () => I._w('<path d="M5 21 8 3M19 21 16 3M12 4v3M12 11v3M12 18v3"/>'),
    school: () => I._w('<path d="m12 3 9 5-9 5-9-5z"/><path d="M7 11v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5"/>'),
    hospital: () => I._w('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>'),
    bridge: () => I._w('<path d="M2 9h20"/><path d="M4 9v10M20 9v10"/><path d="M4 15a8 8 0 0 1 16 0"/>'),
    power: () => I._w('<path d="m13 2-8 12h6l-1 8 8-12h-6z"/>'),
    water: () => I._w('<path d="M12 3s6 6.4 6 10.4A6 6 0 0 1 6 13.4C6 9.4 12 3 12 3z"/>'),
    shelter: () => I._w('<path d="M3 11 12 4l9 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>'),
    tower: () => I._w('<path d="M12 6v15"/><path d="M7 3a7 7 0 0 0 0 9M17 3a7 7 0 0 1 0 9"/><path d="m9 21 3-9 3 9"/>'),
    users: () => I.people(),
    storm: () => I._w('<path d="M7 16a4 4 0 0 1 .8-7.9 5.5 5.5 0 0 1 10.5 1.4A3.5 3.5 0 0 1 18 16"/><path d="m12 13-2 4h3l-2 4"/>'),
    rain: () => I._w('<path d="M7 15a4 4 0 0 1 .8-7.9 5.5 5.5 0 0 1 10.5 1.4A3.5 3.5 0 0 1 18 15"/><path d="M8 18v2M12 18v3M16 18v2"/>'),
    flood: () => I._w('<path d="M2 16c2 0 2 1.6 4 1.6S8 16 10 16s2 1.6 4 1.6S16 16 18 16s2 1.6 4 1.6"/><path d="M2 20c2 0 2 1.6 4 1.6"/><path d="M6 13V5h8v8"/>'),
    tree: () => I._w('<path d="M12 3 6 12h3l-4 6h14l-4-6h3z"/><path d="M12 18v3"/>'),
    hail: () => I._w('<path d="M7 14a4 4 0 0 1 .8-7.9A5.5 5.5 0 0 1 18.3 7.5 3.5 3.5 0 0 1 18 14"/><circle cx="9" cy="18.5" r="1.1"/><circle cx="13" cy="20.5" r="1.1"/><circle cx="16" cy="18" r="1.1"/>'),
    build: () => I._w('<path d="M4 21V7l7-4 7 4v14"/><path d="M9 21v-5h4v5"/><path d="M9 10h.01M13 10h.01"/>'),
    dot: () => I._w('<circle cx="12" cy="12" r="4"/>'),
    globe: () => I._w('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 3 2.6 15 0 18M12 3c-2.6 3-2.6 15 0 18"/>'),
    book: () => I._w('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"/>'),
    speaker: () => I._w('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
    sun: () => I._w('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
    moon: () => I._w('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>'),
    user: () => I._w('<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>'),
    logOut: () => I._w('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
    shield: () => I._w('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>')
  };

  /* ---------------------------------------------------- User personas (Citizens & Community) */
  const PERSONAS = [
    {
      id: 'aarav_mehta',
      name: 'Aarav Mehta',
      email: 'aarav.mehta@gmail.com',
      role: 'Resident & Commuter',
      neighborhood: 'South Kolkata, Ward 92',
      initials: 'AM',
      color: '#0070F2'
    },
    {
      id: 'ananya_roy',
      name: 'Ananya Roy',
      email: 'ananya.roy@community.in',
      role: 'Community Volunteer & Ground Reporter',
      neighborhood: 'Salt Lake Sector V',
      initials: 'AR',
      color: '#07838F'
    },
    {
      id: 'vikram_das',
      name: 'Vikram Das',
      email: 'vikram.das@logistics.in',
      role: 'Local Driver & Courier',
      neighborhood: 'Howrah Central Corridor',
      initials: 'VD',
      color: '#E9730C'
    }
  ];

  /* ------------------------------------------------------- persistent bits */
  const KEY = 'ga.state.v1';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        location: S.location, reports: S.reports, lang: S.lang, layers: S.layers, seen: S.seenAlerts,
        user: S.user, theme: S.theme
      }));
    } catch (e) { /* storage may be unavailable; app still works in-session */ }
  }

  const saved = load();

  /* ----------------------------------------------------------- the store */
  const S = {
    user: saved.user || null,
    theme: saved.theme || 'evening',
    location: saved.location || { name: 'Kolkata', region: 'West Bengal, India', lat: 22.5726, lon: 88.3639, source: 'built-in gazetteer' },
    route: '#/dashboard',
    horizon: 3,
    radiusKm: 12,
    hazardFilter: null,
    scenario: null,          // null = live model; object = What-if simulation
    lang: saved.lang || 'en-IN',
    reports: saved.reports || [],
    seenAlerts: saved.seen || [],
    layers: Object.assign({
      risk: true, thunderstorm: false, cloudburst: false, flashflood: false,
      rainfall: false, terrain: false, infrastructure: false, reports: true
    }, saved.layers || {}),
    assessment: null,
    timeline: null,
    lastUpdate: Date.now(),
    listeners: []
  };

  // Sync initial theme
  try { document.documentElement.setAttribute('data-sap-theme', S.theme); } catch (e) {}

  function recompute() {
    const opts = S.scenario ? { scenario: S.scenario } : {};
    S.assessment = GA.assess(S.location.lat, S.location.lon, S.horizon >= 1 ? 0 : 0, opts);
    S.timeline = GA.timeline(S.location.lat, S.location.lon, 6, opts);
    S.lastUpdate = Date.now();
    S.alerts = buildAlerts();
  }

  function on(fn) { S.listeners.push(fn); }
  function emit(reason) { S.listeners.forEach(f => { try { f(reason); } catch (e) { console.error(e); } }); }

  function setUser(user) {
    S.user = user;
    persist();
    emit('auth');
  }

  function logout() {
    S.user = null;
    persist();
    emit('auth');
  }

  function setTheme(t) {
    S.theme = (t === 'morning' ? 'morning' : 'evening');
    try { document.documentElement.setAttribute('data-sap-theme', S.theme); } catch (e) {}
    persist();
    emit('theme');
  }

  function setLocation(loc) {
    S.location = loc;
    recompute();
    persist();
    emit('location');
  }
  function setScenario(sc) { S.scenario = sc; recompute(); emit('scenario'); }
  function setHorizon(h) { S.horizon = h; emit('horizon'); }
  function setLayer(k, v) { S.layers[k] = v; persist(); emit('layers'); }
  function setLang(l) { S.lang = l; persist(); emit('lang'); }

  /* ------------------------------------------------------- alert building */
  const ALERT_RULES = [
    { cat: 'Thunderstorm', hazard: 'thunderstorm', icon: 'storm', min: 55,
      reason: a => `Thunderstorm score ${a.hazards.thunderstorm.score} with CAPE ${a.atm.cape} J/kg and cloud-top change ${a.atm.cttTrend} K/30min.`,
      action: 'Move indoors, secure loose objects outdoors, and delay outdoor work until 30 minutes after the last thunder.' },
    { cat: 'Cloudburst', hazard: 'cloudburst', icon: 'rain', min: 58,
      reason: a => `Column moisture ${a.atm.iwv} mm rising ${a.atm.iwvTrend > 0 ? '+' : ''}${a.atm.iwvTrend} mm/3h over terrain with ${a.atm.terrain.slope}° mean slope.`,
      action: 'Move away from stream channels and steep cut slopes. Expect road drains to overwhelm within minutes.' },
    { cat: 'Flash flood', hazard: 'flashflood', icon: 'flood', min: 55,
      reason: a => `Rain rate ${a.atm.rainRate} mm/h on ground already ${Math.round(a.atm.soilSat * 100)}% saturated, drainage index ${Math.round(a.atm.terrain.drainage * 100)}/100.`,
      action: 'Do not cross flowing water on foot or by vehicle. Move vehicles and people to higher ground now.' },
    { cat: 'Heavy rainfall', hazard: null, icon: 'rain', min: 0,
      test: a => a.atm.rainRate >= 15,
      reason: a => `Modelled rainfall intensity ${a.atm.rainRate} mm/h, which is in the heavy band (IMD: 15.6–64.4 mm in 24h is "heavy").`,
      action: 'Allow extra travel time, avoid underpasses, and keep drains near your building clear.' },
    { cat: 'Infrastructure exposure', hazard: null, icon: 'build', min: 0,
      test: a => a.overall >= 60,
      reason: a => `Overall risk ${a.overall} across the ${S.radiusKm} km assessment radius overlaps mapped critical assets.`,
      action: 'Pre-position crews near hospitals, substations and low-lying bridges; verify backup power.' }
  ];

  function severityOf(score) { return GA.band(score); }

  function buildAlerts() {
    const a = S.assessment;
    if (!a) return [];
    const out = [];
    const start = new Date(), end = new Date(Date.now() + 3 * 3600e3);
    ALERT_RULES.forEach((r, i) => {
      let score, fire;
      if (r.hazard) { score = a.hazards[r.hazard].score; fire = score >= r.min; }
      else { fire = r.test(a); score = a.overall; }
      if (!fire) return;
      out.push({
        id: 'al-' + r.cat.toLowerCase().replace(/\s+/g, '-') + '-' + Math.floor(a.generatedAt / 60000),
        category: r.cat,
        icon: r.icon,
        hazard: r.hazard,
        score: U.round(score, 1),
        band: severityOf(score),
        area: `${S.location.name} and surrounding ${S.radiusKm} km`,
        from: start, to: end,
        reason: r.reason(a),
        action: r.action,
        // An alert only counts as data-backed when the feeds it depends on are
        // live. In this build no live feed is connected, so everything is DEMO.
        provenance: a.simulated ? 'sim' : 'demo'
      });
    });
    // route hazard alert, only when a route comparison exists
    if (S.routes && S.routes.length) {
      const worst = S.routes.reduce((x, y) => (y.exposure > x.exposure ? y : x));
      if (worst.exposure >= 45) {
        out.push({
          id: 'al-route-' + Math.floor(a.generatedAt / 60000),
          category: 'Route hazard', icon: 'route', hazard: null,
          score: worst.exposure, band: severityOf(worst.exposure),
          area: `${worst.name}: ${S.routeQuery ? S.routeQuery.from + ' → ' + S.routeQuery.to : 'selected corridor'}`,
          from: start, to: end,
          reason: `${U.round(worst.highShare * 100, 0)}% of this corridor samples inside modelled high or severe risk cells.`,
          action: 'Review the lower-exposure alternative before dispatching. Brief drivers on the flagged segments.',
          provenance: a.simulated ? 'sim' : 'demo'
        });
      }
    }
    return out.sort((x, y) => y.score - x.score);
  }

  /* ---------------------------------------------------------- reports API */
  const REPORT_TYPES = [
    { id: 'flooding', label: 'Flooding', icon: 'flood', colour: '#35B0A7' },
    { id: 'heavy-rain', label: 'Heavy rainfall', icon: 'rain', colour: '#6FA8DC' },
    { id: 'hail', label: 'Hail', icon: 'hail', colour: '#9FD3E8' },
    { id: 'thunderstorm', label: 'Thunderstorm', icon: 'storm', colour: '#B57BE0' },
    { id: 'blocked-road', label: 'Blocked road', icon: 'road', colour: '#E2703A' },
    { id: 'fallen-tree', label: 'Fallen tree', icon: 'tree', colour: '#7FBF6A' },
    { id: 'waterlogging', label: 'Waterlogging', icon: 'water', colour: '#4F8FE0' },
    { id: 'damage', label: 'Damaged infrastructure', icon: 'build', colour: '#D2423F' },
    { id: 'other', label: 'Other observation', icon: 'info', colour: '#7E95A5' }
  ];

  const VERIFY_STATES = {
    unverified: { label: 'Unverified', colour: 'var(--ink-mute)', note: 'Submitted by a member of the public. Not checked against any other source.' },
    review: { label: 'Under review', colour: 'var(--sev-mod)', note: 'Queued for a moderator. Automatic checks found something worth a human look.' },
    verified: { label: 'Corroborated', colour: 'var(--sev-low)', note: 'Matches at least two independent reports nearby, or a moderator confirmed it. Still a citizen observation, not an official measurement.' }
  };

  async function addReport(r) {
    const rec = {
      id: U.uid(),
      type: r.type,
      description: r.description || '',
      lat: r.lat, lon: r.lon,
      placeName: r.placeName || '',
      photo: r.photo || null,
      ts: Date.now(),
      status: 'unverified',
      corroborations: 0,
      reporter: 'anonymous'
    };
    // Corroboration heuristic: same hazard type, within 3 km, in the last 2 h.
    const near = S.reports.filter(x =>
      x.type === rec.type &&
      Date.now() - x.ts < 2 * 3600e3 &&
      GA.haversine(x, rec) < 3
    );
    if (near.length >= 1) {
      rec.status = 'review';
      rec.corroborations = near.length;
      if (near.length >= 2) rec.status = 'verified';
      near.forEach(x => {
        x.corroborations = (x.corroborations || 0) + 1;
        x.status = x.corroborations >= 2 ? 'verified' : 'review';
      });
    }
    S.reports.unshift(rec);
    if (S.reports.length > 200) S.reports.length = 200;
    try {
      const response = await fetch('/api/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rec, reporter: S.user ? { id: S.user.id, name: S.user.name, email: S.user.email } : null })
      });
      if (!response.ok) throw new Error('Report could not be sent to rescue coordination');
    } catch (error) {
      console.warn('Remote report submission failed; keeping local copy.', error);
      rec.syncError = true;
    }
    persist();
    emit('reports');
    return rec;
  }

  function seedDemoReports() {
    if (S.reports.length) return;
    const { lat, lon } = S.location;
    const demo = [
      { type: 'waterlogging', description: 'Knee-deep water at the main crossing, two-wheelers turning back.', dl: 0.014, dn: -0.011, age: 26, status: 'verified', corr: 3 },
      { type: 'blocked-road', description: 'Service road closed by the ward office, barricades up.', dl: -0.021, dn: 0.018, age: 62, status: 'review', corr: 1 },
      { type: 'heavy-rain', description: 'Very heavy rain for about twenty minutes, then eased.', dl: 0.031, dn: 0.026, age: 95, status: 'unverified', corr: 0 }
    ];
    demo.forEach(d => {
      S.reports.push({
        id: U.uid(), type: d.type, description: d.description,
        lat: lat + d.dl, lon: lon + d.dn, placeName: 'Near ' + S.location.name,
        photo: null, ts: Date.now() - d.age * 60000,
        status: d.status, corroborations: d.corr, reporter: 'anonymous'
      });
    });
    persist();
  }

  /* -------------------------------------------------------- route builder */
  // Fetch real road geometry, then score the sampled road points against the
  // same risk field used by the rest of the application.
  async function buildRoutes(from, to) {
    const endpoint = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=true&overview=full&geometries=geojson&steps=false`;
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
    const payload = await response.json();
    if (payload.code !== 'Ok' || !payload.routes || !payload.routes.length) {
      throw new Error('No road route was found between these places');
    }

    const colours = ['#6FA8DC', '#3FA66A', '#E0A33E'];
    const names = ['Road route', 'Alternative road route', 'Second road alternative'];
    const opts = S.scenario ? { scenario: S.scenario } : {};
    const routes = payload.routes.slice(0, 3).map((route, routeIndex) => {
      const pts = route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
      let sum = 0, peak = 0, high = 0;
      const segs = [];
      pts.forEach((p, i) => {
        const a = GA.assess(p.lat, p.lon, 0, opts);
        sum += a.overall;
        if (a.overall > peak) peak = a.overall;
        if (a.overall >= 62) high++;
        segs.push({ ...p, score: a.overall, band: a.overallBand, dominant: a.dominant.label, rain: a.atm.rainRate });
      });
      const mean = sum / pts.length;
      let dist = 0;
      for (let i = 1; i < pts.length; i++) dist += GA.haversine(pts[i - 1], pts[i]);
      return {
        name: names[routeIndex] || `Road alternative ${routeIndex + 1}`,
        colour: colours[routeIndex] || '#B4C6D2', points: pts, segments: segs,
        distanceKm: U.round(route.distance / 1000, 1),
        minutes: Math.max(1, Math.round(route.duration / 60)),
        exposure: U.round(mean, 1),
        peak: U.round(peak, 1),
        highShare: U.round(high / pts.length, 3),
        band: GA.band(mean)
      };
    });
    routes.sort((a, b) => a.exposure - b.exposure);
    routes.forEach((r, i) => { r.rank = i; r.recommended = i === 0; });
    S.routes = routes;
    S.routeQuery = { from: from.name || U.dms(from.lat, from.lon), to: to.name || U.dms(to.lat, to.lon), fromPt: from, toPt: to };
    S.alerts = buildAlerts();
    return routes;
  }

  recompute();
  seedDemoReports();

  global.GAState = {
    S, I, on, emit, recompute, setLocation, setScenario, setHorizon, setLayer, setLang,
    setUser, logout, setTheme, PERSONAS,
    addReport, buildRoutes, buildAlerts, persist,
    REPORT_TYPES, VERIFY_STATES
  };
})(window);
