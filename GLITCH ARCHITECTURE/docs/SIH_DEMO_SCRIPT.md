# SIH demo script

Eight minutes, one browser tab. Run `python3 -m http.server 8000` before you walk up.

---

## 0:00 — Landing (30 s)

Open `index.html`. Do not read the page aloud.

> "Daily forecasts handle tomorrow well. What they handle badly is the cell that forms over one catchment this afternoon and floods a specific set of streets in forty minutes. That's the window we built for."

Point at the cross-section — the updraught, the rain shaft, the runoff marker at the valley. Scroll past the module grid to the **limits** section and leave it on screen for a beat.

> "Before anything else — this is a prototype. No live feed, no trained model, and we claim no accuracy figure anywhere. I'll show you exactly where that's stated in the product, not just in the README."

That opening buys you credibility for the next seven minutes. Judges have seen a lot of dashboards claiming 94% accuracy with no verification behind it.

---

## 0:30 — Situation overview (90 s)

Click **Open the console**.

- Point at the overall gauge, the three hazard cards, the `DEMO` chip.
- Scroll the indicator table. Name three: CAPE, IWV, cloud-top cooling rate.

> "Twelve indicators, and every one of them feeds the score in a way you can interrogate — I'll come back to that."

- Type `Bhubaneswar` in the search bar. Let it resolve.

> "Every module follows the assessment point. Search, coordinates, or a click on the map — anywhere on Earth."

- Paste `30.5550, 79.5646` (Joshimath). Watch the scores jump.

> "Steep Himalayan terrain, monsoon moisture. The terrain proxy is doing real work in the flood model here, not decoration."

---

## 2:00 — Risk map (45 s)

Click **Risk map**.

- Toggle **Cloudburst** and **Terrain & elevation** on, **Combined risk** off.
- Click a cell. The inspector shows per-hazard scores for that cell.

> "Two-kilometre lattice. One ward floods while the next stays dry — a district-level bulletin can't express that."

*If the venue wifi is down:* the map falls back to a canvas grid view and labels itself `grid view · no basemap`. Say so out loud — it's a design decision, not a failure.

---

## 2:45 — Prediction (45 s)

> "Six hours, hour by hour."

- Point at the diverging series, then at the confidence figure falling with lead time.
- Point at the cell-motion arrow.

> "And here's the thing we don't do —"

Scroll to the confidence panel note.

> "No CSI, no POD, no lead-time claim. Those numbers only mean something after verification against observed events. We haven't run that, so we don't print a number."

---

## 3:30 — Why this risk (75 s) ← **the money slide**

Click **Why this risk**.

- Point at the signed contribution bars. Red pushes up, green holds down.
- Read one plain-language line aloud from the panel below.

> "This isn't a post-hoc explanation bolted onto a black box. The demo model is an explicit weighted score, so these bars are literally the terms in the sum — they add to the logit the model used. Swap in the trained XGBoost model and the same panel renders SHAP values from TreeExplainer. The layout doesn't change, only the source of the numbers."

Then point at the caveat note.

> "And we say plainly that feature importance is association inside a model, not proven physical cause. Moisture and rain rate move together; they'll share credit in ways that mislead if you read them as causation."

---

## 4:45 — Impact and routes (75 s)

**Impact analysis** — scroll the asset list.

> "Residents, roads, schools, hospitals, bridges, substations. And where OSM coverage is thin, it says *no data* instead of printing a zero. In rural India that distinction matters — a gap is not an absence."

**Safe routes** — origin `Kolkata`, destination `Digha`, compare.

- Point at the ranked corridors and the segment strip.

> "Note the language. Lowest exposure. Comparatively lower risk. Recommended alternative. We never call a route safe — roads close for reasons no weather model sees, and we have no live traffic feed."

---

## 6:00 — What-if (45 s)

Click **What-if simulator**, hit the **Cloudburst over the catchment** preset.

> "Rainfall up 160%, moisture up 70%, saturated ground."

- Point at the score deltas, then the exposure deltas, then the route exposure changing, then the alerts it would raise.

> "Everything is marked simulated, and that marker follows the alert into the Alert Centre. A hypothetical must never be able to escape into an operations feed looking like a real warning."

---

## 6:45 — Reports, alerts, assistant (60 s)

**Citizen reports** — point at the three moderation states.

> "Unverified, under review, corroborated. Corroborated means two independent reports within three kilometres and two hours. That raises confidence — it does not make it an official measurement, and we never feed it back into the model as one."

**Alert centre** — point at the provenance legend.

> "Three markers. Demo. Simulated. And live data-backed — which is reserved, and appears on nothing in this build, because nothing here qualifies."

Open the **assistant**. Ask by voice or type:

> *"Why is the risk high?"*

Then switch the language selector to **ଓଡ଼ିଆ** and ask for safety guidance.

> "Five languages. Three with full answer packs, two with core safety phrases only — and the interface tells you which. Five shallow machine-translated languages would be worse than three solid ones. A garbled evacuation instruction is itself a hazard."

---

## 7:45 — Close (15 s)

> "Ten modules, offline-capable, and a swap point documented so the demo model comes out and INSAT, DWR and IMERG go in without touching a view file. What we won't do is claim it's something it isn't."

---

## Likely questions

**"Why not use a real ML model?"**
> The architecture is built around the swap point — one function, `sampleAtmosphere`, and one scorer. What we couldn't do in the hackathon window is train *and verify* a model. Shipping an unverified model with a confident accuracy number would be the actual failure.

**"Is the weather data real?"**
> No, and it says so on every page. It's a deterministic physically-motivated field — same place and hour gives the same result, which is why the demo is reproducible. The indicator ranges and thresholds are real; the values are modelled.

**"How is this different from IMD's own warnings?"**
> It isn't a competitor. IMD has warning authority, we have none, and the product says so in the Alert Centre. This is decision support at a spatial scale below what a bulletin expresses, plus explanation and exposure analysis on top.

**"What happens with no internet?"**
> Everything except basemap tiles and Nominatim search. Offline you get a canvas grid view and an 88-entry gazetteer. Demonstrate it by killing wifi — it degrades and labels itself rather than breaking.
