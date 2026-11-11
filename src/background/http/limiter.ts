/**
 * Limits how many tasks run at once, queueing the rest in arrival order.
 *
 * Used to cap concurrent requests to NYC Open Data, which throttles bursts from
 * one IP address.
 */

/** Runs tasks with a concurrency limit. */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Creates a limiter.
 *
 * @param maxConcurrent - How many tasks may run at once.
 * @returns A function that runs a task when a slot is free.
 *
 * @example
 * const limit = createLimiter(2);
 * await Promise.all(urls.map((url) => limit(() => fetch(url))));
 */
export function createLimiter(maxConcurrent: number): Limiter {
  let running = 0;
  const waiting: (() => void)[] = [];

  const release = (): void => {
    running--;
    waiting.shift()?.();
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= maxConcurrent) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running++;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
