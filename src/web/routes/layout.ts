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

/** Build the active nav class string. */
export function navClass(href: string, current: string): string {
  const target = href.replace(/\/+$/, '') || '/';
  const here = current.replace(/\/+$/, '') || '/';
  return target === here ? 'nav-link active' : 'nav-link';
}

/** Wrap page body in the glassmorphic shell with animated nav. */
export function layout(title: string, body: string, path: string = '/'): string {
  const current = path;

  const navItems = [
    { href: '/', label: 'Catalog', icon: '⌘' },
    { href: '/matrix', label: 'Matrix', icon: '⊞' },
    { href: '/loadouts', label: 'Loadouts', icon: '⊡' },
    { href: '/proposals', label: 'Proposals', icon: '◎' },
  ];

  const navLinks = navItems
    .map(
      (n) =>
        `<a class="${navClass(n.href, current)}" href="${esc(n.href)}">
          <span class="nav-icon" aria-hidden="true">${n.icon}</span>
          ${esc(n.label)}
        </a>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quartermaster -- ${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/theme.css">
</head>
<body>
  <header>
    <a class="brand" href="/">
      <span class="brand-icon" aria-hidden="true">Q</span>
      <span class="brand-text">Quartermaster</span>
    </a>
    <nav aria-label="primary">
      <span class="nav-indicator" aria-hidden="true"></span>
      ${navLinks}
    </nav>
  </header>
  <main>
    <div class="page-header anim-section">
      <h1>${esc(title)}</h1>
      <p>local-first agent artifact management</p>
    </div>
    ${body}
  </main>
  <script defer src="/assets/js/animations.js">
  </script>
</body>
</html>`;
}
