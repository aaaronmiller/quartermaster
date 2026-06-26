import { mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openCatalog } from "../src/storage/schema";
import { Repository } from "../src/storage/repository";

export function tempRepo(): { repo: Repository; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "qm-test-"));
  return { repo: new Repository(openCatalog(join(dir, "catalog.sqlite"))), dir };
}

export function fixtureLibrary(): string {
  return resolve("tests/fixtures/library/mixed");
}

export function copyFixtureLibrary(): string {
  const dir = mkdtempSync(join(tmpdir(), "qm-lib-"));
  cpSync(fixtureLibrary(), dir, { recursive: true });
  return dir;
}
