import type { CourierAdapter } from "./types";

export const nullAdapter: CourierAdapter = {
  name: "unknown",
  async getBalance() { return { supported: false }; },
  async getCodReport() { return { supported: false }; },
  async getReturns() { return { supported: false }; },
  async getPayments() { return { supported: false }; },
  async getTracking() { return { supported: false }; },
};
