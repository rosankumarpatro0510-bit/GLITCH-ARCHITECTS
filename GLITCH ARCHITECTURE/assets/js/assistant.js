/* ==========================================================================
   GLITCH ARCHITECTURE — assistant (chat + voice)
   --------------------------------------------------------------------------
   The assistant answers from three sources only:
     1. the current dashboard state (location, scores, indicators, alerts),
     2. a fixed glossary of meteorological terms,
     3. a fixed library of preparedness guidance.
   It has no connection to any live weather service and is built so that it
   cannot invent one: if a question needs data the platform does not hold, it
   says so instead of guessing.
   ========================================================================== */

(function (global) {
  'use strict';
  const GA = global.GA, U = GA.U, St = global.GAState, S = St.S;

  /* ===================================================== i18n =========== */
  // Coverage is declared honestly per language. Free-form answers fall back to
  // English where a language pack is incomplete, and the interface says so.
  const LANGS = [
    { code: 'en-IN', name: 'English', native: 'English', coverage: 'full' },
    { code: 'hi-IN', name: 'Hindi', native: 'हिन्दी', coverage: 'full' },
    { code: 'bn-IN', name: 'Bengali', native: 'বাংলা', coverage: 'full' },
    { code: 'or-IN', name: 'Odia', native: 'ଓଡ଼ିଆ', coverage: 'safety' },
    { code: 'ta-IN', name: 'Tamil', native: 'தமிழ்', coverage: 'safety' }
  ];

  const T = {
    'en-IN': {
      greeting: 'Ask me about the risk here, what an indicator means, or what to do during severe weather.',
      riskHere: (l, b, s) => `Overall risk at ${l} is ${b} — ${s} out of 100.`,
      hazardLine: (n, b, s) => `${n}: ${b} (${s})`,
      because: 'The model is showing this because:',
      noData: 'The platform does not hold that data, so I will not guess at it.',
      notLive: 'Everything I report comes from the demonstration model in this build, not from a live observation.',
      unknown: 'I did not follow that. Try asking about the risk here, an indicator such as CAPE or IWV, a route, or what to do in a storm.',
      conf: (c, h) => `Model confidence is ${c}% for the ${h}-hour window.`,
      window: h => `The ${h}-hour window is a nowcast: it covers roughly the next ${h} hours from now, based on current conditions and how they are evolving.`,
      safety: 'Here is the preparedness guidance:',
      notOfficial: 'I am a decision-support assistant with no emergency authority. For official warnings in India follow IMD and your State Disaster Management Authority. Emergency number 112.'
    },
    'hi-IN': {
      greeting: 'यहाँ के जोखिम, किसी संकेतक का अर्थ, या खराब मौसम में क्या करें — कुछ भी पूछिए।',
      riskHere: (l, b, s) => `${l} में कुल जोखिम ${b} है — 100 में से ${s}।`,
      hazardLine: (n, b, s) => `${n}: ${b} (${s})`,
      because: 'मॉडल यह जोखिम इन कारणों से दिखा रहा है:',
      noData: 'यह जानकारी इस प्लेटफ़ॉर्म के पास नहीं है, इसलिए मैं अनुमान नहीं लगाऊँगा।',
      notLive: 'मैं जो भी बता रहा हूँ वह इस बिल्ड के प्रदर्शन मॉडल से है, किसी सीधे प्रेक्षण से नहीं।',
      unknown: 'मैं समझ नहीं पाया। यहाँ के जोखिम, CAPE या IWV जैसे संकेतक, मार्ग, या तूफ़ान में क्या करें — इनके बारे में पूछिए।',
      conf: (c, h) => `${h} घंटे की अवधि के लिए मॉडल का विश्वास स्तर ${c}% है।`,
      window: h => `${h} घंटे की अवधि एक नाउकास्ट है: यह वर्तमान स्थिति के आधार पर अगले लगभग ${h} घंटे को कवर करती है।`,
      safety: 'सुरक्षा संबंधी सलाह:',
      notOfficial: 'मैं केवल निर्णय-सहायक सहायक हूँ, मेरे पास कोई आपातकालीन अधिकार नहीं है। आधिकारिक चेतावनी के लिए IMD और अपने राज्य आपदा प्रबंधन प्राधिकरण को देखें। आपातकालीन नंबर 112।'
    },
    'bn-IN': {
      greeting: 'এখানকার ঝুঁকি, কোনও সূচকের অর্থ, বা দুর্যোগে কী করবেন — যা খুশি জিজ্ঞেস করুন।',
      riskHere: (l, b, s) => `${l}-এ সামগ্রিক ঝুঁকি ${b} — ১০০-এর মধ্যে ${s}।`,
      hazardLine: (n, b, s) => `${n}: ${b} (${s})`,
      because: 'মডেল এই ঝুঁকি দেখাচ্ছে কারণ:',
      noData: 'এই তথ্য প্ল্যাটফর্মে নেই, তাই আমি অনুমান করব না।',
      notLive: 'আমি যা বলছি তা এই বিল্ডের প্রদর্শন মডেল থেকে, সরাসরি পর্যবেক্ষণ থেকে নয়।',
      unknown: 'বুঝতে পারিনি। এখানকার ঝুঁকি, CAPE বা IWV-এর মতো সূচক, রুট, বা ঝড়ে কী করবেন — জিজ্ঞেস করুন।',
      conf: (c, h) => `${h} ঘণ্টার সময়সীমার জন্য মডেলের আত্মবিশ্বাস ${c}%।`,
      window: h => `${h} ঘণ্টার সময়সীমা একটি নাউকাস্ট: বর্তমান অবস্থার ভিত্তিতে এটি পরবর্তী প্রায় ${h} ঘণ্টা কভার করে।`,
      safety: 'নিরাপত্তা নির্দেশিকা:',
      notOfficial: 'আমি কেবল একটি সিদ্ধান্ত-সহায়ক সহকারী, আমার কোনও জরুরি কর্তৃত্ব নেই। সরকারি সতর্কতার জন্য IMD এবং আপনার রাজ্য দুর্যোগ ব্যবস্থাপনা কর্তৃপক্ষ দেখুন। জরুরি নম্বর ১১২।'
    },
    'or-IN': {
      greeting: 'ଏଠାରେ ବିପଦ ବିଷୟରେ ପଚାରନ୍ତୁ।',
      riskHere: (l, b, s) => `${l}ରେ ସମୁଦାୟ ବିପଦ ${b} — ୧୦୦ ମଧ୍ୟରୁ ${s}।`,
      notOfficial: 'ମୁଁ କେବଳ ଏକ ସହାୟକ, ମୋର କୌଣସି ସରକାରୀ ଅଧିକାର ନାହିଁ। ଜରୁରୀକାଳୀନ ନମ୍ବର ୧୧୨।',
      safety: 'ସୁରକ୍ଷା ପରାମର୍ଶ:',
      partial: 'ଓଡ଼ିଆରେ କେବଳ ମୁଖ୍ୟ ବାକ୍ୟ ଉପଲବ୍ଧ। ବିସ୍ତୃତ ଉତ୍ତର ଇଂରାଜୀରେ ଦିଆଯାଉଛି।'
    },
    'ta-IN': {
      greeting: 'இங்குள்ள ஆபத்து குறித்து கேளுங்கள்.',
      riskHere: (l, b, s) => `${l} இல் ஒட்டுமொத்த ஆபத்து ${b} — 100 இல் ${s}.`,
      notOfficial: 'நான் ஒரு துணை உதவியாளர் மட்டுமே, எனக்கு அதிகாரப்பூர்வ அதிகாரம் இல்லை. அவசர எண் 112.',
      safety: 'பாதுகாப்பு வழிகாட்டுதல்:',
      partial: 'தமிழில் முக்கிய வாக்கியங்கள் மட்டுமே உள்ளன. விரிவான பதில்கள் ஆங்கிலத்தில் வழங்கப்படும்.'
    }
  };

  const SAFETY_LOCAL = {
    'hi-IN': {
      thunderstorm: ['किसी पक्की इमारत के अंदर चले जाएँ।', 'ऊँचे अकेले पेड़, खुले मैदान और पानी से दूर रहें।', 'आख़िरी गड़गड़ाहट के 30 मिनट बाद ही बाहर निकलें।'],
      flashflood: ['बहते पानी में पैदल या गाड़ी से कभी न जाएँ।', 'ऊँची जगह पर चले जाएँ।', 'पानी घर में आ रहा हो तो मुख्य बिजली बंद कर दें, यदि सुरक्षित हो।'],
      cloudburst: ['नाले और नदी की तरफ़ से तुरंत ऊपर की ओर जाएँ।', 'खड़ी ढलानों के नीचे खड़े न हों।', 'फ़ोन, टॉर्च और ज़रूरी दवाइयाँ पास रखें।']
    },
    'bn-IN': {
      thunderstorm: ['পাকা বাড়ির ভিতরে চলে যান।', 'উঁচু একা গাছ, খোলা মাঠ ও জলাশয় এড়িয়ে চলুন।', 'শেষ বজ্রধ্বনির ৩০ মিনিট পরে বাইরে বেরোন।'],
      flashflood: ['বয়ে যাওয়া জলে হেঁটে বা গাড়িতে কখনও যাবেন না।', 'উঁচু জায়গায় উঠে যান।', 'ঘরে জল ঢুকলে নিরাপদ হলে মেন সুইচ বন্ধ করুন।'],
      cloudburst: ['নালা ও নদীর দিক থেকে সরে উঁচুতে উঠুন।', 'খাড়া ঢালের নিচে দাঁড়াবেন না।', 'ফোন, টর্চ ও প্রয়োজনীয় ওষুধ হাতের কাছে রাখুন।']
    },
    'or-IN': {
      thunderstorm: ['ପକ୍କା ଘର ଭିତରକୁ ଯାଆନ୍ତୁ।', 'ଉଚ୍ଚ ଏକାକୀ ଗଛ ଓ ଖୋଲା ପଡ଼ିଆରୁ ଦୂରେ ରୁହନ୍ତୁ।', 'ଶେଷ ମେଘ ଗର୍ଜନର ୩୦ ମିନିଟ୍ ପରେ ବାହାରକୁ ଯାଆନ୍ତୁ।'],
      flashflood: ['ବହୁଥିବା ପାଣି ଭିତରେ ଚାଲି କିମ୍ବା ଗାଡ଼ିରେ ଯାଆନ୍ତୁ ନାହିଁ।', 'ଉଚ୍ଚ ସ୍ଥାନକୁ ଯାଆନ୍ତୁ।', 'ଘରେ ପାଣି ପଶିଲେ ମୁଖ୍ୟ ବିଦ୍ୟୁତ୍ ବନ୍ଦ କରନ୍ତୁ।'],
      cloudburst: ['ନାଳ ଓ ନଦୀ ପାଖରୁ ଉପରକୁ ଯାଆନ୍ତୁ।', 'ଖଡ଼ା ଢାଲ ତଳେ ରୁହନ୍ତୁ ନାହିଁ।', 'ଫୋନ୍, ଟର୍ଚ୍ଚ ଓ ଔଷଧ ପାଖରେ ରଖନ୍ତୁ।']
    },
    'ta-IN': {
      thunderstorm: ['உறுதியான கட்டிடத்திற்குள் செல்லுங்கள்.', 'உயரமான தனி மரங்கள், திறந்தவெளி, நீர்நிலைகளைத் தவிர்க்கவும்.', 'கடைசி இடிக்குப் பிறகு 30 நிமிடம் கழித்தே வெளியே செல்லுங்கள்.'],
      flashflood: ['ஓடும் வெள்ளத்தில் நடந்தோ வாகனத்திலோ செல்ல வேண்டாம்.', 'உயரமான இடத்திற்குச் செல்லுங்கள்.', 'வீட்டில் நீர் புகுந்தால், பாதுகாப்பாக இருந்தால் மின்சாரத்தை நிறுத்துங்கள்.'],
      cloudburst: ['ஓடை, ஆற்றுப் பகுதியிலிருந்து மேட்டுப் பகுதிக்குச் செல்லுங்கள்.', 'செங்குத்தான சரிவுகளுக்குக் கீழே நிற்க வேண்டாம்.', 'தொலைபேசி, விளக்கு, மருந்துகளை அருகில் வைத்திருங்கள்.']
    }
  };

  function t(key, ...args) {
    const pack = T[S.lang] || T['en-IN'];
    const v = pack[key] !== undefined ? pack[key] : T['en-IN'][key];
    return typeof v === 'function' ? v(...args) : v;
  }
  function langMeta() { return LANGS.find(l => l.code === S.lang) || LANGS[0]; }
  function partialNotice() {
    const m = langMeta();
    if (m.coverage === 'full') return '';
    const p = (T[S.lang] || {}).partial;
    return p ? `<span class="src">${U.esc(p)}</span>` : '';
  }

  /* ================================================== intent engine ===== */
  // Order matters: the list is scanned top-down, so the most specific patterns
  // come first. "Why is the risk high?" must not be swallowed by the generic
  // risk pattern, and "What does the 3-hour forecast mean?" must not be
  // swallowed by the generic "what does ... mean" glossary pattern.
  const INTENTS = [
    { id: 'emergency', pat: /\b(help me|emergency|trapped|stuck|drowning|call 112|112|1078)\b/i },
    { id: 'route_why', pat: /(why|explain|reason).*(route|road|corridor|journey)|(route|road|corridor).*(why|high exposure|showing)/i },
    { id: 'window', pat: /\d\s*-?\s*hour|forecast window|prediction window|nowcast|how far ahead|next \d+\s*hours?|time window/i },
    { id: 'why', pat: /\bwhy\b|explain (the )?(risk|score|prediction)|what.*(driving|causing)|कारण|क्यों|কেন|କାହିଁକି|ஏன்/i },
    { id: 'safety', pat: /what should i do|what do i do|safety|precaution|prepare|stay safe|बचाव|क्या करें|কী করব|নিরাপত্তা|ସୁରକ୍ଷା|பாதுகாப்பு/i },
    { id: 'flashflood_area', pat: /flash.?flood|flood risk|is this area.*flood|बाढ़|বন্যা|ବନ୍ୟା|வெள்ளம்/i },
    { id: 'exposed', pat: /which areas|more exposed|most exposed|worst affected|exposure|who is affected|how many people/i },
    { id: 'route', pat: /route|corridor|travel|drive|journey|रास्ता|मार्ग|রাস্তা|পথ/i },
    { id: 'alerts', pat: /alert|warning|चेतावनी|সতর্কতা|ଚେତାବନୀ|எச்சரிக்கை/i },
    { id: 'confidence', pat: /confiden|how sure|accuracy|reliable|trust|सटीक|নির্ভরযোগ্য/i },
    { id: 'data', pat: /\bdata\b|source|satellite|radar|where.*(from|come)|live|real.?time/i },
    { id: 'location', pat: /where am i|current location|selected location|which place/i },
    { id: 'reports', pat: /citizen|report|ground truth|people.*(seeing|reporting)/i },
    { id: 'capability', pat: /what can you|who are you|commands|kya kar sakte/i },
    { id: 'risk_here', pat: /\b(risk|danger|khatra|ख़तरा|खतरा|ঝুঁকি|ବିପଦ|ஆபத்து)\b|what.*situation|मेरे पास|আমার কাছে/i },
    { id: 'glossary', pat: /what (is|does|are)\b|meaning of|define|\bmean\b|मतलब|অর্থ/i }
  ];

  // Which hazard did the person actually name? Answering a thunderstorm
  // question with flash-flood advice because that happens to be the dominant
  // hazard on the dashboard is exactly the kind of wrong a safety tool must
  // not be.
  function hazardInQuery(q) {
    if (/thunder|lightning|storm|आंधी|तूफ़ान|বজ্র|ঝড়/i.test(q)) return 'thunderstorm';
    if (/cloud.?burst|बादल फटना|মেঘভাঙা/i.test(q)) return 'cloudburst';
    if (/flood|flash.?flood|बाढ़|বন্যা|ବନ୍ୟା|வெள்ளம்/i.test(q)) return 'flashflood';
    return null;
  }

  function detect(q) {
    const s = q.trim();
    const term = matchTerm(s);
    const hazard = hazardInQuery(s);
    // A named glossary term wins only when the question is clearly definitional
    // AND no earlier-listed intent claims it.
    for (const it of INTENTS) {
      if (it.pat.test(s)) {
        if (it.id === 'glossary' && !term) break;
        return { id: it.id, term, hazard };
      }
    }
    if (term) return { id: 'glossary', term, hazard };
    return { id: 'unknown', hazard };
  }

  function matchTerm(s) {
    const q = s.toLowerCase();
    const map = {
      cape: /\bcape\b|instability/, cin: /\bcin\b|inhibition|cap\b/,
      iwv: /\biwv\b|water vapour|water vapor|moisture column/,
      ctt: /\bctt\b|cloud.?top/, shear: /shear/, convergence: /convergen/,
      iwvtrend: /moisture (trend|increase)/, drainage: /drainage|susceptib/,
      nowcast: /nowcast/, shap: /\bshap\b|feature importance|explainab/
    };
    for (const k in map) if (map[k].test(q)) return k;
    return null;
  }

  /* ===================================================== answering ====== */
  function answer(q) {
    const a = S.assessment, loc = S.location;
    const it = detect(q);
    const demoTag = `<span class="src">${U.esc(t('notLive'))}</span>`;

    switch (it.id) {
      case 'risk_here': {
        const lines = a.list.map(h => `<li>${U.esc(t('hazardLine', h.label, h.band.label, U.fmt(h.score, 0)))}</li>`).join('');
        return `<b>${U.esc(t('riskHere', loc.name, a.overallBand.label, U.fmt(a.overall, 0)))}</b>
          <ul>${lines}</ul>
          ${U.esc(t('conf', a.confidence, S.horizon))}${partialNotice()}${demoTag}`;
      }
      case 'why': {
        const key = S.hazardFilter || a.dominant.key;
        const h = a.hazards[key];
        const top = h.contribs.slice(0, 4);
        return `<b>${U.esc(h.label)}: ${U.esc(h.band.label)} (${U.fmt(h.score, 0)})</b><br>${U.esc(t('because'))}
          <ul>${top.map(c => `<li>${c.contribution >= 0 ? '+' : '−'} <b>${U.esc(c.short)}</b> — ${U.esc(c.note)} <span class="mono">(${U.esc(c.value)})</span></li>`).join('')}</ul>
          <span class="src">These are the model's own feature contributions, which show association inside the model rather than proven physical cause.</span>${demoTag}`;
      }
      case 'flashflood_area': {
        const h = a.hazards.flashflood, tr = a.atm.terrain;
        return `<b>Flash-flood score at ${U.esc(loc.name)} is ${U.fmt(h.score, 0)} — ${U.esc(h.band.label.toLowerCase())}.</b><br>
          Drainage susceptibility here is ${Math.round(tr.drainage * 100)} out of 100, mean slope ${tr.slope}°, and the ground is about ${Math.round(a.atm.soilSat * 100)}% saturated. Modelled rain rate is ${a.atm.rainRate} mm/h.
          <ul>${h.contribs.slice(0, 3).map(c => `<li>${U.esc(c.short)} — ${U.esc(c.value)}</li>`).join('')}</ul>${demoTag}`;
      }
      case 'glossary': {
        const g = GA.GLOSSARY[it.term];
        if (!g) return `${U.esc(t('noData'))} I can explain CAPE, CIN, IWV, cloud-top temperature, wind shear, low-level convergence, drainage susceptibility, nowcasting and SHAP.`;
        const cur = currentValueFor(it.term, a);
        return `<b>${U.esc(g.term)} — ${U.esc(g.full)}</b><br>${U.esc(g.text)}
          ${cur ? `<br><br>Right now at ${U.esc(loc.name)} it reads <span class="mono">${U.esc(cur)}</span>.` : ''}${partialNotice()}`;
      }
      case 'exposed': {
        const rad = S.radiusKm;
        const ex = GA.exposure(loc.lat, loc.lon, rad, a.overall, S.scenario ? { scenario: S.scenario } : {});
        const pop = ex.find(x => x.id === 'population');
        const top = ex.filter(x => x.id !== 'population' && x.available).sort((x, y) => (y.exposed / (y.total || 1)) - (x.exposed / (x.total || 1))).slice(0, 4);
        return `<b>Within ${rad} km of ${U.esc(loc.name)}, roughly ${U.compact(pop.exposed)} residents fall inside the modelled risk footprint.</b>
          <ul>${top.map(x => `<li>${U.esc(x.name)}: ${U.fmt(x.exposed, x.unit === 'km' ? 1 : 0)} ${U.esc(x.unit)}</li>`).join('')}</ul>
          The Impact page breaks this down fully.
          <span class="src">Exposure counts are modelled from density proxies, not queried from OpenStreetMap in this build.</span>`;
      }
      case 'safety': {
        // the hazard the person asked about, then the one they are filtering on,
        // then the dominant one — in that order
        const key = it.hazard || S.hazardFilter || a.dominant.key;
        const local = SAFETY_LOCAL[S.lang] && SAFETY_LOCAL[S.lang][key];
        const tips = local || GA.SAFETY[key] || GA.SAFETY.general;
        return `<b>${U.esc(t('safety'))}</b><ul>${tips.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul>
          <span class="src">${U.esc(t('notOfficial'))}</span>`;
      }
      case 'route_why': {
        if (!S.routes || !S.routes.length) {
          return `No corridor has been compared yet. Open Safe routes, enter an origin and destination, and I can explain segment by segment why each option scores the way it does.`;
        }
        const r = S.routes[S.routePick || 0];
        const hot = r.segments.filter(x => x.score >= 62);
        const counts = {};
        hot.forEach(x => counts[x.dominant] = (counts[x.dominant] || 0) + 1);
        const lead = Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0];
        return `<b>${U.esc(r.name)} has a mean exposure of ${U.fmt(r.exposure, 0)} of 100, peaking at ${U.fmt(r.peak, 0)}.</b><br>
          ${hot.length
            ? `About ${Math.round(r.highShare * 100)}% of the sampled points along it fall inside modelled high or severe cells, mostly driven by <b>${U.esc(lead.toLowerCase())}</b>.`
            : `No sampled point along it currently falls inside a high or severe cell — the score comes from sustained moderate conditions rather than one bad stretch.`}
          ${r.rank > 0 ? ` <b>${U.esc(S.routes[0].name)}</b> currently scores lower at ${U.fmt(S.routes[0].exposure, 0)}.` : ' It is currently the lowest-exposure option of those compared.'}
          <span class="src">Exposure is scored against the demonstration risk field, sampled at ${r.segments.length} points. Lower exposure is not the same as safe.</span>`;
      }
      case 'route': {
        if (!S.routes || !S.routes.length) {
          return `No corridor has been compared yet. Open Safe routes, enter an origin and destination, and I can explain why each option scores the way it does.`;
        }
        const best = S.routes[0], worst = S.routes[S.routes.length - 1];
        return `<b>${U.esc(best.name)} currently has the lowest modelled exposure at ${U.fmt(best.exposure, 0)} of 100.</b><br>
          ${U.esc(worst.name)} scores ${U.fmt(worst.exposure, 0)}, with about ${Math.round(worst.highShare * 100)}% of its sampled points inside high or severe cells, peaking at ${U.fmt(worst.peak, 0)}.
          <span class="src">Lower exposure is not the same as safe. Roads close for reasons no model sees, and this build has no live traffic or closure feed.</span>`;
      }
      case 'window':
        return `${U.esc(t('window', S.horizon))} ${U.esc(t('conf', a.confidence, S.horizon))}
          <span class="src">Confidence falls with lead time and with missing data feeds. No accuracy figure is claimed anywhere in this platform, because no verification run has been done.</span>`;
      case 'alerts': {
        if (!S.alerts.length) return `Nothing at ${U.esc(loc.name)} currently crosses an alert threshold.${demoTag}`;
        return `<b>${S.alerts.length} alert${S.alerts.length > 1 ? 's' : ''} at ${U.esc(loc.name)}:</b>
          <ul>${S.alerts.map(al => `<li><b>${U.esc(al.category)}</b> — ${U.esc(al.band.label.toLowerCase())}. ${U.esc(al.reason)}</li>`).join('')}</ul>
          <span class="src">${S.scenario ? 'These come from a simulated scenario.' : 'These are demonstration alerts from model thresholds.'} None is a government warning. ${U.esc(t('notOfficial'))}</span>`;
      }
      case 'confidence':
        return `Model confidence is ${a.confidence}% for the ${S.horizon}-hour window, computed from lead time and how many data adapters report for this area (${a.status.feeds.filter(f => f.ok).length} of ${a.status.feeds.length}).
          <span class="src">This is an internal confidence estimate, not a verified accuracy. No skill score is claimed.</span>`;
      case 'data':
        return `<b>No live feed is connected in this build.</b> Everything shown comes from a deterministic demonstration model. The adapters designed for it are INSAT-3D/3DR imagery, IMD Doppler radar, AWS rain gauges, GPM IMERG, GFS/WRF fields, SRTM terrain and OpenStreetMap infrastructure. The Data page lists all of them with cadence.${U.esc('')}`;
      case 'location':
        return `The assessment point is <b>${U.esc(loc.name)}</b>${loc.region ? ', ' + U.esc(loc.region) : ''}, at <span class="mono">${U.dms(loc.lat, loc.lon)}</span>. Elevation is about ${U.fmt(a.atm.terrain.elevation)} m${a.atm.terrain.range ? ' in the ' + U.esc(a.atm.terrain.range) + ' area' : ''}. Search or click the map to move it.`;
      case 'reports': {
        const v = S.reports.filter(r => r.status === 'verified').length;
        if (!S.reports.length) return `No citizen reports have been submitted for this area yet.`;
        const last = S.reports[0];
        const ty = St.REPORT_TYPES.find(x => x.id === last.type);
        return `<b>${S.reports.length} citizen report${S.reports.length > 1 ? 's' : ''}, ${v} corroborated.</b> Most recent: ${U.esc(ty ? ty.label : last.type)}, ${U.ago(last.ts)}.
          <span class="src">Citizen reports are public observations. They are never treated as official measurements.</span>`;
      }
      case 'emergency':
        return `<b>If you are in immediate danger, call 112 now.</b> The NDMA helpline is 1078.
          <ul>${GA.SAFETY.general.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul>
          <span class="src">${U.esc(t('notOfficial'))}</span>`;
      case 'capability':
        return `I answer from what this dashboard holds. You can ask me:
          <ul><li>What is the risk near me?</li><li>Why is the risk high?</li><li>Is this area affected by flash floods?</li>
          <li>What does CAPE or IWV mean?</li><li>Which areas are more exposed?</li><li>What should I do during a severe thunderstorm?</li>
          <li>Why is this route showing high exposure?</li><li>What does the 3-hour forecast mean?</li></ul>
          <span class="src">I will not invent live weather. If the platform does not hold something, I say so.</span>`;
      default:
        return `${U.esc(t('unknown'))}${partialNotice()}`;
    }
  }

  async function answerWithApi(q) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        query: q,
        lang: S.lang,
        context: {
          location: S.location,
          assessment: S.assessment,
          horizon: S.horizon,
          scenario: S.scenario || null
        }
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Assistant API request failed');
    return payload.answer;
  }

  function currentValueFor(term, a) {
    const m = {
      cape: a.atm.cape + ' J/kg', cin: a.atm.cin + ' J/kg', iwv: a.atm.iwv + ' mm',
      ctt: a.atm.ctt + ' °C', shear: a.atm.shear + ' m/s',
      convergence: a.atm.convergence + ' ×10⁻⁵ s⁻¹',
      iwvtrend: (a.atm.iwvTrend > 0 ? '+' : '') + a.atm.iwvTrend + ' mm/3h',
      drainage: Math.round(a.atm.terrain.drainage * 100) + ' / 100'
    };
    return m[term] || null;
  }

  // Plain text for speech synthesis
  function speakable(html) {
    return html.replace(/<li>/g, ' • ').replace(/<br\s*\/?>/g, '. ')
      .replace(/<span class="src">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim();
  }

  /* ======================================================== voice ======= */
  const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
  const synth = global.speechSynthesis;
  let recog = null, listening = false;

  function voiceSupport(code) {
    const asr = !!SR;                       // browsers rarely expose per-language ASR support
    let tts = false;
    if (synth) {
      const vs = synth.getVoices() || [];
      const base = code.split('-')[0];
      tts = vs.some(v => v.lang && (v.lang === code || v.lang.replace('_', '-').split('-')[0] === base));
    }
    return { asr, tts };
  }

  function speak(text, code) {
    if (!synth) return { ok: false, reason: 'no-tts' };
    const lang = code || S.lang;
    const sup = voiceSupport(lang);
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (sup.tts) {
      utt.lang = lang;
      const v = (synth.getVoices() || []).find(x => x.lang === lang) ||
                (synth.getVoices() || []).find(x => x.lang && x.lang.split('-')[0] === lang.split('-')[0]);
      if (v) utt.voice = v;
      synth.speak(utt);
      return { ok: true, fellBack: false };
    }
    // graceful fallback: read in English rather than mangling the language
    const fb = voiceSupport('en-IN').tts || voiceSupport('en-US').tts;
    if (!fb) return { ok: false, reason: 'no-voice' };
    utt.lang = 'en-IN';
    synth.speak(utt);
    return { ok: true, fellBack: true };
  }

  function startListening(onResult, onState) {
    if (!SR) { onState('unsupported'); return false; }
    try {
      recog = new SR();
      recog.lang = S.lang;
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      recog.continuous = false;
      recog.onstart = () => { listening = true; onState('listening'); };
      recog.onerror = e => { listening = false; onState('error', e.error); };
      recog.onend = () => { listening = false; onState('idle'); };
      recog.onresult = e => {
        const txt = e.results[0][0].transcript;
        onResult(txt);
      };
      recog.start();
      return true;
    } catch (e) { onState('error', e.message); return false; }
  }
  function stopListening() { if (recog && listening) { try { recog.stop(); } catch (e) {} } }

  global.GAAssistant = {
    answer, answerWithApi, speakable, LANGS, T, t, langMeta,
    voiceSupport, speak, startListening, stopListening,
    isListening: () => listening,
    hasASR: () => !!SR, hasTTS: () => !!synth
  };
})(window);
