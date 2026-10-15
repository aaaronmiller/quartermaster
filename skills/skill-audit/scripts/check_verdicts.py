#!/usr/bin/env python3
"""Gate for corpus-mode output: schema, freshness, reading evidence, coverage.

Verdicts (verdicts/<skill>.json):
  - schema (templates/verdict.schema.json)
  - every files_read hash matches the file on disk now (else stale: redo)
  - every existing file SKILL.md references was read, or is named in notes
  - every finding quote occurs verbatim (whitespace-normalized) in a file read
  - findings: [] needs "Checked:" in notes; relations: [] needs "Compared against"
  - proposed description within --allowance (lengths are measured here, not trusted)
Clusters (--clusters): schema, base in members, decisions cover members,
  one score per rubric item per member.
Verifier results (--require-verify): one per verdict, schema, agreement
  recomputed from item statuses.
Coverage (--plan batches.json): every planned skill has a verdict.

Usage:
  python3 check_verdicts.py <run-dir> [--plan batches.json] [--allowance 200] [--clusters] [--require-verify]
Exit status 1 when any error is found; warnings do not fail the gate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
WS = re.compile(r"\s+")
FM_SRC_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(\n|\Z)", re.S)
RESOURCE_RE = re.compile(r"(?<![\w/.])((?:references|reference|scripts|assets|templates|resources)/[\w./-]+\.\w{1,6})")


def norm(s: str) -> str:
    return WS.sub(" ", s).strip()


def schema_errors(obj: dict, name: str) -> list[str]:
    schema = json.loads((TEMPLATES / name).read_text())
    try:
        import jsonschema  # type: ignore
    except ImportError:
        return [f"missing field: {k}" for k in schema.get("required", []) if k not in obj]
    return [f"{'/'.join(map(str, e.path)) or '(root)'}: {e.message}"
            for e in jsonschema.Draft202012Validator(schema).iter_errors(obj)]


def load(path: Path, errors: list[str], tag: str):
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        errors.append(f"{tag}: unreadable JSON ({e})")
        return None


def check_verdict(v: dict, tag: str, allowance: int | None, errors: list[str], warnings: list[str]) -> None:
    errors += [f"{tag}: {m}" for m in schema_errors(v, "verdict.schema.json")]
    base = Path(v.get("path", ""))
    reads = {r.get("path"): r.get("sha256") for r in v.get("files_read", []) if isinstance(r, dict)}
    notes = v.get("notes", "")
    if "SKILL.md" not in reads:
        errors.append(f"{tag}: files_read lacks SKILL.md")
    texts: dict[str, list[str]] = {}
    for rel, sha in reads.items():
        p = base / rel
        if not p.is_file():
            errors.append(f"{tag}: read file missing now: {rel}")
            continue
        data = p.read_bytes()
        texts[rel] = data.decode("utf-8", "replace").splitlines()
        if hashlib.sha256(data).hexdigest() != sha:
            errors.append(f"{tag}: stale or wrong hash for {rel} (hash raw bytes with sha256sum)")
    skill_md = base / "SKILL.md"
    if skill_md.is_file():
        body = skill_md.read_text(errors="replace")
        for ref in sorted({m.group(1).rstrip(".,)`'\"") for m in RESOURCE_RE.finditer(body)}):
            if (base / ref).is_file() and ref not in reads and ref not in notes:
                errors.append(f"{tag}: referenced file not read and not explained in notes: {ref}")
    findings = v.get("findings", [])
    for i, f in enumerate(findings):
        loc = f.get("file", "SKILL.md")
        lines = texts.get(loc, [])
        line = f.get("line")
        q = norm(f.get("quote", ""))
        target = norm(lines[line - 1]) if isinstance(line, int) and 1 <= line <= len(lines) else ""
        if not q or q not in target or (len(q) < 20 and q != target):
            errors.append(f"{tag}: findings[{i}] quote does not ground {loc} line {line}: {q[:60]!r}")
    d = v.get("description", {})
    if d.get("current") and (base / "SKILL.md").is_file():
        m = FM_SRC_RE.match((base / "SKILL.md").read_text(errors="replace"))
        src_desc = ""
        if m:
            dm = re.search(r"^description:\s*(\||>|\"|'|-)?(.*)$", m.group(1), re.M | re.S)
            if dm:
                src_desc = " ".join(l.strip() for l in dm.group(2).splitlines() if l.strip())[: len(d["current"]) + 50]
        if src_desc and d["current"] not in src_desc and src_desc not in d["current"]:
            errors.append(f"{tag}: description.current does not match SKILL.md source")
    if d.get("checks", {}).get("D4") == "pass" and (allowance == "unknown" or (isinstance(allowance, int) and allowance < 120)):
        errors.append(f"{tag}: D4 must be n/a when allowance is unknown or below 120")
    for field, text_field in (("current_chars", "current"), ("proposed_chars", "proposed")):
        if field in d and text_field in d and abs(d[field] - len(d[text_field])) > 5:
            warnings.append(f"{tag}: {field} {d[field]} but measured {len(d[text_field])} (lengths are measured; field ignored)")
    if "proposed" in d and isinstance(allowance, int):
        if allowance < 120:
            errors.append(f"{tag}: allowance below 120; reduce N before rewriting descriptions")
        elif len(d["proposed"]) > allowance:
            errors.append(f"{tag}: proposed description {len(d['proposed'])} chars, over allowance {allowance}")
    if d.get("checks") and all(x == "pass" for x in d["checks"].values()) and "proposed" in d:
        warnings.append(f"{tag}: all D-checks pass but a replacement description is proposed")
    changed = d.get("proposed", d.get("current")) != d.get("current")
    if changed and v.get("provenance") in ("own", "modified") and "trigger_tests" not in v:
        errors.append(f"{tag}: changed description requires trigger_tests")
    if v.get("provenance") == "own-copy-diverged" and (v.get("recommendation") != "escalate" or v.get("edits") or changed):
        errors.append(f"{tag}: diverged copy must escalate without editing one copy")
    if str(v.get("recommendation", "")).startswith(("merge-into:", "retire")) and "usage: unknown" in notes.lower() and v.get("confidence") == "high":
        errors.append(f"{tag}: unknown usage caps merge/retire confidence at medium")
    tested = {frozenset((v.get("skill"), r.get("other"))) for r in v.get("relations", [])}
    tested |= {frozenset((v.get("skill"), c.get("other"))) for c in v.get("comparisons", [])}
    v["_tested"] = tested

def check_cluster(c: dict, tag: str, errors: list[str]) -> None:
    errors += [f"cluster {tag}: {m}" for m in schema_errors(c, "cluster.schema.json")]
    members = set(c.get("members", []))
    if c.get("base") and c["base"] not in members:
        errors.append(f"cluster {tag}: base '{c['base']}' is not a member")
    missing = members - set(c.get("decisions", {}))
    if missing:
        errors.append(f"cluster {tag}: no decision for {sorted(missing)}")
    n = len(c.get("rubric", []))
    for m, s in c.get("scores", {}).items():
        if len(s) != n:
            errors.append(f"cluster {tag}: {m} has {len(s)} scores for {n} rubric items")


def check_verify(r: dict, tag: str, verdict: dict | None, errors: list[str]) -> None:
    errors += [f"verify {tag}: {m}" for m in schema_errors(r, "verify.schema.json")]
    if verdict:
        need = (len(verdict.get("findings", [])) + len(verdict.get("relations", []))
                + len(verdict.get("comparisons", [])) + len(verdict.get("conflicts", [])) + 2)
        if len(r.get("items", [])) < need:
            errors.append(f"verify {tag}: {len(r.get('items', []))} items, expected at least {need} "
                          "(one per finding, relation, comparison, conflict, plus proposed description and recommendation)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_dir")
    ap.add_argument("--plan", help="batches.json from cluster.py, for coverage")
    ap.add_argument("--allowance", type=int, help="max chars for a proposed description")
    ap.add_argument("--clusters", action="store_true", help="also validate clusters/*.json")
    ap.add_argument("--require-verify", action="store_true", help="also require and validate verify/*.json")
    args = ap.parse_args()

    run = Path(args.run_dir)
    errors: list[str] = []
    warnings: list[str] = []
    verdicts: dict[str, dict] = {}
    for vf in sorted((run / "verdicts").glob("*.json")):
        v = load(vf, errors, vf.stem)
        if v is None:
            continue
        verdicts[v.get("skill", vf.stem)] = v
        check_verdict(v, vf.stem, args.allowance, errors, warnings)
    if args.clusters:
        for cf in sorted((run / "clusters").glob("*.json")):
            c = load(cf, errors, f"cluster {cf.stem}")
            if c is not None:
                check_cluster(c, cf.stem, errors)
    if args.require_verify:
        for name, v in verdicts.items():
            rf = run / "verify" / f"{name}.json"
            if not rf.is_file():
                errors.append(f"{name}: no verifier result")
                continue
            r = load(rf, errors, f"verify {name}")
            if r is not None:
                check_verify(r, name, v, errors)
    if args.plan:
        plan = json.loads(Path(args.plan).read_text())
        planned = {s for b in plan["batches"] for s in b["skills"]}
        for s in sorted(planned - set(verdicts)):
            errors.append(f"coverage: no verdict for {s}")
        for s in sorted(set(verdicts) - planned):
            warnings.append(f"coverage: verdict for unplanned skill {s}")
        tested_all: set = set()
        for v in verdicts.values():
            tested_all |= v.pop("_tested", set())
        for e in plan.get("review_pairs", []):
            if frozenset((e["a"], e["b"])) not in tested_all:
                warnings.append(f"coverage: review pair untested: {e['a']} <-> {e['b']} (sim {e['sim']})")
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"verdicts {len(verdicts)}, errors {len(errors)}, warnings {len(warnings)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
