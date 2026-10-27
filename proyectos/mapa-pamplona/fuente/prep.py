"""Turn the Overture extracts + terrarium tiles into one compact JSON for the Pamplona map page."""
import json, math, re, glob, base64, collections, hashlib
import numpy as np
import pyarrow.parquet as pq
from shapely import wkb
from shapely.geometry import Polygon, LineString, MultiPolygon
from PIL import Image

LON0, LAT0 = -72.6465, 7.3770
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
def proj(lon, lat): return ((lon - LON0) * KX, (lat - LAT0) * KY)
def unproj(x, y): return (x / KX + LON0, y / KY + LAT0)
EXT = 5200  # half extent of the data window, meters

def tb(n): return pq.read_table(f"data/{n}.parquet").to_pylist()
def pname(r):
    n = r.get("names") or {}
    return (n.get("primary") or "").strip()

def pts(coords, tol=None):
    xy = [proj(lon, lat) for lon, lat in coords]
    return xy

def simplify_line(xy, tol):
    if len(xy) < 3: return xy
    return list(LineString(xy).simplify(tol).coords)

names = []; name_ix = {}
def nid(s):
    if not s: return -1
    if s not in name_ix: name_ix[s] = len(names); names.append(s)
    return name_ix[s]

# ---------------- roads
ROAD_CLASS = ["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "service", "living_street", "pedestrian", "footway", "steps", "path", "track", "cycleway", "bridleway", "unknown"]
roads = []
for r in tb("segments"):
    g = wkb.loads(r["geometry"])
    if g.geom_type != "LineString": continue
    xy = pts(g.coords)
    if all(abs(x) > EXT + 800 or abs(y) > EXT + 800 for x, y in xy): continue
    xy = simplify_line(xy, 1.2)
    cls = r["class"] or "unknown"
    if cls not in ROAD_CLASS: cls = "unknown"
    flags = str(r.get("road_flags") or "")
    roads.append({"c": ROAD_CLASS.index(cls), "n": nid(pname(r)), "b": 1 if "is_bridge" in flags else 0,
                  "p": [int(round(v)) for xyp in xy for v in xyp]})

# ---------------- buildings
def ring_xy(poly):
    xy = pts(poly.exterior.coords)[:-1]
    if len(xy) > 4: xy = list(Polygon(xy).simplify(0.4).exterior.coords)[:-1] if Polygon(xy).is_valid else xy
    return xy
blds = []
for r in tb("buildings"):
    g = wkb.loads(r["geometry"])
    polys = [g] if g.geom_type == "Polygon" else list(g.geoms) if g.geom_type == "MultiPolygon" else []
    for poly in polys:
        xy = ring_xy(poly)
        if len(xy) < 3: continue
        cx = sum(p[0] for p in xy) / len(xy); cy = sum(p[1] for p in xy) / len(xy)
        if abs(cx) > EXT or abs(cy) > EXT: continue
        area = abs(Polygon(xy).area)
        if area < 6: continue
        h = int(hashlib.md5(r["id"].encode()).hexdigest()[:6], 16) / 0xFFFFFF
        floors = r.get("num_floors")
        if not floors:
            dc = math.hypot(cx - 0, cy - 0)
            base = 1 + (h > 0.45) + (h > 0.86)
            if area > 350: base += 1
            if area > 1200: base += 1
            if dc < 500 and base < 2: base = 2
            floors = base
        height = r.get("height") or floors * 3.0 + 0.6
        cls = r.get("class") or ""
        nm = pname(r)
        church = bool(re.search(r"(?i)catedral|iglesia|parroquia|capilla|templo", nm)) or cls == "church"
        if church: height = max(height, 14)
        blds.append({"p": [int(round(v * 2)) for p in xy for v in p], "h": round(height, 1), "k": 1 if church else 0, "n": nid(nm) if nm else -1})

# ---------------- land use
LU_GROUP = {"residential": "res", "park": "park", "pitch": "pitch", "commercial": "com", "retail": "com", "school": "edu", "college": "edu", "university": "edu",
            "meadow": "meadow", "hospital": "med", "garden": "park", "track": "pitch", "construction": "con", "cemetery": "cem", "religious": "rel", "military": "mil", "stadium": "pitch"}
lus = []
for r in tb("land_use"):
    g = wkb.loads(r["geometry"])
    grp = LU_GROUP.get(r["class"])
    if not grp: continue
    polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
    for poly in polys:
        xy = pts(poly.exterior.coords)[:-1]
        if any(abs(x) > 40000 or abs(y) > 40000 for x, y in xy): continue
        xy = list(Polygon(xy).simplify(1.5).exterior.coords)[:-1]
        lus.append({"g": grp, "n": nid(pname(r)), "p": [int(round(v)) for p in xy for v in p]})

# ---------------- water + infrastructure
water = []
for r in tb("water"):
    g = wkb.loads(r["geometry"])
    if g.geom_type == "LineString":
        water.append({"n": nid(pname(r)), "p": [int(round(v)) for p in simplify_line(pts(g.coords), 2) for v in p]})
trees = []
for r in tb("land"):
    g = wkb.loads(r["geometry"])
    if g.geom_type == "Point":
        x, y = proj(g.x, g.y); trees += [int(round(x)), int(round(y))]

# ---------------- places
def group(cat, nm):
    c = cat or ""; n = nm.lower()
    if "polic" in n or c in ("police_station",): return "seg", "Policía"
    if "bombero" in n or c == "fire_station": return "seg", "Bomberos"
    if c in ("hospital",) or "hospital" in n or "clinica" in n or "clínica" in n: return "sal", "Hospital / clínica"
    if c in ("pharmacy_and_drug_store",) or "drog" in n or "farmac" in n: return "far", "Farmacia"
    if c in ("dental_clinic", "health_care", "vision_or_eye_care_clinic", "diagnostics_imaging_or_lab_service", "behavioral_or_mental_health_clinic",
             "reproductive_perinatal_and_womens_care", "wellness_service", "obstetrics_and_gynecology") or "salud" in n: return "sal", "Salud"
    if c in ("restaurant", "casual_eatery", "fast_food_restaurant", "food_service"): return "com", "Restaurante"
    if c in ("cafe", "coffee_shop"): return "caf", "Café"
    if c in ("bar", "dance_club", "music_venue"): return "bar", "Bar / discoteca"
    if c in ("hotel", "lodging"): return "hot", "Hotel"
    if c in ("college_university",): return "edu", "Universidad"
    if c in ("place_of_learning", "education", "middle_school", "high_school", "educational_service", "library"): return "edu", "Educación"
    if c in ("christian_place_of_worship", "religious_organization"): return "igl", "Iglesia"
    if c in ("museum", "historic_site", "monument", "arts_and_entertainment", "movie_theater"): return "cul", "Cultura / turismo"
    if c in ("bank_or_credit_union", "financial_service"): return "ban", "Banco"
    if c in ("park",): return "par", "Parque"
    if c in ("gym", "sport_or_fitness_facility", "sports_and_recreation", "sport_or_recreation_club", "sporting_goods_store"): return "dep", "Deporte"
    if c in ("shopping_mall", "superstore", "food_and_beverage_store", "farmers_market"): return "sup", "Mercado / supermercado"
    if c.endswith("_store") or c in ("shopping", "fashion_and_apparel_store"): return "tie", "Tienda"
    if c in ("travel_and_transportation", "travel_service"): return "tra", "Transporte"
    if c in ("government_office",): return "gob", "Gobierno"
    if c in ("mountain",): return "mon", "Cerro"
    if c in ("animal_or_pet_service", "animal_and_pet_store"): return "vet", "Mascotas"
    if c in ("automotive_service", "vehicle_service", "auto_dealer", "vehicle_parts_store"): return "aut", "Taller / vehículos"
    return "ser", "Servicio"
places = []
barrio_pts = collections.defaultdict(list)
for r in tb("places"):
    nm = pname(r)
    if not nm: continue
    g = wkb.loads(r["geometry"]); x, y = proj(g.x, g.y)
    if abs(x) > EXT or abs(y) > EXT: continue
    cat = r.get("basic_category")
    grp, label = group(cat, nm)
    addr = ""
    for a in (r.get("addresses") or []):
        addr = (a.get("freeform") or "").strip()
        m = re.search(r"(?i)\b(?:barrio|urbanizaci[oó]n)\s+((?:(?:los|las|el|la|santo|santa|san)\s+)?[A-Za-zÁÉÍÓÚÑáéíóúñ]+)", addr)
        if m:
            b = m.group(1).strip().title().replace("Topon", "Topón").replace("Florian", "Florián").replace("Americas", "Américas")
            if len(b) > 2 and b.lower() not in ("el", "la", "nro"): barrio_pts[b].append((x, y))
    phone = ((r.get("phones") or [None])[0]) or ""
    web = ((r.get("websites") or [None])[0]) or ""
    if r.get("confidence", 1) < 0.25 and grp not in ("seg", "sal"): continue
    places.append({"x": int(round(x)), "y": int(round(y)), "n": nm[:60], "g": grp, "c": label, "a": addr[:70], "t": phone, "w": web[:80]})
# street name of barrio El Zulia
for rd in roads:
    if rd["n"] >= 0 and names[rd["n"]] == "Barrio El Zulia":
        p = rd["p"]; barrio_pts["El Zulia"].append((p[0], p[1]))
barrios = [{"n": b, "x": int(np.mean([p[0] for p in v])), "y": int(np.mean([p[1] for p in v]))} for b, v in barrio_pts.items() if b not in ("Centro",)]
# the centre: around the main square
pk = [l for l in lus if l["n"] >= 0 and "gueda" in names[l["n"]]]
barrios = [b for k, b in enumerate(barrios) if all((b["x"] - o["x"]) ** 2 + (b["y"] - o["y"]) ** 2 > 90 ** 2 for o in barrios[:k])]  # dedupe
if pk:
    pp = pk[0]["p"]; barrios.append({"n": "Centro", "x": int(np.mean(pp[0::2])), "y": int(np.mean(pp[1::2]))})
else:
    barrios.append({"n": "Centro", "x": 0, "y": 0})
infra = []
for r in tb("infrastructure"):
    g = wkb.loads(r["geometry"])
    if r["class"] in ("bus_station", "viewpoint", "parking", "charging_station") and g.geom_type == "Point":
        x, y = proj(g.x, g.y)
        infra.append({"x": int(x), "y": int(y), "c": r["class"], "n": pname(r)})

# ---------------- terrain grid
z = 13; tiles = {}
for f in glob.glob("tiles/13_*.png"):
    _, tx, ty = f[:-4].split("/")[-1].split("_"); tiles[(int(tx), int(ty))] = np.asarray(Image.open(f).convert("RGB")).astype(np.float64)
def elev(lon, lat):
    n = 2 ** z; fx = (lon + 180) / 360 * n; fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    tx, ty = int(fx), int(fy); px = (fx - tx) * 256 - 0.5; py = (fy - ty) * 256 - 0.5
    a = tiles[(tx, ty)]
    x0 = int(math.floor(px)); y0 = int(math.floor(py)); ax = px - x0; ay = py - y0
    def v(xx, yy):
        xx = min(max(xx, 0), 255); yy = min(max(yy, 0), 255); c = a[yy, xx]; return c[0] * 256 + c[1] + c[2] / 256 - 32768
    return (v(x0, y0) * (1 - ax) + v(x0 + 1, y0) * ax) * (1 - ay) + (v(x0, y0 + 1) * (1 - ax) + v(x0 + 1, y0 + 1) * ax) * ay
TE = 6200; TS = 40; TN = int(2 * TE / TS) + 1
grid = np.zeros((TN, TN))
for j in range(TN):
    for i in range(TN):
        lon, lat = unproj(-TE + i * TS, -TE + j * TS)
        grid[j, i] = elev(lon, lat)
base = float(np.floor(grid.min()))
g16 = np.round((grid - base) * 4).astype("<u2")  # quarter-metre steps
terrain = {"n": TN, "s": TS, "e": TE, "base": base, "d": base64.b64encode(g16.tobytes()).decode()}
print("terrain", TN, grid.min(), grid.max(), "centre", grid[TN // 2, TN // 2])

out = {"origin": [LON0, LAT0], "names": names, "roadClasses": ROAD_CLASS, "roads": roads, "buildings": blds, "landuse": lus,
       "water": water, "trees": trees, "places": places, "barrios": barrios, "infra": infra, "terrain": terrain}
s = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
open("data.json", "w").write(s)
print("roads", len(roads), "buildings", len(blds), "landuse", len(lus), "places", len(places), "barrios", barrios, "bytes", len(s))
print(collections.Counter(p["g"] for p in places))
