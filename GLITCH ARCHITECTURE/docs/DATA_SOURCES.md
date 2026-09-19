# Data sources

**None of these is connected in this build.** This is the ingest plan the adapter layer was designed against, listed so the gap between prototype and deployment is explicit rather than implied.

## Observation

| Layer                               | Source                                   | Cadence | Resolution | Feeds                       |
| ----------------------------------- | ---------------------------------------- | ------- | ---------- | --------------------------- |
| Cloud-top temperature, water vapour | INSAT-3D / 3DR imager + sounder (MOSDAC) | 15 min  | 4 km       | `ctt`, `cttTrend`, `iwv`    |
| Reflectivity, radial velocity       | IMD Doppler weather radar network        | 10 min  | 0.5–1 km   | `rainRate`, cell tracking   |
| Surface rain, temperature, wind     | IMD AWS / ARG stations                   | 15 min  | point      | calibration, verification   |
| Satellite precipitation             | NASA GPM IMERG Early Run                 | 30 min  | 10 km      | gap-fill beyond radar range |
| Lightning                           | ISRO / earth networks strike feed        | 1 min   | point      | thunderstorm confirmation   |

## Model fields

| Layer                 | Source                   | Cadence | Resolution | Feeds                                    |
| --------------------- | ------------------------ | ------- | ---------- | ---------------------------------------- |
| CAPE, CIN, shear, RH  | NOAA GFS 0.25°           | 6 h     | 25 km      | thermodynamic environment                |
| Downscaled fields     | WRF nest over the domain | 1 h     | 3 km       | convergence, local shear                 |
| Reanalysis (training) | ERA5                     | hourly  | 31 km      | model training and hindcast verification |

## Static

| Layer                               | Source                     | Feeds                                |
| ----------------------------------- | -------------------------- | ------------------------------------ |
| Elevation, slope, flow accumulation | SRTM 30 m / Cartosat-1 DEM | orographic lift, `drainage`, `slope` |
| Land cover, impervious fraction     | ESA WorldCover 10 m        | `urbanisation`, runoff               |
| Soil texture and moisture           | SMAP L3 / NBSS&LUP         | `soilSat`                            |
| Roads, buildings, facilities        | OpenStreetMap via Overpass | exposure, routing                    |
| Population                          | WorldPop 100 m             | residents exposed                    |
| Administrative boundaries           | Survey of India / GADM     | alert areas                          |

## Live services used **now**

Only two, both optional — the app degrades to built-in fallbacks without them:

| Service                 | Used for                        | Fallback                                                                 |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| OpenStreetMap Nominatim | place search, reverse geocoding | 88-entry built-in gazetteer, coordinate parsing, nearest-place labelling |
| OpenStreetMap basemap   | map tiles                       | canvas grid view with graticule and terrain shading                      |

Nominatim's usage policy caps automated querying at roughly one request per second and requires an identifying User-Agent. This build debounces at 360 ms and shows local gazetteer results instantly while the remote query is in flight. A deployment should run its own Nominatim instance or use a commercial geocoder.

## Licensing

| Source                    | Licence                           | Obligation                                      |
| ------------------------- | --------------------------------- | ----------------------------------------------- |
| OpenStreetMap / Nominatim | ODbL 1.0                          | attribution, share-alike on derived geodata     |
| CARTO basemaps            | CC BY 3.0 on style, OSM data ODbL | attribution (rendered in-map)                   |
| SRTM                      | public domain                     | none                                            |
| GPM IMERG                 | NASA open data                    | citation                                        |
| ERA5                      | Copernicus licence                | citation, no implied endorsement                |
| WorldPop                  | CC BY 4.0                         | attribution                                     |
| INSAT via MOSDAC          | ISRO terms                        | registration, non-commercial restrictions apply |
| IMD radar / AWS           | IMD data policy                   | formal data request; redistribution restricted  |

The last two are the real procurement obstacles for a student team, and they are why this prototype ships with a synthetic engine rather than a half-connected one.

## Verification plan (not yet run)

Before any accuracy figure could honestly be displayed:

1. Hindcast over ≥2 monsoon seasons using ERA5 + IMERG.
2. Score against IMD AWS observations and recorded flood events.
3. Report **CSI, POD, FAR and Brier score** per hazard, per lead time, with confidence intervals.
4. Reliability diagrams; recalibrate with isotonic regression if needed.
5. Report skill against a persistence baseline — a nowcast that cannot beat "conditions continue unchanged" has no value.

Until step 5 passes, the interface shows internal model confidence only, clearly distinguished from verified accuracy.
