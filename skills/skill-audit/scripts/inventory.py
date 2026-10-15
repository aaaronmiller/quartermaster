#!/usr/bin/env python3
"""Measure a skill collection across harnesses. Measures only; never judges.

Per harness: skills listed, skills the model may invoke (after every control
this script can read), managed (symlink) vs unmanaged (real dir) entries,
listing size, and the listing budget and per-skill allowance when the
context window is known. Per skill: hashes (whole file and body only),
frontmatter problems, description and when_to_use lengths, body size,
repeated paragraphs, broken resource paths. Across harnesses: missing
names, divergent content, double loading.

Controls read: disable-model-invocation (frontmatter), Claude Code
skillOverrides (~/.claude/settings.json), Codex [[skills.config]] enabled =
false (~/.codex/config.toml) and agents/openai.yaml allow_implicit_invocation,
OpenCode metadata opencode/autoinvoke.

Usage:
  python3 inventory.py --out inventory.json --context claude=1000000 --context codex=400000
  python3 inventory.py --out inv.json --config harnesses.json --root ~/code/my-skills

harnesses.json (optional) overrides the built-in table, for example
  {"claude": {"own": "~/.claude/skills", "reads": ["~/.claude/skills"], "fraction": 0.01}}
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

try:
    import yaml  # type: ignore
except ImportError:  # the subset parser below is the fallback
    yaml = None

# "own" is the folder a sync tool writes; "reads" is every user-level folder the
# harness loads skills from (per its docs; verify at audit time). "fraction" is the
# documented listing budget as a share of the context window; "cap" a per-skill cap.
HARNESSES = {
    "claude": {"own": "~/.claude/skills", "reads": ["~/.claude/skills"], "fraction": 0.01, "cap": 1536},
    "codex": {"own": "~/.codex/skills", "reads": ["~/.codex/skills", "~/.agents/skills"], "fraction": 0.02},
    "gemini": {"own": "~/.gemini/skills", "reads": ["~/.gemini/skills", "~/.agents/skills"]},
    "antigravity": {"own": "~/.gemini/antigravity-cli/skills", "reads": ["~/.gemini/antigravity-cli/skills"]},
    "opencode": {"own": "~/.config/opencode/skills",
                 "reads": ["~/.config/opencode/skills", "~/.claude/skills", "~/.agents/skills"]},
    "pi": {"own": "~/.pi/agent/skills", "reads": ["~/.pi/agent/skills", "~/.agents/skills"]},
    "kilocode": {"own": "~/.kilocode/skills",
                 "reads": ["~/.kilocode/skills", "~/.kilo/skills", "~/.claude/skills", "~/.agents/skills"]},
    "omp": {"own": "~/.omp/agent/skills", "reads": ["~/.omp/agent/skills"]},
    "hermes": {"own": "~/.hermes/skills", "reads": ["~/.hermes/skills"], "budget_chars": 12000},
    "muse": {"own": "~/.config/muse/skills", "reads": ["~/.config/muse/skills"]},
    "qwen": {"own": "~/.qwen/skills", "reads": ["~/.qwen/skills"]},
    "ante": {"own": "~/.ante/skills", "reads": ["~/.ante/skills"]},
    "openclaw": {"own": "~/.openclaw/skills", "reads": ["~/.openclaw/skills"]},
}
# Which frontmatter controls each harness honors (documented ones only).
HONORS_DMI = {"claude", "pi"}
CHARS_PER_TOKEN = 4      # English prose estimate; CJK text runs 1 to 2
ENTRY_OVERHEAD = 30      # name plus list formatting; recompute if names average over 20 chars
HEADROOM = 0.8           # space left for bundled and plugin skills this script cannot see
PORTABLE_FIELDS = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
HARNESS_FIELDS = {  # Claude Code frontmatter fields; other harnesses ignore them
    "when_to_use", "disable-model-invocation", "user-invocable", "argument-hint", "arguments",
    "context", "agent", "hooks", "shell", "paths", "effort"}
TRUE = {"true", "yes", "1", "on"}
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
FM_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(\n|\Z)", re.S)
RESOURCE_RE = re.compile(r"(?<![\w/.])((?:references|reference|scripts|assets|templates|resources)/[\w./-]+\.\w{1,6})")


def expand(p: str) -> Path:
    return Path(os.path.expanduser(p))


def parse_frontmatter(text: str):
    m = FM_RE.match(text)
    if not m:
        return None, text
    raw, body = m.group(1), text[m.end():]
    if yaml is not None:
        try:
            data = yaml.safe_load(raw)
            if isinstance(data, dict):
                return data, body
        except yaml.YAMLError:
            return {"__yaml_error__": True}, body
    fields: dict = {}
    key, block = None, False
    for line in raw.splitlines():
        top = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if top:
            key, val = top.group(1), top.group(2).strip()
            block = val in (">", "|", ">-", "|-", ">+", "|+")
            fields[key] = "" if block else val.strip("'\"")
        elif key and (block or line.startswith((" ", "\t"))):
            fields[key] = (str(fields[key]) + " " + line.strip()).strip()
    return fields, body


def truthy(v) -> bool:
    return str(v).strip().lower() in TRUE


def metadata_get(fm: dict, key: str):
    md = fm.get("metadata")
    if isinstance(md, dict):
        return md.get(key)
    if isinstance(md, str):
        m = re.search(rf"{re.escape(key)}\s*:\s*['\"]?([^'\"\n]+)", md)
        return m.group(1) if m else None
    return None


def repeated_paragraphs(body: str) -> dict:
    paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", body)]
    paras = [p for p in paras if len(p) >= 160]
    counts = Counter(paras)
    dups = {p: n for p, n in counts.items() if n > 1}
    return {"dup_paragraphs": len(dups), "max_repeat": max(counts.values()) if counts else 0,
            "dup_chars": sum(len(p) * (n - 1) for p, n in dups.items())}


def scan_skill(d: Path) -> dict | None:
    sk = d / "SKILL.md"
    if not sk.is_file():
        return None
    try:
        raw = sk.read_bytes()
    except OSError as e:
        return {"error": str(e)}
    text = raw.decode("utf-8", "replace")
    fm, body = parse_frontmatter(text)
    problems = []
    if fm is None:
        problems.append("no-frontmatter")
        fm = {}
    if fm.get("__yaml_error__"):
        problems.append("yaml-error")
    name = str(fm.get("name") or "")
    desc = str(fm.get("description") or "").strip()
    wtu = str(fm.get("when_to_use") or "").strip()
    if not name:
        problems.append("no-name")
    elif not NAME_RE.match(name) or len(name) > 64:
        problems.append("invalid-name")
    if name and name != d.name:
        problems.append("name-dir-mismatch")
    if not desc:
        problems.append("no-description")
    elif len(desc) > 1024:
        problems.append("description-over-1024")
    if re.search(r"<[A-Za-z/][^>]*>", desc):
        problems.append("description-has-tags")
    if "model" in fm:
        problems.append("model-pinned")
    extra = sorted(set(fm) - PORTABLE_FIELDS - HARNESS_FIELDS - {"model", "__yaml_error__"})
    if extra:
        problems.append("nonportable-fields:" + ",".join(extra))
    refs = sorted({m.group(1).rstrip(".,)`'\"") for m in RESOURCE_RE.finditer(body)})
    broken = [r for r in refs if not (d / r).exists()]
    files = [p for p in d.rglob("*") if p.is_file() and ".git" not in p.parts]
    openai_yaml = d / "agents" / "openai.yaml"
    codex_implicit = True
    if openai_yaml.is_file():
        codex_implicit = not re.search(r"allow_implicit_invocation:\s*false", openai_yaml.read_text(errors="replace"), re.I)
    return {
        "sha256": hashlib.sha256(raw).hexdigest(),
        "body_sha256": hashlib.sha256(re.sub(r"\s+", " ", body).strip().encode()).hexdigest(),
        "name": name,
        "description": desc,
        "desc_chars": len(desc),
        "when_to_use_chars": len(wtu),
        "listing_chars": len(desc) + (len(wtu) + 1 if wtu else 0),
        "disable_model_invocation": truthy(fm.get("disable-model-invocation", "")),
        "opencode_autoinvoke": str(metadata_get(fm, "opencode/autoinvoke") or "true").lower() not in ("false", "0", "no"),
        "codex_implicit": codex_implicit,
        "body_lines": body.count("\n") + 1,
        "body_words": len(body.split()),
        "has_references": (d / "references").is_dir(),
        "n_files": len(files),
        "refs_mentioned": len(refs),
        "refs_broken": broken[:25],
        "problems": problems,
        **repeated_paragraphs(body),
    }


def list_dir(root: Path) -> dict:
    out = {}
    if not root.is_dir():
        return out
    for p in sorted(root.iterdir()):
        if p.name.startswith(".") or not p.is_dir():
            continue
        out[p.name] = {"kind": "symlink" if p.is_symlink() else "dir", "resolved": str(p.resolve())}
    return out


def claude_overrides() -> dict:
    p = expand("~/.claude/settings.json")
    try:
        return json.loads(p.read_text()).get("skillOverrides", {}) or {}
    except (OSError, json.JSONDecodeError):
        return {}


def codex_disabled() -> set[str]:
    p = expand("~/.codex/config.toml")
    try:
        text = p.read_text()
    except OSError:
        return set()
    out = set()
    for block in re.split(r"\n\s*\[\[skills\.config\]\]", text)[1:]:
        path = re.search(r'path\s*=\s*"([^"]+)"', block)
        if path and re.search(r"enabled\s*=\s*false", block):
            out.add(str(Path(os.path.expanduser(path.group(1))).resolve().parent))
    return out


def invocable(h: str, name: str, info: dict, resolved: str, overrides: dict, codex_off: set) -> str:
    """'full' (name and description listed), 'name' (name only) or 'none'."""
    if h in HONORS_DMI and info.get("disable_model_invocation"):
        return "none"
    if h == "claude":
        o = overrides.get(name, "on")
        return {"on": "full", "name-only": "name"}.get(o, "none")
    if h == "codex" and (not info.get("codex_implicit", True) or resolved in codex_off):
        return "none"
    if h == "opencode" and not info.get("opencode_autoinvoke", True):
        return "none"
    return "full"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, help="JSON report path")
    ap.add_argument("--config", help="JSON harness table overriding the built-in one")
    ap.add_argument("--context", action="append", default=[], metavar="HARNESS=TOKENS",
                    help="context window of the harness's active model, to compute its listing budget")
    ap.add_argument("--root", action="append", default=[], help="extra authoring roots to scan")
    args = ap.parse_args()

    harnesses = json.loads(json.dumps(HARNESSES))
    if args.config:
        for k, v in json.loads(Path(args.config).read_text()).items():
            harnesses.setdefault(k, {}).update(v)
    for item in args.context:
        h, _, tok = item.partition("=")
        harnesses.setdefault(h, {"own": "", "reads": []})["context_tokens"] = int(tok)

    folders = {}
    for cfg in harnesses.values():
        for p in [cfg.get("own", "")] + cfg.get("reads", []):
            if p:
                folders[str(expand(p))] = list_dir(expand(p))
    for r in args.root:
        folders[str(expand(r))] = list_dir(expand(r))

    skills: dict[str, dict | None] = {}
    for entries in folders.values():
        for e in entries.values():
            if e["resolved"] not in skills:
                skills[e["resolved"]] = scan_skill(Path(e["resolved"]))

    overrides, codex_off = claude_overrides(), codex_disabled()
    report = {"constants": {"chars_per_token": CHARS_PER_TOKEN, "entry_overhead": ENTRY_OVERHEAD, "headroom": HEADROOM},
              "harnesses": {}, "folders": folders, "skills": skills, "parity": {}, "double_loading": {}}
    loaded_by = {}
    for h, cfg in harnesses.items():
        own = folders.get(str(expand(cfg["own"])), {}) if cfg.get("own") else {}
        listed: dict[str, list[str]] = defaultdict(list)
        for p in cfg.get("reads", []):
            for name, e in folders.get(str(expand(p)), {}).items():
                if skills.get(e["resolved"]):
                    listed[name].append(e["resolved"])
        loaded_by[h] = listed
        # A name present in several read folders appears once per folder; keep the
        # largest contribution (double loads still reported under double_loading).
        listing, n_full, n_name = 0, 0, 0
        for name, rps in listed.items():
            modes = [(invocable(h, name, skills[rp], rp, overrides, codex_off), rp) for rp in rps]
            if any(m == "full" for m, _ in modes):
                n_full += 1
            elif any(m == "name" for m, _ in modes):
                n_name += 1
            else:
                continue
            per = []
            for mode, rp in modes:
                info = skills[rp]
                if mode == "full":
                    chars = info["listing_chars"]
                    per.append((min(chars, cfg["cap"]) if cfg.get("cap") else chars) + ENTRY_OVERHEAD)
                elif mode == "name":
                    per.append(ENTRY_OVERHEAD)
            listing += max(per) if per else 0
        entry = {
            "own_folder": cfg.get("own", ""),
            "own_total": len(own),
            "own_symlinks": sum(1 for e in own.values() if e["kind"] == "symlink"),
            "own_unmanaged_dirs": sum(1 for e in own.values() if e["kind"] == "dir"),
            "listed_skills": len(listed),
            "listed_with_description": n_full,
            "listed_name_only": n_name,
            "listing_chars": listing,
        }
        budget = None
        if cfg.get("context_tokens") and cfg.get("fraction"):
            budget = int(cfg["context_tokens"] * cfg["fraction"] * CHARS_PER_TOKEN)
        elif cfg.get("budget_chars"):
            budget = cfg["budget_chars"]
        if budget:
            n = max(1, n_full)
            entry.update({
                "budget_chars": budget,
                "over_budget_by": max(0, listing - budget),
                "allowance_per_skill": max(0, int((budget * HEADROOM - (n_full + n_name) * ENTRY_OVERHEAD) // n)),
            })
        else:
            entry["allowance_per_skill"] = "unknown"
        report["harnesses"][h] = entry
        dl = {n: len(r) for n, r in listed.items() if len(r) > 1}
        if dl:
            report["double_loading"][h] = dl

    divergent, missing = {}, {}
    for n in sorted({n for h in loaded_by for n in loaded_by[h]}):
        shas = {}
        for h, cfg in harnesses.items():
            e = folders.get(str(expand(cfg.get("own", ""))), {}).get(n)
            if e and skills.get(e["resolved"]):
                shas[h] = skills[e["resolved"]]["sha256"][:12]
            elif cfg.get("own") and expand(cfg["own"]).is_dir():
                missing.setdefault(n, []).append(h)
        if len(set(shas.values())) > 1:
            groups = defaultdict(list)
            for h, s in shas.items():
                groups[s].append(h)
            divergent[n] = dict(groups)
    report["parity"] = {"divergent": divergent, "missing": missing}
    Path(args.out).write_text(json.dumps(report, indent=1))

    print(f"skill dirs scanned: {sum(1 for v in skills.values() if v)}  (yaml parser: {'PyYAML' if yaml else 'subset'})")
    print(f"{'harness':12} {'listed':>6} {'w/desc':>6} {'unmgd':>6} {'listing':>8} {'budget':>8} {'allow':>7}")
    for h, e in report["harnesses"].items():
        print(f"{h:12} {e['listed_skills']:6} {e['listed_with_description']:6} {e['own_unmanaged_dirs']:6} "
              f"{e['listing_chars']:8} {e.get('budget_chars', '-'):>8} {e['allowance_per_skill']:>7}")
    rep = [v for v in skills.values() if v and v.get("max_repeat", 0) >= 2]
    print(f"skills with repeated paragraphs: {len(rep)}; divergent names: {len(divergent)}; "
          f"harnesses with double loading: {len(report['double_loading'])}")


if __name__ == "__main__":
    sys.exit(main())
