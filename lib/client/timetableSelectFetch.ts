/**
 * `pushTimetableQuery` sets `ttUrlSkipRef` so the URL effect does not double-fetch.
 * Selection handlers that only push the URL must therefore fetch directly.
 */
export function shouldDirectFetchAfterTimetableUrlPush(opts: {
  urlPushSetsSkipRef: boolean;
}): boolean {
  return opts.urlPushSetsSkipRef;
}
