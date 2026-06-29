// ─────────────────────────────────────────────────────────────
// Quartermaster — shared web layout + HTML escaping (NFR-052)
// ─────────────────────────────────────────────────────────────

/** Escape user/content text for safe HTML interpolation. */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wrap page body in the dark-mode-first shell with nav. */
export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quartermaster — ${esc(title)}</title>
  <link rel="stylesheet" href="/theme.css">
</head>
<body>
  <header>
    <h1>⛳ Quartermaster</h1>
    <nav>
      <a href="/">Catalog</a>
      <a href="/matrix">Matrix</a>
      <a href="/loadouts">Loadouts</a>
      <a href="/proposals">Proposals</a>
    </nav>
  </header>
  <main>${body}</main>
</body>
</html>`;
}
