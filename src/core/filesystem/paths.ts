import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

export function resolveInside(root: string, candidate: string): string {
  const rootAbs = resolve(root);
  const pathAbs = resolve(rootAbs, candidate);
  const rel = relative(rootAbs, pathAbs);
  if (rel.startsWith("..") || rel === ".." || rel.startsWith(`..${"/"}`)) {
    throw new Error(`Path escapes configured root: ${candidate}`);
  }
  return pathAbs;
}

export function assertExistingDirectory(path: string): string {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`Directory does not exist: ${abs}`);
  if (!statSync(abs).isDirectory()) throw new Error(`Not a directory: ${abs}`);
  return realpathSync(abs);
}

export function relativeUnix(root: string, path: string): string {
  return relative(root, path).split("\\").join("/");
}

export function ensureParent(path: string): void {
  const fs = require("node:fs") as typeof import("node:fs");
  fs.mkdirSync(dirname(path), { recursive: true });
}
