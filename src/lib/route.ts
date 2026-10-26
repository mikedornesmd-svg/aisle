import {
  CATEGORY_LABEL,
  type Category,
  type Deal,
  type FuelBoard,
  type FuelStation,
  type Place,
  type Store,
  categorize,
  matchesTerm,
  milesBetween,
} from "./deals";

const WALK: Category[] = [
  "produce",
  "bakery",
  "meat",
  "dairy",
  "pantry",
  "drinks",
  "frozen",
  "household",
  "pets",
  "other",
];

export type RouteItem = {
  name: string;
  aisle: string;
  price: number | null;
};

export type RouteStop = {
  id: string;
  kind: "store" | "fuel";
  name: string;
  street: string;
  lat: number;
  lon: number;
  distanceMi: number;
  legMi: number;
  items: RouteItem[];
};

export function orderedList(items: string[]) {
  return items
    .map((item, index) => ({ item, index, rank: WALK.indexOf(categorize(item)) }))
    .sort((a, b) => (a.rank < 0 ? 99 : a.rank) - (b.rank < 0 ? 99 : b.rank) || a.index - b.index)
    .map((row) => row.item);
}

export function planRoute(list: string[], deals: Deal[], stores: Store[], place: Place, fuel?: FuelBoard): RouteStop[] {
  const items = orderedList(list);
  const nearest = nearestByChain(stores);
  const groups: { store: Store; items: RouteItem[] }[] = [];
  let remaining = [...items];

  while (remaining.length && groups.length < 3) {
    let best: { store: Store; taken: string[] } | null = null;
    for (const store of nearest) {
      if (groups.some((group) => group.store.id === store.id)) continue;
      const taken = remaining.filter((item) => quote(item, store.chainKey, deals));
      if (!taken.length) continue;
      if (!best || taken.length > best.taken.length || (taken.length === best.taken.length && store.distanceMi < best.store.distanceMi)) {
        best = { store, taken };
      }
    }
    if (!best) break;
    groups.push({
      store: best.store,
      items: best.taken.map((name) => itemRow(name, best.store.chainKey, deals)),
    });
    const claimed = new Set(best.taken);
    remaining = remaining.filter((item) => !claimed.has(item));
  }

  if (remaining.length) {
    const host = groups[0] ?? (nearest[0] ? { store: nearest[0], items: [] } : null);
    if (host) {
      host.items.push(...remaining.map((name) => ({ name, aisle: aisleName(name), price: null })));
      if (!groups.length) groups.push(host);
    }
  }

  for (const group of groups) group.items = orderedRows(group.items);

  const ordered = nearestNeighbor(
    { lat: place.lat, lon: place.lon },
    groups.map((group) => ({
      id: group.store.id,
      kind: "store" as const,
      name: group.store.name,
      street: group.store.street,
      lat: group.store.lat,
      lon: group.store.lon,
      distanceMi: group.store.distanceMi,
      legMi: 0,
      items: group.items,
    })),
  );

  const station = fuel?.stations[0];
  const withFuel = station ? insertFuel({ lat: place.lat, lon: place.lon }, ordered, station, fuel) : ordered;
  return withLegs({ lat: place.lat, lon: place.lon }, withFuel);
}

export function mapsRoute(place: Place, stops: RouteStop[]) {
  if (!stops.length) return null;
  const last = stops[stops.length - 1];
  const via = stops.slice(0, -1);
  const params = new URLSearchParams({
    api: "1",
    origin: `${place.lat},${place.lon}`,
    destination: `${last.lat},${last.lon}`,
    travelmode: "driving",
  });
  if (via.length) params.set("waypoints", via.map((stop) => `${stop.lat},${stop.lon}`).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function nearestByChain(stores: Store[]) {
  const best = new Map<string, Store>();
  for (const store of [...stores].sort((a, b) => a.distanceMi - b.distanceMi)) {
    if (!best.has(store.chainKey)) best.set(store.chainKey, store);
  }
  return [...best.values()];
}

function quote(item: string, chainKey: string, deals: Deal[]) {
  let price: number | null = null;
  for (const deal of deals) {
    if (deal.chainKey !== chainKey || !matchesTerm(deal.name, item)) continue;
    if (price == null || deal.price < price) price = deal.price;
  }
  return price;
}

function itemRow(name: string, chainKey: string, deals: Deal[]): RouteItem {
  return { name, aisle: aisleName(name), price: quote(name, chainKey, deals) };
}

function aisleName(name: string) {
  return CATEGORY_LABEL[categorize(name)];
}

function orderedRows(items: RouteItem[]) {
  return orderedList(items.map((item) => item.name)).map((name) => items.find((item) => item.name === name)!);
}

function nearestNeighbor(origin: { lat: number; lon: number }, stops: RouteStop[]) {
  const left = [...stops];
  const out: RouteStop[] = [];
  let cursor = origin;
  while (left.length) {
    let pick = 0;
    let best = Infinity;
    for (let i = 0; i < left.length; i += 1) {
      const miles = milesBetween(cursor.lat, cursor.lon, left[i].lat, left[i].lon);
      if (miles < best) {
        best = miles;
        pick = i;
      }
    }
    const [next] = left.splice(pick, 1);
    out.push(next);
    cursor = next;
  }
  return out;
}

function insertFuel(
  origin: { lat: number; lon: number },
  stops: RouteStop[],
  station: FuelStation,
  fuel: FuelBoard | undefined,
): RouteStop[] {
  const regular = fuel?.grades.find((grade) => grade.id === "regular")?.price ?? null;
  const diesel = fuel?.grades.find((grade) => grade.id === "diesel")?.price ?? null;
  const fuelStop: RouteStop = {
    id: station.id,
    kind: "fuel",
    name: station.name,
    street: station.street,
    lat: station.lat,
    lon: station.lon,
    distanceMi: station.distanceMi,
    legMi: 0,
    items: [
      { name: "Regular", aisle: "Fuel", price: regular },
      { name: "Diesel", aisle: "Fuel", price: diesel },
    ],
  };
  let bestAt = stops.length;
  let bestExtra = Infinity;
  for (let i = 0; i <= stops.length; i += 1) {
    const prev = i === 0 ? origin : stops[i - 1];
    const next = stops[i];
    const direct = next ? milesBetween(prev.lat, prev.lon, next.lat, next.lon) : 0;
    const via =
      milesBetween(prev.lat, prev.lon, station.lat, station.lon) +
      (next ? milesBetween(station.lat, station.lon, next.lat, next.lon) : 0);
    const extra = via - direct;
    if (extra < bestExtra) {
      bestExtra = extra;
      bestAt = i;
    }
  }
  const next = [...stops];
  next.splice(bestAt, 0, fuelStop);
  return next;
}

function withLegs(origin: { lat: number; lon: number }, stops: RouteStop[]) {
  let prev = origin;
  return stops.map((stop) => {
    const legMi = milesBetween(prev.lat, prev.lon, stop.lat, stop.lon);
    prev = stop;
    return { ...stop, legMi };
  });
}
