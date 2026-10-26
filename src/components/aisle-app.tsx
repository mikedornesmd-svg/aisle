import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, MapPin, Mic, Plus, Search, X } from "lucide-react";
import { getNearbyDeals } from "@/lib/deals.functions";
import { mapsRoute, orderedList, planRoute } from "@/lib/route";
import {
  CATEGORY_LABEL,
  FILTERS,
  type Category,
  type Deal,
  type DealQuery,
  type DealsOk,
  type Store,
  chainById,
  bulkScore,
  categorize,
  endsLabel,
  formatMiles,
  matchesTerm,
  money,
  storeAd,
} from "@/lib/deals";

const SAMPLES = [
  { label: "Sioux Falls", query: "57104" },
  { label: "New York", query: "10001" },
  { label: "Chicago", query: "60614" },
  { label: "Seattle", query: "98101" },
];

const STARTERS = ["Bananas", "Bread", "Chicken", "Milk", "Eggs", "Coffee"];
const RADII = [3, 8, 15];

type Status = "idle" | "loading" | "ready" | "error";
type SortKey = "size" | "nearest" | "price" | "ending" | "store";
type SaleScope = "either" | "sale" | "regular";
type CompareRow = {
  store: Store;
  deal: Deal | null;
  hits: string[];
  extra: number;
};

export function AisleApp() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<DealsOk | null>(null);
  const [list, setList] = useState<string[]>([]);
  const [listReady, setListReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<Category | "all">("all");
  const [sort, setSort] = useState<SortKey>("size");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [onlyList, setOnlyList] = useState(false);
  const [dealQuery, setDealQuery] = useState("");
  const [saleScope, setSaleScope] = useState<SaleScope>("either");
  const requestId = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("aisle-list");
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setList(parsed.filter((item): item is string => typeof item === "string").slice(0, 40));
        }
      }
    } catch {
      /* keep empty */
    }
    setListReady(true);
  }, []);

  useEffect(() => {
    if (!listReady) return;
    localStorage.setItem("aisle-list", JSON.stringify(list));
  }, [list, listReady]);

  async function run(next: DealQuery) {
    const id = ++requestId.current;
    setStatus("loading");
    setError("");
    setStoreId(null);
    try {
      const res = await getNearbyDeals({ data: next });
      if (id !== requestId.current) return;
      if (!res.ok) {
        setStatus("error");
        setError(res.error);
        return;
      }
      setResult(res);
      setStatus("ready");
      localStorage.setItem(
        "aisle-place",
        JSON.stringify({ lat: res.place.lat, lon: res.place.lon, radiusMi: res.radiusMi }),
      );
    } catch {
      if (id !== requestId.current) return;
      setStatus("error");
      setError("Couldn't load deals. Check the ZIP and try again.");
    }
  }

  function addItem(raw: string) {
    const item = raw.trim().replace(/\s+/g, " ");
    if (item.length < 2 || item.length > 48) return;
    setList((current) => {
      if (current.some((entry) => entry.toLowerCase() === item.toLowerCase())) return current;
      return [...current, item].slice(0, 40);
    });
    setDraft("");
  }

  function removeItem(item: string) {
    setList((current) => current.filter((entry) => entry !== item));
  }

  const selectedStore = result?.stores.find((store) => store.id === storeId) ?? null;

  const decorated = useMemo(() => {
    if (!result) return [];
    return result.deals.map((deal) => {
      const hits = list.filter((term) => matchesTerm(deal.name, term));
      const nearestOfChain =
        result.stores
          .filter((item) => item.chainKey === deal.chainKey)
          .sort((a, b) => a.distanceMi - b.distanceMi)[0] ?? null;
      const store =
        selectedStore && selectedStore.chainKey === deal.chainKey
          ? selectedStore
          : (result.stores.find((item) => item.id === deal.storeId) ?? nearestOfChain);
      const distanceMi = store ? store.distanceMi : deal.distanceMi;
      return { deal, hits, distanceMi, store, closest: !!store && store.id === nearestOfChain?.id };
    });
  }, [result, list, selectedStore]);

  const visible = useMemo(() => {
    const q = dealQuery.trim().toLowerCase();
    const rows = decorated.filter(({ deal, hits }) => {
      if (selectedStore && deal.chainKey !== selectedStore.chainKey) return false;
      if (onlyList && hits.length === 0) return false;
      if (filter === "all" && deal.category === "other") return false;
      if (filter !== "all" && deal.category !== filter) return false;
      if (!q) return true;
      return `${deal.name} ${deal.merchant}`.toLowerCase().includes(q);
    });
    rows.sort((a, b) => {
      if (sort === "price") return a.deal.price - b.deal.price;
      if (sort === "ending") return a.deal.validTo.localeCompare(b.deal.validTo);
      if (sort === "store") return a.deal.merchant.localeCompare(b.deal.merchant) || a.deal.price - b.deal.price;
      if (sort === "nearest") {
        const ad = a.distanceMi ?? 999;
        const bd = b.distanceMi ?? 999;
        return ad - bd || a.deal.price - b.deal.price;
      }
      return bulkScore(b.deal.name) - bulkScore(a.deal.name) || a.deal.price - b.deal.price;
    });
    return rows;
  }, [decorated, dealQuery, filter, onlyList, selectedStore, sort]);

  const offSale = useMemo(() => {
    if (!result || saleScope === "sale") return [];
    const q = dealQuery.trim();
    if (q.length < 2) return [];
    if (onlyList && !list.some((term) => matchesTerm(q, term) || matchesTerm(term, q))) return [];
    const category = categorize(q);
    if (filter !== "all" && category !== filter) return [];
    const needle = q.toLowerCase();
    const pool = (selectedStore ? [selectedStore] : result.stores).slice().sort((a, b) => a.distanceMi - b.distanceMi);
    const seen = new Set<string>();
    const rows: Store[] = [];
    for (const store of pool) {
      if (seen.has(store.chainKey)) continue;
      seen.add(store.chainKey);
      const onSale = result.deals.some(
        (deal) => deal.chainKey === store.chainKey && `${deal.name} ${deal.merchant}`.toLowerCase().includes(needle),
      );
      if (!onSale) rows.push(store);
    }
    return rows;
  }, [dealQuery, filter, list, onlyList, result, saleScope, selectedStore]);

  const matchCount = decorated.filter((row) => row.hits.length > 0).length;
  const showSales = saleScope !== "regular";
  const itemQuery = dealQuery.trim();
  const showRegular = saleScope !== "sale" && itemQuery.length >= 2;
  const comparing = itemQuery.length >= 2;

  const comparison = useMemo(() => {
    if (!result || !comparing) return [];
    const needle = itemQuery.toLowerCase();
    const pool = (selectedStore ? [selectedStore] : result.stores)
      .slice()
      .sort((a, b) => a.distanceMi - b.distanceMi);
    const seen = new Set<string>();
    const rows: CompareRow[] = [];
    for (const store of pool) {
      if (seen.has(store.chainKey)) continue;
      seen.add(store.chainKey);
      const matches = decorated
        .filter(({ deal, hits }) => {
          if (deal.chainKey !== store.chainKey) return false;
          if (onlyList && hits.length === 0) return false;
          if (filter === "all" && deal.category === "other") return false;
          if (filter !== "all" && deal.category !== filter) return false;
          return `${deal.name} ${deal.merchant}`.toLowerCase().includes(needle);
        })
        .sort(
          (a, b) => bulkScore(b.deal.name) - bulkScore(a.deal.name) || a.deal.price - b.deal.price,
        );
      const lead = matches[0];
      if (saleScope === "sale" && !lead) continue;
      if (saleScope === "regular" && lead) continue;
      if (!lead && filter !== "all" && categorize(itemQuery) !== filter) continue;
      if (!lead && onlyList && !list.some((term) => matchesTerm(itemQuery, term) || matchesTerm(term, itemQuery))) {
        continue;
      }
      rows.push({
        store,
        deal: lead?.deal ?? null,
        hits: lead?.hits ?? [],
        extra: Math.max(0, matches.length - 1),
      });
    }
    rows.sort((a, b) => {
      if (a.deal && b.deal) {
        return (
          bulkScore(b.deal.name) - bulkScore(a.deal.name) ||
          a.deal.price - b.deal.price ||
          a.store.distanceMi - b.store.distanceMi
        );
      }
      if (a.deal) return -1;
      if (b.deal) return 1;
      return a.store.distanceMi - b.store.distanceMi;
    });
    return rows;
  }, [comparing, decorated, filter, itemQuery, list, onlyList, result, saleScope, selectedStore]);

  const bestPrice = comparison.reduce<number | null>((min, row) => {
    if (!row.deal) return min;
    return min == null || row.deal.price < min ? row.deal.price : min;
  }, null);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-2xl font-medium tracking-tight">Aisle</p>
            <p className="text-sm text-muted">Nearby grocery sales</p>
          </div>
          {result ? (
            <p className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <MapPin className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">{result.place.label}</span>
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <Finder
          query={query}
          setQuery={setQuery}
          status={status}
          hasResult={!!result}
          onSearch={() => run({ query, radiusMi: result?.radiusMi ?? 8 })}
          onLocate={() => {
            if (!navigator.geolocation) {
              setError("This browser can't share location. Enter a ZIP instead.");
              setStatus("error");
              return;
            }
            setStatus("loading");
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                run({
                  lat: pos.coords.latitude,
                  lon: pos.coords.longitude,
                  radiusMi: result?.radiusMi ?? 8,
                }),
              () => {
                setStatus(result ? "ready" : "error");
                setError("Location is blocked. Enter a ZIP or city instead.");
              },
              { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
            );
          }}
        />

        {status === "error" ? (
          <p role="alert" className="rounded-lg bg-sale-soft px-4 py-3 text-sm text-ink">
            {error}
          </p>
        ) : null}

        {!result && status !== "loading" ? (
          <section className="rise max-w-2xl">
            <h1 className="font-display text-display font-medium text-ink">Sales at stores near you.</h1>
            <p className="mt-3 max-w-xl text-muted">
              Enter a ZIP or city. Aisle pulls this week's grocery ads for that area, pins the stores
              around it, and marks anything already on your list.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.query}
                  type="button"
                  className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-medium"
                  onClick={() => {
                    setQuery(sample.query);
                    void run({ query: sample.query, radiusMi: 8 });
                  }}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {status === "loading" ? (
          <p className="text-sm text-muted" aria-live="polite">
            Finding stores and this week's circulars…
          </p>
        ) : null}

        {result ? (
          <section className="flex flex-col gap-5" aria-live="polite">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-medium tracking-tight">
                  {comparing
                    ? `${comparison.filter((row) => row.deal).length} ads · bulk to single`
                    : saleScope === "regular"
                      ? `${offSale.length} not on sale`
                      : showRegular
                        ? `${visible.length} on sale · ${offSale.length} not`
                        : `${visible.length} ${visible.length === 1 ? "sale" : "sales"}`}
                  {selectedStore ? ` at ${chainLabel(selectedStore)}` : ""}
                </h1>
                <p className="text-sm text-muted">
                  {comparing
                    ? "Ads run from bulk packs down to single items, lowest price first. Stores without this item are at the bottom."
                    : sort === "size"
                      ? `${result.stores.length} stores within ${result.radiusMi} mi · large packs first, then lowest price`
                      : `${result.stores.length} stores within ${result.radiusMi} mi`}
                  {matchCount > 0 ? ` · ${matchCount} match your list` : ""}
                </p>
              </div>
              <div className="flex gap-2" role="group" aria-label="Search radius">
                {RADII.map((miles) => (
                  <button
                    key={miles}
                    type="button"
                    aria-pressed={result.radiusMi === miles}
                    className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                      result.radiusMi === miles ? "bg-ink text-paper" : "border border-line bg-surface"
                    }`}
                    onClick={() =>
                      run({ lat: result.place.lat, lon: result.place.lon, radiusMi: miles })
                    }
                  >
                    {miles} mi
                  </button>
                ))}
              </div>
            </div>

            {result.note ? <p className="text-sm text-muted">{result.note}</p> : null}

            <ListBar
              list={orderedList(list)}
              draft={draft}
              setDraft={setDraft}
              onAdd={addItem}
              onRemove={removeItem}
              matchCount={matchCount}
              onlyList={onlyList}
              onToggle={() => setOnlyList((value) => !value)}
            />

            <RoutePlan result={result} list={list} />

            <StorePicker
              stores={result.stores}
              deals={result.deals}
              filter={filter}
              selectedId={storeId}
              onSelect={setStoreId}
            />

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search items</span>
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
                  <input
                    value={dealQuery}
                    onChange={(event) => setDealQuery(event.target.value)}
                    placeholder="Search an item, on sale or not"
                    className="h-11 w-full rounded-sm border border-line bg-surface pr-3 pl-10 text-base"
                  />
                </label>
                <VoiceSearch
                  prompt="Say an item or a ZIP"
                  onHeard={(said) => {
                    if (/^\d{5}$/.test(said)) {
                      setQuery(said);
                      void run({ query: said, radiusMi: result.radiusMi });
                      return;
                    }
                    setDealQuery(said);
                  }}
                />
                <label className="flex h-11 items-center gap-2 text-sm text-muted">
                  <span className="sr-only">Sort</span>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    className="h-11 rounded-sm border border-line bg-surface px-3 text-ink"
                  >
                    <option value="size">Bulk to single</option>
                    <option value="nearest">Nearest</option>
                    <option value="price">Price</option>
                    <option value="ending">Ending soon</option>
                    <option value="store">Store</option>
                  </select>
                </label>
              </div>
              <div className="flex gap-2" role="group" aria-label="Sale or not">
                {(
                  [
                    ["either", "On sale or not"],
                    ["sale", "On sale"],
                    ["regular", "Not on sale"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={saleScope === id}
                    className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                      saleScope === id ? "bg-ink text-paper" : "border border-line bg-surface"
                    }`}
                    onClick={() => setSaleScope(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
              {FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={filter === item}
                  className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${
                    filter === item ? "bg-accent text-accent-ink" : "bg-chip text-ink"
                  }`}
                  onClick={() => setFilter(item)}
                >
                  {item === "all" ? "Groceries" : CATEGORY_LABEL[item]}
                </button>
              ))}
            </div>

            {comparing ? (
              comparison.length === 0 ? (
                <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-muted">
                  No store has {itemQuery} in this week's ads.
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {comparison.map((row, index) => (
                    <CompareRowCard
                      key={row.store.id}
                      row={row}
                      rank={index + 1}
                      best={row.deal != null && row.deal.price === bestPrice}
                      bestPrice={bestPrice}
                      query={itemQuery}
                      onSave={() => addItem(row.deal ? shortName(row.deal.name) : itemQuery)}
                    />
                  ))}
                </ol>
              )
            ) : null}

            {showSales && (!comparing || visible.length > 0) ? (
              comparing ? (
                <h2 className="font-display text-xl font-medium">Sales, bulk to single</h2>
              ) : null
            ) : null}
            {showSales && (comparing ? visible.length > 0 : true) ? (
              visible.length === 0 ? (
                <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-muted">
                  {onlyList
                    ? "Nothing on your list is in this week's ads."
                    : itemQuery
                      ? `No ${itemQuery} in this week's ads.`
                      : "No sales match that filter. Try another aisle or a wider radius."}
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map(({ deal, hits, distanceMi, store, closest }) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      hits={hits}
                      distanceMi={distanceMi}
                      store={store}
                      closest={closest}
                      onSave={() => addItem(shortName(deal.name))}
                    />
                  ))}
                </ul>
              )
            ) : null}

            {saleScope === "regular" && !comparing ? (
              <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-muted">
                Type an item, like eggs or chicken, to see stores that don't have it on sale.
              </p>
            ) : null}

            {showRegular && !comparing ? (
              <div className="flex flex-col gap-3">
                {saleScope === "either" ? (
                  <h2 className="font-display text-xl font-medium">Not on sale</h2>
                ) : null}
                {offSale.length === 0 ? (
                  <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-muted">
                    {itemQuery} is in this week's ad at every nearby store.
                  </p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {offSale.map((store) => (
                      <OffSaleCard
                        key={store.id}
                        store={store}
                        item={itemQuery}
                        onList={list.some((term) => matchesTerm(itemQuery, term) || matchesTerm(term, itemQuery))}
                        onSave={() => addItem(itemQuery)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <p className="max-w-3xl text-sm text-faint">
              Store pins come from OpenStreetMap. Prices are this week's published circulars for{" "}
              {result.place.postal}. Fuel is today's AAA average for the cheapest metro nearby, not one station's sign. Ads and
              stock vary by store.
            </p>
          </section>
        ) : null}

        {status === "loading" && !result ? <SkeletonGrid /> : null}
      </main>
    </div>
  );
}

function Finder({
  query,
  setQuery,
  status,
  hasResult,
  onSearch,
  onLocate,
}: {
  query: string;
  setQuery: (value: string) => void;
  status: Status;
  hasResult: boolean;
  onSearch: () => void;
  onLocate: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">ZIP or city</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ZIP or city"
          autoComplete="postal-code"
          className="h-11 w-full rounded-sm border border-line bg-surface px-3 text-base"
        />
      </label>
      <button
        type="submit"
        disabled={status === "loading" || query.trim().length < 2}
        className="h-11 rounded-sm bg-accent px-4 font-medium text-accent-ink disabled:opacity-50"
      >
        {status === "loading" ? "Searching" : hasResult ? "Update" : "Find sales"}
      </button>
      <button
        type="button"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-line bg-surface px-4 font-medium"
        onClick={onLocate}
      >
        <LocateFixed className="size-4" aria-hidden="true" />
        Use my location
      </button>
      <VoiceSearch
        prompt="Say a ZIP or city"
        onHeard={(said) => {
          setQuery(said);
          onSearch();
        }}
      />
    </form>
  );
}

function VoiceSearch({ prompt, onHeard }: { prompt: string; onHeard: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("");
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => () => recRef.current?.abort(), []);

  function start() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) {
      setNote("Google voice search needs Chrome.");
      return;
    }
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let said = "";
      let final = false;
      for (let i = 0; i < event.results.length; i += 1) {
        said += event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) final = true;
      }
      said = said.replace(/[.?!,]/g, " ").replace(/\s+/g, " ").trim();
      if (!said) return;
      setNote(final ? `Heard “${said}”` : `Hearing “${said}”`);
      if (final) onHeard(said);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setNote("Microphone is blocked.");
      } else if (event.error === "no-speech") {
        setNote("Didn't hear anything.");
      } else if (event.error !== "aborted") {
        setNote("Voice search failed. Try again.");
      }
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      setNote(prompt);
    } catch {
      setListening(false);
      setNote("Voice search is already on.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={listening}
        aria-label={listening ? "Stop voice search" : "Google voice search"}
        className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-sm px-4 font-medium ${
          listening ? "bg-sale text-paper" : "border border-line bg-surface"
        }`}
        onClick={start}
      >
        <Mic className="size-4" aria-hidden="true" />
        {listening ? "Listening" : "Voice"}
      </button>
      {note ? (
        <p className="text-sm text-muted" aria-live="polite">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function ListBar({
  list,
  draft,
  setDraft,
  onAdd,
  onRemove,
  matchCount,
  onlyList,
  onToggle,
}: {
  list: string[];
  draft: string;
  setDraft: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  matchCount: number;
  onlyList: boolean;
  onToggle: () => void;
}) {
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => () => recRef.current?.abort(), []);

  function dictate() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) {
      setVoiceNote("Voice dictation isn't available in this browser. Type eggs instead.");
      return;
    }
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let said = "";
      let final = false;
      for (let i = 0; i < event.results.length; i += 1) {
        said += event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) final = true;
      }
      said = said.trim();
      if (!final) {
        setDraft(said);
        setVoiceNote(said ? `Hearing “${said}”` : "Listening… say eggs");
        return;
      }
      const items = itemsFromSpeech(said);
      if (items.length === 0) {
        setVoiceNote("Didn't catch an item. Say eggs.");
        return;
      }
      for (const item of items) onAdd(item);
      setDraft("");
      setVoiceNote(items.length === 1 ? `Added ${itemLabel(items[0])}` : `Added ${items.map(itemLabel).join(", ")}`);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setVoiceNote("Microphone is blocked. Type eggs instead.");
      } else if (event.error === "no-speech") {
        setVoiceNote("Didn't hear anything. Say eggs.");
      } else if (event.error !== "aborted") {
        setVoiceNote("Couldn't hear that. Try saying eggs again.");
      }
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      setVoiceNote("Listening… say eggs");
    } catch {
      setListening(false);
      setVoiceNote("Voice dictation is already on.");
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-medium">Your list</h2>
        {list.length > 0 ? (
          <button
            type="button"
            aria-pressed={onlyList}
            className={`min-h-11 rounded-full px-4 text-sm font-medium ${
              onlyList ? "bg-accent text-accent-ink" : "bg-match text-ink"
            }`}
            onClick={onToggle}
          >
            {matchCount} on sale
          </button>
        ) : null}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(draft);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Add an item</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add milk, eggs, chicken"
            className="h-11 w-full rounded-sm border border-line bg-paper px-3"
          />
        </label>
        <button
          type="button"
          aria-pressed={listening}
          aria-label={listening ? "Stop dictation" : "Dictate an item, like eggs"}
          className={`grid size-11 shrink-0 place-items-center rounded-sm ${
            listening ? "bg-sale text-paper" : "border border-line bg-paper text-ink"
          }`}
          onClick={dictate}
        >
          <Mic className="size-4" aria-hidden="true" />
        </button>
        <button type="submit" className="h-11 rounded-sm bg-ink px-4 font-medium text-paper">
          Add
        </button>
      </form>
      {voiceNote ? (
        <p className="mt-2 text-sm text-muted" aria-live="polite">
          {voiceNote}
        </p>
      ) : null}
      {list.length > 0 ? (
        <p className="mt-2 text-sm text-muted">In aisle order. Produce first, frozen last. The route follows this list.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {(list.length ? list : STARTERS).map((item) =>
          list.length ? (
            <span key={item} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-chip pl-4 pr-1 text-sm">
              {item}
              <button type="button" className="grid size-9 place-items-center rounded-full" onClick={() => onRemove(item)} aria-label={`Remove ${item}`}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className="inline-flex min-h-11 items-center gap-1 rounded-full bg-chip px-4 text-sm font-medium"
              onClick={() => onAdd(item)}
            >
              <Plus className="size-4" aria-hidden="true" />
              {item}
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function DealCard({
  deal,
  hits,
  distanceMi,
  store,
  closest,
  onSave,
}: {
  deal: Deal;
  hits: string[];
  distanceMi: number | null;
  store: Store | null;
  closest: boolean;
  onSave: () => void;
}) {
  const [imageOk, setImageOk] = useState(true);
  const [zoom, setZoom] = useState(false);
  const href = store ? storeDirections(store) : undefined;
  const picture =
    deal.image && imageOk ? (
      <button
        type="button"
        className="group relative z-10 size-16 shrink-0"
        onClick={() => setZoom(true)}
        aria-label={`Enlarge ${deal.name}`}
      >
        <img
          src={deal.image}
          alt=""
          className="size-16 rounded-sm bg-paper object-contain transition duration-150 group-hover:relative group-hover:z-30 group-hover:scale-[2.6] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          loading="lazy"
          onError={() => setImageOk(false)}
        />
      </button>
    ) : (
      <div className="grid size-16 shrink-0 place-items-center rounded-sm bg-chip text-sm font-medium text-muted">
        {deal.merchant.slice(0, 1)}
      </div>
    );
  const copy = (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm text-muted">
        {deal.merchant}
        {distanceMi != null ? ` · ${formatMiles(distanceMi)}${closest ? " · closest" : ""}` : " · ZIP ad"}
      </p>
      <p className="mt-1 line-clamp-2 font-medium leading-snug">{deal.name}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="font-display text-xl font-medium tabular-nums">{money(deal.price)}</p>
        <p className="text-xs font-medium text-sale">{endsLabel(deal.validTo)}</p>
      </div>
    </div>
  );

  return (
    <li className="relative rounded-xl border border-line bg-surface p-4 shadow-card hover:z-20">
      <div className="flex gap-3">
        {picture}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 rounded-sm"
            aria-label={`${deal.name} at ${store?.name}. Open directions.`}
          >
            {copy}
          </a>
        ) : (
          copy
        )}
      </div>
      {zoom && deal.image ? (
        <button
          type="button"
          className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-6"
          onClick={() => setZoom(false)}
          aria-label="Close enlarged image"
        >
          <img src={deal.image} alt={deal.name} className="max-h-[85vh] max-w-full object-contain" />
        </button>
      ) : null}
      {hits.length > 0 ? (
        <p className="mt-2 inline-flex min-h-8 items-center rounded-full bg-match px-3 text-xs font-medium">
          On your list · {hits.join(", ")}
        </p>
      ) : (
        <button
          type="button"
          className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent"
          onClick={onSave}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add to list
        </button>
      )}
      {storeAd(deal.chainKey) ? (
        <a
          className="mt-5 flex min-h-14 w-full items-center justify-center rounded-sm border border-ink px-4 text-base font-medium"
          href={storeAd(deal.chainKey)!.ad}
          target="_blank"
          rel="noreferrer"
        >
          View ad
        </a>
      ) : null}
    </li>
  );
}

function CompareRowCard({
  row,
  rank,
  best,
  bestPrice,
  query,
  onSave,
}: {
  row: CompareRow;
  rank: number;
  best: boolean;
  bestPrice: number | null;
  query: string;
  onSave: () => void;
}) {
  const { store, deal, hits, extra } = row;
  const gap = deal && bestPrice != null && !best ? deal.price - bestPrice : 0;
  return (
    <li className="flex gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-medium ${
          best ? "bg-accent text-accent-ink" : "bg-ink text-paper"
        }`}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">
            {chainLabel(store)}
            <span className="font-normal text-muted">
              {" "}
              · {formatMiles(store.distanceMi)} · closest
            </span>
          </p>
          {deal ? (
            <p className="font-display text-2xl font-medium tabular-nums">{money(deal.price)}</p>
          ) : (
            <p className="text-sm text-muted">Not on sale</p>
          )}
        </div>
        <p className="mt-1 text-sm">{deal ? deal.name : query}</p>
        <p className="mt-1 text-sm text-muted">
          {[
            best ? "Best price" : null,
            gap > 0 ? `${money(gap)} more than the best` : null,
            !deal ? "Not in this week's ad" : null,
            deal && extra > 0 ? `${extra} other ${extra === 1 ? "price" : "prices"}` : null,
            store.street || null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {hits.length > 0 ? (
            <p className="inline-flex min-h-8 items-center rounded-full bg-match px-3 text-xs font-medium">On your list</p>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent"
              onClick={onSave}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add to list
            </button>
          )}
          <a
            className="inline-flex min-h-11 items-center text-sm font-medium underline decoration-line underline-offset-4"
            href={storeDirections(store)}
            target="_blank"
            rel="noreferrer"
          >
            Directions
          </a>
        </div>
        {storeAd(store.chainKey) ? (
          <a
            className="mt-4 flex min-h-14 w-full items-center justify-center rounded-sm border border-ink px-4 text-base font-medium"
            href={storeAd(store.chainKey)!.ad}
            target="_blank"
            rel="noreferrer"
          >
            View ad
          </a>
        ) : null}
      </div>
    </li>
  );
}

function OffSaleCard({
  store,
  item,
  onList,
  onSave,
}: {
  store: Store;
  item: string;
  onList: boolean;
  onSave: () => void;
}) {
  return (
    <li className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <a
        href={storeDirections(store)}
        target="_blank"
        rel="noreferrer"
        className="flex gap-3 rounded-sm"
        aria-label={`${item} at ${store.name}. Not on sale. Open directions.`}
      >
        <div className="grid size-16 shrink-0 place-items-center rounded-sm bg-chip text-sm font-medium text-muted">
          {chainLabel(store).slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted">
            {chainLabel(store)} · {formatMiles(store.distanceMi)}
          </p>
          <p className="mt-1 line-clamp-2 font-medium leading-snug">{item}</p>
          <p className="mt-2 text-sm text-muted">Not on sale this week</p>
          {store.street ? <p className="truncate text-xs text-faint">{store.street}</p> : null}
        </div>
      </a>
      {onList ? (
        <p className="mt-2 inline-flex min-h-8 items-center rounded-full bg-match px-3 text-xs font-medium">On your list</p>
      ) : (
        <button
          type="button"
          className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent"
          onClick={onSave}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add to list
        </button>
      )}
    </li>
  );
}

function RoutePlan({ result, list }: { result: DealsOk; list: string[] }) {
  const stops = useMemo(
    () => planRoute(list, result.deals, result.stores, result.place, result.fuel),
    [list, result],
  );
  const href = mapsRoute(result.place, stops);
  const grades = result.fuel?.grades ?? [];
  const stations = result.fuel?.stations ?? [];
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-medium">Route</h2>
        {href ? (
          <a
            className="inline-flex min-h-11 items-center rounded-sm bg-ink px-4 text-sm font-medium text-paper"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            Open route
          </a>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">
        {list.length
          ? "Grocery stops cover your list. Drive order is the short path. Fuel is inserted where it adds the least miles."
          : "Add to your list and the stops follow it. Fuel shows today's best AAA price."}
      </p>
      {stops.length > 0 ? (
        <ol className="mt-3 divide-y divide-line">
          {stops.map((stop, index) => (
            <li key={`${stop.kind}-${stop.id}`} className="flex gap-3 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium text-paper">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium">{stop.kind === "fuel" ? `Fuel · ${stop.name}` : stop.name}</p>
                <p className="text-sm text-muted">
                  {stop.street ? `${stop.street} · ` : ""}
                  {formatMiles(stop.legMi)} {index === 0 ? "from you" : "from the last stop"}
                </p>
                <p className="mt-1 text-sm">
                  {stop.items
                    .map((item) => (item.price == null ? `${item.name} · not in the ad` : `${item.name} ${money(item.price)}`))
                    .join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted">No stops yet. Add a list item or widen the radius.</p>
      )}
      {grades.length > 0 ? (
        <div className="mt-2">
          <h3 className="text-sm font-medium">
            Best fuel{result.fuel?.area ? ` · ${result.fuel.area}` : ""}
            {result.fuel?.asOf ? ` · ${result.fuel.asOf}` : ""}
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {grades.map((grade) => (
              <div key={grade.id} className="rounded-sm bg-paper px-3 py-2">
                <dt className="text-xs text-muted">{grade.label}</dt>
                <dd className="font-display text-xl font-medium tabular-nums">{money(grade.price)}</dd>
              </div>
            ))}
          </dl>
          {(result.fuel?.areas.length ?? 0) > 1 ? (
            <ul className="mt-3 divide-y divide-line">
              {result.fuel?.areas.map((area, index) => (
                <li key={area.name} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">
                    {index === 0 ? "Best · " : ""}
                    {area.name}
                  </span>
                  <span className="tabular-nums text-muted">
                    {money(area.regular)} regular · {money(area.diesel)} diesel
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-sm text-faint">{result.fuel?.source}</p>
        </div>
      ) : null}
      {stations.length > 0 ? (
        <ul className="mt-2 divide-y divide-line">
          {stations.map((station) => (
            <li key={station.id} className="flex items-center justify-between gap-3 py-2">
              <p className="min-w-0 text-sm">
                <span className="font-medium">{station.name}</span>
                <span className="text-muted">
                  {station.street ? ` · ${station.street}` : ""} · {formatMiles(station.distanceMi)}
                </span>
              </p>
              <a
                className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-accent"
                href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                Directions
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function StorePicker({
  stores,
  deals,
  filter,
  selectedId,
  onSelect,
}: {
  stores: Store[];
  deals: Deal[];
  filter: Category | "all";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const groups = storeGroups(stores, deals, filter);
  const active = groups.find((group) => group.locations.some((store) => store.id === selectedId)) ?? null;
  if (groups.length === 0) {
    return <p className="text-sm text-muted">No grocery stores pinned in this radius.</p>;
  }
  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-medium">Stores</h2>
        {active ? (
          <button type="button" className="min-h-11 text-sm font-medium text-accent" onClick={() => onSelect(null)}>
            All stores
          </button>
        ) : null}
      </div>
      <div className="-mx-4 mt-3 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1">
        {groups.map((group) => {
          const nearest = group.locations[0];
          const selected = active?.chainKey === group.chainKey;
          return (
            <div
              key={group.chainKey}
              className={`inline-flex shrink-0 items-center rounded-full ${
                selected ? "bg-ink text-paper" : "border border-line bg-surface"
              }`}
            >
              <button
                type="button"
                aria-pressed={selected}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap"
                onClick={() => onSelect(selected ? null : nearest.id)}
              >
                {group.label}
                <span className={`tabular-nums ${selected ? "opacity-70" : "text-faint"}`}>
                  {formatMiles(nearest.distanceMi)}
                </span>
              </button>
              <a
                className={`inline-flex min-h-11 items-center pr-4 text-sm font-medium underline decoration-line underline-offset-4 ${
                  selected ? "text-paper" : "text-ink"
                }`}
                href={storeDirections(nearest)}
                target="_blank"
                rel="noreferrer"
              >
                Map
              </a>
            </div>
          );
        })}
      </div>
      {active ? (
        <div className="mt-3 rounded-xl border border-line bg-surface">
          <p className="border-b border-line px-4 py-3 text-sm text-muted">
            {active.count} {active.count === 1 ? "sale" : "sales"} this week. The ad is the same at every{" "}
            {active.label}. Map opens the closest store
            {active.locations[0]?.street ? ` on ${active.locations[0].street}` : ""}.
          </p>
          {storeAd(active.chainKey) ? (
            <div className="flex gap-4 border-b border-line px-4 py-2">
              <a
                className="inline-flex min-h-11 items-center text-sm font-medium underline decoration-line underline-offset-4"
                href={storeAd(active.chainKey)!.ad}
                target="_blank"
                rel="noreferrer"
              >
                Weekly ad
              </a>
              {storeAd(active.chainKey)?.events ? (
                <a
                  className="inline-flex min-h-11 items-center text-sm font-medium underline decoration-line underline-offset-4"
                  href={storeAd(active.chainKey)!.events}
                  target="_blank"
                  rel="noreferrer"
                >
                  Events
                </a>
              ) : null}
            </div>
          ) : null}
          <ul className="divide-y divide-line">
            {active.locations.map((store, index) => {
              const selected = store.id === selectedId;
              return (
                <li key={store.id} className="flex items-center gap-2 px-2 py-1">
                  <button
                    type="button"
                    aria-pressed={selected}
                    className={`min-h-11 min-w-0 flex-1 rounded-sm px-2 text-left text-sm ${
                      selected ? "font-medium" : ""
                    }`}
                    onClick={() => onSelect(store.id)}
                  >
                    <span className="block truncate">
                      {index === 0 ? "Closest · " : ""}
                      {store.street || store.name}
                    </span>
                    <span className="text-muted">{formatMiles(store.distanceMi)}</span>
                  </button>
                  <a
                    className="inline-flex min-h-11 shrink-0 items-center rounded-sm border border-line px-3 text-sm font-medium"
                    href={storeDirections(store)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Weekly ads are chain-wide. Map opens the closest store of that chain.
        </p>
      )}
    </section>
  );
}

function storeGroups(stores: Store[], deals: Deal[], filter: Category | "all") {
  const byChain = new Map<string, Store[]>();
  for (const store of stores) {
    const list = byChain.get(store.chainKey) ?? [];
    list.push(store);
    byChain.set(store.chainKey, list);
  }
  return [...byChain.entries()]
    .map(([chainKey, locations]) => {
      locations.sort((a, b) => a.distanceMi - b.distanceMi);
      const count = deals.filter(
        (deal) =>
          deal.chainKey === chainKey && (filter === "all" ? deal.category !== "other" : deal.category === filter),
      ).length;
      return { chainKey, label: chainLabel(locations[0]), locations, count };
    })
    .sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || a.locations[0].distanceMi - b.locations[0].distanceMi);
}

function chainLabel(store: Store) {
  return (
    chainById(store.chainKey)?.label ??
    store.name.replace(/\s+(supercenter|supercentre|neighborhood market|marketplace)$/i, "")
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-36 rounded-xl border border-line bg-chip" />
      ))}
    </div>
  );
}

function storeDirections(store: Store) {
  return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lon}`;
}

type SpeechResult = { transcript: string };
type SpeechEvent = {
  results: ArrayLike<ArrayLike<SpeechResult> & { isFinal?: boolean }>;
};
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function speechCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

function itemLabel(value: string) {
  return value.toLowerCase() === "eggs" ? "eggs" : value;
}

function itemsFromSpeech(transcript: string): string[] {
  let text = transcript.toLowerCase().replace(/[.?!,]/g, " ");
  text = text.replace(/^(?:hey |ok |please )*(?:add |i need |i want |get me |get |put )+/, "");
  const parts = text.split(/\s+and\s+|\s*&\s*/);
  const items: string[] = [];
  for (const raw of parts) {
    let part = raw
      .replace(/\b(?:a dozen|dozen|some|an|the|of)\b/g, " ")
      .replace(/\beggs?\b/g, "eggs")
      .replace(/\s+/g, " ")
      .trim();
    if (part === "a") continue;
    part = part.replace(/^(?:a )+/, "").trim();
    if (part.length < 2 || part.length > 48) continue;
    const label = part === "eggs" ? "Eggs" : part.charAt(0).toUpperCase() + part.slice(1);
    if (!items.includes(label)) items.push(label);
  }
  return items;
}

function shortName(name: string) {
  const trimmed = name.replace(/\s+/g, " ").trim();
  return trimmed.length > 42 ? `${trimmed.slice(0, 42).trim()}…` : trimmed;
}
