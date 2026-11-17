import { useSyncExternalStore } from 'react';

export type RoutePath = '/' | '/products' | '/studio' | '/templates' | '/library' | '/publish' | '/poc';
export const ROUTE_PATHS: readonly RoutePath[] = ['/', '/products', '/studio', '/templates', '/library', '/publish', '/poc'];

export interface Route {
  path: RoutePath;
  params: Record<string, string>;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart = '/', query = ''] = raw.split('?');
  const path = (ROUTE_PATHS as readonly string[]).includes(pathPart) ? (pathPart as RoutePath) : '/';
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  return { path, params };
}

export function buildHash(path: RoutePath, params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

const snapshot = () => window.location.hash;

/** Router hash tối giản (không thêm phụ thuộc, không đụng cấu hình file://). */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot);
  return parseHash(hash);
}

export function navigate(path: RoutePath, params?: Record<string, string | undefined>): void {
  window.location.hash = buildHash(path, params);
}
