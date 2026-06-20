import type { CourierAdapter } from "./types";
import { nullAdapter } from "./null-adapter";
import { steadfastAdapter } from "./steadfast";

export function resolveAdapter(courierName: string | null | undefined): CourierAdapter {
  const n = (courierName ?? "").toLowerCase();
  if (n.includes("steadfast") || n.includes("packzy")) return steadfastAdapter;
  return nullAdapter;
}
