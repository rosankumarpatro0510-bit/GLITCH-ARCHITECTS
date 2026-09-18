/* ==========================================================================
   GLITCH ARCHITECTURE — map abstraction
   --------------------------------------------------------------------------
   Two interchangeable backends behind one API:
     1. Leaflet + OSM raster tiles, when the CDN and network are reachable.
     2. A built-in canvas "grid view" that works with no network at all, so a
        hackathon demo does not die on venue wifi. It draws a graticule, the
        gazetteer, risk cells, markers and routes — but no basemap imagery,
        and it says so on screen rather than pretending.
   ========================================================================== */

(function (global) {
  'use strict';
  const U = global.GA.U;

  const HAS_LEAFLET = () => typeof global.L !== 'undefined' && global.L.map;

  /* =================================================== Leaflet backend === */
  function leafletBackend(el, opts) {
    const map = L.map(el, {
      center: [opts.lat, opts.lon],
      zoom: opts.zoom || 9,
      zoomControl: true,
      worldCopyJump: true,
      attributionControl: true
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd', maxZoom: 19
    }).addTo(map);

    const groups = {};
    const ensure = k => (groups[k] = groups[k] || L.layerGroup().addTo(map));

    return {
      kind: 'leaflet',
      raw: map,
      setView(lat, lon, z) { map.setView([lat, lon], z || map.getZoom()); },
      getCenter() { const c = map.getCenter(); return { lat: c.lat, lon: c.lng }; },
      getZoom() { return map.getZoom(); },
      clear(k) { if (groups[k]) groups[k].clearLayers(); },
      clearAll() { Object.keys(groups).forEach(k => groups[k].clearLayers()); },
      setVisible(k, on) {
        const g = ensure(k);
        if (on) { if (!map.hasLayer(g)) map.addLayer(g); }
        else if (map.hasLayer(g)) map.removeLayer(g);
      },
      cells(k, cells, sizeKm, opacity) {
        const g = ensure(k);
        const half = sizeKm / 2;
        cells.forEach(c => {
          if (c.score < 18) return;
          const dLat = half / 111, dLon = half / (111 * Math.cos(c.lat * Math.PI / 180) || 1);
          L.rectangle([[c.lat - dLat, c.lon - dLon], [c.lat + dLat, c.lon + dLon]], {
            stroke: false, fillColor: c.band.colour,
            fillOpacity: (opacity || 0.45) * U.clamp(c.score / 100 + 0.18, 0.2, 1)
          }).addTo(g);
        });
      },
      circle(k, lat, lon, radiusKm, style) {
        L.circle([lat, lon], {
          radius: radiusKm * 1000,
          color: style.colour, weight: style.weight || 1.4,
          fillColor: style.colour, fillOpacity: style.fill || 0.06,
          dashArray: style.dash || null
        }).addTo(ensure(k));
      },
      marker(k, lat, lon, o) {
        const html = `<div style="width:${o.size || 14}px;height:${o.size || 14}px;border-radius:${o.square ? '3px' : '50%'};background:${o.colour};border:2px solid ${o.ring || '#101A23'};box-shadow:0 0 0 1px ${o.colour}77"></div>`;
        const m = L.marker([lat, lon], {
          icon: L.divIcon({ html, className: 'ga-pin', iconSize: [o.size || 14, o.size || 14] })
        }).addTo(ensure(k));
        if (o.popup) m.bindPopup(o.popup);
        return m;
      },
      line(k, pts, style) {
        L.polyline(pts.map(p => [p.lat, p.lon]), {
          color: style.colour, weight: style.weight || 4,
          opacity: style.opacity || 0.9, dashArray: style.dash || null
        }).addTo(ensure(k));
      },
      fit(pts, pad) {
        if (!pts.length) return;
        map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])), { padding: [pad || 40, pad || 40] });
      },
      onClick(fn) { map.on('click', e => fn(e.latlng.lat, e.latlng.lng)); },
      onMove(fn) { map.on('moveend', () => fn()); },
      invalidate() { setTimeout(() => map.invalidateSize(), 60); },
      destroy() { map.remove(); }
    };
  }

  /* ==================================================== canvas backend === */
  function canvasBackend(el, opts) {
    el.innerHTML = '';
    const cv = document.createElement('canvas');
    cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block'; cv.style.cursor = 'grab';
    el.appendChild(cv);
    const tag = document.createElement('div');
    tag.className = 'map-hud';
    tag.style.left = '.7rem'; tag.style.right = 'auto';
    tag.textContent = 'grid view · no basemap';
    el.appendChild(tag);

    const ctx = cv.getContext('2d');
    let view = { lat: opts.lat, lon: opts.lon, zoom: opts.zoom || 9 };
    const layers = {};   // key -> { on:bool, items:[] }
    let clickFn = null, moveFn = null;
    let W = 0, H = 0, dpr = Math.min(2, global.devicePixelRatio || 1);

    function scale() { return 256 * Math.pow(2, view.zoom) / 360; } // px per degree lon
    function project(lat, lon) {
      const s = scale();
      const k = Math.cos(view.lat * Math.PI / 180) || 0.2;
      return { x: W / 2 + (lon - view.lon) * s * k, y: H / 2 - (lat - view.lat) * s };
    }
    function unproject(x, y) {
      const s = scale();
      const k = Math.cos(view.lat * Math.PI / 180) || 0.2;
      return { lat: view.lat - (y - H / 2) / s, lon: view.lon + (x - W / 2) / (s * k) };
    }
    const ensure = k => (layers[k] = layers[k] || { on: true, items: [] });

    function resize() {
      const r = el.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function drawGraticule() {
      const stepChoices = [30, 10, 5, 2, 1, .5, .2, .1, .05, .02];
      const step = stepChoices[U.clamp(Math.floor(view.zoom / 2), 0, stepChoices.length - 1)];
      ctx.lineWidth = 1;
      ctx.font = '10px "IBM Plex Mono", monospace';
      const tl = unproject(0, 0), br = unproject(W, H);
      ctx.strokeStyle = 'rgba(79,195,217,.10)';
      ctx.fillStyle = 'rgba(126,149,165,.75)';
      for (let lon = Math.ceil(tl.lon / step) * step; lon < br.lon; lon += step) {
        const p = project(0, lon);
        ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, H); ctx.stroke();
        ctx.fillText(lon.toFixed(step < 1 ? 2 : 0) + '°', p.x + 3, H - 6);
      }
      for (let lat = Math.floor(br.lat / step) * step; lat < tl.lat; lat += step) {
        const p = project(lat, 0);
        ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(W, p.y); ctx.stroke();
        ctx.fillText(lat.toFixed(step < 1 ? 2 : 0) + '°', 5, p.y - 4);
      }
    }

    function drawTerrainShade() {
      // cheap relief shading from the same terrain proxy the model uses
      const step = 14;
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          const g = unproject(x + step / 2, y + step / 2);
          const t = global.GA.terrainAt(g.lat, g.lon);
          const v = U.clamp(t.elevation / 4200, 0, 1);
          ctx.fillStyle = `rgba(${40 + v * 70},${58 + v * 62},${72 + v * 52},.55)`;
          ctx.fillRect(x, y, step, step);
        }
      }
    }

    function drawGazetteer() {
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      global.GA.GAZETTEER.forEach(g => {
        const p = project(g.lat, g.lon);
        if (p.x < -40 || p.x > W + 40 || p.y < -20 || p.y > H + 20) return;
        ctx.fillStyle = 'rgba(180,198,210,.55)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 7); ctx.fill();
        if (view.zoom > 5) { ctx.fillStyle = 'rgba(180,198,210,.7)'; ctx.fillText(g.name, p.x + 5, p.y + 3); }
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#101A23'; ctx.fillRect(0, 0, W, H);
      drawTerrainShade();
      drawGraticule();
      drawGazetteer();

      Object.keys(layers).forEach(k => {
        const L2 = layers[k];
        if (!L2.on) return;
        L2.items.forEach(it => {
          if (it.t === 'cell') {
            const a = project(it.lat + it.dLat, it.lon - it.dLon);
            const b = project(it.lat - it.dLat, it.lon + it.dLon);
            ctx.globalAlpha = it.alpha; ctx.fillStyle = it.colour;
            ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
            ctx.globalAlpha = 1;
          } else if (it.t === 'circle') {
            const c = project(it.lat, it.lon);
            const edge = project(it.lat, it.lon + it.radiusKm / (111 * Math.cos(it.lat * Math.PI / 180) || 1));
            const r = Math.abs(edge.x - c.x);
            ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 7);
            ctx.fillStyle = it.colour; ctx.globalAlpha = it.fill; ctx.fill(); ctx.globalAlpha = 1;
            ctx.strokeStyle = it.colour; ctx.lineWidth = it.weight;
            if (it.dash) ctx.setLineDash([5, 4]);
            ctx.stroke(); ctx.setLineDash([]);
          } else if (it.t === 'marker') {
            const p = project(it.lat, it.lon);
            ctx.beginPath(); ctx.arc(p.x, p.y, (it.size || 12) / 2, 0, 7);
            ctx.fillStyle = it.colour; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = '#101A23'; ctx.stroke();
          } else if (it.t === 'line') {
            ctx.beginPath();
            it.pts.forEach((p, i) => { const q = project(p.lat, p.lon); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
            ctx.strokeStyle = it.colour; ctx.lineWidth = it.weight; ctx.globalAlpha = it.opacity;
            if (it.dash) ctx.setLineDash([8, 6]);
            ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
          }
        });
      });
    }

    /* interaction */
    let drag = null;
    cv.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY, lat: view.lat, lon: view.lon, moved: false };
      cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      const s = scale(), k = Math.cos(view.lat * Math.PI / 180) || 0.2;
      view.lon = drag.lon - dx / (s * k);
      view.lat = U.clamp(drag.lat + dy / s, -84, 84);
      draw();
    });
    cv.addEventListener('pointerup', e => {
      const wasDrag = drag && drag.moved;
      drag = null; cv.style.cursor = 'grab';
      if (wasDrag && moveFn) moveFn();
      if (!wasDrag && clickFn) {
        const r = cv.getBoundingClientRect();
        const g = unproject(e.clientX - r.left, e.clientY - r.top);
        clickFn(U.round(g.lat, 5), U.round(g.lon, 5));
      }
    });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      view.zoom = U.clamp(view.zoom + (e.deltaY < 0 ? 0.45 : -0.45), 1.6, 15);
      draw(); if (moveFn) moveFn();
    }, { passive: false });

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    return {
      kind: 'canvas',
      raw: null,
      setView(lat, lon, z) { view.lat = lat; view.lon = lon; if (z) view.zoom = z; draw(); },
      getCenter() { return { lat: view.lat, lon: view.lon }; },
      getZoom() { return Math.round(view.zoom); },
      clear(k) { ensure(k).items = []; draw(); },
      clearAll() { Object.keys(layers).forEach(k => layers[k].items = []); draw(); },
      setVisible(k, on) { ensure(k).on = on; draw(); },
      cells(k, cells, sizeKm, opacity) {
        const g = ensure(k), half = sizeKm / 2;
        cells.forEach(c => {
          if (c.score < 18) return;
          g.items.push({
            t: 'cell', lat: c.lat, lon: c.lon,
            dLat: half / 111, dLon: half / (111 * Math.cos(c.lat * Math.PI / 180) || 1),
            colour: c.band.colour, alpha: (opacity || 0.45) * U.clamp(c.score / 100 + 0.18, 0.2, 1)
          });
        });
        draw();
      },
      circle(k, lat, lon, radiusKm, style) {
        ensure(k).items.push({ t: 'circle', lat, lon, radiusKm, colour: style.colour, weight: style.weight || 1.4, fill: style.fill || 0.06, dash: !!style.dash });
        draw();
      },
      marker(k, lat, lon, o) {
        ensure(k).items.push({ t: 'marker', lat, lon, colour: o.colour, size: o.size || 14 });
        draw(); return null;
      },
      line(k, pts, style) {
        ensure(k).items.push({ t: 'line', pts, colour: style.colour, weight: style.weight || 4, opacity: style.opacity || 0.9, dash: !!style.dash });
        draw();
      },
      fit(pts) {
        if (!pts.length) return;
        const lats = pts.map(p => p.lat), lons = pts.map(p => p.lon);
        const la = (Math.min(...lats) + Math.max(...lats)) / 2;
        const lo = (Math.min(...lons) + Math.max(...lons)) / 2;
        const span = Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lons) - Math.min(...lons)) * 0.6, 0.02);
        view.lat = la; view.lon = lo;
        view.zoom = U.clamp(Math.log2(180 / span) + 0.2, 1.6, 14);
        draw();
      },
      onClick(fn) { clickFn = fn; },
      onMove(fn) { moveFn = fn; },
      invalidate() { resize(); },
      destroy() { ro.disconnect(); el.innerHTML = ''; }
    };
  }

  /* ========================================================= public API === */
  global.GAMap = {
    available: HAS_LEAFLET,
    create(el, opts) {
      opts = opts || { lat: 20, lon: 80, zoom: 5 };
      try {
        if (HAS_LEAFLET()) return leafletBackend(el, opts);
      } catch (e) { /* fall through */ }
      return canvasBackend(el, opts);
    }
  };
})(window);
