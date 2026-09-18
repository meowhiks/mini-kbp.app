/** API paths on the backend host (v0 — без legacy-префикса /v0/). */

export const API_V0_PREFIX = "/v0";

/** Собрать путь вида `/v0/auth/refresh/` */
export function apiPath(segment: string): string {
  const clean = segment.replace(/^\/+/, "").replace(/^(api|v0)\//, "");
  return `${API_V0_PREFIX}/${clean}`;
}

/** Полный URL к API для fetch (base без trailing slash). */
export function apiUrl(base: string, segment: string): string {
  return `${base.replace(/\/+$/, "")}${apiPath(segment)}`;
}
