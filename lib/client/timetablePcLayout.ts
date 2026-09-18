export function timetablePcSidePadClass(opts: { isPc: boolean; enabled: boolean }): string {
  if (!opts.isPc || !opts.enabled) return "";
  return "px-8 lg:px-20";
}
