import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

const defaultOrdersSearch = {
  status: "all",
  page: 1,
  limit: 10,
  source: "all",
  site: "all",
  courier: "all",
  partner: "all",
  staff: "all",
  q: "",
  advanceOnly: false,
  dup: false,
};

const ordersSearch = z.object({
  status: fallback(z.string(), defaultOrdersSearch.status).default(defaultOrdersSearch.status),
  page: fallback(z.number(), defaultOrdersSearch.page).default(defaultOrdersSearch.page),
  limit: fallback(z.number(), defaultOrdersSearch.limit).default(defaultOrdersSearch.limit),
  source: fallback(z.string(), defaultOrdersSearch.source).default(defaultOrdersSearch.source),
  site: fallback(z.string(), defaultOrdersSearch.site).default(defaultOrdersSearch.site),
  courier: fallback(z.string(), defaultOrdersSearch.courier).default(defaultOrdersSearch.courier),
  partner: fallback(z.string(), defaultOrdersSearch.partner).default(defaultOrdersSearch.partner),
  staff: fallback(z.string(), defaultOrdersSearch.staff).default(defaultOrdersSearch.staff),
  q: fallback(z.string(), defaultOrdersSearch.q).default(defaultOrdersSearch.q),
  advanceOnly: fallback(z.boolean(), defaultOrdersSearch.advanceOnly).default(defaultOrdersSearch.advanceOnly),
  dup: fallback(z.boolean(), defaultOrdersSearch.dup).default(defaultOrdersSearch.dup),
});

export const Route = createFileRoute("/_app/orders/")({
  head: () => ({ meta: [{ title: "Orders — OMS" }] }),
  validateSearch: zodValidator(ordersSearch),
  search: {
    middlewares: [stripSearchParams(defaultOrdersSearch)],
  },
});
