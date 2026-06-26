export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printText(lines: string[] | string): void {
  process.stdout.write(`${Array.isArray(lines) ? lines.join("\n") : lines}\n`);
}

export function fail(message: string, code = 1): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}

export function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}
