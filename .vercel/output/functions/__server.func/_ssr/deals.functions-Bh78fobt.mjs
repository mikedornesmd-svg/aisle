import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { a as chainKeyOf, d as milesBetween, i as chainById, l as isBlocked, m as priceOk, o as chainOf, p as normalizeName, r as categorize } from "./deals-CrQ2gBAn.mjs";
import { i as string, n as number, r as object } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/deals.functions-Bh78fobt.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var UA = "AisleGrocery/1.0 (nearby grocery sales; +https://grok.com)";
var TTL = 9e5;
var placeCache = /* @__PURE__ */ new Map();
var flyerCache = /* @__PURE__ */ new Map();
var storeCache = /* @__PURE__ */ new Map();
var STATE = {
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
	"district of columbia": "DC"
};
var REJECT_TYPES = /* @__PURE__ */ new Set([
	"pharmacy",
	"fuel",
	"bank",
	"atm",
	"restaurant",
	"fast_food",
	"cafe",
	"clothes",
	"hairdresser"
]);
async function loadDeals(input) {
	const radiusMi = clamp(input.radiusMi ?? 8, 1, 30);
	try {
		const place = await resolvePlace(input);
		if (!place) return {
			ok: false,
			error: "Couldn't find that place. Try a 5-digit ZIP or a city name."
		};
		if (!/^\d{5}$/.test(place.postal)) return {
			ok: false,
			error: "Weekly circulars need a U.S. ZIP. Try 57104 or a city like Chicago."
		};
		let dealsRaw = [];
		let stores = [];
		let flyerFailed = false;
		let storeFailed = false;
		try {
			dealsRaw = await cached(`flyers:${place.postal}`, flyerCache, () => loadFlyerDeals(place.postal));
		} catch (error) {
			flyerFailed = true;
			console.error(error);
		}
		const chainIds = [...new Set(dealsRaw.map((deal) => deal.chainKey))];
		try {
			stores = await cached(`stores:${place.lat.toFixed(2)}:${place.lon.toFixed(2)}:${radiusMi}:${chainIds.slice().sort().join(",")}`, storeCache, () => loadStores(place, radiusMi, chainIds));
		} catch (error) {
			storeFailed = true;
			console.error(error);
		}
		if (flyerFailed && storeFailed) return {
			ok: false,
			error: "Store listings are busy. Try again in a moment."
		};
		const deals = attachStores(dealsRaw, stores);
		const note = deals.length === 0 ? "No grocery ads came back for this ZIP right now." : stores.length === 0 ? "Ads loaded, but nearby store pins didn't. Distances are hidden." : void 0;
		return {
			ok: true,
			place,
			stores,
			deals,
			radiusMi,
			note
		};
	} catch (error) {
		console.error(error);
		return {
			ok: false,
			error: "Store listings are busy. Try again in a moment."
		};
	}
}
function attachStores(deals, stores) {
	return deals.map((deal) => {
		let nearest = null;
		for (const store of stores) {
			if (store.chainKey !== deal.chainKey) continue;
			if (!nearest || store.distanceMi < nearest.distanceMi) nearest = store;
		}
		if (!nearest) return {
			...deal,
			distanceMi: null,
			storeId: null
		};
		return {
			...deal,
			distanceMi: nearest.distanceMi,
			storeId: nearest.id
		};
	});
}
async function resolvePlace(input) {
	const query = input.query?.trim();
	if (query) {
		const key = `q:${query.toLowerCase()}`;
		const hit = placeCache.get(key);
		if (hit && Date.now() - hit.at < TTL) return hit.value;
		let place = placeFrom((await nominatim({
			q: query,
			limit: "1"
		}))[0]);
		if (place && !place.postal) place = await reverse(place.lat, place.lon) ?? place;
		if (place?.postal) placeCache.set(key, {
			at: Date.now(),
			value: place
		});
		return place;
	}
	if (typeof input.lat === "number" && typeof input.lon === "number") {
		const key = `ll:${input.lat.toFixed(3)}:${input.lon.toFixed(3)}`;
		const hit = placeCache.get(key);
		if (hit && Date.now() - hit.at < TTL) return hit.value;
		const place = await reverse(input.lat, input.lon);
		if (place?.postal) placeCache.set(key, {
			at: Date.now(),
			value: place
		});
		return place;
	}
	return null;
}
async function reverse(lat, lon) {
	const data = await fetchJson(`https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({
		format: "jsonv2",
		lat: String(lat),
		lon: String(lon),
		addressdetails: "1"
	})}`, 12e3);
	if (!data || typeof data !== "object") return null;
	return placeFrom(data);
}
function placeFrom(item) {
	if (!item?.lat || !item.lon) return null;
	const lat = Number(item.lat);
	const lon = Number(item.lon);
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	const address = item.address ?? {};
	const city = address.city || address.town || address.village || address.hamlet || address.municipality || "Nearby";
	const regionFull = address.state ?? "";
	const region = STATE[regionFull.toLowerCase()] ?? regionFull;
	const postal = address.postcode?.match(/\d{5}/)?.[0] ?? "";
	const label = [
		city,
		region,
		postal
	].filter(Boolean).join(", ").replace(", ", ", ");
	return {
		label: (postal ? `${city}${region ? `, ${region}` : ""} ${postal}` : `${city}${region ? `, ${region}` : ""}`) || label,
		city,
		region,
		postal,
		lat,
		lon
	};
}
async function loadStores(place, radiusMi, chainIds) {
	const box = viewBox(place.lat, place.lon, radiusMi);
	let stores = (await nominatim({
		q: "supermarket",
		limit: "30",
		bounded: "1",
		viewbox: box
	})).map((item) => toStore(item, place)).filter((s) => !!s);
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
		"lewis"
	];
	const missing = chainIds.filter((id) => !have.has(id)).sort((a, b) => {
		const ai = priority.indexOf(a);
		const bi = priority.indexOf(b);
		return (ai === -1 ? 50 : ai) - (bi === -1 ? 50 : bi);
	}).slice(0, 8);
	if (missing.length) {
		const extras = await Promise.all(missing.map(async (id) => {
			const chain = chainById(id);
			if (!chain) return [];
			return nominatim({
				q: chain.label,
				limit: "5",
				bounded: "1",
				viewbox: box
			}).catch(() => []);
		}));
		for (const hit of extras.flat()) {
			const store = toStore(hit, place);
			if (store) stores.push(store);
		}
	}
	const seen = /* @__PURE__ */ new Set();
	stores = stores.filter((store) => store.distanceMi <= radiusMi * 1.05).filter((store) => {
		const id = store.id;
		if (seen.has(id)) return false;
		seen.add(id);
		const near = `${store.chainKey}:${store.lat.toFixed(3)}:${store.lon.toFixed(3)}`;
		if (seen.has(near)) return false;
		seen.add(near);
		return true;
	}).sort((a, b) => {
		return (chainIds.includes(a.chainKey) ? 0 : 1) - (chainIds.includes(b.chainKey) ? 0 : 1) || a.distanceMi - b.distanceMi;
	}).slice(0, 24);
	return stores;
}
function toStore(item, place) {
	const name = item.name?.trim();
	if (!name || !item.lat || !item.lon) return null;
	if (item.type && REJECT_TYPES.has(item.type)) return null;
	const lat = Number(item.lat);
	const lon = Number(item.lon);
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	const chain = chainOf(name);
	if (!(!item.type || [
		"supermarket",
		"grocery",
		"greengrocer",
		"convenience",
		"department_store",
		"variety_store",
		"wholesale"
	].includes(item.type) || !!chain)) return null;
	const road = item.address?.road;
	const street = [item.address?.house_number, road].filter(Boolean).join(" ");
	return {
		id: item.osm_id ? `${item.osm_type ?? "n"}${item.osm_id}` : `${lat.toFixed(5)},${lon.toFixed(5)}`,
		name,
		chainKey: chainKeyOf(name),
		lat,
		lon,
		distanceMi: milesBetween(place.lat, place.lon, lat, lon),
		street
	};
}
async function loadFlyerDeals(postal) {
	const picked = pickFlyers(asArray((await fetchJson(`https://backflipp.wishabi.com/flipp/flyers?${new URLSearchParams({
		locale: "en-us",
		postal_code: postal
	})}`, 12e3)).flyers).map(asFlyer).filter((f) => !!f.id && !!f.merchant)).slice(0, 8);
	const batches = await Promise.allSettled(picked.map((flyer) => loadFlyer(flyer)));
	const deals = [];
	const seen = /* @__PURE__ */ new Set();
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
function pickFlyers(flyers) {
	const now = Date.now() - 216e5;
	const groups = /* @__PURE__ */ new Map();
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
	return best;
}
function scoreFlyer(flyer) {
	return ((flyer.categories ?? []).includes("Groceries") ? 0 : 2) + (chainOf(flyer.merchant ?? "")?.grocery === false ? 1 : 0);
}
async function loadFlyer(flyer) {
	const items = asArray((await fetchJson(`https://backflipp.wishabi.com/flipp/flyers/${flyer.id}`, 12e3)).items).map(asItem);
	const chain = chainOf(flyer.merchant);
	const groceryStore = chain ? chain.grocery : (flyer.categories ?? []).includes("Groceries");
	return diversify(dropGlitchPrices(items.map((item) => ({
		item,
		price: parsePrice(item.price)
	})).filter((row) => row.item.name && row.item.id && row.price != null)).filter(({ item, price }) => {
		const name = cleanName(item.name);
		if (name.length < 3 || /^(pinterest|facebook|instagram|qr code|scan)$/i.test(name)) return false;
		if (isBlocked(name)) return false;
		const category = categorize(name);
		if (!groceryStore && category === "other") return false;
		return priceOk(price, name, category);
	}).map(({ item, price }) => {
		const name = cleanName(item.name);
		const category = categorize(name);
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
			storeId: null
		};
	}), 40);
}
function dropGlitchPrices(rows) {
	const counts = /* @__PURE__ */ new Map();
	for (const row of rows) {
		const key = row.price.toFixed(2);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	let mode = "";
	let modeN = 0;
	for (const [key, n] of counts) if (n > modeN) {
		mode = key;
		modeN = n;
	}
	const unique = counts.size;
	const share = rows.length ? modeN / rows.length : 0;
	const modePrice = Number(mode);
	if (unique <= 4 && share > .55 && modePrice <= 1.25) return rows.filter((row) => row.price.toFixed(2) !== mode);
	return rows;
}
function diversify(deals, max) {
	if (deals.length <= max) return deals;
	const buckets = /* @__PURE__ */ new Map();
	for (const deal of deals) {
		const list = buckets.get(deal.category) ?? [];
		list.push(deal);
		buckets.set(deal.category, list);
	}
	const keys = [...buckets.keys()];
	const out = [];
	let guard = 0;
	while (out.length < max && guard < max * 4) {
		let added = false;
		for (const key of keys) {
			const next = buckets.get(key)?.shift();
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
async function nominatim(params) {
	return asArray(await fetchJson(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({
		format: "jsonv2",
		addressdetails: "1",
		countrycodes: "us",
		...params
	})}`, 12e3)).filter((row) => !!row && typeof row === "object");
}
async function fetchJson(url, ms) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	try {
		const res = await fetch(url, {
			signal: ctrl.signal,
			headers: {
				Accept: "application/json",
				"User-Agent": UA
			}
		});
		if (!res.ok) throw new Error(`Request failed (${res.status})`);
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}
async function cached(key, bucket, load) {
	const hit = bucket.get(key);
	if (hit && Date.now() - hit.at < TTL) return hit.value;
	const value = await load();
	if (value != null && !(Array.isArray(value) && value.length === 0 && key.startsWith("flyers:"))) bucket.set(key, {
		at: Date.now(),
		value
	});
	if (Array.isArray(value) ? value.length > 0 : value) bucket.set(key, {
		at: Date.now(),
		value
	});
	return value;
}
function asArray(value) {
	return Array.isArray(value) ? value : [];
}
function asFlyer(value) {
	if (!value || typeof value !== "object") return {};
	const row = value;
	return {
		id: typeof row.id === "number" ? row.id : void 0,
		merchant: typeof row.merchant === "string" ? row.merchant : void 0,
		categories: Array.isArray(row.categories) ? row.categories.filter((c) => typeof c === "string") : [],
		valid_to: typeof row.valid_to === "string" ? row.valid_to : void 0
	};
}
function asItem(value) {
	if (!value || typeof value !== "object") return {};
	const row = value;
	return {
		id: typeof row.id === "number" ? row.id : void 0,
		name: typeof row.name === "string" ? row.name : void 0,
		price: typeof row.price === "string" ? row.price : void 0,
		cutout_image_url: typeof row.cutout_image_url === "string" ? row.cutout_image_url : void 0,
		valid_to: typeof row.valid_to === "string" ? row.valid_to : void 0
	};
}
function parsePrice(raw) {
	if (!raw) return null;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return null;
	return Math.round(n * 100) / 100;
}
function cleanName(name) {
	return name.replace(/\s+/g, " ").trim().slice(0, 140);
}
function httpsUrl(url) {
	if (!url) return void 0;
	if (url.startsWith("http://")) return `https://${url.slice(7)}`;
	return url;
}
function viewBox(lat, lon, radiusMi) {
	const dLat = radiusMi / 69;
	const dLon = radiusMi / (69 * Math.max(.2, Math.cos(lat * Math.PI / 180)));
	return `${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}`;
}
function clamp(n, min, max) {
	if (!Number.isFinite(n)) return min;
	return Math.min(max, Math.max(min, n));
}
var Input = object({
	query: string().trim().max(80).optional(),
	lat: number().min(-90).max(90).optional(),
	lon: number().min(-180).max(180).optional(),
	radiusMi: number().min(1).max(30).optional()
});
var getNearbyDeals_createServerFn_handler = createServerRpc({
	id: "08828e9168eb79ff0b6cc7d3cadb606cdb6a8b068106a9c1540726f5b4ad50f4",
	name: "getNearbyDeals",
	filename: "src/lib/deals.functions.ts"
}, (opts) => getNearbyDeals.__executeServer(opts));
var getNearbyDeals = createServerFn({ method: "POST" }).validator((input) => {
	const parsed = Input.safeParse(input);
	if (!parsed.success) throw new Error("Enter a ZIP code or city.");
	const data = parsed.data;
	if (!data.query && (data.lat == null || data.lon == null)) throw new Error("Enter a ZIP code or city, or use your location.");
	return data;
}).handler(getNearbyDeals_createServerFn_handler, async ({ data }) => loadDeals(data));
//#endregion
export { getNearbyDeals_createServerFn_handler };
