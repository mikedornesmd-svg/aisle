import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DealQuery } from "./deals";
import { loadDeals } from "./load-deals";

const Input = z.object({
  query: z.string().trim().max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  radiusMi: z.number().min(1).max(30).optional(),
});

export const getNearbyDeals = createServerFn({ method: "POST" })
  .validator((input: unknown): DealQuery => {
    const parsed = Input.safeParse(input);
    if (!parsed.success) throw new Error("Enter a ZIP code or city.");
    const data = parsed.data;
    if (!data.query && (data.lat == null || data.lon == null)) {
      throw new Error("Enter a ZIP code or city, or use your location.");
    }
    return data;
  })
  .handler(async ({ data }) => loadDeals(data));
