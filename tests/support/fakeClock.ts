export function createFakeClock(start = Date.parse("2026-01-01T12:00:00.000Z")) {
  let current = start;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}
