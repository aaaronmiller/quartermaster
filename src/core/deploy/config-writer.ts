import yaml from "js-yaml";
import { stringify as tomlStringify } from "smol-toml";
import type { ConfigFormat } from "../types";

export function serializeConfig(value: unknown, format: ConfigFormat): string {
  if (format === "json") return `${JSON.stringify(value, null, 2)}\n`;
  if (format === "yaml") return yaml.dump(value, { noRefs: true });
  return tomlStringify(value as Record<string, unknown>);
}
