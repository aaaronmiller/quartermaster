#!/usr/bin/env python3
"""Group skills into review batches so similar skills are read side by side.

Proposes candidates only. The reviewing model assigns categories and decides
relations; this script makes sure likely duplicates land in the same batch.

Input is the JSON written by inventory.py. Similarity is TF-IDF cosine over the
skill name (weighted 3x), description (2x) and SKILL.md headings (1x).

Usage:
  python3 cluster.py inventory.json --harness claude --own ~/code/custom-skills --out batches.json
  python3 cluster.py inventory.json --root ~/code/custom-skills --out batches.json --threshold 0.22

Output: exact-copy groups, clusters, batches (max --batch-size skills and
--batch-tokens of skill text), and the 5 nearest neighbours of every skill for
the cross-cluster pass.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

STOP = set("""a an and are as at be by for from has have in into is it its of on or that the this to
use used uses using when with without your you skill skills agent agents user users via can will""".split())
TOKEN_RE = re.compile(r"[a-z][a-z0-9]+")
PROV_ORDER = {"own": 0, "own-copy-diverged": 0, "modified": 1, "downloaded": 2}


def tokens(text: str) -> list[str]:
    return [t for t in TOKEN_RE.findall(text.lower().replace("-", " ")) if t not in STOP and len(t) > 2]


def headings(path: Path) -> str:
    try:
        text = (path / "SKILL.md").read_text(errors="replace")
    except OSError:
        return ""
    return " ".join(re.findall(r"^#{1,3}\s+(.+)$", text, re.M))


def body_tokens(path: Path) -> list[str]:
    """First 40 content tokens of the SKILL.md body (frontmatter and code stripped)."""
    try:
        text = (path / "SKILL.md").read_text(errors="replace")
    except OSError:
        return []
    text = re.sub(r"\A---\s*\n.*?\n---\s*\n", "", text, flags=re.S)
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    return tokens(text)[:40]


def provenance(name: str, path: str, sha: str, own_roots: list[Path]) -> str:
    """own: path is inside an own root, or an own root holds a same-named skill.
    own-copy-diverged: same name in an own root but different SKILL.md content
    (a copied deployment that has drifted from its source)."""
    rp = Path(path)
    for r in own_roots:
        try:
            rp.relative_to(r)
            return "own"
        except ValueError:
            pass
    for r in own_roots:
        src = r / name / "SKILL.md"
        if src.is_file():
            import hashlib
            same = hashlib.sha256(src.read_bytes()).hexdigest() == sha
            return "own" if same else "own-copy-diverged"
    try:
        out = subprocess.run(["git", "-C", path, "status", "--porcelain", "--", "."],
                             capture_output=True, text=True, timeout=20)
        if out.returncode == 0 and out.stdout.strip():
            return "modified"
    except (OSError, subprocess.TimeoutExpired):
        pass
    return "downloaded"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inventory")
    ap.add_argument("--out", required=True)
    ap.add_argument("--harness", help="scope: skills this harness lists")
    ap.add_argument("--root", action="append", default=[], help="scope: skills in this folder")
    ap.add_argument("--own", action="append", default=[], help="folders holding own skills (resolved paths)")
    ap.add_argument("--threshold", type=float, default=0.22, help="cosine similarity that always links two skills")
    ap.add_argument("--max-cluster", type=int, default=14, help="split larger linked groups into sub-clusters")
    ap.add_argument("--mutual-k", type=int, default=3, help="link mutual top-k neighbours ...")
    ap.add_argument("--mutual-floor", type=float, default=0.09, help="... when their similarity is at least this")
    ap.add_argument("--review-pairs-cap", type=int, default=150, help="max unclustered candidate pairs to report")
    ap.add_argument("--review-pairs-floor", type=float, default=0.09, help="similarity floor for reporting unclustered pairs")
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--batch-tokens", type=int, default=60000)
    ap.add_argument("--allowance", type=int, default=250, help="description allowance when no harness budget is known")
    ap.add_argument("--briefs-dir", help="write <batch>-neighbours.txt (descriptions of out-of-batch neighbours) here")
    args = ap.parse_args()

    inv = json.loads(Path(args.inventory).read_text())
    skills = inv["skills"]
    scope: dict[str, str] = {}  # name -> resolved path
    if args.harness:
        h = inv["harnesses"][args.harness]
        folder = inv["folders"].get(os.path.expanduser(h["own_folder"]), {})
        for name, e in folder.items():
            scope[name] = e["resolved"]
    for r in args.root:
        for name, e in inv["folders"].get(os.path.expanduser(r), {}).items():
            scope.setdefault(name, e["resolved"])
    if not scope:
        raise SystemExit("empty scope: pass --harness or --root (the folder must be in the inventory)")
    scope = {n: p for n, p in scope.items() if skills.get(p)}

    # Exact copies: same SKILL.md hash under different names or paths.
    by_sha = defaultdict(list)
    for n, p in scope.items():
        by_sha[skills[p]["sha256"]].append(n)
    exact = [sorted(v) for v in by_sha.values() if len(v) > 1]
    # Same body, frontmatter stripped: near-copies that differ only in description.
    by_body = defaultdict(list)
    for n, p in scope.items():
        if skills[p].get("body_sha256"):
            by_body[skills[p]["body_sha256"]].append(n)
    same_body = [sorted(v) for v in by_body.values() if len(v) > 1 and v not in exact]
    rep = {}  # representative per hash
    for v in by_sha.values():
        for n in v:
            rep[n] = sorted(v)[0]
    names = sorted({rep[n] for n in scope})
    docs = {}
    for n in names:
        s = skills[scope[n]]
        routable = s.get("name") or n
        docs[n] = Counter(tokens(routable) * 3 + tokens(s.get("description", "")) * 2 + tokens(headings(Path(scope[n]))))
        for t in body_tokens(Path(scope[n])):
            docs[n][t] += 0.5
    df = Counter(t for c in docs.values() for t in c)
    N = len(docs)
    vec = {}
    for n, c in docs.items():
        v = {t: (1 + math.log(f)) * math.log((1 + N) / (1 + df[t])) for t, f in c.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vec[n] = {t: x / norm for t, x in v.items()}

    def cos(a: str, b: str) -> float:
        va, vb = vec[a], vec[b]
        if len(va) > len(vb):
            va, vb = vb, va
        return sum(x * vb.get(t, 0.0) for t, x in va.items())

    sims = defaultdict(dict)
    parent = {n: n for n in names}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, a in enumerate(names):
        for b in names[i + 1:]:
            s = cos(a, b)
            if s > 0.05:
                sims[a][b] = sims[b][a] = round(s, 3)
            if s >= args.threshold:
                parent[find(a)] = find(b)
    # Shared phrasing links regardless of similarity score: two descriptions that
    # quote the same trigger phrases or repeat the same sentence claim the same
    # activation, whatever their names (found the 2026-08-22 spec-family collision).
    def phrases(n: str) -> set[str]:
        d = skills[scope[n]].get("description", "").lower()
        quoted = {q.strip() for q in re.findall(r"[\"“']([^\"”']{4,60})[\"”']", d)}
        sentences = {s.strip() for s in re.split(r"(?<=[.!?])\s+", d) if len(s.strip()) >= 40}
        return quoted | sentences
    shared = []
    ph = {n: phrases(n) for n in names}
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            common = ph[a] & ph[b]
            if len(common) >= 2 or any(len(c) >= 40 for c in common):
                shared.append({"a": a, "b": b, "shared": sorted(common)[:5]})
                parent[find(a)] = find(b)
    # Same lead verb + object noun in the first 150 chars: a routing collision
    # even when the jobs differ (D8 in description-standard.md).
    def opener(n: str) -> str:
        toks = TOKEN_RE.findall(skills[scope[n]].get("description", "")[:150].lower().replace("-", " "))
        toks = [t for t in toks if t not in STOP and len(t) > 2]
        return " ".join(toks[:2]) if len(toks) >= 2 else ""
    shared_openers = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if opener(a) and opener(a) == opener(b):
                shared_openers.append({"a": a, "b": b, "opener": opener(a)})
                parent[find(a)] = find(b)
    # wording differs (humanize-writing, stop-slop, unslop) without chaining everything.
    topk = {n: {o for o, _ in sorted(sims[n].items(), key=lambda kv: -kv[1])[:args.mutual_k]} for n in names}
    for a in names:
        for b in topk[a]:
            if a in topk[b] and sims[a][b] >= args.mutual_floor:
                parent[find(a)] = find(b)

    comps = defaultdict(list)
    for n in names:
        comps[find(n)].append(n)

    severed: list = []


    def split(group: list[str]) -> list[list[str]]:
        """Split an oversized linked group by growing sub-clusters around the best-connected members."""
        if len(group) <= args.max_cluster:
            return [group]
        left, parts = set(group), []
        while left:
            seed = max(left, key=lambda m: sum(sims[m].get(o, 0) for o in left))
            part = [seed] + sorted((o for o in left if o != seed), key=lambda o: -sims[seed].get(o, 0))[:args.max_cluster - 1]
            parts.append(sorted(part))
            left -= set(part)
        for pi, pa in enumerate(parts):
            for pb in parts[pi + 1:]:
                for a in pa:
                    for b in pb:
                        if sims[a].get(b, 0) >= args.review_pairs_floor:
                            severed.append({"a": a, "b": b, "sim": sims[a][b], "reason": "split"})
        return parts

    clusters = sorted((p for v in comps.values() for p in split(sorted(v))), key=lambda v: (-len(v), v[0]))

    own_roots = [Path(os.path.expanduser(o)).resolve() for o in args.own]
    prov = {n: provenance(n, scope[n], skills[scope[n]]["sha256"], own_roots) for n in names}

    ref_re = re.compile(r"(?<![\w/.])((?:references|reference|scripts|assets|templates|resources)/[\w./-]+\.\w{1,6})")

    def size_tokens(n: str) -> int:
        """Input a worker must read: SKILL.md plus sibling and resource files (about 4 bytes/token)."""
        root = Path(scope[n])
        total = 0
        try:
            for f in [root / "SKILL.md"] + [p for p in root.iterdir() if p.is_file()] + [
                    q for p in root.iterdir() if p.is_dir() and p.name in
                    ("references", "reference", "scripts", "assets", "templates", "resources")
                    for q in p.rglob("*") if q.is_file()]:
                try:
                    total += f.stat().st_size
                except OSError:
                    pass
        except OSError:
            pass
        total = max(0, total - skills[scope[n]].get("dup_chars", 0))
        return total // 4
    # Description allowance per skill: the smallest allowance among harnesses that list it.
    harness_allow = {h: e["allowance_per_skill"] for h, e in inv["harnesses"].items()
                     if isinstance(e.get("allowance_per_skill"), int)}


    def allowance(n: str) -> int:
        vals = [a for h, a in harness_allow.items()
                if n in inv["folders"].get(os.path.expanduser(inv["harnesses"][h]["own_folder"]), {})]
        return min(vals) if vals else args.allowance

    batches = []
    for ci, members in enumerate(clusters):
        if len(members) == 1:
            continue
        # Keep the most similar members together: order by similarity to the
        # member with the highest total similarity inside the cluster.
        anchor = max(members, key=lambda m: sum(sims[m].get(o, 0) for o in members))
        ordered = sorted(members, key=lambda m: -1 if m == anchor else -sims[anchor].get(m, 0))
        cur, cur_tok = [], 0
        for m in ordered:
            t = size_tokens(m)
            if cur and (len(cur) >= args.batch_size or cur_tok + t > args.batch_tokens):
                batches.append({"cluster": ci, "skills": cur})
                cur, cur_tok = [], 0
            cur.append(m)
            cur_tok += t
            if t > args.batch_tokens and cur_tok > args.batch_tokens:
                batches.append({"cluster": ci, "skills": cur, "oversize": True})
                cur, cur_tok = [], 0
        if cur:
            batches.append({"cluster": ci, "skills": cur})
    singles = [m[0] for m in clusters if len(m) == 1]
    # Singletons go in batches of their own size limit, ordered by provenance so own skills come first.
    singles.sort(key=lambda n: (PROV_ORDER[prov[n]], n))
    for i in range(0, len(singles), args.batch_size):
        grp = singles[i:i + args.batch_size]
        batches.append({"cluster": None, "skills": grp,
                        **({"oversize": True} if any(size_tokens(n) > args.batch_tokens for n in grp) else {})})
    batches.sort(key=lambda b: (min(PROV_ORDER[prov[n]] for n in b["skills"]), b["cluster"] is None))
    for i, b in enumerate(batches):
        b["id"] = f"b{i + 1:03d}"
    # review_pairs: cross-cluster candidate pairs the batches split apart, plus
    # severed split links. Each entry MUST be tested by a worker; untested pairs
    # are reported as untested, never assumed distinct (cluster-and-dedupe.md s3).
    co_clustered = {frozenset((a, b)) for cl in clusters for i, a in enumerate(cl) for b in cl[i + 1:]}
    review_pairs = [
        {"a": a, "b": b, "sim": round(s, 3), "reason": "cross-cluster"}
        for a in names for b, s in sims[a].items()
        if a < b and s >= args.review_pairs_floor and frozenset((a, b)) not in co_clustered
    ] + severed
    for b in batches:
        b["paths"] = {n: scope[n] for n in b["skills"]}
        b["provenance"] = {n: prov[n] for n in b["skills"]}
        b["input_tokens"] = sum(size_tokens(n) for n in b["skills"])
        b["allowance"] = min(allowance(n) for n in b["skills"])

    # Reserved slots: top-3 overall plus top-2 from different provisional
    # clusters, so same-vendor families cannot eat every slot (DUPE-12).
    member_of = {}
    for ci, cl in enumerate(clusters):
        for n in cl:
            member_of[n] = ci
    neighbours, neighbours_cross = {}, {}
    for n in names:
        ranked = sorted(sims[n].items(), key=lambda kv: -kv[1])
        top = ranked[:3]
        seen = {o for o, _ in top}
        xc = [e for e in ranked if member_of.get(e[0]) != member_of.get(n) and e[0] not in seen][:2]
        seen |= {o for o, _ in xc}
        extra = [e for e in ranked if e[0] not in seen][: max(0, 5 - len(top) - len(xc))]
        neighbours[n] = top + extra
        neighbours_cross[n] = xc



    out = {
        "scope_size": len(scope), "unique": len(names),
        "threshold": args.threshold, "mutual_k": args.mutual_k,
        "mutual_floor": args.mutual_floor, "max_cluster": args.max_cluster,
        "review_pairs_floor": args.review_pairs_floor, "review_pairs_cap": args.review_pairs_cap,
        "exact_copies": exact,
        "same_body": same_body,
        "shared_phrasing": shared,
        "shared_openers": shared_openers,
        "clusters": [{"id": i, "skills": m} for i, m in enumerate(clusters) if len(m) > 1],
        "batches": batches,
        "neighbours": {n: neighbours[n] + neighbours_cross[n] for n in names},
        "neighbours_cross": neighbours_cross,
        "review_pairs": review_pairs,
        "provenance": prov,
    }
    Path(args.out).write_text(json.dumps(out, indent=1))
    if args.briefs_dir:
        bd = Path(args.briefs_dir)
        bd.mkdir(parents=True, exist_ok=True)
        for b in batches:
            members = set(b["skills"])
            same_cluster = set(clusters[b["cluster"]]) if b["cluster"] is not None else set()
            pairs = sorted({frozenset((e["a"], e["b"])) for e in review_pairs if e["a"] in members or e["b"] in members})
            near = sorted(({o for m in members for o, _ in neighbours[m] + neighbours_cross[m]} | same_cluster) - members)
            lines = [f"{o}: {skills[scope[o]].get('description', '')}" for o in near]
            lines.append("")
            lines.append("Review pairs involving this batch (test each; untested pairs stay unresolved):")
            for e in [x for x in review_pairs if frozenset((x["a"], x["b"])) in pairs]:
                lines.append(f"- {e['a']} <-> {e['b']} (sim {e['sim']}, {e['reason']})")
            (bd / f"{b['id']}-neighbours.txt").write_text("\n".join(lines).rstrip() + "\n")
    print(f"scope {len(scope)}, unique {len(names)}, exact-copy groups {len(exact)}, "
          f"same-body groups {len(same_body)}, review pairs {len(review_pairs)}, "
          f"multi-member clusters {len(out['clusters'])}, batches {len(batches)}, "
          f"provenance {dict(Counter(prov.values()))}")
if __name__ == "__main__":
    main()
