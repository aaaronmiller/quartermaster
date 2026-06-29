// ─────────────────────────────────────────────────────────────
// Quartermaster — TUI theme (NFR-052, dark-mode-first)
// ANSI palette tuned for dark terminals; the default theme IS dark.
// ─────────────────────────────────────────────────────────────

export interface Theme {
  name: string;
  dark: boolean;
  reset: string;
  title: string;
  heading: string;
  dim: string;
  ok: string;
  warn: string;
  bad: string;
  accent: string;
}

const ESC = '[';

/** Dark-mode-first default theme. */
export const darkTheme: Theme = {
  name: 'dark',
  dark: true,
  reset: `${ESC}0m`,
  title: `${ESC}1;38;5;81m`, // bright cyan, bold
  heading: `${ESC}1;38;5;231m`, // bright white, bold
  dim: `${ESC}38;5;244m`, // grey
  ok: `${ESC}38;5;114m`, // green
  warn: `${ESC}38;5;215m`, // amber
  bad: `${ESC}38;5;203m`, // red
  accent: `${ESC}38;5;141m`, // violet
};

/** The default theme is dark (NFR-052). */
export const defaultTheme: Theme = darkTheme;

export function paint(theme: Theme, color: keyof Theme, text: string): string {
  const code = theme[color];
  if (typeof code !== 'string' || !code.startsWith(ESC)) return text;
  return `${code}${text}${theme.reset}`;
}
