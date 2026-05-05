export type Throttled = (() => void) & { cancel: () => void };

export function throttle(fn: () => void, intervalMs: number): Throttled {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const call = (() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, intervalMs);
  }) as Throttled;
  call.cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return call;
}
