/* ==========================================================================
   GLITCH ARCHITECTURE — application shell
   ========================================================================== */

(function (global) {
  'use strict';
  const GA = global.GA, U = GA.U, St = global.GAState, S = St.S, I = St.I, V = global.GAViews, A = global.GAAssistant;

  const ROUTES = [
    { hash: '#/dashboard', key: 'dashboard', label: 'Situation overview', icon: 'gauge', group: 'Monitor' },
    { hash: '#/map', key: 'riskmap', label: 'Risk map', icon: 'map', group: 'Monitor' },
    { hash: '#/prediction', key: 'prediction', label: 'Prediction', icon: 'clock', group: 'Monitor' },
    { hash: '#/explain', key: 'explain', label: 'Why this risk', icon: 'brain', group: 'Monitor' },
    { hash: '#/impact', key: 'impact', label: 'Impact analysis', icon: 'impact', group: 'Respond' },
    { hash: '#/routes', key: 'routes', label: 'Safe routes', icon: 'route', group: 'Respond' },
    { hash: '#/alerts', key: 'alerts', label: 'Alert centre', icon: 'siren', group: 'Respond', badge: () => S.alerts.length },
    { hash: '#/whatif', key: 'whatif', label: 'What-if simulator', icon: 'flask', group: 'Plan' },
    { hash: '#/reports', key: 'reports', label: 'Citizen reports', icon: 'people', group: 'Plan', badge: () => S.reports.filter(r => r.status === 'review').length },
    { hash: '#/about', key: 'about', label: 'Data & limits', icon: 'info', group: 'Plan' },
    { hash: '#/signin', key: 'signin', label: 'Sign in portal', icon: 'shield', group: null }
  ];

  function getGreeting() {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /* ------------------------------------------------------------- shell */
  function shell() {
    const groups = [...new Set(ROUTES.filter(r => r.group).map(r => r.group))];
    return `
    <aside class="rail" id="rail">
      <a class="rail__brand" href="index.html">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M4 20a6 6 0 0 1 1.5-11.8A9 9 0 0 1 23 10.5 5.5 5.5 0 0 1 26 20"/>
          <path d="M16 17l-3 6h4l-2.5 6"/>
        </svg>
        <span><b>Glitch Architecture</b><small>SAP Severe Weather</small></span>
      </a>
      <nav class="rail__nav">
        ${groups.map(g => `<div class="rail__group">${g}</div>
          ${ROUTES.filter(r => r.group === g).map(r => {
            const n = r.badge ? r.badge() : 0;
            return `<a class="navlink" href="${r.hash}" data-key="${r.key}">${I[r.icon] ? I[r.icon]() : ''}<span>${U.esc(r.label)}</span>
              ${n ? `<span class="badge">${n}</span>` : ''}</a>`;
          }).join('')}`).join('')}
      </nav>
      <div class="rail__foot">
        <span>Demonstration build<br><small style="opacity:.75">Model data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)</small></span>
        <a href="#/signin" style="color:var(--sap-brand);font-size:.72rem;font-weight:600">Access Portal</a>
      </div>
    </aside>

    <header class="strip">
      <button class="iconbtn rail-toggle" id="railToggle" aria-label="Show navigation">${I.menu()}</button>
      <div class="searchbox">
        <span class="icon">${I.search()}</span>
        <input type="text" id="q" placeholder="Search any place, or paste 22.5726, 88.3639" autocomplete="off" aria-label="Search for a location">
        <div class="suggests" id="suggests" role="listbox"></div>
      </div>
      <div class="strip__loc"><b id="stripName">${U.esc(S.location.name)}</b><span id="stripCoord">${U.dms(S.location.lat, S.location.lon)}</span></div>
      <div class="strip__spacer"></div>
      <div class="strip__meta" id="stripMeta"></div>

      <!-- Theme Switcher on Navbar -->
      <button class="theme-toggle-btn" id="themeToggleBtn" title="Switch SAP Theme (Morning / Evening Horizon)">
        <span id="themeToggleIcon">${S.theme === 'morning' ? (I.sun ? I.sun() : '☀️') : (I.moon ? I.moon() : '🌙')}</span>
        <span id="themeToggleLabel">${S.theme === 'morning' ? 'Morning Horizon' : 'Evening Horizon'}</span>
      </button>

      <button class="iconbtn" id="voiceBtn" title="Voice assistant" aria-label="Voice assistant">${I.mic()}</button>
      <button class="iconbtn" id="chatBtn" title="Assistant" aria-label="Open assistant">${I.chat()}</button>

      <!-- Personalized User Welcome & Avatar -->
      <div class="user-chip-wrap" style="position:relative">
        <button class="user-chip" id="userChipBtn" aria-label="User profile and switch menu">
          <span class="user-avatar" id="userAvatarBadge" style="background:${S.user ? (S.user.color || 'var(--sap-brand)') : 'var(--slate-600)'}">
            ${S.user ? U.esc(S.user.initials || 'U') : (I.user ? I.user() : 'U')}
          </span>
          <span class="user-chip__greeting" id="userGreeting">${getGreeting()},</span>
          <span class="user-chip__name" id="userNameLabel">${S.user ? U.esc(S.user.name.split(' ')[0]) : 'Sign in'}</span>
        </button>
        <div class="user-popover" id="userPopover"></div>
      </div>
    </header>

    <main class="main" id="main"></main>

    <div class="fab" id="fab"><button id="fabChat" aria-label="Open assistant">${I.chat()}</button></div>

    <section class="dock" id="dock" aria-label="Assistant">
      <div class="dock__head">${I.chat()}<b>Assistant</b><div class="spacer"></div>
        <select id="langSel" style="background:var(--slate-900);border:1px solid var(--line);border-radius:4px;color:var(--ink);font-size:.8rem;padding:.2rem .3rem">
          ${A.LANGS.map(l => `<option value="${l.code}" ${S.lang === l.code ? 'selected' : ''}>${l.native}</option>`).join('')}
        </select>
        <button class="iconbtn" id="dockClose" aria-label="Close assistant" style="width:28px;height:28px">${I.x()}</button>
      </div>
      <div class="dock__ctx" id="dockCtx"></div>
      <div class="dock__log" id="dockLog"></div>
      <div class="voice-state" id="voiceState" style="display:none">
        <span class="lvl"><i></i><i></i><i></i><i></i></span><span id="voiceMsg">Listening…</span>
      </div>
      <div class="dock__foot">
        <div class="chipset" style="margin-bottom:.5rem">
          <button data-ask="What is the risk near me?">Risk near me</button>
          <button data-ask="Why is the risk high?">Why</button>
          <button data-ask="What should I do during a severe thunderstorm?">What to do</button>
          <button data-ask="What does CAPE mean?">CAPE</button>
        </div>
        <div class="dock__row">
          <input type="text" id="dockInput" placeholder="Ask about this location…" aria-label="Ask the assistant">
          <button class="iconbtn" id="dockMic" title="Speak" aria-label="Speak your question">${I.mic()}</button>
          <button class="iconbtn" id="dockSend" aria-label="Send">${I.send()}</button>
        </div>
      </div>
    </section>

    <div class="toasts" id="toasts"></div>`;
  }

  /* ------------------------------------------------------------ routing */
  function currentRoute() {
    const h = location.hash || (S.user ? '#/dashboard' : '#/signin');
    return ROUTES.find(r => r.hash === h) || ROUTES[0];
  }

  function render() {
    const r = currentRoute();
    const view = V[r.key] || V.dashboard;
    V.killMaps();
    const main = document.getElementById('main');
    main.innerHTML = view.html();
    main.scrollTop = 0;
    try { view.mount(main); } catch (e) { console.error('mount failed', e); }

    document.querySelectorAll('.navlink').forEach(a => a.classList.toggle('is-on', a.dataset.key === r.key));
    const stripName = document.getElementById('stripName');
    if (stripName) stripName.textContent = S.location.name;
    const stripCoord = document.getElementById('stripCoord');
    if (stripCoord) stripCoord.textContent = U.dms(S.location.lat, S.location.lon);
    const stripMeta = document.getElementById('stripMeta');
    if (stripMeta && S.assessment) {
      stripMeta.innerHTML =
        `<span>overall <b class="${S.assessment.overallBand.cls}">${U.fmt(S.assessment.overall, 0)}</b></span>
         <span>conf <b>${S.assessment.confidence}%</b></span>
         <span>updated <b>${U.timeHHMM(new Date(S.lastUpdate))}</b></span>`;
    }
    refreshBadges();
    updateCtx();
    updateUserBar();
    document.title = (view.title || 'Console') + ' · Glitch Architecture';
    document.body.classList.remove('rail-open');

    main.addEventListener('click', e => {
      if (e.target.closest('[data-act="exit-sim"]')) { St.setScenario(null); render(); }
    });
  }

  function refreshBadges() {
    ROUTES.forEach(r => {
      if (!r.badge) return;
      const link = document.querySelector(`.navlink[data-key="${r.key}"]`);
      if (!link) return;
      const n = r.badge();
      let b = link.querySelector('.badge');
      if (n) { if (!b) { b = document.createElement('span'); b.className = 'badge'; link.appendChild(b); } b.textContent = n; }
      else if (b) b.remove();
    });
  }

  /* ------------------------------------------------------------- search */
  function initSearch() {
    const input = document.getElementById('q');
    const box = document.getElementById('suggests');
    let timer = null, seq = 0;

    function close() { box.classList.remove('is-open'); box.innerHTML = ''; }

    function show(results, online, q) {
      if (!results.length) {
        box.innerHTML = `<div class="note">No match for “${U.esc(q)}”. Try a different spelling, or paste coordinates like <span class="mono">22.5726, 88.3639</span>.</div>`;
        box.classList.add('is-open');
        return;
      }
      box.innerHTML = results.map((p, i) =>
        `<button data-i="${i}" role="option"><b>${U.esc(p.name)}</b><small>${U.esc(p.region || '')} · ${U.dms(p.lat, p.lon)}</small></button>`
      ).join('') + (online ? '' : `<div class="note">Offline: showing the built-in gazetteer and coordinate parsing only.</div>`);
      box.classList.add('is-open');
      box.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
        pick(results[parseInt(b.dataset.i, 10)]);
        input.value = '';
        close();
      }));
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(timer);
      if (q.length < 2) { close(); return; }
      const coord = GA.parseCoords(q);
      if (coord) { show([coord], true, q); return; }
      show(GA.localSearch(q), true, q);   // instant local results
      const my = ++seq;
      timer = setTimeout(async () => {
        const res = await GA.geocode(q);
        if (my !== seq || input.value.trim() !== q) return;
        show(res.results, res.online, q);
      }, 360);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); input.blur(); }
      if (e.key === 'Enter') {
        const first = box.querySelector('[data-i]');
        if (first) first.click();
      }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.searchbox')) close(); });
  }

  // Prefetch live model fields for a point. The engine keeps answering from the
  // synthetic field immediately; when real data lands we recompute and redraw once.
  function refreshLive(lat, lon) {
    if (!GA.live) return;
    GA.live.ensure(lat, lon).then(changed => {
      if (changed) { St.recompute(); render(); toast('Live model fields loaded (Open-Meteo).'); }
      else if (!GA.live.hasData(lat, lon) && GA.live.status().error) toast('Live model data unavailable. Showing the synthetic engine.', 'warn');
    });
  }

  function pick(p) {
    St.setLocation(p);
    refreshLive(p.lat, p.lon);
    S.routes = null; S.routeQuery = null;
    toast(`Assessment point moved to ${p.name}. All modules updated.`);
    render();
  }

  async function pickPoint(lat, lon) {
    toast('Resolving that point…');
    const p = await GA.reverse(lat, lon);
    pick(p);
  }

  /* -------------------------------------------------------------- toast */
  let toastN = 0;
  function toast(msg, kind) {
    const wrap = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.textContent = msg;
    wrap.appendChild(el);
    const id = ++toastN;
    setTimeout(() => { el.remove(); }, 3400 + (id % 3) * 200);
  }

  /* --------------------------------------------------------- assistant */
  function updateCtx() {
    const el = document.getElementById('dockCtx');
    if (!el) return;
    const a = S.assessment;
    el.innerHTML = `Context: <b style="color:var(--ink-soft)">${U.esc(S.location.name)}</b> ·
      overall <b class="${a.overallBand.cls}">${U.fmt(a.overall, 0)}</b> ·
      ${S.horizon} h window${S.scenario ? ' · <span style="color:var(--hz-storm)">simulation active</span>' : ''}`;
  }

  function log(role, html) {
    const el = document.getElementById('dockLog');
    const d = document.createElement('div');
    d.className = 'msg msg--' + role;
    d.innerHTML = html;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
    return d;
  }

  function ask(q, spoken) {
    if (!q.trim()) return;
    log('you', U.esc(q));
    const html = A.answer(q);
    log('bot', html);
    if (spoken) {
      const r = A.speak(A.speakable(html));
      if (r.fellBack) log('bot', `<span class="src">No ${U.esc(A.langMeta().name)} voice is installed on this device, so that was read in English. The text answer stays in the selected language where a pack exists.</span>`);
      else if (!r.ok) log('bot', `<span class="src">This browser has no speech synthesis available, so nothing was read aloud.</span>`);
    }
  }

  function initAssistant() {
    const dock = document.getElementById('dock');
    const input = document.getElementById('dockInput');
    const open = () => {
      dock.classList.add('is-open');
      document.getElementById('fab').style.display = 'none';
      if (!document.getElementById('dockLog').children.length) {
        log('bot', `${U.esc(A.t('greeting'))}<span class="src">I answer only from this dashboard, a fixed glossary and stored preparedness guidance. I will not invent live weather.</span>`);
      }
      updateCtx();
      input.focus();
    };
    const close = () => { dock.classList.remove('is-open'); document.getElementById('fab').style.display = 'flex'; A.stopListening(); };

    document.getElementById('chatBtn').addEventListener('click', () => dock.classList.contains('is-open') ? close() : open());
    document.getElementById('fabChat').addEventListener('click', open);
    document.getElementById('dockClose').addEventListener('click', close);
    document.getElementById('dockSend').addEventListener('click', () => { ask(input.value); input.value = ''; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { ask(input.value); input.value = ''; } });
    dock.addEventListener('click', e => {
      const b = e.target.closest('[data-ask]');
      if (b) ask(b.dataset.ask);
    });
    document.getElementById('langSel').addEventListener('change', e => {
      St.setLang(e.target.value);
      const m = A.langMeta();
      const sup = A.voiceSupport(m.code);
      log('bot', `Language set to ${U.esc(m.native)}. ` +
        (m.coverage === 'full'
          ? 'Full answer pack available.'
          : 'Only core safety phrases exist in this language; longer answers fall back to English rather than being machine-mangled.') +
        `<span class="src">On this device: speech recognition ${sup.asr ? 'available' : 'not available'}, ${U.esc(m.name)} voice ${sup.tts ? 'installed' : 'not installed'}.</span>`);
    });

    /* voice */
    const vs = document.getElementById('voiceState');
    const vm = document.getElementById('voiceMsg');
    function setVoice(state, detail) {
      if (state === 'listening') { vs.style.display = 'flex'; vs.classList.add('is-live'); vm.textContent = `Listening in ${A.langMeta().native}…`; }
      else if (state === 'idle') { vs.classList.remove('is-live'); setTimeout(() => vs.style.display = 'none', 400); }
      else if (state === 'unsupported') { vs.style.display = 'flex'; vs.classList.remove('is-live'); vm.textContent = 'This browser has no speech recognition. Type your question instead.'; }
      else { vs.style.display = 'flex'; vs.classList.remove('is-live'); vm.textContent = 'Speech input stopped: ' + (detail || 'unknown reason') + '. Typing still works.'; }
      document.getElementById('dockMic').classList.toggle('is-on', state === 'listening');
      document.getElementById('voiceBtn').classList.toggle('is-on', state === 'listening');
    }
    const mic = () => {
      if (A.isListening()) { A.stopListening(); return; }
      open();
      A.startListening(txt => ask(txt, true), setVoice);
    };
    document.getElementById('dockMic').addEventListener('click', mic);
    document.getElementById('voiceBtn').addEventListener('click', mic);

    // voice list loads asynchronously in most browsers
    if (global.speechSynthesis) global.speechSynthesis.onvoiceschanged = () => {};
  }

  /* -------------------------------------------------------- user & theme */
  function renderUserPopover() {
    const pop = document.getElementById('userPopover');
    if (!pop) return;
    if (S.user) {
      pop.innerHTML = `
        <div class="user-popover__header">
          <div class="user-popover__avatar" style="background:${S.user.color || 'var(--sap-brand)'}">
            ${U.esc(S.user.initials || 'U')}
          </div>
          <div class="user-popover__info">
            <b>${U.esc(S.user.name)}</b>
            <small>${U.esc(S.user.email || '')}</small>
            <span class="user-popover__role">${U.esc(S.user.role || 'Community Member')}${S.user.neighborhood ? ' · ' + U.esc(S.user.neighborhood) : ''}</span>
          </div>
        </div>
        <div class="user-popover__section-title">Quick Switch User Profile</div>
        <div class="user-popover__personas">
          ${St.PERSONAS.map(p => `
            <button class="persona-quick-btn ${S.user.id === p.id ? 'is-active' : ''}" data-switch-user="${p.id}">
              <span class="dot" style="background:${p.color}"></span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(p.name)}</span>
              <small style="font-size:.68rem;color:var(--ink-mute)">${U.esc(p.neighborhood ? p.neighborhood.split(',')[0] : p.role)}</small>
            </button>
          `).join('')}
        </div>
        <div class="user-popover__actions">
          <a class="btn btn--ghost" href="#/signin" style="font-size:.76rem;padding:.3rem .6rem">Switch account</a>
          <button class="logout-btn" id="popoverLogoutBtn">
            ${I.logOut ? I.logOut() : ''} Sign out
          </button>
        </div>
      `;
    } else {
      pop.innerHTML = `
        <div class="user-popover__header">
          <div class="user-popover__avatar" style="background:var(--slate-600)">?</div>
          <div class="user-popover__info">
            <b>Guest Session</b>
            <small>Not signed in</small>
          </div>
        </div>
        <div class="user-popover__section-title">Quick Demo Login</div>
        <div class="user-popover__personas">
          ${St.PERSONAS.map(p => `
            <button class="persona-quick-btn" data-switch-user="${p.id}">
              <span class="dot" style="background:${p.color}"></span>
              <span style="flex:1">${U.esc(p.name)}</span>
            </button>
          `).join('')}
        </div>
        <div class="user-popover__actions" style="justify-content:flex-end">
          <a class="btn btn--solid" href="#/signin" style="font-size:.78rem;padding:.35rem .75rem" id="popoverSignInBtn">
            Sign In Portal →
          </a>
        </div>
      `;
    }
  }

  function updateUserBar() {
    const avatar = document.getElementById('userAvatarBadge');
    const greeting = document.getElementById('userGreeting');
    const nameLabel = document.getElementById('userNameLabel');
    if (greeting) greeting.textContent = getGreeting() + ',';
    if (S.user) {
      if (avatar) {
        avatar.style.background = S.user.color || 'var(--sap-brand)';
        avatar.textContent = S.user.initials || 'U';
      }
      if (nameLabel) nameLabel.textContent = S.user.name;
    } else {
      if (avatar) {
        avatar.style.background = 'var(--slate-600)';
        avatar.innerHTML = I.user ? I.user() : 'U';
      }
      if (nameLabel) nameLabel.textContent = 'Sign in';
    }
    const themeIcon = document.getElementById('themeToggleIcon');
    const themeLabel = document.getElementById('themeToggleLabel');
    if (themeIcon) themeIcon.innerHTML = S.theme === 'morning' ? (I.sun ? I.sun() : '☀️') : (I.moon ? I.moon() : '🌙');
    if (themeLabel) themeLabel.textContent = S.theme === 'morning' ? 'Morning Horizon' : 'Evening Horizon';
    renderUserPopover();
  }

  function initUserAndTheme() {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const next = S.theme === 'morning' ? 'evening' : 'morning';
        St.setTheme(next);
        if (V.rethemeMaps) V.rethemeMaps();
        toast(`Theme set to ${next === 'morning' ? 'SAP Morning Horizon (Light)' : 'SAP Evening Horizon (Dark)'}`);
        updateUserBar();
      });
    }

    const userChip = document.getElementById('userChipBtn');
    const popover = document.getElementById('userPopover');
    if (userChip && popover) {
      userChip.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.classList.toggle('is-open');
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-chip-wrap')) {
          popover.classList.remove('is-open');
        }
      });
      popover.addEventListener('click', (e) => {
        const switchBtn = e.target.closest('[data-switch-user]');
        if (switchBtn) {
          const p = St.PERSONAS.find(x => x.id === switchBtn.dataset.switchUser);
          if (p) {
            St.setUser({
              id: p.id,
              name: p.name,
              email: p.email,
              role: p.role,
              org: p.org,
              initials: p.initials,
              color: p.color
            });
            popover.classList.remove('is-open');
            toast(`Switched persona to ${p.name}`);
            updateUserBar();
            render();
          }
        }
        if (e.target.closest('#popoverLogoutBtn')) {
          St.logout();
          popover.classList.remove('is-open');
          toast('Signed out successfully.');
          location.hash = '#/signin';
        }
      });
    }

    St.on((reason) => {
      if (reason === 'auth' || reason === 'theme') {
        updateUserBar();
      }
    });
  }

  /* ---------------------------------------------------------------- boot */
  function boot() {
    document.body.className = 'is-console';
    document.body.innerHTML = shell();
    initSearch();
    initAssistant();
    initUserAndTheme();
    render();
    refreshLive(S.location.lat, S.location.lon);

    global.addEventListener('hashchange', render);
    document.getElementById('railToggle').addEventListener('click', () => document.body.classList.toggle('rail-open'));
    document.addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault(); document.getElementById('q').focus();
      }
    });

    // keep the "last update" readout honest
    setInterval(() => {
      const m = document.getElementById('stripMeta');
      if (m && S.lastUpdate) {
        const lastEl = m.querySelector('span:last-child b');
        if (lastEl) lastEl.textContent = U.timeHHMM(new Date(S.lastUpdate));
      }
    }, 30000);

    if (!global.GAMap.available()) {
      setTimeout(() => toast('Map tiles unavailable — using the built-in offline grid view.', 'warn'), 900);
    }
  }

  global.GAApp = { boot, render, toast, pickPoint, pick, ask, ROUTES };
})(window);
