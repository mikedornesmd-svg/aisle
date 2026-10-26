export type Category =
  | "produce"
  | "dairy"
  | "meat"
  | "bakery"
  | "pantry"
  | "frozen"
  | "drinks"
  | "household"
  | "pets"
  | "other";

export type Place = {
  label: string;
  city: string;
  region: string;
  postal: string;
  lat: number;
  lon: number;
};

export type Store = {
  id: string;
  name: string;
  chainKey: string;
  lat: number;
  lon: number;
  distanceMi: number;
  street: string;
};

export type Deal = {
  id: string;
  name: string;
  merchant: string;
  chainKey: string;
  price: number;
  image?: string;
  validTo: string;
  category: Category;
  distanceMi: number | null;
  storeId: string | null;
  flyerId: number;
};

export type DealsOk = {
  ok: true;
  place: Place;
  stores: Store[];
  deals: Deal[];
  radiusMi: number;
  fuel?: FuelBoard;
  note?: string;
};

export type FuelGrade = {
  id: "regular" | "midgrade" | "premium" | "diesel";
  label: string;
  price: number;
};

export type FuelStation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMi: number;
  street: string;
};

export type FuelArea = {
  name: string;
  regular: number;
  midgrade: number;
  premium: number;
  diesel: number;
};

export type FuelBoard = {
  grades: FuelGrade[];
  stations: FuelStation[];
  areas: FuelArea[];
  area: string;
  asOf: string;
  stateRegular: number | null;
  nationalRegular: number | null;
  source: string;
};

export type DealsResult = DealsOk | { ok: false; error: string };

export type DealQuery = {
  query?: string;
  lat?: number;
  lon?: number;
  radiusMi?: number;
};

export const CATEGORY_LABEL: Record<Category, string> = {
  produce: "Produce",
  dairy: "Dairy & eggs",
  meat: "Meat & seafood",
  bakery: "Bakery",
  pantry: "Pantry",
  frozen: "Frozen",
  drinks: "Drinks",
  household: "Household",
  pets: "Pets",
  other: "More",
};

export const FILTERS: Array<Category | "all"> = [
  "all",
  "produce",
  "dairy",
  "meat",
  "bakery",
  "pantry",
  "frozen",
  "drinks",
  "household",
  "pets",
  "other",
];

const CATEGORY_WORDS: Array<{ id: Category; words: string[] }> = [
  {
    id: "pets",
    words: ["dog food", "cat food", "pet food", "kibble", "litter", "dog treat", "cat treat", "puppy food"],
  },
  {
    id: "household",
    words: [
      "detergent",
      "paper towel",
      "bath tissue",
      "toilet paper",
      "tissue",
      "soap",
      "shampoo",
      "toothpaste",
      "diaper",
      "laundry",
      "dish",
      "trash bag",
      "foil",
      "bleach",
      "cleaner",
      "wipe",
      "softener",
      "sponge",
      "napkin",
      "shaving",
      "deodorant",
    ],
  },
  {
    id: "frozen",
    words: ["frozen", "ice cream", "popsicle", "gelato"],
  },
  {
    id: "drinks",
    words: [
      "juice",
      "soda",
      "water",
      "coffee",
      "tea",
      "kcup",
      "k-cup",
      "cola",
      "seltzer",
      "lemonade",
      "energy drink",
    ],
  },
  {
    id: "dairy",
    words: ["milk", "cheese", "yogurt", "butter", "cream", "egg", "kefir", "cottage"],
  },
  {
    id: "meat",
    words: [
      "chicken",
      "beef",
      "pork",
      "bacon",
      "sausage",
      "turkey",
      "steak",
      "ground",
      "salmon",
      "shrimp",
      "fish",
      "lamb",
      "ham",
      "roast",
      "wing",
      "drumstick",
      "brisket",
      "burger",
      "meatball",
      "meat",
      "tuna",
      "cod",
      "tilapia",
      "crab",
    ],
  },
  {
    id: "produce",
    words: [
      "banana",
      "apple",
      "lettuce",
      "tomato",
      "onion",
      "potato",
      "berry",
      "berries",
      "grape",
      "avocado",
      "broccoli",
      "carrot",
      "fruit",
      "salad",
      "celery",
      "spinach",
      "kale",
      "mushroom",
      "lemon",
      "lime",
      "orange",
      "peach",
      "pear",
      "melon",
      "cucumber",
      "pepper",
      "corn",
      "herb",
    ],
  },
  {
    id: "bakery",
    words: ["bread", "bagel", "muffin", "bun", "roll", "loaf", "croissant", "donut", "doughnut", "cake", "tortilla", "pie", "baguette", "flatbread", "pita", "naan", "biscuit", "waffle"],
  },
  {
    id: "pantry",
    words: [
      "cereal",
      "pasta",
      "rice",
      "bean",
      "soup",
      "chip",
      "snack",
      "sauce",
      "candy",
      "chocolate",
      "cookie",
      "cracker",
      "oat",
      "granola",
      "oil",
      "sugar",
      "flour",
      "peanut",
      "noodle",
      "ramen",
      "salsa",
      "canned",
      "broth",
      "ketchup",
      "mayo",
      "spice",
      "honey",
      "jam",
      "syrup",
      "pizza",
    ],
  },
];

const BLOCK =
  /\b(sofa|loveseat|mattress|dresser|furniture|recliner|television|\btv\b|laptop|iphone|ipad|macbook|playstation|xbox|costume|vacuum|lego|bicycle|\bbike\b|tablet|monitor|headphone|speaker|camera|printer|drill|air fryer|instant pot|tablecloth|wreath|ornament|inflatable|skeleton|comforter|sheet set|pillow|curtain|\brug\b|lamp|vase|scratcher|puffer|polo|jean|sneaker)\b/i;

export function categorize(name: string): Category {
  const n = name.toLowerCase();
  if (/\bsoup\b/.test(n)) return "pantry";
  for (const cat of CATEGORY_WORDS) {
    if (cat.words.some((word) => wordHit(n, word))) return cat.id;
  }
  return "other";
}

function wordHit(name: string, word: string) {
  if (word.includes(" ")) return name.includes(word);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}s?\\b`, "i").test(name);
}

export function isBlocked(name: string) {
  return BLOCK.test(name);
}

export function matchesTerm(name: string, term: string): boolean {
  const t = term.toLowerCase().trim();
  if (t.length < 2) return false;
  const words = t.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length >= 2) return words.every((word) => matchesTerm(name, word));
  const forms = new Set<string>([t]);
  if (t.endsWith("es") && t.length > 4) forms.add(t.slice(0, -2));
  if (t.endsWith("s") && t.length > 3) forms.add(t.slice(0, -1));
  else forms.add(`${t}s`);
  for (const form of forms) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(name)) return true;
  }
  return false;
}

export function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function endsLabel(iso: string) {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return "This week";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = Math.round((startEnd.getTime() - startToday.getTime()) / 86_400_000);
  if (diff < 0) return "Ended";
  if (diff === 0) return "Ends today";
  if (diff === 1) return "Ends tomorrow";
  return `Ends ${end.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
}

export function milesBetween(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const earth = 3958.8;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatMiles(n: number) {
  if (n < 0.1) return "Under 0.1 mi";
  return `${n.toFixed(n < 10 ? 1 : 0)} mi`;
}

type Chain = { key: string; label: string; grocery: boolean };

const CHAINS: Chain[] = [
  { key: "trader joe", label: "Trader Joe's", grocery: true },
  { key: "whole foods", label: "Whole Foods", grocery: true },
  { key: "dollar general", label: "Dollar General", grocery: false },
  { key: "family dollar", label: "Family Dollar", grocery: false },
  { key: "dollar tree", label: "Dollar Tree", grocery: false },
  { key: "sam s club", label: "Sam's Club", grocery: false },
  { key: "sams club", label: "Sam's Club", grocery: false },
  { key: "natural grocers", label: "Natural Grocers", grocery: true },
  { key: "grocery outlet", label: "Grocery Outlet", grocery: true },
  { key: "save a lot", label: "Save A Lot", grocery: true },
  { key: "food lion", label: "Food Lion", grocery: true },
  { key: "trader joes", label: "Trader Joe's", grocery: true },
  { key: "hy vee", label: "Hy-Vee", grocery: true },
  { key: "hyvee", label: "Hy-Vee", grocery: true },
  { key: "aldi", label: "Aldi", grocery: true },
  { key: "walmart", label: "Walmart", grocery: false },
  { key: "wal mart", label: "Walmart", grocery: false },
  { key: "target", label: "Target", grocery: false },
  { key: "costco", label: "Costco", grocery: false },
  { key: "fareway", label: "Fareway", grocery: true },
  { key: "kroger", label: "Kroger", grocery: true },
  { key: "publix", label: "Publix", grocery: true },
  { key: "safeway", label: "Safeway", grocery: true },
  { key: "albertsons", label: "Albertsons", grocery: true },
  { key: "meijer", label: "Meijer", grocery: true },
  { key: "winco", label: "WinCo", grocery: true },
  { key: "sprouts", label: "Sprouts", grocery: true },
  { key: "wegmans", label: "Wegmans", grocery: true },
  { key: "schnucks", label: "Schnucks", grocery: true },
  { key: "lidl", label: "Lidl", grocery: true },
  { key: "heb", label: "H-E-B", grocery: true },
  { key: "h e b", label: "H-E-B", grocery: true },
  { key: "lewis drug", label: "Lewis Drug", grocery: false },
  { key: "lewis", label: "Lewis Drug", grocery: false },
  { key: "fresh market", label: "The Fresh Market", grocery: true },
  { key: "fresh thyme", label: "Fresh Thyme", grocery: true },
  { key: "piggly wiggly", label: "Piggly Wiggly", grocery: true },
  { key: "shoprite", label: "ShopRite", grocery: true },
  { key: "stop and shop", label: "Stop & Shop", grocery: true },
  { key: "hannaford", label: "Hannaford", grocery: true },
  { key: "price chopper", label: "Price Chopper", grocery: true },
  { key: "market basket", label: "Market Basket", grocery: true },
  { key: "giant eagle", label: "Giant Eagle", grocery: true },
  { key: "king soopers", label: "King Soopers", grocery: true },
  { key: "fred meyer", label: "Fred Meyer", grocery: true },
  { key: "harris teeter", label: "Harris Teeter", grocery: true },
  { key: "food city", label: "Food City", grocery: true },
  { key: "cub foods", label: "Cub", grocery: true },
  { key: "cub", label: "Cub", grocery: true },
  { key: "jewel osco", label: "Jewel-Osco", grocery: true },
  { key: "smart and final", label: "Smart & Final", grocery: true },
  { key: "smart final", label: "Smart & Final", grocery: true },
  { key: "bj s", label: "BJ's", grocery: false },
  { key: "bjs", label: "BJ's", grocery: false },
  { key: "sunshine foods", label: "Sunshine Foods", grocery: true },
  { key: "cash wise", label: "Cash Wise", grocery: true },
  { key: "kwik star", label: "Kwik Star", grocery: false },
  { key: "kwik trip", label: "Kwik Trip", grocery: false },
];

export function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function chainOf(name: string): Chain | null {
  const n = normalizeName(name);
  const ordered = [...CHAINS].sort((a, b) => b.key.length - a.key.length);
  for (const chain of ordered) {
    const key = chain.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^| )${key}(?: |$)`).test(n)) return chain;
  }
  return null;
}

const CANONICAL: Record<string, string> = {
  "trader joe": "traderjoes",
  "trader joes": "traderjoes",
  "hy vee": "hyvee",
  hyvee: "hyvee",
  "lewis drug": "lewis",
  lewis: "lewis",
  "sam s club": "sams",
  "sams club": "sams",
  "h e b": "heb",
  heb: "heb",
  "dollar general": "dollargeneral",
  "family dollar": "familydollar",
  "dollar tree": "dollartree",
  "whole foods": "wholefoods",
  "stop and shop": "stopshop",
  "cub foods": "cub",
  cub: "cub",
  "wal mart": "walmart",
  walmart: "walmart",
  "bj s": "bjs",
  bjs: "bjs",
  "smart and final": "smartfinal",
  "smart final": "smartfinal",
  "fresh market": "freshmarket",
  "fresh thyme": "freshthyme",
  "piggly wiggly": "piggly",
  "price chopper": "pricechopper",
  "market basket": "marketbasket",
  "giant eagle": "gianteagle",
  "king soopers": "kingsoopers",
  "fred meyer": "fredmeyer",
  "harris teeter": "harristeeter",
  "food city": "foodcity",
  "food lion": "foodlion",
  "save a lot": "savealot",
  "grocery outlet": "groceryoutlet",
  "natural grocers": "naturalgrocers",
  "jewel osco": "jewel",
  "sunshine foods": "sunshine",
  "cash wise": "cashwise",
  "shop rite": "shoprite",
  "kwik star": "kwikstar",
  "kwik trip": "kwikstar",
};

export function chainKeyOf(name: string) {
  const chain = chainOf(name);
  if (!chain) return normalizeName(name);
  return CANONICAL[chain.key] ?? chain.key.replace(/ /g, "");
}

export function bulkScore(name: string) {
  const n = name.toLowerCase();
  let score = 0;
  if (/\b(bulk|club|family|value pack|party|mega|jumbo|warehouse|economy)\b/.test(n)) score += 40;
  const pack = n.match(/(\d{1,3})\s*-?\s*(?:pk|pack|packs|ct|count)\b/);
  if (pack) score += Math.min(80, Number(pack[1]) * 4);
  const lb = n.match(/(\d+(?:\.\d+)?)\s*-?\s*lbs?\b/);
  if (lb) score += Math.min(70, Number(lb[1]) * 8);
  const gal = n.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:gal|gallons)\b/);
  if (gal) score += Math.min(60, Number(gal[1]) * 24);
  const oz = n.match(/(\d+(?:\.\d+)?)\s*-?\s*oz\b/);
  if (oz) score += Math.min(36, Number(oz[1]) / 2);
  return score || 4;
}

export function chainById(id: string) {
  return CHAINS.find((chain) => chainKeyOf(chain.key) === id || chainKeyOf(chain.label) === id) ?? null;
}

const STORE_LINKS: Record<string, { ad: string; events?: string }> = {
  hyvee: { ad: "https://www.hy-vee.com/deals" },
  aldi: { ad: "https://www.aldi.us/weekly-specials/this-weeks-aldi-finds/" },
  walmart: { ad: "https://www.walmart.com/shop/deals" },
  target: { ad: "https://www.target.com/weekly-ad" },
  dollargeneral: { ad: "https://www.dollargeneral.com/deals/weekly-ads" },
  familydollar: { ad: "https://www.familydollar.com/weekly-ads" },
  fareway: { ad: "https://www.fareway.com/stores" },
  costco: { ad: "https://www.costco.com/o/-/warehouse-savings" },
  sams: { ad: "https://www.samsclub.com/savings" },
  kwikstar: { ad: "https://www.kwiktrip.com/savings" },
  lewis: { ad: "https://www.lewisdrug.com/weekly-ad", events: "https://www.lewisdrug.com/about/events" },
  publix: { ad: "https://www.publix.com/savings/weekly-ad" },
  wholefoods: { ad: "https://www.wholefoodsmarket.com/sales-flyer" },
  sprouts: { ad: "https://www.sprouts.com/weekly-ad/" },
  traderjoes: { ad: "https://www.traderjoes.com/home/products/category/fearless-flyer" },
  kroger: { ad: "https://www.kroger.com/weeklyad" },
  safeway: { ad: "https://www.safeway.com/weeklyad" },
  albertsons: { ad: "https://www.albertsons.com/weeklyad" },
  meijer: { ad: "https://www.meijer.com/shopping/weekly-ad.html" },
  winco: { ad: "https://www.wincofoods.com/winco-weekly-ad" },
  foodlion: { ad: "https://www.foodlion.com/weekly-ad" },
};

export function storeAd(chainKey: string) {
  return STORE_LINKS[chainKey] ?? null;
}

export function priceOk(price: number, name: string, category: Category) {
  if (price < 0.2 || price > 120) return false;
  if (price <= 40) return true;
  if (category === "household" && price <= 60) return true;
  if (/\b(pack|case|count|bulk|lb|variety|oz|roll)\b/i.test(name) && price <= 100) return true;
  return false;
}
