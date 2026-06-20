import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

const ordersSearch = z.object({
  status: fallback(z.string(), "processing").default("processing"),
  page: fallback(z.number(), 1).default(1),
  limit: fallback(z.number(), 10).default(10),
  source: fallback(z.string(), "all").default("all"),
  site: fallback(z.string(), "all").default("all"),
  courier: fallback(z.string(), "all").default("all"),
  partner: fallback(z.string(), "all").default("all"),
  staff: fallback(z.string(), "all").default("all"),
  q: fallback(z.string(), "").default(""),
  advanceOnly: fallback(z.boolean(), false).default(false),
  dup: fallback(z.boolean(), false).default(false),
});

export const Route = createFileRoute("/_app/orders/")({
  head: () => ({ meta: [{ title: "Orders — OMS" }] }),
  validateSearch: zodValidator(ordersSearch),
});
