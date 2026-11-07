/**
 * In-memory performance history, newest last. One sample per `sampleRate`
 * (1 s by default), so this is about an hour at the default rate.
 *
 * It used to grow for the whole session, appending with an array spread, so a
 * long session paid an ever larger copy per sample and never released memory.
 */
export const PERFORMANCE_HISTORY_MAX = 3600;

export function appendPerformanceSample<T>(prev: T[] | undefined, sample: T, max = PERFORMANCE_HISTORY_MAX): T[] {
  const history = prev ?? [];
  const start = history.length >= max ? history.length - max + 1 : 0;
  const next = history.slice(start);
  next.push(sample);
  return next;
}
