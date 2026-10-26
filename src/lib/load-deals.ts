import {
  type Category,
  type Deal,
  type DealQuery,
  type DealsResult,
  type FuelBoard,
  type FuelGrade,
  type FuelStation,
  type FuelArea,
  type Place,
  type Store,
  categorize,
  chainKeyOf,
  chainById,
  chainOf,
  isBlocked,
  milesBetween,
  normalizeName,
  priceOk,
} from "./deals";

const UA = "AisleGrocery/1.0 (nearby grocery sales; +https://grok.com)";
const TTL = 15 * 60 * 1000;

type CacheEntry<T> = { at: number; value: T };

const placeCache = new Map<string, CacheEntry<Place>>();
const flyerCache = new Map<string, CacheEntry<Deal[]>>();
const storeCache = new Map<string, CacheEntry<Store[]>>();
const gradeCache = new Map<string, CacheEntry<AaaSnap>>();
const stationCache = new Map<string, CacheEntry<FuelStation[]>>();

const STATE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const REJECT_TYPES = new Set([
  "pharmacy",
  "fuel",
  "bank",
  "atm",
  "restaurant",
  "fast_food",
  "cafe",
  "clothes",
  "hairdresser",
]);

const CLUBS = ["costco", "sams"];
const PINNED = ["costco", "sams", "kwikstar"];

type NomAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  state?: string;
  postcode?: string;
  road?: string;
  house_number?: string;
  country_code?: string;
};

type NomItem = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  type?: string;
  osm_id?: number;
  osm_type?: string;
  address?: NomAddress;
};

type Flyer = {
  id?: number;
  merchant?: string;
  categories?: string[];
  valid_to?: string;
};

type FlyerItem = {
  id?: number;
  name?: string;
  price?: string;
  cutout_image_url?: string;
  valid_to?: string;
};

export async function loadDeals(input: DealQuery): Promise<DealsResult> {
  const radiusMi = clamp(input.radiusMi ?? 8, 1, 30);
  try {
    const place = await resolvePlace(input);
    if (!place) {
      return { ok: false, error: "Couldn't find that place. Try a 5-digit ZIP or a city name." };
    }
    if (!/^\d{5}$/.test(place.postal)) {
      return { ok: false, error: "Weekly circulars need a U.S. ZIP. Try 57104 or a city like Chicago." };
    }

    const fuelPromise = loadFuel(place, radiusMi).catch((error) => {
      console.error(error);
      return undefined;
    });
    let dealsRaw: Deal[] = [];
    let stores: Store[] = [];
    let flyerFailed = false;
    let storeFailed = false;
    try {
      dealsRaw = await cached(`flyers:v3:${place.postal}`, flyerCache, () => loadFlyerDeals(place.postal));
    } catch (error) {
      flyerFailed = true;
      console.error(error);
    }
    const chainIds = [...new Set(dealsRaw.map((deal) => deal.chainKey))];
    try {
      stores = await Promise.race([
        cached(
          `stores:v3:${place.lat.toFixed(2)}:${place.lon.toFixed(2)}:${radiusMi}:${chainIds.slice().sort().join(",")}`,
          storeCache,
          () => loadStores(place, radiusMi, chainIds),
        ),
        new Promise<Store[]>((resolve) => setTimeout(() => resolve([]), 8_000)),
      ]);
    } catch (error) {
      storeFailed = true;
      console.error(error);
    }
    if (flyerFailed && storeFailed) {
      return { ok: false, error: "Store listings are busy. Try again in a moment." };
    }

    const deals = attachStores(dealsRaw, stores);
    const fuel = await fuelPromise;
    const note =
      deals.length === 0
        ? "No grocery ads came back for this ZIP right now."
        : stores.length === 0
          ? "Ads loaded, but nearby store pins didn't. Distances are hidden."
          : undefined;

    return { ok: true, place, stores, deals, radiusMi, fuel, note };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Store listings are busy. Try again in a moment." };
  }
}

function attachStores(deals: Deal[], stores: Store[]): Deal[] {
  return deals.map((deal) => {
    let nearest: Store | null = null;
    for (const store of stores) {
      if (store.chainKey !== deal.chainKey) continue;
      if (!nearest || store.distanceMi < nearest.distanceMi) nearest = store;
    }
    if (!nearest) return { ...deal, distanceMi: null, storeId: null };
    return { ...deal, distanceMi: nearest.distanceMi, storeId: nearest.id };
  });
}

async function resolvePlace(input: DealQuery): Promise<Place | null> {
  const query = input.query?.trim();
  if (query) {
    const key = `q:${query.toLowerCase()}`;
    const hit = placeCache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.value;
    const zip = query.match(/^\d{5}$/)?.[0];
    if (zip) {
      const fromZip = await zipPlace(zip).catch(() => null);
      if (fromZip) {
        placeCache.set(key, { at: Date.now(), value: fromZip });
        return fromZip;
      }
    }
    try {
      const hits = await nominatim({ q: query, limit: "1" });
      let place = placeFrom(hits[0]);
      if (place && !place.postal) {
        place = (await reverse(place.lat, place.lon)) ?? place;
      }
      if (place?.postal) placeCache.set(key, { at: Date.now(), value: place });
      return place ?? hit?.value ?? null;
    } catch {
      return hit?.value ?? null;
    }
  }
  if (typeof input.lat === "number" && typeof input.lon === "number") {
    const key = `ll:${input.lat.toFixed(3)}:${input.lon.toFixed(3)}`;
    const hit = placeCache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.value;
    const place = await reverse(input.lat, input.lon);
    if (place?.postal) placeCache.set(key, { at: Date.now(), value: place });
    return place ?? hit?.value ?? null;
  }
  return null;
}

async function zipPlace(zip: string): Promise<Place | null> {
  const data = await fetchJson(`https://api.zippopotam.us/us/${zip}`, 8_000);
  if (!data || typeof data !== "object") return null;
  const row = data as { places?: Array<Record<string, string>> };
  const spot = row.places?.[0];
  if (!spot) return null;
  const lat = Number(spot.latitude);
  const lon = Number(spot.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const city = spot["place name"] || "Nearby";
  const region = spot["state abbreviation"] || "";
  return { label: `${city}${region ? `, ${region}` : ""} ${zip}`, city, region, postal: zip, lat, lon };
}

async function reverse(lat: number, lon: number): Promise<Place | null> {
  await paceNominatim();
  let data: unknown;
  try {
    data = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({
        format: "jsonv2",
        lat: String(lat),
        lon: String(lon),
        addressdetails: "1",
      })}`,
      12_000,
    );
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  return placeFrom(data as NomItem);
}

function placeFrom(item: NomItem | undefined): Place | null {
  if (!item?.lat || !item.lon) return null;
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const address = item.address ?? {};
  const city =
    address.city || address.town || address.village || address.hamlet || address.municipality || "Nearby";
  const regionFull = address.state ?? "";
  const region = STATE[regionFull.toLowerCase()] ?? regionFull;
  const postal = address.postcode?.match(/\d{5}/)?.[0] ?? "";
  const label = [city, region, postal].filter(Boolean).join(", ").replace(", ", ", ");
  const pretty = postal ? `${city}${region ? `, ${region}` : ""} ${postal}` : `${city}${region ? `, ${region}` : ""}`;
  return { label: pretty || label, city, region, postal, lat, lon };
}

async function loadStores(place: Place, radiusMi: number, chainIds: string[]): Promise<Store[]> {
  const box = viewBox(place.lat, place.lon, radiusMi);
  const base = await nominatim({
    q: "supermarket",
    limit: "30",
    bounded: "1",
    viewbox: box,
  });
  let stores = base.map((item) => toStore(item, place)).filter((s): s is Store => !!s);

  const have = new Set(stores.map((s) => s.chainKey));
  const priority = [
    "walmart",
    "target",
    "aldi",
    "hyvee",
    "fareway",
    "costco",
    "sams",
    "kroger",
    "dollargeneral",
    "familydollar",
    "lewis",
    "kwikstar",
  ];
  const missing = chainIds
    .filter((id) => !have.has(id))
    .sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      return (ai === -1 ? 50 : ai) - (bi === -1 ? 50 : bi);
    });
  const lookups = [...new Set([...PINNED.filter((id) => !have.has(id)), ...missing])].slice(0, 4);
  if (lookups.length && Date.now() >= nominatimDownUntil) {
    const extras = await Promise.all(
      lookups.map(async (id) => {
        const chain = chainById(id);
        if (!chain) return [] as NomItem[];
        return nominatim({
          q: chain.label,
          limit: id === "kwikstar" ? "8" : "5",
          bounded: "1",
          viewbox: box,
        }).catch(() => [] as NomItem[]);
      }),
    );
    for (const hit of extras.flat()) {
      const store = toStore(hit, place);
      if (store) stores.push(store);
    }
  }

  const seen = new Set<string>();
  stores = stores
    .filter((store) => store.distanceMi <= radiusMi * 1.05)
    .filter((store) => {
      const id = store.id;
      if (seen.has(id)) return false;
      seen.add(id);
      const near = `${store.chainKey}:${store.lat.toFixed(3)}:${store.lon.toFixed(3)}`;
      if (seen.has(near)) return false;
      seen.add(near);
      return true;
    })
    .sort((a, b) => {
      const aHit = chainIds.includes(a.chainKey) || PINNED.includes(a.chainKey) ? 0 : 1;
      const bHit = chainIds.includes(b.chainKey) || PINNED.includes(b.chainKey) ? 0 : 1;
      return aHit - bHit || a.distanceMi - b.distanceMi;
    });
  const clubs = stores.filter((store) => PINNED.includes(store.chainKey));
  const rest = stores.filter((store) => !PINNED.includes(store.chainKey));
  return [...clubs, ...rest].slice(0, 24);
}

function toStore(item: NomItem, place: Place): Store | null {
  const name = item.name?.trim();
  if (!name || !item.lat || !item.lon) return null;
  if (item.type && REJECT_TYPES.has(item.type)) return null;
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const chain = chainOf(name);
  const allowed =
    !item.type ||
    ["supermarket", "grocery", "greengrocer", "convenience", "department_store", "variety_store", "wholesale"].includes(
      item.type,
    ) ||
    !!chain;
  if (!allowed) return null;
  const road = item.address?.road;
  const num = item.address?.house_number;
  const street = [num, road].filter(Boolean).join(" ");
  return {
    id: item.osm_id ? `${item.osm_type ?? "n"}${item.osm_id}` : `${lat.toFixed(5)},${lon.toFixed(5)}`,
    name,
    chainKey: chainKeyOf(name),
    lat,
    lon,
    distanceMi: milesBetween(place.lat, place.lon, lat, lon),
    street,
  };
}

async function loadFlyerDeals(postal: string): Promise<Deal[]> {
  const index = await fetchJson(
    `https://backflipp.wishabi.com/flipp/flyers?${new URLSearchParams({
      locale: "en-us",
      postal_code: postal,
    })}`,
    12_000,
  );
  const flyers = asArray((index as { flyers?: unknown }).flyers)
    .map(asFlyer)
    .filter((f): f is Flyer & { id: number; merchant: string } => !!f.id && !!f.merchant);
  const picked = pickFlyers(flyers);
  const batches = await Promise.allSettled(picked.map((flyer) => loadFlyer(flyer)));
  const deals: Deal[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const deal of batch.value) {
      const key = `${deal.chainKey}|${normalizeName(deal.name)}|${deal.price.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deals.push(deal);
    }
  }
  return deals.slice(0, 320);
}

function pickFlyers(flyers: Array<Flyer & { id: number; merchant: string }>) {
  const now = Date.now() - 6 * 60 * 60 * 1000;
  const groups = new Map<string, Array<Flyer & { id: number; merchant: string }>>();
  for (const flyer of flyers) {
    const until = flyer.valid_to ? new Date(flyer.valid_to).getTime() : 0;
    if (until && until < now) continue;
    const known = chainOf(flyer.merchant);
    const groceryCat = (flyer.categories ?? []).includes("Groceries");
    if (!known && !groceryCat) continue;
    const key = chainKeyOf(flyer.merchant);
    const list = groups.get(key) ?? [];
    list.push(flyer);
    groups.set(key, list);
  }
  const best = [...groups.values()].map((list) => {
    return [...list].sort((a, b) => {
      const ag = (a.categories ?? []).includes("Groceries") ? 1 : 0;
      const bg = (b.categories ?? []).includes("Groceries") ? 1 : 0;
      if (ag !== bg) return bg - ag;
      return (b.valid_to ?? "").localeCompare(a.valid_to ?? "");
    })[0];
  });
  best.sort((a, b) => scoreFlyer(a) - scoreFlyer(b));
  const clubs = best.filter((flyer) => CLUBS.includes(chainKeyOf(flyer.merchant)));
  const rest = best.filter((flyer) => !CLUBS.includes(chainKeyOf(flyer.merchant)));
  return [...clubs, ...rest].slice(0, 10);
}

function scoreFlyer(flyer: Flyer) {
  const groceryCat = (flyer.categories ?? []).includes("Groceries") ? 0 : 2;
  const pure = chainOf(flyer.merchant ?? "")?.grocery === false ? 1 : 0;
  return groceryCat + pure;
}

async function loadFlyer(flyer: Flyer & { id: number; merchant: string }): Promise<Deal[]> {
  const data = await fetchJson(`https://backflipp.wishabi.com/flipp/flyers/${flyer.id}`, 12_000);
  const items = asArray((data as { items?: unknown }).items).map(asItem);
  const chain = chainOf(flyer.merchant);
  const groceryStore = chain ? chain.grocery : (flyer.categories ?? []).includes("Groceries");
  const parsed = items
    .map((item) => ({ item, price: parsePrice(item.price) }))
    .filter((row) => row.item.name && row.item.id && row.price != null) as Array<{
    item: FlyerItem & { id: number; name: string };
    price: number;
  }>;

  const kept = dropGlitchPrices(parsed).filter(({ item, price }) => {
    const name = cleanName(item.name);
    if (name.length < 3 || /^(pinterest|facebook|instagram|qr code|scan)$/i.test(name)) return false;
    if (isBlocked(name)) return false;
    const category = categorize(name);
    if (!groceryStore && category === "other") return false;
    return priceOk(price, name, category);
  });

  return diversify(
    kept.map(({ item, price }) => {
      const name = cleanName(item.name);
      const category: Category = categorize(name);
      return {
        id: `${flyer.id}-${item.id}`,
        name,
        merchant: chain?.label ?? flyer.merchant.trim(),
        chainKey: chainKeyOf(flyer.merchant),
        price,
        image: httpsUrl(item.cutout_image_url),
        validTo: item.valid_to || flyer.valid_to || "",
        category,
        distanceMi: null,
        storeId: null,
        flyerId: flyer.id,
      };
    }),
    40,
  );
}

function dropGlitchPrices<T extends { price: number }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.price.toFixed(2);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let mode = "";
  let modeN = 0;
  for (const [key, n] of counts) {
    if (n > modeN) {
      mode = key;
      modeN = n;
    }
  }
  const unique = counts.size;
  const share = rows.length ? modeN / rows.length : 0;
  const modePrice = Number(mode);
  if (unique <= 4 && share > 0.55 && modePrice <= 1.25) {
    return rows.filter((row) => row.price.toFixed(2) !== mode);
  }
  return rows;
}

function diversify(deals: Deal[], max: number) {
  if (deals.length <= max) return deals;
  const buckets = new Map<Category, Deal[]>();
  for (const deal of deals) {
    const list = buckets.get(deal.category) ?? [];
    list.push(deal);
    buckets.set(deal.category, list);
  }
  const keys = [...buckets.keys()];
  const out: Deal[] = [];
  let guard = 0;
  while (out.length < max && guard < max * 4) {
    let added = false;
    for (const key of keys) {
      const list = buckets.get(key);
      const next = list?.shift();
      if (!next) continue;
      out.push(next);
      added = true;
      if (out.length >= max) break;
    }
    if (!added) break;
    guard += 1;
  }
  return out;
}

let nominatimChain: Promise<void> = Promise.resolve();
let lastNominatim = 0;
let nominatimDownUntil = 0;

function paceNominatim() {
  const run = nominatimChain.then(async () => {
    const wait = 1100 - (Date.now() - lastNominatim);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatim = Date.now();
  });
  nominatimChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function nominatim(params: Record<string, string>): Promise<NomItem[]> {
  if (Date.now() < nominatimDownUntil) return [];
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "us",
    ...params,
  })}`;
  await paceNominatim();
  if (Date.now() < nominatimDownUntil) return [];
  try {
    const data = await fetchJson(url, 8_000);
    return asArray(data).filter((row): row is NomItem => !!row && typeof row === "object");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("429") || message.includes("abort")) nominatimDownUntil = Date.now() + 45_000;
    return [];
  }
}

async function fetchJson(url: string, ms: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function cached<T>(key: string, bucket: Map<string, CacheEntry<T>>, load: () => Promise<T>): Promise<T> {
  const hit = bucket.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = await load();
  if (value != null && !(Array.isArray(value) && value.length === 0 && key.startsWith("flyers:"))) {
    bucket.set(key, { at: Date.now(), value });
  }
  if (Array.isArray(value) ? value.length > 0 : value) bucket.set(key, { at: Date.now(), value });
  return value;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFlyer(value: unknown): Flyer {
  if (!value || typeof value !== "object") return {};
  const row = value as Flyer;
  return {
    id: typeof row.id === "number" ? row.id : undefined,
    merchant: typeof row.merchant === "string" ? row.merchant : undefined,
    categories: Array.isArray(row.categories) ? row.categories.filter((c) => typeof c === "string") : [],
    valid_to: typeof row.valid_to === "string" ? row.valid_to : undefined,
  };
}

function asItem(value: unknown): FlyerItem {
  if (!value || typeof value !== "object") return {};
  const row = value as FlyerItem;
  return {
    id: typeof row.id === "number" ? row.id : undefined,
    name: typeof row.name === "string" ? row.name : undefined,
    price: typeof row.price === "string" ? row.price : undefined,
    cutout_image_url: typeof row.cutout_image_url === "string" ? row.cutout_image_url : undefined,
    valid_to: typeof row.valid_to === "string" ? row.valid_to : undefined,
  };
}

function parsePrice(raw: string | undefined) {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, 140);
}

function httpsUrl(url?: string) {
  if (!url) return undefined;
  if (url.startsWith("http://")) return `https://${url.slice("http://".length)}`;
  return url;
}

async function loadFuel(place: Place, radiusMi: number): Promise<FuelBoard | undefined> {
  const code = place.region.trim().toUpperCase();
  const [snap, stations] = await Promise.all([
    cached(`aaa:v2:${code || "US"}`, gradeCache, () => loadAaa(place)).catch(() => null),
    cached(
      `fuel-stations:${place.lat.toFixed(2)}:${place.lon.toFixed(2)}:${radiusMi}`,
      stationCache,
      () => loadStations(place, radiusMi),
    ).catch(() => [] as FuelStation[]),
  ]);
  const grades = snap?.grades?.length ? snap.grades : await loadNationalGrades().catch(() => [] as FuelGrade[]);
  if (!grades.length && !stations.length) return undefined;
  return {
    grades,
    stations,
    areas: snap?.areas ?? [],
    area: snap?.area ?? "U.S.",
    asOf: snap?.asOf ?? "",
    stateRegular: snap?.stateRegular ?? null,
    nationalRegular: snap?.nationalRegular ?? null,
    source:
      snap?.source ??
      "U.S. pump average from fueleconomy.gov. Live station signs were not available.",
  };
}

type AaaSnap = {
  grades: FuelGrade[];
  areas: FuelArea[];
  area: string;
  asOf: string;
  stateRegular: number | null;
  nationalRegular: number | null;
  source: string;
};

async function loadAaa(place: Place): Promise<AaaSnap> {
  const code = place.region.trim().toUpperCase();
  const state = stateName(code);
  if (!state) throw new Error("No state for fuel prices");
  const html = await fetchText(`https://gasprices.aaa.com/?state=${code}`, 12_000);
  const lines = htmlLines(html);
  const asOf = html.match(/Price as of (\d{1,2}\/\d{1,2}\/\d{2})/)?.[1] ?? "";
  const national = dollarAfter(html, "National Average");
  const statePrices = pricesNear(lines, state, "average gas prices");
  const areas = metroPrices(lines);
  areas.sort((a, b) => a.regular - b.regular);
  const city = place.city.trim().toLowerCase();
  const local = areas.find((area) => area.name.toLowerCase() === city) ?? null;
  const best = areas[0] ?? null;
  const chosen = best ?? (statePrices ? { name: state, ...quad(statePrices) } : null);
  if (!chosen) throw new Error("AAA page had no prices");
  const grades = gradesFrom(chosen);
  const bestName = best?.name ?? chosen.name;
  const localNote =
    local && best && local.name !== best.name
      ? ` ${place.city} regular is ${moneyPlain(local.regular)}.`
      : "";
  return {
    grades,
    areas,
    area: bestName,
    asOf,
    stateRegular: statePrices ? round2(statePrices[0]) : null,
    nationalRegular: national,
    source: `AAA daily average${asOf ? ` as of ${asOf}` : ""}. Best regular in ${state} is ${bestName}.${localNote} Station signs can be lower.`,
  };
}

function gradesFrom(area: { regular: number; midgrade: number; premium: number; diesel: number }): FuelGrade[] {
  return [
    { id: "regular", label: "Regular", price: area.regular },
    { id: "midgrade", label: "Midgrade", price: area.midgrade },
    { id: "premium", label: "Premium", price: area.premium },
    { id: "diesel", label: "Diesel", price: area.diesel },
  ];
}

function quad(prices: number[]) {
  return {
    regular: round2(prices[0]),
    midgrade: round2(prices[1]),
    premium: round2(prices[2]),
    diesel: round2(prices[3]),
  };
}

function metroPrices(lines: string[]): FuelArea[] {
  const start = lines.findIndex((line) => line.toLowerCase() === "metro average prices");
  if (start < 0) return [];
  const areas: FuelArea[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === "State Gas Prices") break;
    if (lines[i + 1] !== "Regular") continue;
    const prices = pricesAfter(lines, i);
    if (!prices) continue;
    areas.push({ name: lines[i], ...quad(prices) });
  }
  return areas;
}

function pricesNear(lines: string[], heading: string, nextHint: string) {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] !== heading) continue;
    if (nextHint && !(lines[i + 1] ?? "").toLowerCase().includes(nextHint)) continue;
    return pricesAfter(lines, i);
  }
  return null;
}

function pricesAfter(lines: string[], start: number) {
  let i = start;
  const end = Math.min(lines.length, start + 14);
  while (i < end && lines[i] !== "Current Avg.") i += 1;
  if (lines[i] !== "Current Avg.") return null;
  const nums: number[] = [];
  for (let j = i + 1; j < lines.length && nums.length < 4; j += 1) {
    const match = lines[j].match(/^\$(\d+\.\d+)$/);
    if (!match) break;
    nums.push(Number(match[1]));
  }
  return nums.length === 4 ? nums : null;
}

function dollarAfter(html: string, label: string) {
  const match = html.match(new RegExp(`${label}[\\s\\S]{0,80}\\$(\\d+\\.\\d+)`));
  if (!match) return null;
  const price = Number(match[1]);
  return Number.isFinite(price) ? round2(price) : null;
}

function htmlLines(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/&/g, "&")
        .replace(/&#187;|&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function stateName(code: string) {
  const found = Object.entries(STATE).find(([, abbr]) => abbr === code);
  if (!found) return "";
  return found[0].replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).replace(/\bOf\b/g, "of");
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function moneyPlain(n: number) {
  return `$${n.toFixed(2)}`;
}

async function loadNationalGrades(): Promise<FuelGrade[]> {
  const data = await fetchJson("https://www.fueleconomy.gov/ws/rest/fuelprices", 8_000);
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const spec = [
    ["regular", "Regular"],
    ["midgrade", "Midgrade"],
    ["premium", "Premium"],
    ["diesel", "Diesel"],
  ] as const;
  return spec.flatMap(([id, label]) => {
    const price = Number(row[id]);
    if (!Number.isFinite(price) || price <= 0.5 || price > 15) return [];
    return [{ id, label, price: round2(price) }];
  });
}

async function fetchText(url: string, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "text/html", "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function loadStations(place: Place, radiusMi: number): Promise<FuelStation[]> {
  const rows = await nominatim({
    q: "fuel",
    limit: "12",
    bounded: "1",
    viewbox: viewBox(place.lat, place.lon, radiusMi),
  });
  const seen = new Set<string>();
  const stations: FuelStation[] = [];
  for (const item of rows) {
    if (item.type && item.type !== "fuel") continue;
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distanceMi = milesBetween(place.lat, place.lon, lat, lon);
    if (distanceMi > radiusMi * 1.05) continue;
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const street = [item.address?.house_number, item.address?.road].filter(Boolean).join(" ");
    stations.push({
      id: item.osm_id ? `fuel-${item.osm_id}` : key,
      name: item.name?.trim() || "Fuel station",
      lat,
      lon,
      distanceMi,
      street,
    });
  }
  return stations.sort((a, b) => a.distanceMi - b.distanceMi).slice(0, 5);
}

function viewBox(lat: number, lon: number, radiusMi: number) {
  const dLat = radiusMi / 69;
  const dLon = radiusMi / (69 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const left = lon - dLon;
  const top = lat + dLat;
  const right = lon + dLon;
  const bottom = lat - dLat;
  return `${left},${top},${right},${bottom}`;
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
