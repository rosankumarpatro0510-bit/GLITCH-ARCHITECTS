/* ==========================================================================
   GLITCH ARCHITECTURE — module views
   Each view exports { title, html(), mount(el) }.
   ========================================================================== */

(function (global) {
  'use strict';
  const GA = global.GA, U = GA.U, St = global.GAState, S = St.S, I = St.I;

  let liveMaps = [];
  function killMaps() { liveMaps.forEach(m => { try { m.destroy(); } catch (e) {} }); liveMaps = []; }
  function rethemeMaps() { liveMaps.forEach(m => { try { if (m.retheme) m.retheme(); } catch (e) {} }); }

  /* ------------------------------------------------------------- helpers */
  function gauge(score, b) {
    const R = 52, C = 2 * Math.PI * R, on = (score / 100) * C * 0.75;
    return `<svg class="gauge" viewBox="0 0 132 132" role="img" aria-label="Overall risk ${score} of 100">
      <circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--slate-600)" stroke-width="10"
        stroke-dasharray="${C * 0.75} ${C}" stroke-linecap="round" transform="rotate(135 66 66)"/>
      <circle cx="66" cy="66" r="${R}" fill="none" stroke="${b.colour}" stroke-width="10"
        stroke-dasharray="${on} ${C}" stroke-linecap="round" transform="rotate(135 66 66)"/>
      <text class="val" x="66" y="66" text-anchor="middle" dominant-baseline="middle">${U.fmt(score, 0)}</text>
      <text class="lbl" x="66" y="88" text-anchor="middle">of 100</text>
    </svg>`;
  }

  function meter(score, colour) {
    return `<div class="meter"><i style="width:${U.clamp(score, 0, 100)}%;background:${colour}"></i></div>`;
  }

  function chipProvenance(kind) {
    if (kind === 'sim') return `<span class="chip chip--sim"><i class="dot"></i>Simulated scenario</span>`;
    if (kind === 'mixed') return `<span class="chip chip--live"><i class="dot"></i>Live model fields + synthetic</span>`;
    if (kind === 'live') return `<span class="chip chip--live"><i class="dot"></i>Live data-backed</span>`;
    return `<span class="chip chip--demo"><i class="dot"></i>Demo alert</span>`;
  }

  function scenarioBanner() {
    if (!S.scenario) return '';
    const s = S.scenario;
    const bits = [];
    if (s.rain) bits.push(`rainfall ${s.rain > 0 ? '+' : ''}${s.rain}%`);
    if (s.storm) bits.push(`storm intensity ${s.storm > 0 ? '+' : ''}${s.storm}%`);
    if (s.moisture) bits.push(`moisture ${s.moisture > 0 ? '+' : ''}${s.moisture}%`);
    if (s.soil) bits.push(`soil saturation ${s.soil > 0 ? '+' : ''}${s.soil} pts`);
    if (s.radius) bits.push(`zone radius ×${(1 + s.radius / 100).toFixed(2)}`);
    return `<div class="scenario-banner">${I.flask()}
      <div><b>You are viewing a simulation, not the current model output.</b>
      ${bits.length ? ' Applied: ' + U.esc(bits.join(', ')) + '.' : ''}</div>
      <button class="btn btn--sm btn--ghost" data-act="exit-sim" style="margin-left:auto">Return to model view</button></div>`;
  }

  function note(text, kind, icon) {
    return `<div class="note ${kind ? 'note--' + kind : ''}">${(icon === 'warn' ? I.warn() : I.info())}<div>${text}</div></div>`;
  }

  function hazardCard(h) {
    return `<div class="panel"><div class="panel__body hzcard">
      <div class="hzcard__top">
        <span style="color:${h.colour}">${h.key === 'thunderstorm' ? I.storm() : h.key === 'cloudburst' ? I.rain() : I.flood()}</span>
        <h4>${h.label}</h4>
        <span class="hzcard__score ${h.band.cls}">${U.fmt(h.score, 0)}</span>
      </div>
      ${meter(h.score, h.band.colour)}
      <small><b class="${h.band.cls}">${h.band.label}</b> · ${h.leadDriver
        ? 'driven by ' + U.esc(h.leadDriver.short.toLowerCase())
        : 'nothing currently pushing this up'}</small>
    </div></div>`;
  }

  /* ====================================================== DASHBOARD ===== */
  const dashboard = {
    title: 'Situation overview',
    html() {
      const a = S.assessment, atm = a.atm, loc = S.location;
      const feedsOk = a.status.feeds.filter(f => f.ok).length;
      const mot = GA.motion(loc.lat, loc.lon);

      const indicators = [
        ['Convective available potential energy', 'CAPE', atm.cape, 'J/kg', U.clamp(atm.cape / 4000 * 100, 0, 100)],
        ['Convective inhibition', 'CIN — higher means storms are capped', atm.cin, 'J/kg', U.clamp(atm.cin / 220 * 100, 0, 100)],
        ['Integrated water vapour', 'IWV — depth of the moisture column', atm.iwv, 'mm', U.clamp(atm.iwv / 75 * 100, 0, 100)],
        ['IWV tendency', 'change over the past 3 hours', (atm.iwvTrend > 0 ? '+' : '') + atm.iwvTrend, 'mm/3h', U.clamp((atm.iwvTrend + 2) / 8 * 100, 0, 100)],
        ['Low-level convergence', 'inward flow forcing air upward', atm.convergence, '×10⁻⁵ s⁻¹', U.clamp((atm.convergence + 6) / 34 * 100, 0, 100)],
        ['0–6 km bulk wind shear', 'organises storm structure', atm.shear, 'm/s', U.clamp(atm.shear / 36 * 100, 0, 100)],
        ['Cloud-top temperature', 'colder means taller cloud', atm.ctt, '°C', U.clamp(-atm.ctt / 90 * 100, 0, 100)],
        ['Cloud-top cooling rate', 'rapid cooling means explosive growth', (atm.cttTrend > 0 ? '+' : '') + atm.cttTrend, 'K/30min', U.clamp(-atm.cttTrend / 10 * 100, 0, 100)],
        ['Rainfall intensity', 'modelled surface rate', atm.rainRate, 'mm/h', U.clamp(atm.rainRate / 80 * 100, 0, 100)],
        ['Relative humidity at 850 hPa', 'mid-low level moisture', atm.rh850, '%', atm.rh850],
        ['Soil saturation', 'how much rain the ground can still absorb', U.round(atm.soilSat * 100, 0), '%', atm.soilSat * 100],
        ['Terrain slope', 'orographic lift and runoff speed', atm.terrain.slope, '°', U.clamp(atm.terrain.slope / 30 * 100, 0, 100)]
      ];

      return `<div class="view">
        ${scenarioBanner()}
        <div class="view__head">
          <div>
            <h2>${U.esc(loc.name)}</h2>
            <p>${U.esc(loc.region || '')} · <span class="mono">${U.dms(loc.lat, loc.lon)}</span>
            ${atm.terrain.range ? ' · ' + U.esc(atm.terrain.range) + ' terrain' : ''} · elevation ≈ ${U.fmt(atm.terrain.elevation)} m</p>
          </div>
          <div class="spacer"></div>
          <div>${chipProvenance(a.simulated ? 'sim' : (a.atm.liveFields && a.atm.liveFields.length ? 'mixed' : 'demo'))}</div>
        </div>

        <div class="grid g-2" style="margin-bottom:1rem">
          <div class="panel"><div class="panel__body">
            <div class="risk-hero">
              ${gauge(a.overall, a.overallBand)}
              <div>
                <div class="risk-hero__band ${a.overallBand.cls}">${a.overallBand.label} overall risk</div>
                <div style="color:var(--ink-soft);font-size:.93rem">Dominant hazard: <b class="${a.dominant.band.cls}">${a.dominant.label}</b></div>
                <p>Nowcast window ${S.horizon} ${S.horizon === 1 ? 'hour' : 'hours'} ahead · model confidence ${a.confidence}% ·
                ${feedsOk} of ${a.status.feeds.length} data adapters reporting.</p>
              </div>
            </div>
          </div></div>

          <div class="grid g-3" style="align-content:start">
            ${a.list.map(hazardCard).join('')}
          </div>
        </div>

        <div class="grid g-4" style="margin-bottom:1rem">
          <div class="stat"><span class="stat__k">Prediction window</span>
            <span class="stat__v">0–${S.horizon}<span class="unit">h</span></span>
            <span class="stat__n">Adjustable up to 6 h on the Prediction page</span></div>
          <div class="stat"><span class="stat__k">Model confidence</span>
            <span class="stat__v">${a.confidence}<span class="unit">%</span></span>
            <span class="stat__n">Falls with lead time and missing feeds</span></div>
          <div class="stat"><span class="stat__k">Data status</span>
            <span class="stat__v ${a.status.degraded ? 'sev-mod' : 'sev-low'}">${a.status.degraded ? 'Degraded' : 'Nominal'}</span>
            <span class="stat__n">${feedsOk}/${a.status.feeds.length} adapters · ${Math.round(a.status.coverage * 100)}% coverage</span></div>
          <div class="stat"><span class="stat__k">Last update</span>
            <span class="stat__v">${U.timeHHMM(new Date(S.lastUpdate))}</span>
            <span class="stat__n">${U.ago(S.lastUpdate)} · recomputes on every location change</span></div>
          <div class="stat"><span class="stat__k">Cell motion</span>
            <span class="stat__v">${mot.compass} ${mot.speedKmh}<span class="unit">km/h</span></span>
            <span class="stat__n">Steering-flow proxy, ${mot.bearing}° bearing</span></div>
          <div class="stat"><span class="stat__k">Active alerts</span>
            <span class="stat__v ${S.alerts.length ? 'sev-mod' : ''}">${S.alerts.length}</span>
            <span class="stat__n">All demo-threshold generated</span></div>
          <div class="stat"><span class="stat__k">Citizen reports</span>
            <span class="stat__v">${S.reports.length}</span>
            <span class="stat__n">${S.reports.filter(r => r.status === 'verified').length} corroborated</span></div>
          <div class="stat"><span class="stat__k">Assessment radius</span>
            <span class="stat__v">${S.radiusKm}<span class="unit">km</span></span>
            <span class="stat__n">Used for exposure and zone drawing</span></div>
        </div>

        <div class="dash-grid">
          <div class="panel">
            <div class="panel__head"><h3>Hyper-local risk around this point</h3><div class="spacer"></div>
              <a class="btn btn--sm btn--ghost" href="#/map">Open full map</a></div>
            <div class="panel__body tight mapwrap">
              <div id="dashMap" class="mapbox mapbox--dash"></div>
              <div class="map-legend">
                <div><i class="bg-low"></i> Low</div>
                <div><i class="bg-mod"></i> Moderate</div>
                <div><i class="bg-high"></i> High</div>
                <div><i class="bg-sev"></i> Severe</div>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head"><h3>Atmospheric indicators</h3></div>
            <div class="panel__body tight">
              <table class="indi"><thead><tr><th>Indicator</th><th class="bar"></th><th class="v">Value</th></tr></thead><tbody>
              ${indicators.map(r => `<tr>
                <td class="nm"><b>${U.esc(r[0])}</b><small>${U.esc(r[1])}</small></td>
                <td class="bar">${meter(r[4], r[4] > 66 ? 'var(--sev-high)' : r[4] > 40 ? 'var(--sev-mod)' : 'var(--trace-dim)')}</td>
                <td class="v">${r[2]} <span style="color:var(--ink-mute)">${U.esc(r[3])}</span></td>
              </tr>`).join('')}
              </tbody></table>
            </div>
          </div>
        </div>

        <div style="margin-top:1rem">
          ${a.atm.liveFields && a.atm.liveFields.length ? note('<b>Partly live.</b> CAPE, CIN, 850 hPa humidity, rainfall, soil moisture and shear are Open-Meteo model output on a ~25 km grid, interpolated to this point. It is model output, not an observation, and not hyper-local. The remaining indicators and all risk weightings are still the demonstration model, which was tuned on synthetic data and has not been recalibrated for real inputs.', '', 'info') + '<div style="height:.6rem"></div>' : ''}${note('<b>These values come from a demonstration model.</b> No live satellite, radar or gauge feed is connected in this build. The adapter interfaces for INSAT-3DR, IMD DWR, AWS gauges and GPM IMERG exist in the data layer and are documented in <span class="mono">docs/ARCHITECTURE.md</span>, but they are not wired to a live endpoint here.', 'warn', 'warn')}
        </div>
      </div>`;
    },
    mount() {
      const el = document.getElementById('dashMap');
      if (!el) return;
      const m = global.GAMap.create(el, { lat: S.location.lat, lon: S.location.lon, zoom: 10 });
      liveMaps.push(m);
      const cells = GA.lattice(S.location.lat, S.location.lon, S.radiusKm, 2.2, null, S.scenario ? { scenario: S.scenario } : {});
      m.cells('risk', cells, 2.2, 0.5);
      m.marker('pin', S.location.lat, S.location.lon, { colour: 'var(--trace)', size: 14 });
      S.reports.forEach(r => {
        const t = St.REPORT_TYPES.find(x => x.id === r.type);
        m.marker('reports', r.lat, r.lon, { colour: t ? t.colour : '#7E95A5', size: 10 });
      });
      m.onClick((lat, lon) => global.GAApp.pickPoint(lat, lon));
      m.invalidate();
    }
  };

  /* ======================================================= RISK MAP ===== */
  const LAYER_DEFS = [
    { id: 'risk', label: 'Combined risk zones', colour: 'var(--sev-high)', desc: 'Worst-of the three hazard scores, per 2 km cell.' },
    { id: 'thunderstorm', label: 'Thunderstorm', colour: 'var(--hz-storm)', desc: 'Instability, shear, convergence and cloud-top cooling.' },
    { id: 'cloudburst', label: 'Cloudburst', colour: 'var(--hz-cloud)', desc: 'Moisture depth and tendency with terrain forcing.' },
    { id: 'flashflood', label: 'Flash flood', colour: 'var(--hz-flood)', desc: 'Rain rate against drainage, slope and soil saturation.' },
    { id: 'rainfall', label: 'Rainfall intensity', colour: 'var(--hz-rain)', desc: 'Modelled surface rate in mm/h.' },
    { id: 'terrain', label: 'Terrain & elevation', colour: '#8C7B63', desc: 'Elevation and slope proxy used by the flood model.' },
    { id: 'infrastructure', label: 'Infrastructure', colour: '#E0C060', desc: 'Sample of exposed OSM-tagged assets near the point.' },
    { id: 'reports', label: 'Citizen reports', colour: '#4FC3D9', desc: 'Public submissions, coloured by hazard type.' }
  ];

  const riskmap = {
    title: 'Risk map',
    html() {
      return `<div class="view">
        ${scenarioBanner()}
        <div class="view__head">
          <div><h2>Risk map</h2>
          <p>Pan and zoom anywhere in the world. Click the map to move the assessment point — every module follows it. Zoom in for the 2 km risk lattice.</p></div>
        </div>
        <div class="dash-grid" style="grid-template-columns:minmax(0,1fr) 288px">
          <div class="panel">
            <div class="panel__head"><h3>${U.esc(S.location.name)}</h3><div class="spacer"></div>
              <span class="mono" style="font-size:.76rem;color:var(--ink-mute)">${U.dms(S.location.lat, S.location.lon)}</span></div>
            <div class="panel__body tight mapwrap">
              <div id="bigMap" class="mapbox mapbox--full"></div>
              <div class="map-legend" id="mapLegend"></div>
              <div class="map-hud" id="mapHud">—</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="panel">
              <div class="panel__head">${I.layers()}<h4>Hazard layers</h4></div>
              <div class="panel__body">
                <div class="layerlist">
                ${LAYER_DEFS.map(l => `<label class="layerrow">
                  <input type="checkbox" data-layer="${l.id}" ${S.layers[l.id] ? 'checked' : ''}>
                  <i style="background:${l.colour}"></i>
                  <span><b style="font-weight:500">${U.esc(l.label)}</b><small>${U.esc(l.desc)}</small></span>
                </label>`).join('')}
                </div>
              </div>
            </div>
            <div class="panel">
              <div class="panel__head"><h4>Cell under cursor</h4></div>
              <div class="panel__body" id="cellInfo">
                <p style="color:var(--ink-mute);font-size:.87rem;margin:0">Click anywhere on the map to inspect a cell and re-centre the whole dashboard on it.</p>
              </div>
            </div>
            ${note('Zone boundaries are modelled at 2 km resolution. Treat them as indicative extents, not surveyed flood lines.', 'warn', 'warn')}
          </div>
        </div>
      </div>`;
    },
    mount() {
      const el = document.getElementById('bigMap');
      if (!el) return;
      const m = global.GAMap.create(el, { lat: S.location.lat, lon: S.location.lon, zoom: 9 });
      liveMaps.push(m);
      const hud = document.getElementById('mapHud');
      const legend = document.getElementById('mapLegend');

      function redraw() {
        m.clearAll();
        const opts = S.scenario ? { scenario: S.scenario } : {};
        const rad = S.radiusKm * (S.scenario && S.scenario.radius ? 1 + S.scenario.radius / 100 : 1);

        if (S.layers.risk) m.cells('risk', GA.lattice(S.location.lat, S.location.lon, rad * 1.6, 2.4, null, opts), 2.4, 0.5);
        ['thunderstorm', 'cloudburst', 'flashflood'].forEach(k => {
          if (S.layers[k]) m.cells(k, GA.lattice(S.location.lat, S.location.lon, rad * 1.6, 2.4, k, opts), 2.4, 0.42);
        });
        if (S.layers.rainfall) {
          const cells = GA.lattice(S.location.lat, S.location.lon, rad * 1.6, 2.4, null, opts)
            .map(c => ({ ...c, score: U.clamp(c.rain * 1.6, 0, 100), band: { colour: '#6FA8DC' } }));
          m.cells('rainfall', cells, 2.4, 0.4);
        }
        if (S.layers.terrain) {
          const cells = GA.lattice(S.location.lat, S.location.lon, rad * 1.6, 2.4, null, opts)
            .map(c => ({ ...c, score: U.clamp(c.elev / 32, 0, 100), band: { colour: '#8C7B63' } }));
          m.cells('terrain', cells, 2.4, 0.45);
        }
        if (S.layers.infrastructure) {
          const n = 26;
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2 + GA.fbm(S.location.lat + i, S.location.lon, 5, 2, 1) * 2;
            const d = (0.25 + GA.fbm(S.location.lat, S.location.lon + i, 9, 2, 1) * 0.8) * rad;
            m.marker('infrastructure', S.location.lat + (d / 111) * Math.sin(ang),
              S.location.lon + (d / 111) * Math.cos(ang), { colour: '#E0C060', size: 8 });
          }
        }
        if (S.layers.reports) {
          S.reports.forEach(r => {
            const t = St.REPORT_TYPES.find(x => x.id === r.type);
            m.marker('reports', r.lat, r.lon, {
              colour: t ? t.colour : '#7E95A5', size: r.status === 'verified' ? 13 : 10,
              popup: `<b>${U.esc(t ? t.label : r.type)}</b><br>${U.esc(St.VERIFY_STATES[r.status].label)} · ${U.ago(r.ts)}<br>${U.esc(r.description || '')}`
            });
          });
        }
        m.circle('pin', S.location.lat, S.location.lon, rad, { colour: 'var(--trace)', weight: 1.2, fill: 0.04, dash: true });
        m.marker('pin', S.location.lat, S.location.lon, { colour: '#4FC3D9', size: 15 });

        const on = LAYER_DEFS.filter(l => S.layers[l.id]);
        legend.innerHTML = on.length
          ? on.map(l => `<div><i style="background:${l.colour}"></i>${U.esc(l.label)}</div>`).join('') +
            `<div style="margin-top:.35rem;border-top:1px solid var(--line);padding-top:.3rem">Opacity tracks score</div>`
          : '<div>No layers selected</div>';
        hud.textContent = `z${m.getZoom()} · ${m.kind === 'leaflet' ? 'OpenStreetMap tiles' : 'offline grid'}`;
      }

      redraw();
      m.onMove(() => { hud.textContent = `z${m.getZoom()} · ${m.kind === 'leaflet' ? 'OpenStreetMap tiles' : 'offline grid'}`; });
      m.onClick((lat, lon) => {
        const a = GA.assess(lat, lon, 0, S.scenario ? { scenario: S.scenario } : {});
        document.getElementById('cellInfo').innerHTML = `
          <div style="font-family:var(--font-read);font-size:.78rem;color:var(--ink-mute);margin-bottom:.4rem">${U.dms(lat, lon)}</div>
          <div class="hzcard__top"><h4 style="flex:1">Overall</h4><span class="hzcard__score ${a.overallBand.cls}">${U.fmt(a.overall, 0)}</span></div>
          ${meter(a.overall, a.overallBand.colour)}
          <div style="margin-top:.6rem;font-size:.86rem;display:grid;gap:.25rem">
            ${a.list.map(h => `<div style="display:flex;gap:.5rem"><span style="flex:1;color:var(--ink-soft)">${h.label}</span><span class="mono ${h.band.cls}">${U.fmt(h.score, 0)}</span></div>`).join('')}
            <div style="display:flex;gap:.5rem"><span style="flex:1;color:var(--ink-soft)">Elevation</span><span class="mono">${U.fmt(a.atm.terrain.elevation)} m</span></div>
            <div style="display:flex;gap:.5rem"><span style="flex:1;color:var(--ink-soft)">Rain rate</span><span class="mono">${a.atm.rainRate} mm/h</span></div>
          </div>
          <button class="btn btn--sm btn--block" style="margin-top:.7rem" data-act="recentre" data-lat="${lat}" data-lon="${lon}">Set as assessment point</button>`;
      });

      el.closest('.view').addEventListener('change', e => {
        const k = e.target.getAttribute && e.target.getAttribute('data-layer');
        if (!k) return;
        St.setLayer(k, e.target.checked);
        redraw();
      });
      el.closest('.view').addEventListener('click', e => {
        const b = e.target.closest('[data-act="recentre"]');
        if (b) global.GAApp.pickPoint(parseFloat(b.dataset.lat), parseFloat(b.dataset.lon));
      });
      m.invalidate();
      riskmap._redraw = redraw;
    }
  };

  /* ===================================================== PREDICTION ===== */
  function seriesChart(tl, keys) {
    const W = 620, H = 130, padL = 28, padB = 18, padT = 8;
    const x = i => padL + (i / (tl.length - 1)) * (W - padL - 8);
    const y = v => padT + (1 - v / 100) * (H - padT - padB);
    const grid = [0, 25, 50, 75, 100].map(v =>
      `<line class="gridline" x1="${padL}" y1="${y(v)}" x2="${W - 8}" y2="${y(v)}"/>
       <text class="lbl" x="2" y="${y(v) + 3}">${v}</text>`).join('');
    const lines = keys.map(k => {
      const pts = tl.map((a, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(k.get(a)).toFixed(1)}`).join(' ');
      return `<path class="series" d="${pts}" stroke="${k.colour}"/>`;
    }).join('');
    const ticks = tl.map((a, i) => `<text class="lbl" x="${x(i)}" y="${H - 4}" text-anchor="middle">+${i}h</text>`).join('');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${grid}<line class="axis" x1="${padL}" y1="${y(0)}" x2="${W - 8}" y2="${y(0)}"/>${lines}${ticks}</svg>`;
  }

  const prediction = {
    title: 'Prediction',
    html() {
      const tl = S.timeline, mot = GA.motion(S.location.lat, S.location.lon);
      const keys = [
        { label: 'Thunderstorm', colour: '#B57BE0', get: a => a.hazards.thunderstorm.score },
        { label: 'Cloudburst', colour: '#4F8FE0', get: a => a.hazards.cloudburst.score },
        { label: 'Flash flood', colour: '#35B0A7', get: a => a.hazards.flashflood.score },
        { label: 'Overall', colour: '#E9F0F5', get: a => a.overall }
      ];
      const trend = tl[6].overall - tl[0].overall;

      return `<div class="view">
        ${scenarioBanner()}
        <div class="view__head">
          <div><h2>Six-hour nowcast</h2>
          <p>Risk evolution for ${U.esc(S.location.name)}, hour by hour. Confidence is reported per step and falls with lead time.</p></div>
          <div class="spacer"></div>
          <div class="seg" data-seg="horizon">
            ${[1, 2, 3, 6].map(h => `<button data-h="${h}" class="${S.horizon === h ? 'is-on' : ''}">${h} h</button>`).join('')}
          </div>
        </div>

        <div class="grid g-2" style="margin-bottom:1rem">
          <div class="panel">
            <div class="panel__head"><h3>Risk evolution</h3><div class="spacer"></div>
              <span class="delta ${trend > 3 ? 'delta--up' : trend < -3 ? 'delta--down' : 'delta--flat'}">
                ${trend > 0 ? '▲' : trend < 0 ? '▼' : '■'} ${U.fmt(Math.abs(trend), 0)} pts over 6 h</span></div>
            <div class="panel__body">
              ${seriesChart(tl, keys)}
              <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:.5rem;font-size:.8rem;color:var(--ink-mute)">
                ${keys.map(k => `<span style="display:inline-flex;align-items:center;gap:.35rem"><i style="width:14px;height:2px;background:${k.colour};display:inline-block"></i>${k.label}</span>`).join('')}
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head"><h3>Hour-by-hour overall risk</h3></div>
            <div class="panel__body">
              <div class="tl">
              ${tl.map((a, i) => `<div class="tl__row">
                <span class="tl__t">${U.timeHHMM(a.atm.at)}</span>
                <div class="tl__bar"><i style="width:${a.overall}%;background:${a.overallBand.colour}"></i>
                  <span>${a.overallBand.label} · ${a.dominant.label}</span></div>
                <span class="tl__v ${a.overallBand.cls}">${U.fmt(a.overall, 0)}</span>
              </div>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="grid g-3" style="margin-bottom:1rem">
          ${['thunderstorm', 'cloudburst', 'flashflood'].map(k => {
            const now = tl[0].hazards[k], later = tl[S.horizon].hazards[k];
            const d = later.score - now.score;
            return `<div class="panel">
              <div class="panel__head"><h4>${later.label} outlook</h4></div>
              <div class="panel__body">
                <div style="display:flex;align-items:baseline;gap:.6rem;margin-bottom:.5rem">
                  <span class="mono ${later.band.cls}" style="font-size:1.6rem">${U.fmt(later.score, 0)}</span>
                  <span class="delta ${d > 2 ? 'delta--up' : d < -2 ? 'delta--down' : 'delta--flat'}">${d > 0 ? '+' : ''}${U.fmt(d, 0)} vs now</span>
                </div>
                ${meter(later.score, later.band.colour)}
                <p style="font-size:.86rem;color:var(--ink-soft);margin:.6rem 0 0">
                  At +${S.horizon} h this is <b class="${later.band.cls}">${later.band.label.toLowerCase()}</b>.
                  ${later.leadDriver
                    ? 'Leading indicator: ' + U.esc(later.leadDriver.short.toLowerCase()) + ' (' + U.esc(later.leadDriver.value) + ').'
                    : 'No indicator is currently raising this score; it is held down by ' + U.esc(later.leadSuppressor.short.toLowerCase()) + '.'}</p>
                <div style="margin-top:.6rem;font-size:.82rem;color:var(--ink-mute)">
                  Confidence at this step: <b style="color:var(--ink-soft)">${tl[S.horizon].confidence}%</b></div>
              </div>
            </div>`;
          }).join('')}
        </div>

        <div class="grid g-2">
          <div class="panel">
            <div class="panel__head"><h3>Spatial movement</h3></div>
            <div class="panel__body">
              <div class="movecard">
                <svg class="arrow" viewBox="0 0 54 54">
                  <circle cx="27" cy="27" r="24" fill="none" stroke="var(--line)"/>
                  <g transform="rotate(${mot.bearing} 27 27)">
                    <path d="M27 8 L34 32 L27 27 L20 32 Z" fill="var(--trace)"/>
                  </g>
                  <text x="27" y="52" text-anchor="middle" font-size="8" fill="var(--ink-mute)" font-family="monospace">${mot.bearing}°</text>
                </svg>
                <div>
                  <div style="font-family:var(--font-head);font-size:1.15rem">Cells tracking toward the ${mot.compass}</div>
                  <div style="color:var(--ink-soft);font-size:.89rem">Steering speed ≈ ${mot.speedKmh} km/h, so a cell now 25 km upstream reaches this point in roughly ${Math.max(1, Math.round(25 / mot.speedKmh * 60))} minutes.</div>
                </div>
              </div>
              <div style="margin-top:.8rem">
                ${note('Motion here is a steering-flow proxy derived from latitude and a spatial field. Real advection requires radar or satellite cross-correlation tracking; the optical-flow module is specified but not fed in this build.', 'warn', 'warn')}
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head"><h3>Confidence and data availability</h3></div>
            <div class="panel__body tight">
              <table class="matrix"><thead><tr><th>Feed</th><th>Source</th><th>Cadence</th><th>State</th></tr></thead><tbody>
              ${S.assessment.status.feeds.map(f => `<tr>
                <td>${U.esc(f.name)}</td><td style="color:var(--ink-mute)">${U.esc(f.src)}</td>
                <td class="mono" style="font-size:.8rem">${U.esc(f.cadence)}</td>
                <td class="${f.ok ? 'ok' : 'no'}">${f.ok ? 'adapter ready' : 'no coverage'}</td></tr>`).join('')}
              </tbody></table>
              <div style="padding:.9rem">
                ${note('<b>No accuracy figure is claimed anywhere in this interface.</b> Stating a skill score such as CSI, POD or FAR is only meaningful after verification against observed events. The verification harness is included in the repository plan but has not been run, so no number is shown.', 'warn', 'warn')}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    },
    mount(root) {
      const seg = root.querySelector('[data-seg="horizon"]');
      if (seg) seg.addEventListener('click', e => {
        const b = e.target.closest('[data-h]');
        if (!b) return;
        St.setHorizon(parseInt(b.dataset.h, 10));
        global.GAApp.render();
      });
    }
  };

  /* ========================================================= IMPACT ===== */
  const impact = {
    title: 'Impact analysis',
    html() {
      const a = S.assessment;
      const rad = S.radiusKm * (S.scenario && S.scenario.radius ? 1 + S.scenario.radius / 100 : 1);
      const ex = GA.exposure(S.location.lat, S.location.lon, rad, a.overall, S.scenario ? { scenario: S.scenario } : {});
      const pop = ex.find(x => x.id === 'population');
      const osmOk = a.status.feeds.find(f => f.id === 'osm').ok;

      return `<div class="view">
        ${scenarioBanner()}
        <div class="view__head">
          <div><h2>Exposure inside the risk footprint</h2>
          <p>What sits inside the modelled ${U.fmt(rad, 0)} km footprint around ${U.esc(S.location.name)}, and how much of it falls in cells scored moderate or worse.</p></div>
        </div>

        <div class="grid g-4" style="margin-bottom:1rem">
          <div class="stat"><span class="stat__k">Residents in footprint</span>
            <span class="stat__v">${U.compact(pop.exposed)}</span>
            <span class="stat__n">of about ${U.compact(pop.total)} in the radius</span></div>
          <div class="stat"><span class="stat__k">Footprint area</span>
            <span class="stat__v">${U.fmt(Math.PI * rad * rad, 0)}<span class="unit">km²</span></span>
            <span class="stat__n">circle of ${U.fmt(rad, 0)} km radius</span></div>
          <div class="stat"><span class="stat__k">Dominant hazard</span>
            <span class="stat__v ${a.dominant.band.cls}">${a.dominant.label}</span>
            <span class="stat__n">drives most of the exposure below</span></div>
          <div class="stat"><span class="stat__k">Geospatial source</span>
            <span class="stat__v ${osmOk ? 'sev-low' : 'sev-mod'}" style="font-size:.95rem">${osmOk ? 'OSM adapter ready' : 'OSM sparse here'}</span>
            <span class="stat__n">${osmOk ? 'Counts are modelled, not queried' : 'Counts would be incomplete even with a live query'}</span></div>
        </div>

        <div class="dash-grid">
          <div class="panel">
            <div class="panel__head"><h3>Exposed assets by category</h3><div class="spacer"></div>
              <span style="font-size:.78rem;color:var(--ink-mute)">exposed / total in radius</span></div>
            <div class="panel__body tight">
              <div class="rows">
              ${ex.map(x => {
                const pct = x.total > 0 ? (x.exposed / x.total) * 100 : 0;
                return `<div class="row">
                  <div class="row__ic" style="background:var(--slate-600);color:${pct > 55 ? 'var(--sev-high)' : 'var(--trace)'}">
                    ${(I[x.icon] || I.dot)()}</div>
                  <div class="row__b"><b>${U.esc(x.name)}</b>
                    <small>${x.available ? 'OSM tag ' + U.esc(x.osm) : 'not mapped in this area — count would be incomplete'}</small>
                    <div style="margin-top:.3rem;max-width:320px">${meter(pct, pct > 55 ? 'var(--sev-high)' : pct > 30 ? 'var(--sev-mod)' : 'var(--trace-dim)')}</div>
                  </div>
                  <div class="row__v">${x.available ? `${x.id === 'population' ? U.compact(x.exposed) : U.fmt(x.exposed, x.unit === 'km' ? 1 : 0)}
                    <span style="color:var(--ink-mute)">/ ${x.id === 'population' ? U.compact(x.total) : U.fmt(x.total, x.unit === 'km' ? 1 : 0)} ${U.esc(x.unit)}</span>`
                    : '<span style="color:var(--ink-mute)">no data</span>'}</div>
                </div>`;
              }).join('')}
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="panel">
              <div class="panel__head"><h4>Footprint</h4></div>
              <div class="panel__body tight mapwrap">
                <div id="impactMap" class="mapbox mapbox--mini"></div>
              </div>
            </div>
            <div class="panel">
              <div class="panel__head"><h4>Priority actions</h4></div>
              <div class="panel__body">
                <ul style="margin:0;padding-left:1.1rem;font-size:.89rem;color:var(--ink-soft)">
                  <li>Check standby power and access routes at the ${U.fmt(ex.find(x => x.id === 'hospitals').exposed, 0)} health facilities in the footprint.</li>
                  <li>Confirm ${U.fmt(ex.find(x => x.id === 'bridges').exposed, 0)} bridges and culverts are clear of debris before rainfall peaks.</li>
                  <li>Contact ${U.fmt(ex.find(x => x.id === 'schools').exposed, 0)} schools about dismissal timing if the window falls in school hours.</li>
                  <li>Stage pumps near the ${U.fmt(ex.find(x => x.id === 'roads').exposed, 1)} km of road inside moderate-or-worse cells.</li>
                </ul>
              </div>
            </div>
            ${note('<b>Exposure depends entirely on the geospatial data available.</b> These counts are modelled from land-cover and population-density proxies for the demo. With an Overpass API extract connected, the same panel reports real OSM feature counts — and would show gaps where OSM coverage is thin, which is common in rural India. Absence from this list does not mean absence on the ground.', 'warn', 'warn')}
          </div>
        </div>
      </div>`;
    },
    mount() {
      const el = document.getElementById('impactMap');
      if (!el) return;
      const rad = S.radiusKm * (S.scenario && S.scenario.radius ? 1 + S.scenario.radius / 100 : 1);
      const m = global.GAMap.create(el, { lat: S.location.lat, lon: S.location.lon, zoom: 10 });
      liveMaps.push(m);
      m.cells('risk', GA.lattice(S.location.lat, S.location.lon, rad, 2.2, null, S.scenario ? { scenario: S.scenario } : {}), 2.2, 0.5);
      m.circle('pin', S.location.lat, S.location.lon, rad, { colour: 'var(--trace)', weight: 1.3, fill: 0.03, dash: true });
      m.marker('pin', S.location.lat, S.location.lon, { colour: '#4FC3D9', size: 13 });
      m.invalidate();
    }
  };

  /* ========================================================= ROUTES ===== */
  const routes = {
    title: 'Safe route intelligence',
    html() {
      const q = S.routeQuery;
      const rs = S.routes || [];
      return `<div class="view">
        ${scenarioBanner()}
        <div class="view__head">
          <div><h2>Route exposure comparison</h2>
          <p>Compare corridors by how much modelled risk they cross. The tool ranks by exposure — it never certifies a route as safe.</p></div>
        </div>

        <div class="dash-grid" style="grid-template-columns:320px minmax(0,1fr)">
          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="panel">
              <div class="panel__head">${I.route()}<h4>Plan a corridor</h4></div>
              <div class="panel__body">
                <div class="field"><label for="rFrom">Origin</label>
                  <input type="text" id="rFrom" placeholder="Place name or lat, lon" value="${U.esc(q ? q.from : S.location.name)}">
                  <small class="hint">Leave as is to start from the current assessment point.</small></div>
                <div class="field"><label for="rTo">Destination</label>
                  <input type="text" id="rTo" placeholder="Place name or lat, lon" value="${U.esc(q ? q.to : '')}">
                </div>
                <button class="btn btn--solid btn--block" data-act="route-go">Compare routes</button>
                <div id="rStatus" style="margin-top:.6rem;font-size:.83rem;color:var(--ink-mute)"></div>
              </div>
            </div>
            <div id="routeList">
            ${rs.length ? rs.map((r, i) => `
              <div class="routecard ${i === (S.routePick || 0) ? 'is-on' : ''}" data-route="${i}">
                <div class="routecard__top">
                  <i class="swatch" style="background:${r.colour}"></i>
                  <h4>${U.esc(r.name)}</h4>
                  ${r.recommended ? '<span class="chip chip--live"><i class="dot"></i>Lowest exposure</span>' : ''}
                </div>
                <dl>
                  <div><dt>Distance</dt><dd>${U.fmt(r.distanceKm, 1)} km</dd></div>
                  <div><dt>Est. time</dt><dd>${r.minutes} min</dd></div>
                  <div><dt>Mean exposure</dt><dd class="${r.band.cls}">${U.fmt(r.exposure, 0)}</dd></div>
                </dl>
                <div class="why">${U.esc(routeWhy(r))}</div>
              </div>`).join('') : `<div class="panel"><div class="empty"><b>No corridor compared yet</b>
                Enter an origin and destination to see how much risk each option crosses.</div></div>`}
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="panel">
              <div class="panel__head"><h4>Corridors over the risk field</h4></div>
              <div class="panel__body tight mapwrap">
                <div id="routeMap" class="mapbox" style="height:430px"></div>
                <div class="map-legend"><div><i class="bg-low"></i> Low</div><div><i class="bg-mod"></i> Moderate</div><div><i class="bg-high"></i> High</div><div><i class="bg-sev"></i> Severe</div></div>
              </div>
            </div>
            ${rs.length ? `<div class="panel">
              <div class="panel__head"><h4>Hazard exposure along ${U.esc(rs[S.routePick || 0].name)}</h4></div>
              <div class="panel__body">
                ${segStrip(rs[S.routePick || 0])}
                <div style="margin-top:.8rem;font-size:.88rem;color:var(--ink-soft)">
                  ${U.esc(routeWhy(rs[S.routePick || 0]))}
                  ${rs[S.routePick || 0].highShare > 0 ? ` The flagged segments are driven mainly by ${U.esc(dominantAlong(rs[S.routePick || 0]).toLowerCase())}.` : ''}
                </div>
              </div>
            </div>` : ''}
            ${note('<b>Wording matters here.</b> A corridor with lower modelled exposure is described as comparatively lower risk or a recommended alternative based on current model output. It is never called safe. Conditions change faster than a nowcast updates, roads close for reasons no model sees, and this build has no live traffic or road-closure feed. Always defer to police, traffic control and the district administration.', 'warn', 'warn')}
          </div>
        </div>
      </div>`;
    },
    mount(root) {
      const el = document.getElementById('routeMap');
      const m = global.GAMap.create(el, { lat: S.location.lat, lon: S.location.lon, zoom: 8 });
      liveMaps.push(m);

      function draw() {
        m.clearAll();
        const rs = S.routes || [];
        if (!rs.length) {
          m.cells('risk', GA.lattice(S.location.lat, S.location.lon, S.radiusKm * 1.6, 2.4, null, S.scenario ? { scenario: S.scenario } : {}), 2.4, 0.45);
          m.marker('pin', S.location.lat, S.location.lon, { colour: '#4FC3D9', size: 14 });
          return;
        }
        const all = rs.flatMap(r => r.points);
        const mid = { lat: (S.routeQuery.fromPt.lat + S.routeQuery.toPt.lat) / 2, lon: (S.routeQuery.fromPt.lon + S.routeQuery.toPt.lon) / 2 };
        const span = GA.haversine(S.routeQuery.fromPt, S.routeQuery.toPt);
        m.cells('risk', GA.lattice(mid.lat, mid.lon, Math.max(20, span * 0.75), Math.max(3, span / 22), null, S.scenario ? { scenario: S.scenario } : {}), Math.max(3, span / 22), 0.42);
        rs.forEach((r, i) => m.line('routes', r.points, {
          colour: r.colour, weight: i === (S.routePick || 0) ? 5 : 3, opacity: i === (S.routePick || 0) ? 0.95 : 0.45
        }));
        m.marker('pin', S.routeQuery.fromPt.lat, S.routeQuery.fromPt.lon, { colour: '#4FC3D9', size: 14 });
        m.marker('pin', S.routeQuery.toPt.lat, S.routeQuery.toPt.lon, { colour: '#E9F0F5', size: 14 });
        m.fit(all, 30);
      }
      draw();
      m.invalidate();

      root.addEventListener('click', async e => {
        const card = e.target.closest('[data-route]');
        if (card) { S.routePick = parseInt(card.dataset.route, 10); global.GAApp.render(); return; }
        if (!e.target.closest('[data-act="route-go"]')) return;
        const st = document.getElementById('rStatus');
        const fromQ = document.getElementById('rFrom').value.trim();
        const toQ = document.getElementById('rTo').value.trim();
        if (!toQ) { st.textContent = 'Enter a destination to compare corridors.'; return; }
        st.textContent = 'Resolving places…';
        const resolve = async (q, fallback) => {
          if (!q) return fallback;
          const c = GA.parseCoords(q);
          if (c) return c;
          const r = await GA.geocode(q);
          return r.results[0] || null;
        };
        const from = await resolve(fromQ, S.location);
        const to = await resolve(toQ, null);
        if (!from || !to) { st.textContent = 'Could not resolve one of those places. Try a coordinate pair like 22.57, 88.36.'; return; }
        if (GA.haversine(from, to) > 900) { st.textContent = 'That corridor is longer than 900 km — the nowcast window does not cover a journey that long.'; return; }
        st.textContent = 'Loading original road routes…';
        try {
          await St.buildRoutes(from, to);
          S.routePick = 0;
          st.textContent = '';
          global.GAApp.render();
        } catch (err) {
          st.textContent = 'Could not load road routes. Check your connection and try again.';
          console.error('Road routing failed:', err);
        }
      });
    }
  };

  function routeWhy(r) {
    const pct = Math.round(r.highShare * 100);
    if (pct === 0) return `No sampled point on this corridor currently falls in a high or severe cell. Mean exposure ${U.fmt(r.exposure, 0)} of 100. Comparatively lower risk than the alternatives shown, on current model output.`;
    if (pct < 15) return `About ${pct}% of sampled points cross high or severe cells, peaking at ${U.fmt(r.peak, 0)}. Passable with caution on current model output, but brief drivers on the flagged stretch.`;
    return `Roughly ${pct}% of this corridor passes through modelled high or severe risk, peaking at ${U.fmt(r.peak, 0)}. Consider the recommended alternative and avoid the high-risk zone if the journey can wait.`;
  }
  function dominantAlong(r) {
    const counts = {};
    r.segments.filter(s => s.score >= 62).forEach(s => counts[s.dominant] = (counts[s.dominant] || 0) + 1);
    const k = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return k || 'combined hazards';
  }
  function segStrip(r) {
    return `<div style="display:flex;gap:1px;height:26px;border-radius:3px;overflow:hidden">
      ${r.segments.map(s => `<div title="${U.fmt(s.score, 0)} · ${U.esc(s.dominant)}" style="flex:1;background:${s.band.colour};opacity:${0.35 + s.score / 160}"></div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:.76rem;color:var(--ink-mute);margin-top:.3rem">
      <span>${U.esc(S.routeQuery.from)}</span><span>${U.fmt(r.distanceKm, 1)} km</span><span>${U.esc(S.routeQuery.to)}</span></div>`;
  }

  /* ========================================================= WHAT-IF ===== */
  const SLIDERS = [
    { id: 'rain', label: 'Rainfall intensity', min: -50, max: 200, step: 10, unit: '%', hint: 'Scales the modelled surface rain rate.' },
    { id: 'storm', label: 'Storm intensity', min: -50, max: 150, step: 10, unit: '%', hint: 'Scales CAPE and shear, and weakens the cap.' },
    { id: 'moisture', label: 'Column moisture', min: -40, max: 120, step: 10, unit: '%', hint: 'Scales IWV and its tendency.' },
    { id: 'soil', label: 'Soil saturation', min: -40, max: 60, step: 5, unit: ' pts', hint: 'Shifts how much rain the ground can still absorb.' },
    { id: 'radius', label: 'Risk zone extent', min: 0, max: 150, step: 10, unit: '%', hint: 'Expands the footprint used for exposure and routing.' }
  ];

  const PRESETS = [
    { id: 'cloudburst', label: 'Cloudburst over the catchment', v: { rain: 160, storm: 60, moisture: 70, soil: 30, radius: 40 } },
    { id: 'squall', label: 'Fast-moving squall line', v: { rain: 70, storm: 110, moisture: 20, soil: 0, radius: 60 } },
    { id: 'urban', label: 'Urban flooding after saturation', v: { rain: 80, storm: 10, moisture: 30, soil: 55, radius: 30 } },
    { id: 'clearing', label: 'Conditions easing', v: { rain: -40, storm: -40, moisture: -30, soil: -20, radius: 0 } }
  ];

  const whatif = {
    title: 'What-if simulator',
    html() {
      const base = GA.assess(S.location.lat, S.location.lon, 0, {});
      const sc = S.scenario || { rain: 0, storm: 0, moisture: 0, soil: 0, radius: 0 };
      const sim = GA.assess(S.location.lat, S.location.lon, 0, S.scenario ? { scenario: S.scenario } : {});
      const baseRad = S.radiusKm, simRad = S.radiusKm * (1 + (sc.radius || 0) / 100);
      const baseEx = GA.exposure(S.location.lat, S.location.lon, baseRad, base.overall, {});
      const simEx = GA.exposure(S.location.lat, S.location.lon, simRad, sim.overall, S.scenario ? { scenario: S.scenario } : {});
      const baseAl = St.buildAlerts.length;

      const dRow = (label, a, b, fmt) => {
        const d = b - a;
        return `<div class="row">
          <div class="row__ic" style="background:var(--slate-600);color:var(--ink-mute)">${I.dot()}</div>
          <div class="row__b"><b>${U.esc(label)}</b><small>model view → simulated</small></div>
          <div class="row__v">${fmt(a)} <span style="color:var(--ink-mute)">→</span> ${fmt(b)}
            <span class="delta ${d > 0.5 ? 'delta--up' : d < -0.5 ? 'delta--down' : 'delta--flat'}" style="margin-left:.4rem">
            ${d > 0 ? '+' : ''}${fmt(d)}</span></div>
        </div>`;
      };

      return `<div class="view">
        <div class="view__head">
          <div><h2>What-if emergency simulator</h2>
          <p>Change the drivers and watch risk, exposure, routing and alerts respond. Everything produced here is a hypothetical scenario, clearly separated from the model view.</p></div>
          <div class="spacer"></div>
          <span class="chip chip--sim"><i class="dot"></i>${S.scenario ? 'Scenario active' : 'No scenario'}</span>
        </div>

        <div class="dash-grid" style="grid-template-columns:330px minmax(0,1fr)">
          <div class="panel">
            <div class="panel__head">${I.flask()}<h4>Scenario controls</h4></div>
            <div class="panel__body">
              <div class="chipset" style="margin-bottom:1rem">
                ${PRESETS.map(p => `<button data-preset="${p.id}">${U.esc(p.label)}</button>`).join('')}
              </div>
              ${SLIDERS.map(s => `<div class="slider">
                <div class="slider__top"><b>${U.esc(s.label)}</b>
                  <span class="v" data-out="${s.id}">${(sc[s.id] || 0) > 0 ? '+' : ''}${sc[s.id] || 0}${s.unit}</span></div>
                <input type="range" data-sim="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${sc[s.id] || 0}">
                <small>${U.esc(s.hint)}</small>
              </div>`).join('')}
              <div style="display:flex;gap:.5rem;margin-top:.4rem">
                <button class="btn btn--solid" style="flex:1" data-act="run-sim">Run scenario</button>
                <button class="btn btn--ghost" data-act="exit-sim">Reset</button>
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:1rem">
            ${S.scenario ? scenarioBanner() : note('Adjust the controls and run a scenario. Until you do, the panels below compare the model view against itself.', '', 'info')}

            <div class="grid g-4">
              ${[['Overall risk', base.overall, sim.overall], ...base.list.map((h, i) => [h.label, h.score, sim.list[i].score])].map(r => {
                const d = r[2] - r[1], b2 = GA.band(r[2]);
                return `<div class="stat"><span class="stat__k">${U.esc(r[0])}</span>
                  <span class="stat__v ${b2.cls}">${U.fmt(r[2], 0)}</span>
                  <span class="stat__n">from ${U.fmt(r[1], 0)} ·
                    <span class="delta ${d > 0.5 ? 'delta--up' : d < -0.5 ? 'delta--down' : 'delta--flat'}">${d > 0 ? '+' : ''}${U.fmt(d, 0)}</span></span></div>`;
              }).join('')}
            </div>

            <div class="panel">
              <div class="panel__head"><h4>How exposure changes</h4><div class="spacer"></div>
                <span style="font-size:.78rem;color:var(--ink-mute)">footprint ${U.fmt(baseRad, 0)} km → ${U.fmt(simRad, 0)} km</span></div>
              <div class="panel__body tight"><div class="rows">
                ${['population', 'roads', 'schools', 'hospitals', 'bridges', 'emergency'].map(id => {
                  const a = baseEx.find(x => x.id === id), b = simEx.find(x => x.id === id);
                  return dRow(a.name, a.exposed, b.exposed, v => id === 'population' ? U.compact(v) : U.fmt(v, id === 'roads' ? 1 : 0));
                }).join('')}
              </div></div>
            </div>

            <div class="grid g-2">
              <div class="panel">
                <div class="panel__head"><h4>Route exposure under this scenario</h4></div>
                <div class="panel__body">
                  ${S.routes && S.routes.length ? S.routes.map(r => {
                    const sim2 = simRouteExposure(r);
                    const d = sim2 - r.exposure;
                    return `<div style="display:flex;align-items:center;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--line-soft)">
                      <i style="width:10px;height:10px;border-radius:2px;background:${r.colour}"></i>
                      <span style="flex:1;font-size:.9rem">${U.esc(r.name)}</span>
                      <span class="mono" style="font-size:.86rem">${U.fmt(r.exposure, 0)} → ${U.fmt(sim2, 0)}</span>
                      <span class="delta ${d > 0.5 ? 'delta--up' : d < -0.5 ? 'delta--down' : 'delta--flat'}">${d > 0 ? '+' : ''}${U.fmt(d, 0)}</span>
                    </div>`;
                  }).join('') : `<div class="empty"><b>No corridor loaded</b>Compare routes first and they will appear here under the scenario.</div>`}
                </div>
              </div>
              <div class="panel">
                <div class="panel__head"><h4>Alerts this scenario would raise</h4></div>
                <div class="panel__body">
                  ${(S.scenario ? St.buildAlerts() : []).length
                    ? St.buildAlerts().map(al => `<div style="display:flex;gap:.5rem;align-items:center;padding:.35rem 0">
                        <span class="${al.band.cls}">${(I[al.icon] || I.warn)()}</span>
                        <span style="flex:1;font-size:.9rem">${U.esc(al.category)}</span>
                        <span class="chip chip--sim"><i class="dot"></i>Simulated</span></div>`).join('')
                    : `<div class="empty"><b>${S.scenario ? 'No threshold crossed' : 'Run a scenario'}</b>${S.scenario ? 'This scenario stays below every alert threshold.' : 'Alerts generated by a scenario appear here, marked as simulated.'}</div>`}
                </div>
              </div>
            </div>

            ${note('<b>Simulated scenarios are not forecasts.</b> They answer "if conditions changed like this, what would the model say?" Nothing on this page should be circulated as a warning, and every alert it generates carries a simulated marker that follows it into the Alert Centre.', 'sim', 'warn')}
          </div>
        </div>
      </div>`;
    },
    mount(root) {
      const read = () => {
        const o = {};
        root.querySelectorAll('[data-sim]').forEach(i => o[i.dataset.sim] = parseInt(i.value, 10));
        return o;
      };
      root.addEventListener('input', e => {
        const k = e.target.dataset.sim;
        if (!k) return;
        const s = SLIDERS.find(x => x.id === k);
        const out = root.querySelector(`[data-out="${k}"]`);
        out.textContent = (e.target.value > 0 ? '+' : '') + e.target.value + s.unit;
      });
      root.addEventListener('click', async e => {
        const p = e.target.closest('[data-preset]');
        if (p) {
          const pr = PRESETS.find(x => x.id === p.dataset.preset);
          Object.keys(pr.v).forEach(k => {
            const inp = root.querySelector(`[data-sim="${k}"]`);
            if (inp) { inp.value = pr.v[k]; inp.dispatchEvent(new Event('input', { bubbles: true })); }
          });
          St.setScenario(pr.v);
          global.GAApp.render();
          return;
        }
        if (e.target.closest('[data-act="run-sim"]')) { St.setScenario(read()); global.GAApp.render(); }
      });
    }
  };

  function simRouteExposure(r) {
    const opts = S.scenario ? { scenario: S.scenario } : {};
    let sum = 0;
    r.points.forEach(p => sum += GA.assess(p.lat, p.lon, 0, opts).overall);
    return U.round(sum / r.points.length, 1);
  }

  /* ======================================================== REPORTS ===== */
  const reports = {
    title: 'Citizen reports',
    html() {
      const list = S.reports;
      const counts = { unverified: 0, review: 0, verified: 0 };
      list.forEach(r => counts[r.status]++);
      return `<div class="view">
        <div class="view__head">
          <div><h2>Ground reports</h2>
          <p>What people on the ground are seeing. These are observations from the public, held separate from model output and from official measurements.</p></div>
        </div>

        <div class="dash-grid" style="grid-template-columns:340px minmax(0,1fr)">
          <div class="panel" style="align-self:start">
            <div class="panel__head">${I.plus()}<h4>Submit a report</h4></div>
            <div class="panel__body">
              <div class="field"><label>What are you seeing?</label>
                <div class="chipset" id="repTypes">
                  ${St.REPORT_TYPES.map((t, i) => `<button data-rtype="${t.id}" class="${i === 0 ? 'is-on' : ''}">${U.esc(t.label)}</button>`).join('')}
                </div>
              </div>
              <div class="field"><label for="repDesc">Description <span style="color:var(--ink-mute)">— optional</span></label>
                <textarea id="repDesc" placeholder="Water depth, how long it has been going on, whether the road is passable…"></textarea></div>
              <div class="field"><label for="repLoc">Location</label>
                <input type="text" id="repLoc" value="${U.dms(S.location.lat, S.location.lon)}">
                <small class="hint">Defaults to the assessment point. Paste a coordinate pair to change it, or use the button below.</small></div>
              <div class="field"><label for="repPhoto">Photo <span style="color:var(--ink-mute)">— optional</span></label>
                <input type="file" id="repPhoto" accept="image/*" style="font-size:.85rem">
                <small class="hint">Stays in your browser. Nothing is uploaded in this build.</small></div>
              <button class="btn btn--ghost btn--block" data-act="use-gps" style="margin-bottom:.5rem">${I.pin()} Use my device location</button>
              <button class="btn btn--solid btn--block" data-act="submit-report">Submit report</button>
              <div id="repMsg" style="margin-top:.6rem;font-size:.84rem;color:var(--ink-mute)"></div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="grid g-3">
              <div class="stat"><span class="stat__k">Unverified</span><span class="stat__v">${counts.unverified}</span>
                <span class="stat__n">${U.esc(St.VERIFY_STATES.unverified.note)}</span></div>
              <div class="stat"><span class="stat__k">Under review</span><span class="stat__v sev-mod">${counts.review}</span>
                <span class="stat__n">${U.esc(St.VERIFY_STATES.review.note)}</span></div>
              <div class="stat"><span class="stat__k">Corroborated</span><span class="stat__v sev-low">${counts.verified}</span>
                <span class="stat__n">${U.esc(St.VERIFY_STATES.verified.note)}</span></div>
            </div>

            <div class="panel">
              <div class="panel__head"><h4>Reports on the map</h4></div>
              <div class="panel__body tight mapwrap"><div id="repMap" class="mapbox mapbox--mini"></div></div>
            </div>

            <div class="panel">
              <div class="panel__head"><h4>Report feed</h4><div class="spacer"></div>
                <span style="font-size:.78rem;color:var(--ink-mute)">${list.length} total</span></div>
              <div class="panel__body">
                ${list.length ? list.map(r => {
                  const t = St.REPORT_TYPES.find(x => x.id === r.type) || { label: r.type, colour: '#7E95A5', icon: 'info' };
                  const v = St.VERIFY_STATES[r.status];
                  return `<div class="repcard">
                    <div class="repcard__top">
                      <span style="color:${t.colour}">${(I[t.icon] || I.dot)()}</span>
                      <b>${U.esc(t.label)}</b>
                      <span class="chip" style="color:${v.colour}"><i class="dot"></i>${U.esc(v.label)}</span>
                      ${r.corroborations ? `<span style="font-size:.78rem;color:var(--ink-mute)">${r.corroborations} nearby match${r.corroborations > 1 ? 'es' : ''}</span>` : ''}
                    </div>
                    ${r.description ? `<p>${U.esc(r.description)}</p>` : ''}
                    ${r.photo ? `<img src="${r.photo}" alt="Photo attached to a citizen report">` : ''}
                    <div class="meta">${U.dms(r.lat, r.lon)} · ${U.ago(r.ts)} · ${new Date(r.ts).toLocaleString()}</div>
                  </div>`;
                }).join('') : `<div class="empty"><b>No reports yet</b>Submit the first observation for this area.</div>`}
              </div>
            </div>

            ${note('<b>Citizen reports are not official observations.</b> They are never promoted into the model as measurements. Corroboration here means at least two independent reports of the same hazard within 3 km and 2 hours, or a moderator confirmation — it raises confidence, it does not make a report authoritative. In deployment this queue sits behind a moderator console with rate limiting, device attestation and spam scoring.', 'warn', 'warn')}
          </div>
        </div>
      </div>`;
    },
    mount(root) {
      const el = document.getElementById('repMap');
      const m = global.GAMap.create(el, { lat: S.location.lat, lon: S.location.lon, zoom: 11 });
      liveMaps.push(m);
      S.reports.forEach(r => {
        const t = St.REPORT_TYPES.find(x => x.id === r.type);
        m.marker('reports', r.lat, r.lon, { colour: t ? t.colour : '#7E95A5', size: r.status === 'verified' ? 14 : 10 });
      });
      m.marker('pin', S.location.lat, S.location.lon, { colour: 'var(--trace)', size: 12 });
      m.onClick((lat, lon) => { document.getElementById('repLoc').value = U.round(lat, 5) + ', ' + U.round(lon, 5); });
      m.invalidate();

      let type = St.REPORT_TYPES[0].id, photo = null;
      root.querySelector('#repTypes').addEventListener('click', e => {
        const b = e.target.closest('[data-rtype]');
        if (!b) return;
        type = b.dataset.rtype;
        root.querySelectorAll('[data-rtype]').forEach(x => x.classList.toggle('is-on', x === b));
      });
      root.querySelector('#repPhoto').addEventListener('change', e => {
        const f = e.target.files[0];
        if (!f) { photo = null; return; }
        if (f.size > 3.5e6) { document.getElementById('repMsg').textContent = 'That image is over 3.5 MB. Choose a smaller one.'; e.target.value = ''; return; }
        const fr = new FileReader();
        fr.onload = () => photo = fr.result;
        fr.readAsDataURL(f);
      });
      root.addEventListener('click', async e => {
        if (e.target.closest('[data-act="use-gps"]')) {
          const msg = document.getElementById('repMsg');
          if (!navigator.geolocation) { msg.textContent = 'This browser does not expose a location API.'; return; }
          msg.textContent = 'Asking your browser for a location…';
          navigator.geolocation.getCurrentPosition(
            p => { document.getElementById('repLoc').value = U.round(p.coords.latitude, 5) + ', ' + U.round(p.coords.longitude, 5); msg.textContent = 'Location filled in.'; },
            () => msg.textContent = 'Location permission was declined. Enter coordinates or tap the map instead.');
          return;
        }
        if (!e.target.closest('[data-act="submit-report"]')) return;
        const msg = document.getElementById('repMsg');
        const c = GA.parseCoords(document.getElementById('repLoc').value);
        if (!c) { msg.textContent = 'Location needs to be a coordinate pair, for example 22.5726, 88.3639.'; return; }
        await St.addReport({
          type, description: document.getElementById('repDesc').value.trim(),
          lat: c.lat, lon: c.lon, placeName: S.location.name, photo
        });
        global.GAApp.toast('Report submitted. It is marked unverified until corroborated.');
        global.GAApp.render();
      });
    }
  };

  /* ========================================================== ALERTS ===== */
  const alerts = {
    title: 'Alert centre',
    html() {
      const list = S.alerts || [];
      return `<div class="view">
        ${scenarioBanner()}
        <div class="view__head">
          <div><h2>Alert centre</h2>
          <p>Alerts raised when model scores cross demonstration thresholds for ${U.esc(S.location.name)}. Every alert states where it came from.</p></div>
        </div>

        <div class="dash-grid" style="grid-template-columns:minmax(0,1fr) 320px">
          <div>
            ${list.length ? list.map(al => `<div class="alert" style="border-left-color:${al.band.colour}">
              <div class="alert__top">
                <span class="${al.band.cls}">${(I[al.icon] || I.warn)()}</span>
                <h4>${U.esc(al.category)} — <span class="${al.band.cls}">${al.band.label.toLowerCase()}</span></h4>
                ${chipProvenance(al.provenance)}
              </div>
              <dl>
                <dt>Affected area</dt><dd>${U.esc(al.area)}</dd>
                <dt>Expected window</dt><dd>${U.timeHHMM(al.from)} – ${U.timeHHMM(al.to)} local, today</dd>
                <dt>Severity / score</dt><dd class="${al.band.cls}">${al.band.label} · ${U.fmt(al.score, 0)} of 100</dd>
                <dt>Why it fired</dt><dd>${U.esc(al.reason)}</dd>
              </dl>
              <div class="action"><b>Recommended preparedness action.</b> ${U.esc(al.action)}</div>
            </div>`).join('') : `<div class="panel"><div class="empty"><b>No thresholds crossed</b>
              Nothing at this location currently reaches an alert threshold. Alerts recompute whenever the location, horizon or scenario changes.</div></div>`}
          </div>

          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="panel">
              <div class="panel__head"><h4>How to read these</h4></div>
              <div class="panel__body" style="font-size:.88rem;color:var(--ink-soft)">
                <p style="margin-bottom:.6rem"><span class="chip chip--demo"><i class="dot"></i>Demo alert</span><br>
                Generated by the demonstration model against fixed thresholds. No live observation stands behind it.</p>
                <p style="margin-bottom:.6rem"><span class="chip chip--sim"><i class="dot"></i>Simulated scenario</span><br>
                Produced by the What-if simulator from hypothetical inputs. Never circulate these.</p>
                <p style="margin-bottom:0"><span class="chip chip--live"><i class="dot"></i>Live data-backed</span><br>
                Reserved for alerts traceable to a connected observation feed. Nothing in this build qualifies, so the marker does not appear on any alert.</p>
              </div>
            </div>

            <div class="panel">
              <div class="panel__head"><h4>Thresholds in use</h4></div>
              <div class="panel__body tight">
                <table class="matrix"><thead><tr><th>Category</th><th>Fires at</th></tr></thead><tbody>
                  <tr><td>Thunderstorm</td><td class="mono">score ≥ 55</td></tr>
                  <tr><td>Cloudburst</td><td class="mono">score ≥ 58</td></tr>
                  <tr><td>Flash flood</td><td class="mono">score ≥ 55</td></tr>
                  <tr><td>Heavy rainfall</td><td class="mono">≥ 15 mm/h</td></tr>
                  <tr><td>Route hazard</td><td class="mono">corridor ≥ 45</td></tr>
                  <tr><td>Infrastructure</td><td class="mono">overall ≥ 60</td></tr>
                </tbody></table>
              </div>
            </div>

            ${note('<b>Nothing here is a government warning.</b> India\'s official severe-weather warnings come from the India Meteorological Department and are issued through IMD, NDMA and your State Disaster Management Authority. This platform is decision support; it has no authority to issue or withdraw a warning, and it is not a substitute for one.', 'warn', 'warn')}
          </div>
        </div>
      </div>`;
    },
    mount() {}
  };

  /* ==================================================== EXPLAINABILITY === */
  const explain = {
    title: 'Why this risk',
    html() {
      const a = S.assessment;
      const key = S.hazardFilter || a.dominant.key;
      const h = a.hazards[key];
      const maxAbs = Math.max(...h.contribs.map(c => Math.abs(c.contribution)), 0.4);

      return `<div class="view">
        ${scenarioBanner()}
        <div class="view__head">
          <div><h2>Why is the system showing this risk?</h2>
          <p>Every score is opened up here: which indicators pushed it up, which held it down, and by how much.</p></div>
          <div class="spacer"></div>
          <div class="seg" data-seg="hazard">
            ${a.list.map(x => `<button data-hz="${x.key}" class="${x.key === key ? 'is-on' : ''}">${x.label}</button>`).join('')}
          </div>
        </div>

        <div class="dash-grid">
          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="panel">
              <div class="panel__head">${I.brain()}<h3>${U.esc(h.label)} — feature contributions</h3><div class="spacer"></div>
                <span class="hzcard__score ${h.band.cls}">${U.fmt(h.score, 0)}</span></div>
              <div class="panel__body">
                <div class="shap">
                  ${h.contribs.map(c => {
                    const w = Math.abs(c.contribution) / maxAbs * 48;
                    const pos = c.contribution >= 0;
                    return `<div class="shaprow">
                      <div class="nm"><b style="font-weight:500">${U.esc(c.short)}</b><small>${U.esc(c.value)}</small></div>
                      <div class="track"><div class="zero"></div>
                        <i style="${pos ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`};background:${pos ? 'var(--sev-high)' : 'var(--sev-low)'}"></i></div>
                      <span class="amt" style="color:${pos ? 'var(--sev-high)' : 'var(--sev-low)'}">${pos ? '+' : ''}${U.fmt(c.contribution, 2)}</span>
                    </div>`;
                  }).join('')}
                </div>
                <div style="display:flex;gap:1.2rem;margin-top:.8rem;font-size:.78rem;color:var(--ink-mute)">
                  <span><i style="display:inline-block;width:10px;height:10px;background:var(--sev-high);border-radius:2px"></i> raises the score</span>
                  <span><i style="display:inline-block;width:10px;height:10px;background:var(--sev-low);border-radius:2px"></i> lowers the score</span>
                </div>
              </div>
            </div>

            <div class="panel">
              <div class="panel__head"><h4>In plain language</h4></div>
              <div class="panel__body">
                <div class="plain">
                  <div style="font-family:var(--font-head);font-size:1.25rem" class="${h.band.cls}">
                    ${h.band.label.toUpperCase()} ${h.label.toUpperCase()} RISK</div>
                  <div style="font-size:.88rem;color:var(--ink-mute);margin-top:.2rem">Contributing indicators, strongest first</div>
                  <ul>
                    ${h.contribs.slice(0, 5).map(c => `<li class="${c.contribution >= 0 ? 'plus' : 'minus'}">
                      <b>${U.esc(c.short)}</b> — ${U.esc(c.note)} <span class="mono" style="color:var(--ink-mute)">(${U.esc(c.value)})</span></li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="panel">
              <div class="panel__head"><h4>What these numbers are</h4></div>
              <div class="panel__body" style="font-size:.89rem;color:var(--ink-soft)">
                <p>The demonstration model is an explicit weighted score: each indicator is normalised to 0–1, multiplied by a fixed weight, and summed through a logistic function. Because that form is transparent, the bars above are the model's real per-feature contributions, not a post-hoc guess.</p>
                <p style="margin-bottom:0">When the trained gradient-boosted model is plugged in, these bars are replaced by SHAP values from the inference service, computed with <span class="mono">TreeExplainer</span> over the same feature vector. A sequence model would instead surface temporal attention weights. The panel layout does not change; only the source of the numbers does.</p>
              </div>
            </div>

            ${note('<b>These are associations inside a model, not proven causes.</b> A feature importance tells you what the model leaned on for this one prediction. It does not establish that the indicator physically caused the weather. Two indicators that move together — moisture and rain rate, for example — will share credit in ways that can mislead if read as causation.', 'warn', 'warn')}

            <div class="panel">
              <div class="panel__head">${I.book()}<h4>Indicator reference</h4></div>
              <div class="panel__body" style="max-height:340px;overflow-y:auto">
                ${Object.values(GA.GLOSSARY).map(g => `<div style="margin-bottom:.8rem">
                  <b style="font-family:var(--font-head);font-size:1rem">${U.esc(g.term)}</b>
                  <span style="color:var(--ink-mute);font-size:.82rem"> — ${U.esc(g.full)}</span>
                  <p style="font-size:.86rem;color:var(--ink-soft);margin:.2rem 0 0">${U.esc(g.text)}</p>
                </div>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    },
    mount(root) {
      const seg = root.querySelector('[data-seg="hazard"]');
      if (seg) seg.addEventListener('click', e => {
        const b = e.target.closest('[data-hz]');
        if (!b) return;
        S.hazardFilter = b.dataset.hz;
        global.GAApp.render();
      });
    }
  };

  /* =========================================================== ABOUT ==== */
  const about = {
    title: 'Data, model and limits',
    html() {
      return `<div class="view">
        <div class="view__head"><div><h2>Data, model and limits</h2>
        <p>What this build actually does, what it does not do, and what changes when real feeds are connected.</p></div></div>

        <div class="grid g-2">
          <div class="panel"><div class="panel__head"><h4>What is real in this build</h4></div>
            <div class="panel__body" style="font-size:.9rem;color:var(--ink-soft)">
              <ul style="padding-left:1.1rem;margin:0">
                <li>Global place search through OpenStreetMap Nominatim, with an offline gazetteer fallback.</li>
                <li>Coordinate entry and map-click selection anywhere on Earth.</li>
                <li>A deterministic, physically-motivated field generator — same place and hour gives the same result, so demos are reproducible.</li>
                <li>A transparent scoring model whose feature contributions are genuinely the model's own.</li>
                <li>Route corridor generation and exposure scoring over that field.</li>
                <li>Citizen reporting with corroboration logic and local persistence.</li>
                <li>Browser-native speech recognition and synthesis where the platform provides them.</li>
              </ul>
            </div></div>

          <div class="panel"><div class="panel__head"><h4>What is not connected</h4></div>
            <div class="panel__body" style="font-size:.9rem;color:var(--ink-soft)">
              <ul style="padding-left:1.1rem;margin:0">
                <li>No live satellite, radar, rain-gauge or NWP ingest. Adapter interfaces exist; endpoints do not.</li>
                <li>No trained machine-learning model. The scorer is a hand-specified surrogate.</li>
                <li>No verified accuracy, skill score or lead-time claim, because no verification run has been done.</li>
                <li>No road-network routing engine. Corridors are geometric, not road-following.</li>
                <li>No Overpass/OSM infrastructure query. Asset counts are density-modelled.</li>
                <li>No server, account system or moderator console. Reports stay in your browser.</li>
              </ul>
            </div></div>
        </div>

        <div class="panel" style="margin-top:1rem"><div class="panel__head"><h4>Planned data sources</h4></div>
          <div class="panel__body tight">
            <table class="matrix"><thead><tr><th>Layer</th><th>Source</th><th>Cadence</th><th>Used for</th></tr></thead><tbody>
              <tr><td>Cloud-top temperature, water vapour</td><td>INSAT-3D / 3DR imager and sounder</td><td class="mono">15 min</td><td>Convective growth, CTT trend</td></tr>
              <tr><td>Reflectivity, radial velocity</td><td>IMD Doppler weather radar network</td><td class="mono">10 min</td><td>Cell tracking, rain rate</td></tr>
              <tr><td>Surface rainfall, temperature, wind</td><td>IMD AWS / ARG stations</td><td class="mono">15 min</td><td>Calibration and verification</td></tr>
              <tr><td>Satellite precipitation</td><td>GPM IMERG Early Run</td><td class="mono">30 min</td><td>Gap filling outside radar range</td></tr>
              <tr><td>CAPE, CIN, shear, IWV</td><td>GFS 0.25° with a WRF nest</td><td class="mono">6 h</td><td>Thermodynamic environment</td></tr>
              <tr><td>Elevation, slope, flow accumulation</td><td>SRTM 30 m / Cartosat DEM</td><td class="mono">static</td><td>Orographic lift, flood susceptibility</td></tr>
              <tr><td>Roads, buildings, facilities</td><td>OpenStreetMap via Overpass</td><td class="mono">weekly</td><td>Exposure and routing</td></tr>
              <tr><td>Population distribution</td><td>WorldPop 100 m</td><td class="mono">annual</td><td>People exposed</td></tr>
            </tbody></table>
          </div>
        </div>

        <div style="margin-top:1rem">
          ${note('<b>Built for Smart India Hackathon as a decision-support prototype.</b> It is not an operational warning system and carries no official authority. For warnings in India, follow the India Meteorological Department, the National Disaster Management Authority and your State Disaster Management Authority. Emergency number 112. NDMA helpline 1078.', 'warn', 'warn')}
        </div>
      </div>`;
    },
    mount() {}
  };

  /* ========================================================= 11. SIGN IN & REGISTER (FOR USERS) */
  const signin = {
    title: 'Sign In · Weather & Safety Network',
    html() {
      const personas = St.PERSONAS;
      return `
      <div class="signin-page">
        <div class="signin-glow"></div>
        <div class="signin-card">
          <div class="signin-brand">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 20a6 6 0 0 1 1.5-11.8A9 9 0 0 1 23 10.5 5.5 5.5 0 0 1 26 20"/>
              <path d="M16 17l-3 6h4l-2.5 6"/>
            </svg>
            <div>
              <h2>GLITCH ARCHITECTURE</h2>
              <small>Community Weather & Safety Network</small>
            </div>
          </div>

          <p class="signin-subtitle">
            Hyper-local nowcasting for thunderstorms, cloudbursts, and flash floods. Sign in to monitor your neighborhood and receive alerts.
          </p>

          <!-- Tab switchers: Sign In vs Create Account -->
          <div class="auth-tabs" role="tablist">
            <button class="auth-tab is-active" id="tabBtnSignIn" type="button" role="tab">Sign In</button>
            <button class="auth-tab" id="tabBtnSignUp" type="button" role="tab">Create Account</button>
          </div>

          <!-- 1. SIGN IN (LOG IN) FORM -->
          <div class="auth-form-view is-active" id="viewSignIn">
            <form class="signin-form" id="userLoginForm">
              <div class="form-group">
                <label for="loginIdentifier">Email address or Mobile number</label>
                <input type="text" id="loginIdentifier" class="form-input" placeholder="e.g. name@example.com or 9876543210" required autocomplete="username">
              </div>
              <div class="form-group">
                <label for="loginPassword">Password</label>
                <input type="password" id="loginPassword" class="form-input" placeholder="Enter your password" required autocomplete="current-password" value="••••••••">
              </div>
              <div class="form-row">
                <label class="form-checkbox">
                  <input type="checkbox" id="rememberMe" checked>
                  <span>Remember me</span>
                </label>
                <a class="form-link" id="forgotPassLink">Forgot password?</a>
              </div>
              <button type="submit" class="signin-btn-primary">
                ${I.shield ? I.shield() : ''} Sign In
              </button>
            </form>

            <div class="signin-section-divider">Or quick one-click demo login</div>

            <div class="persona-picker" id="personaPicker">
              ${personas.map(p => `
                <button class="persona-card" type="button" data-persona="${p.id}">
                  <div class="persona-card__avatar" style="background:${p.color}">${p.initials}</div>
                  <div class="persona-card__body">
                    <div class="persona-card__name">${U.esc(p.name)} <span class="badge" style="background:rgba(0,112,242,0.12);color:var(--sap-brand);font-size:.68rem;padding:1px 6px;border-radius:4px">Member</span></div>
                    <div class="persona-card__role">${U.esc(p.role)}</div>
                    <div class="persona-card__org">${U.esc(p.neighborhood || '')}</div>
                  </div>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- 2. CREATE ACCOUNT (SIGN UP) FORM -->
          <div class="auth-form-view" id="viewSignUp">
            <form class="signin-form" id="userRegisterForm">
              <div class="form-group">
                <label for="regName">Full Name</label>
                <input type="text" id="regName" class="form-input" placeholder="e.g. Maya Roy" required autocomplete="name">
              </div>
              <div class="form-group">
                <label for="regContact">Email address or Mobile number</label>
                <input type="text" id="regContact" class="form-input" placeholder="e.g. maya.roy@example.com" required autocomplete="email">
              </div>
              <div class="form-group">
                <label for="regNeighborhood">Home Locality / Neighborhood</label>
                <input type="text" id="regNeighborhood" class="form-input" placeholder="e.g. South Kolkata / Salt Lake / Dehradun" required>
              </div>
              <div class="form-group">
                <label for="regRole">Primary Interest</label>
                <select id="regRole" class="form-input">
                  <option value="Local Resident & Commuter">Local Resident & Commuter</option>
                  <option value="Community Volunteer">Community Volunteer & Reporter</option>
                  <option value="Delivery / Commercial Driver">Delivery / Transport Worker</option>
                  <option value="Student & Youth Volunteer">Student & Campus Resident</option>
                </select>
              </div>
              <div class="form-group">
                <label for="regPassword">Create Password</label>
                <input type="password" id="regPassword" class="form-input" placeholder="At least 6 characters" required autocomplete="new-password">
              </div>
              <button type="submit" class="signin-btn-primary">
                ${I.plus ? I.plus() : ''} Create Free User Account
              </button>
            </form>
          </div>

          <div class="signin-guest-link">
            <a id="continueGuestLink">Continue as Guest (No account needed) →</a>
          </div>
        </div>
      </div>`;
    },
    mount(root) {
      // Tab switching
      const tabSignIn = root.querySelector('#tabBtnSignIn');
      const tabSignUp = root.querySelector('#tabBtnSignUp');
      const viewSignIn = root.querySelector('#viewSignIn');
      const viewSignUp = root.querySelector('#viewSignUp');

      function switchTab(isSignIn) {
        if (tabSignIn && tabSignUp && viewSignIn && viewSignUp) {
          tabSignIn.classList.toggle('is-active', isSignIn);
          tabSignUp.classList.toggle('is-active', !isSignIn);
          viewSignIn.classList.toggle('is-active', isSignIn);
          viewSignUp.classList.toggle('is-active', !isSignIn);
        }
      }

      if (tabSignIn && tabSignUp) {
        tabSignIn.addEventListener('click', () => switchTab(true));
        tabSignUp.addEventListener('click', () => switchTab(false));
      }

      // Quick persona login
      const picker = root.querySelector('#personaPicker');
      if (picker) {
        picker.querySelectorAll('[data-persona]').forEach(btn => {
          btn.addEventListener('click', () => {
            const pid = btn.dataset.persona;
            const p = St.PERSONAS.find(x => x.id === pid);
            if (p) {
              St.setUser({
                id: p.id,
                name: p.name,
                email: p.email,
                role: p.role,
                neighborhood: p.neighborhood,
                initials: p.initials,
                color: p.color
              });
              GAApp.toast(`Welcome back, ${p.name}! Signed in to your local weather feed.`);
              location.hash = '#/dashboard';
            }
          });
        });
      }

      // Log in form submission
      const loginForm = root.querySelector('#userLoginForm');
      if (loginForm) {
        loginForm.addEventListener('submit', async e => {
          e.preventDefault();
          const identifier = root.querySelector('#loginIdentifier').value.trim();
          const password = root.querySelector('#loginPassword').value;
          if (!identifier || !password) return;
          try {
            const response = await fetch('/api/auth/login', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contact: identifier, password })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Sign in failed');
            const initials = result.user.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
            St.setUser({ ...result.user, initials, color: '#0070F2' });
            GAApp.toast(`Welcome back, ${result.user.name}!`);
            location.hash = '#/dashboard';
          } catch (error) {
            GAApp.toast(error.message || 'Sign in failed.');
          }
        });
      }

      // Register form submission
      const regForm = root.querySelector('#userRegisterForm');
      if (regForm) {
        regForm.addEventListener('submit', async e => {
          e.preventDefault();
          const name = root.querySelector('#regName').value.trim();
          const contact = root.querySelector('#regContact').value.trim();
          const neighborhood = root.querySelector('#regNeighborhood').value.trim() || 'Local Ward';
          const role = root.querySelector('#regRole').value;
          const password = root.querySelector('#regPassword').value;
          if (!name || !contact || password.length < 8) {
            GAApp.toast('Use a contact and a password with at least 8 characters.');
            return;
          }
          try {
            const response = await fetch('/api/auth/register', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, contact, neighborhood, role, password })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Account creation failed');
            const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'US';
            St.setUser({ ...result.user, initials, color: '#107E3E' });
            GAApp.toast(`Account created! Welcome to the safety network, ${name}.`);
            location.hash = '#/dashboard';
          } catch (error) {
            GAApp.toast(error.message || 'Account creation failed.');
          }
        });
      }

      const forgotLink = root.querySelector('#forgotPassLink');
      if (forgotLink) {
        forgotLink.addEventListener('click', () => {
          GAApp.toast('Contact the administrator to recover your account. Passwords are never shown.');
        });
      }

      const guestLink = root.querySelector('#continueGuestLink');
      if (guestLink) {
        guestLink.addEventListener('click', () => {
          St.setUser({
            id: 'guest',
            name: 'Guest Explorer',
            email: 'guest@weather.local',
            role: 'Guest Observer',
            neighborhood: 'Public Access',
            initials: 'GE',
            color: '#64748B'
          });
          GAApp.toast('Browsing as Guest Explorer.');
          location.hash = '#/dashboard';
        });
      }
    }
  };

  global.GAViews = { dashboard, riskmap, prediction, impact, routes, whatif, reports, alerts, explain, about, signin, killMaps, rethemeMaps, LAYER_DEFS };
})(window);
