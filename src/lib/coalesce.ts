// Tiny coalescer for realtime invalidations.
// Multiple postgres_changes events within `ms` collapse into a single call.
export function makeCoalescer(fn: () => void, ms = 800) {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      fn();
    }, ms);
  };
}
