// ─────────────────────────────────────────────────────────────
// Quartermaster — view scope for the heavy web pages (NFR-052)
// ─────────────────────────────────────────────────────────────
//
// Both `/` and `/matrix` rendered the whole catalogue into one document.
// Measured 2026-08-21: `/` was 5,180,224 bytes and `/matrix` was 23,403,991
// bytes across 157,781 verdict cells. Both returned 200, so the acceptance
// tests ("renders the catalog table", "renders verdict grid (status 200)")
// passed while no browser could open either page.
//
// The default scope is chosen from what the catalogue actually holds:
// 10,487 of 12,137 artifacts are `script` files living inside skill packages,
// against 1,461 skills. An unfiltered first screen is therefore ~86% noise
// relative to what the tool exists to manage.

import { esc } from './layout';

export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 2000;

export interface ViewScope {
  type: string | null;
  q: string | null;
  limit: number;
  offset: number;
}

export function parseScope(url: URL, defaultType: string | null = null): ViewScope {
  const rawType = url.searchParams.get('type');
  // `type=all` is the explicit opt-out; an absent parameter takes the default.
  const type = rawType === 'all' ? null : (rawType ?? defaultType);

  const q = url.searchParams.get('q')?.trim() || null;

  const rawLimit = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  const rawOffset = Number(url.searchParams.get('offset'));
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  return { type, q, limit, offset };
}

export interface Scoped<T> {
  page: T[];
  matched: number;
  total: number;
}

export function applyScope<T extends { type?: string; name?: string; organizationalPath?: string }>(
  items: T[],
  scope: ViewScope,
): Scoped<T> {
  let matched = items;
  if (scope.type) matched = matched.filter((item) => item.type === scope.type);
  if (scope.q) {
    const needle = scope.q.toLowerCase();
    matched = matched.filter(
      (item) =>
        (item.name ?? '').toLowerCase().includes(needle) ||
        (item.organizationalPath ?? '').toLowerCase().includes(needle),
    );
  }
  return {
    page: matched.slice(scope.offset, scope.offset + scope.limit),
    matched: matched.length,
    total: items.length,
  };
}

function href(path: string, scope: ViewScope, over: Partial<ViewScope>): string {
  const merged = { ...scope, ...over };
  const p = new URLSearchParams();
  p.set('type', merged.type ?? 'all');
  if (merged.q) p.set('q', merged.q);
  p.set('limit', String(merged.limit));
  if (merged.offset > 0) p.set('offset', String(merged.offset));
  return `${path}?${p.toString()}`;
}

/**
 * Filter form plus prev/next. Rendered above the table so the reader can see
 * that the page is a slice, and of what. A page that silently truncates is
 * worse than one that is too large.
 */
export function renderScopeControls(
  path: string,
  scope: ViewScope,
  result: Scoped<unknown>,
  types: string[],
): string {
  const shownFrom = result.matched === 0 ? 0 : scope.offset + 1;
  const shownTo = Math.min(scope.offset + scope.limit, result.matched);

  const options = ['all', ...types]
    .map((t) => {
      const selected = (scope.type ?? 'all') === t ? ' selected' : '';
      return `<option value="${esc(t)}"${selected}>${esc(t)}</option>`;
    })
    .join('');

  const prev =
    scope.offset > 0
      ? `<a class="chip" href="${esc(href(path, scope, { offset: Math.max(0, scope.offset - scope.limit) }))}">&larr; prev</a>`
      : `<span class="chip" aria-disabled="true">&larr; prev</span>`;
  const next =
    shownTo < result.matched
      ? `<a class="chip" href="${esc(href(path, scope, { offset: scope.offset + scope.limit }))}">next &rarr;</a>`
      : `<span class="chip" aria-disabled="true">next &rarr;</span>`;

  return `
    <form class="glass-card anim-section" method="get" action="${esc(path)}" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <label>Type
        <select name="type">${options}</select>
      </label>
      <label>Search
        <input type="search" name="q" value="${esc(scope.q ?? '')}" placeholder="name or path">
      </label>
      <label>Per page
        <input type="number" name="limit" min="1" max="${MAX_LIMIT}" value="${scope.limit}" style="width:6em">
      </label>
      <button type="submit">Apply</button>
      <span class="chip">showing ${shownFrom}-${shownTo} of ${result.matched}${
        result.matched === result.total ? '' : ` (${result.total} total)`
      }</span>
      ${prev} ${next}
    </form>`;
}
