import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeOrderSearchPhone,
  scheduleOrderSearch,
  ORDER_SEARCH_DEBOUNCE_MS,
} from "./order-search";

describe("computeOrderSearchPhone", () => {
  it("returns '' for empty / whitespace input", () => {
    expect(computeOrderSearchPhone("")).toBe("");
    expect(computeOrderSearchPhone("   ")).toBe("");
  });

  it("returns '' for partial digits (< 11)", () => {
    expect(computeOrderSearchPhone("0170")).toBe("");
    expect(computeOrderSearchPhone("017012345")).toBe("");
  });

  it("returns '' for non-phone strings (names, order numbers)", () => {
    expect(computeOrderSearchPhone("Rahim")).toBe("");
    expect(computeOrderSearchPhone("INV-1234")).toBe("");
  });

  it("normalizes a full 11-digit BD phone", () => {
    expect(computeOrderSearchPhone("01711223344")).toBe("01711223344");
    expect(computeOrderSearchPhone("  01711223344 ")).toBe("01711223344");
  });

  it("strips +88 / 88 country prefixes", () => {
    expect(computeOrderSearchPhone("+8801711223344")).toBe("01711223344");
    expect(computeOrderSearchPhone("8801711223344")).toBe("01711223344");
  });

  it("converts Bengali digits to ASCII", () => {
    // ০১৭১১২২৩৩৪৪ === 01711223344
    expect(computeOrderSearchPhone("০১৭১১২২৩৩৪৪")).toBe("01711223344");
  });

  it("rejects numbers that don't start with 01 after normalization", () => {
    expect(computeOrderSearchPhone("02123456789")).toBe("");
  });
});

describe("scheduleOrderSearch (debounce behavior)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies '' synchronously and does NOT schedule a timer for partial input", () => {
    const apply = vi.fn();
    scheduleOrderSearch("0170", apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith("");
    // Advance well past debounce — nothing extra should fire.
    vi.advanceTimersByTime(ORDER_SEARCH_DEBOUNCE_MS * 5);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("waits for the debounce before firing on a complete phone", () => {
    const apply = vi.fn();
    scheduleOrderSearch("01711223344", apply);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ORDER_SEARCH_DEBOUNCE_MS - 1);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith("01711223344");
  });

  it("coalesces rapid keystrokes into a single query (no extra fetches during typing)", () => {
    const apply = vi.fn();
    // Simulate the useEffect cleanup pattern: each keystroke cancels the
    // previous pending timer.
    let cancel = scheduleOrderSearch("0171122", apply);       // partial → apply("")
    cancel();
    cancel = scheduleOrderSearch("01711223", apply);          // partial → apply("")
    cancel();
    cancel = scheduleOrderSearch("017112233", apply);         // partial → apply("")
    cancel();
    cancel = scheduleOrderSearch("0171122334", apply);        // partial → apply("")
    cancel();
    cancel = scheduleOrderSearch("01711223344", apply);       // full → scheduled
    // Partial keystrokes must not have scheduled any fetch for a full phone.
    // Only the sync apply("") calls should have run.
    expect(apply.mock.calls.every(([v]) => v === "")).toBe(true);
    const beforeFlush = apply.mock.calls.length;
    vi.advanceTimersByTime(ORDER_SEARCH_DEBOUNCE_MS);
    expect(apply).toHaveBeenCalledTimes(beforeFlush + 1);
    expect(apply).toHaveBeenLastCalledWith("01711223344");
    cancel();
  });

  it("cleanup cancels a pending debounced fire (no query if user clears input)", () => {
    const apply = vi.fn();
    const cancel = scheduleOrderSearch("01711223344", apply);
    // User clears input before the debounce elapses.
    cancel();
    vi.advanceTimersByTime(ORDER_SEARCH_DEBOUNCE_MS * 10);
    expect(apply).not.toHaveBeenCalled();
  });
});