// Polls until a condition holds or the timeout expires. Never a fixed sleep:
// the test moves on as soon as the system is ready, and fails with context
// when it never gets there.
export async function waitFor<T>(
  probe: () => Promise<T>,
  {
    until,
    timeoutMs,
    intervalMs = 250,
    description,
    diagnose,
  }: {
    until: (value: T) => boolean;
    timeoutMs: number;
    intervalMs?: number;
    description: string;
    /** Extra facts to print on timeout, e.g. the indexer status. */
    diagnose?: () => Promise<string>;
  },
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await probe();
    if (until(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs)); // allow-fixed-wait: pause between polls
  } while (Date.now() < deadline);

  const details = diagnose ? `\n${await diagnose()}` : "";
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${description}.\nLast value: ${JSON.stringify(last)}${details}`);
}
