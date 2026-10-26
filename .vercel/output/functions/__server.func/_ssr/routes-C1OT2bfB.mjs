import { i as __toESM } from "../_runtime.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { c as formatMiles, f as money, n as FILTERS, s as endsLabel, t as CATEGORY_LABEL, u as matchesTerm } from "./deals-CrQ2gBAn.mjs";
import { i as string, n as number, r as object } from "../_libs/zod.mjs";
import { a as MapPin, i as Plus, o as LocateFixed, r as Search, t as X } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-C1OT2bfB.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var Input = object({
	query: string().trim().max(80).optional(),
	lat: number().min(-90).max(90).optional(),
	lon: number().min(-180).max(180).optional(),
	radiusMi: number().min(1).max(30).optional()
});
var getNearbyDeals = createServerFn({ method: "POST" }).validator((input) => {
	const parsed = Input.safeParse(input);
	if (!parsed.success) throw new Error("Enter a ZIP code or city.");
	const data = parsed.data;
	if (!data.query && (data.lat == null || data.lon == null)) throw new Error("Enter a ZIP code or city, or use your location.");
	return data;
}).handler(createSsrRpc("08828e9168eb79ff0b6cc7d3cadb606cdb6a8b068106a9c1540726f5b4ad50f4"));
var SAMPLES = [
	{
		label: "Sioux Falls",
		query: "57104"
	},
	{
		label: "New York",
		query: "10001"
	},
	{
		label: "Chicago",
		query: "60614"
	},
	{
		label: "Seattle",
		query: "98101"
	}
];
var STARTERS = [
	"Milk",
	"Eggs",
	"Bread",
	"Chicken",
	"Bananas",
	"Coffee"
];
var RADII = [
	3,
	8,
	15
];
function AisleApp() {
	const [query, setQuery] = (0, import_react.useState)("");
	const [status, setStatus] = (0, import_react.useState)("idle");
	const [error, setError] = (0, import_react.useState)("");
	const [result, setResult] = (0, import_react.useState)(null);
	const [list, setList] = (0, import_react.useState)([]);
	const [listReady, setListReady] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)("");
	const [filter, setFilter] = (0, import_react.useState)("all");
	const [sort, setSort] = (0, import_react.useState)("nearest");
	const [storeId, setStoreId] = (0, import_react.useState)(null);
	const [onlyList, setOnlyList] = (0, import_react.useState)(false);
	const [dealQuery, setDealQuery] = (0, import_react.useState)("");
	const requestId = (0, import_react.useRef)(0);
	(0, import_react.useEffect)(() => {
		try {
			const raw = localStorage.getItem("aisle-list");
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) setList(parsed.filter((item) => typeof item === "string").slice(0, 40));
			}
		} catch {}
		setListReady(true);
	}, []);
	(0, import_react.useEffect)(() => {
		if (!listReady) return;
		localStorage.setItem("aisle-list", JSON.stringify(list));
	}, [list, listReady]);
	async function run(next) {
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
			localStorage.setItem("aisle-place", JSON.stringify({
				lat: res.place.lat,
				lon: res.place.lon,
				radiusMi: res.radiusMi
			}));
		} catch {
			if (id !== requestId.current) return;
			setStatus("error");
			setError("Couldn't load deals. Check the ZIP and try again.");
		}
	}
	function addItem(raw) {
		const item = raw.trim().replace(/\s+/g, " ");
		if (item.length < 2 || item.length > 48) return;
		setList((current) => {
			if (current.some((entry) => entry.toLowerCase() === item.toLowerCase())) return current;
			return [...current, item].slice(0, 40);
		});
		setDraft("");
	}
	function removeItem(item) {
		setList((current) => current.filter((entry) => entry !== item));
	}
	const selectedStore = result?.stores.find((store) => store.id === storeId) ?? null;
	const decorated = (0, import_react.useMemo)(() => {
		if (!result) return [];
		return result.deals.map((deal) => {
			const hits = list.filter((term) => matchesTerm(deal.name, term));
			const store = selectedStore && selectedStore.chainKey === deal.chainKey ? selectedStore : result.stores.find((item) => item.id === deal.storeId) ?? result.stores.filter((item) => item.chainKey === deal.chainKey).sort((a, b) => a.distanceMi - b.distanceMi)[0] ?? null;
			return {
				deal,
				hits,
				distanceMi: store ? store.distanceMi : deal.distanceMi,
				store
			};
		});
	}, [
		result,
		list,
		selectedStore
	]);
	const visible = (0, import_react.useMemo)(() => {
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
			return (a.distanceMi ?? 999) - (b.distanceMi ?? 999) || a.deal.price - b.deal.price;
		});
		return rows;
	}, [
		decorated,
		dealQuery,
		filter,
		onlyList,
		selectedStore,
		sort
	]);
	const matchCount = decorated.filter((row) => row.hits.length > 0).length;
	const pinned = (result?.stores.filter((store) => result.deals.some((deal) => deal.chainKey === store.chainKey)) ?? []).slice().sort((a, b) => a.distanceMi - b.distanceMi);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
			className: "sticky top-0 z-10 border-b border-line bg-paper",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display text-2xl font-medium tracking-tight",
						children: "Aisle"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: "Nearby grocery sales"
					})]
				}), result ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "flex min-h-11 items-center gap-2 text-sm text-ink",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, {
						className: "size-4 shrink-0 text-accent",
						"aria-hidden": "true"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate",
						children: result.place.label
					})]
				}) : null]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Finder, {
					query,
					setQuery,
					status,
					hasResult: !!result,
					onSearch: () => run({
						query,
						radiusMi: result?.radiusMi ?? 8
					}),
					onLocate: () => {
						if (!navigator.geolocation) {
							setError("This browser can't share location. Enter a ZIP instead.");
							setStatus("error");
							return;
						}
						setStatus("loading");
						navigator.geolocation.getCurrentPosition((pos) => run({
							lat: pos.coords.latitude,
							lon: pos.coords.longitude,
							radiusMi: result?.radiusMi ?? 8
						}), () => {
							setStatus(result ? "ready" : "error");
							setError("Location is blocked. Enter a ZIP or city instead.");
						}, {
							enableHighAccuracy: false,
							timeout: 8e3,
							maximumAge: 3e5
						});
					}
				}),
				status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					role: "alert",
					className: "rounded-lg bg-sale-soft px-4 py-3 text-sm text-ink",
					children: error
				}) : null,
				!result && status !== "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rise max-w-2xl",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "font-display text-display font-medium text-ink",
							children: "Sales at stores near you."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 max-w-xl text-muted",
							children: "Enter a ZIP or city. Aisle pulls this week's grocery ads for that area, pins the stores around it, and marks anything already on your list."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-5 flex flex-wrap gap-2",
							children: SAMPLES.map((sample) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-medium",
								onClick: () => {
									setQuery(sample.query);
									run({
										query: sample.query,
										radiusMi: 8
									});
								},
								children: sample.label
							}, sample.query))
						})
					]
				}) : null,
				status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					"aria-live": "polite",
					children: "Finding stores and this week's circulars…"
				}) : null,
				result ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "flex flex-col gap-5",
					"aria-live": "polite",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-end justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
								className: "font-display text-3xl font-medium tracking-tight",
								children: [
									visible.length,
									" ",
									visible.length === 1 ? "sale" : "sales"
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-sm text-muted",
								children: [
									result.stores.length,
									" stores within ",
									result.radiusMi,
									" mi",
									matchCount > 0 ? ` · ${matchCount} match your list` : ""
								]
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex gap-2",
								role: "group",
								"aria-label": "Search radius",
								children: RADII.map((miles) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-pressed": result.radiusMi === miles,
									className: `min-h-11 rounded-full px-4 text-sm font-medium ${result.radiusMi === miles ? "bg-ink text-paper" : "border border-line bg-surface"}`,
									onClick: () => run({
										lat: result.place.lat,
										lon: result.place.lon,
										radiusMi: miles
									}),
									children: [miles, " mi"]
								}, miles))
							})]
						}),
						result.note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted",
							children: result.note
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListBar, {
							list,
							draft,
							setDraft,
							onAdd: addItem,
							onRemove: removeItem,
							matchCount,
							onlyList,
							onToggle: () => setOnlyList((value) => !value)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1",
							children: pinned.map((store) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								"aria-pressed": storeId === store.id,
								className: `min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${storeId === store.id ? "bg-ink text-paper" : "border border-line bg-surface"}`,
								onClick: () => setStoreId((current) => current === store.id ? null : store.id),
								children: [store.name, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `ml-2 tabular-nums ${storeId === store.id ? "opacity-70" : "text-faint"}`,
									children: formatMiles(store.distanceMi)
								})]
							}, store.id))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-3 sm:flex-row sm:items-center",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "relative min-w-0 flex-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "sr-only",
										children: "Search sales"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: dealQuery,
										onChange: (event) => setDealQuery(event.target.value),
										placeholder: "Search chicken, milk, detergent",
										className: "h-11 w-full rounded-sm border border-line bg-surface pr-3 pl-10 text-base"
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex h-11 items-center gap-2 text-sm text-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "sr-only",
									children: "Sort"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									value: sort,
									onChange: (event) => setSort(event.target.value),
									className: "h-11 rounded-sm border border-line bg-surface px-3 text-ink",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "nearest",
											children: "Nearest"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "price",
											children: "Price"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "ending",
											children: "Ending soon"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "store",
											children: "Store"
										})
									]
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "-mx-4 flex gap-2 overflow-x-auto px-4",
							children: FILTERS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-pressed": filter === item,
								className: `min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${filter === item ? "bg-accent text-accent-ink" : "bg-chip text-ink"}`,
								onClick: () => setFilter(item),
								children: item === "all" ? "Groceries" : CATEGORY_LABEL[item]
							}, item))
						}),
						visible.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "rounded-xl border border-line bg-surface px-4 py-8 text-center text-muted",
							children: onlyList ? "Nothing on your list is in this week's ads." : "No sales match that filter. Try another aisle or a wider radius."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
							children: visible.map(({ deal, hits, distanceMi, store }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DealCard, {
								deal,
								hits,
								distanceMi,
								store,
								onSave: () => addItem(shortName(deal.name))
							}, deal.id))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StoreList, {
							stores: result.stores,
							deals: result.deals,
							selectedId: storeId,
							onSelect: setStoreId
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "max-w-3xl text-sm text-faint",
							children: [
								"Store pins come from OpenStreetMap. Prices are this week's published circulars for",
								" ",
								result.place.postal,
								". Ads and stock vary by store."
							]
						})
					]
				}) : null,
				status === "loading" && !result ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkeletonGrid, {}) : null
			]
		})]
	});
}
function Finder({ query, setQuery, status, hasResult, onSearch, onLocate }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
		className: "flex flex-col gap-2 sm:flex-row",
		onSubmit: (event) => {
			event.preventDefault();
			onSearch();
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "sr-only",
					children: "ZIP or city"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: query,
					onChange: (event) => setQuery(event.target.value),
					placeholder: "ZIP or city",
					autoComplete: "postal-code",
					className: "h-11 w-full rounded-sm border border-line bg-surface px-3 text-base"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "submit",
				disabled: status === "loading" || query.trim().length < 2,
				className: "h-11 rounded-sm bg-accent px-4 font-medium text-accent-ink disabled:opacity-50",
				children: status === "loading" ? "Searching" : hasResult ? "Update" : "Find sales"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-line bg-surface px-4 font-medium",
				onClick: onLocate,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LocateFixed, {
					className: "size-4",
					"aria-hidden": "true"
				}), "Use my location"]
			})
		]
	});
}
function ListBar({ list, draft, setDraft, onAdd, onRemove, matchCount, onlyList, onToggle }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-xl border border-line bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl font-medium",
					children: "Your list"
				}), list.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					"aria-pressed": onlyList,
					className: `min-h-11 rounded-full px-4 text-sm font-medium ${onlyList ? "bg-accent text-accent-ink" : "bg-match text-ink"}`,
					onClick: onToggle,
					children: [matchCount, " on sale"]
				}) : null]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "mt-3 flex gap-2",
				onSubmit: (event) => {
					event.preventDefault();
					onAdd(draft);
				},
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "sr-only",
						children: "Add an item"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: draft,
						onChange: (event) => setDraft(event.target.value),
						placeholder: "Add milk, eggs, chicken",
						className: "h-11 w-full rounded-sm border border-line bg-paper px-3"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "submit",
					className: "h-11 rounded-sm bg-ink px-4 font-medium text-paper",
					children: "Add"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: (list.length ? list : STARTERS).map((item) => list.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex min-h-11 items-center gap-1 rounded-full bg-chip pl-4 pr-1 text-sm",
					children: [item, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "grid size-9 place-items-center rounded-full",
						onClick: () => onRemove(item),
						"aria-label": `Remove ${item}`,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
							className: "size-4",
							"aria-hidden": "true"
						})
					})]
				}, item) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "inline-flex min-h-11 items-center gap-1 rounded-full bg-chip px-4 text-sm font-medium",
					onClick: () => onAdd(item),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
						className: "size-4",
						"aria-hidden": "true"
					}), item]
				}, item))
			})
		]
	});
}
function DealCard({ deal, hits, distanceMi, store, onSave }) {
	const [imageOk, setImageOk] = (0, import_react.useState)(true);
	const href = store ? storeDirections(store) : void 0;
	const body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [deal.image && imageOk ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: deal.image,
		alt: "",
		className: "size-16 shrink-0 rounded-sm bg-paper object-contain",
		loading: "lazy",
		onError: () => setImageOk(false)
	}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid size-16 shrink-0 place-items-center rounded-sm bg-chip text-sm font-medium text-muted",
		children: deal.merchant.slice(0, 1)
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-w-0 flex-1",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "truncate text-sm text-muted",
				children: [deal.merchant, distanceMi != null ? ` · ${formatMiles(distanceMi)}` : " · ZIP ad"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 line-clamp-2 font-medium leading-snug",
				children: deal.name
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex items-end justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-display text-xl font-medium tabular-nums",
					children: money(deal.price)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium text-sale",
					children: endsLabel(deal.validTo)
				})]
			})
		]
	})] });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: "rounded-xl border border-line bg-surface p-4 shadow-card",
		children: [href ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
			href,
			target: "_blank",
			rel: "noreferrer",
			className: "flex gap-3 rounded-sm",
			"aria-label": `${deal.name} at ${store?.name}. Open directions.`,
			children: body
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex gap-3",
			children: body
		}), hits.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-2 inline-flex min-h-8 items-center rounded-full bg-match px-3 text-xs font-medium",
			children: ["On your list · ", hits.join(", ")]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent",
			onClick: onSave,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
				className: "size-4",
				"aria-hidden": "true"
			}), "Add to list"]
		})]
	});
}
function StoreList({ stores, deals, selectedId, onSelect }) {
	if (stores.length === 0) return null;
	const ordered = [...stores].sort((a, b) => a.distanceMi - b.distanceMi);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
		className: "font-display text-xl font-medium",
		children: "Stores"
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "mt-3 divide-y divide-line rounded-xl border border-line bg-surface",
		children: ordered.map((store) => {
			const count = deals.filter((deal) => deal.chainKey === store.chainKey).length;
			const selected = selectedId === store.id;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-medium",
						children: store.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-sm text-muted",
						children: [
							formatMiles(store.distanceMi),
							store.street ? ` · ${store.street}` : "",
							count > 0 ? ` · ${count} ad prices` : " · No ad this week"
						]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2",
					children: [count > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-pressed": selected,
						className: `min-h-11 rounded-sm px-3 text-sm font-medium ${selected ? "bg-ink text-paper" : "border border-line"}`,
						onClick: () => onSelect(selected ? null : store.id),
						children: selected ? "Showing" : "Sales"
					}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						className: "inline-flex min-h-11 items-center rounded-sm border border-line px-3 text-sm font-medium",
						href: `https://www.openstreetmap.org/?mlat=${store.lat}&mlon=${store.lon}#map=17/${store.lat}/${store.lon}`,
						target: "_blank",
						rel: "noreferrer",
						children: "Map"
					})]
				})]
			}, store.id);
		})
	})] });
}
function SkeletonGrid() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
		"aria-hidden": "true",
		children: Array.from({ length: 6 }, (_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-36 rounded-xl border border-line bg-chip" }, index))
	});
}
function storeDirections(store) {
	return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lon}`;
}
function shortName(name) {
	const trimmed = name.replace(/\s+/g, " ").trim();
	return trimmed.length > 42 ? `${trimmed.slice(0, 42).trim()}…` : trimmed;
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AisleApp, {});
}
//#endregion
export { Home as component };
