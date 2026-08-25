#!/usr/bin/env python3
"""Load a skill-audit run into the catalogue database.

The 2026-08-24 audit produced 25 head-to-head verdicts, 275 description
gradings, a dependency graph and usage counts, all of it in loose JSON and
Markdown under ~/.quartermaster/skill-audit-<date>/. Nothing reads those files,
so the next audit would re-derive the same conclusions at the same cost, and
the twenty grafts it recommended would stay recommendations forever.

This loads a run into five tables keyed on the artifact ids the catalogue
already uses, so the findings become queryable alongside everything else
Quartermaster knows. Re-running is safe: rows are keyed by
(artifact, timestamp, assessor, method), so the same run loads once.

Usage:
    python3 scripts/ingest-skill-audit.py [--audit-dir DIR] [--db PATH] [--dry-run]
"""
import argparse
import json
import os
import re
import sqlite3
import sys

SCHEMA = """
CREATE TABLE IF NOT EXISTS skill_assessment (
  id            INTEGER PRIMARY KEY,
  artifact_id   TEXT NOT NULL,
  assessed_at   TEXT NOT NULL,
  assessor      TEXT NOT NULL,
  method        TEXT NOT NULL,
  verdict       TEXT NOT NULL,
  confidence    TEXT,
  issue         TEXT,
  suggestion    TEXT,
  evidence      TEXT,
  UNIQUE(artifact_id, assessed_at, assessor, method)
);
CREATE INDEX IF NOT EXISTS idx_assessment_artifact ON skill_assessment(artifact_id);
CREATE INDEX IF NOT EXISTS idx_assessment_verdict  ON skill_assessment(verdict);

CREATE TABLE IF NOT EXISTS skill_contest (
  id          INTEGER PRIMARY KEY,
  label       TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  assessor    TEXT NOT NULL,
  same_task   INTEGER,
  winner_id   TEXT,
  rationale   TEXT,
  UNIQUE(label, assessed_at, assessor)
);
CREATE TABLE IF NOT EXISTS skill_contest_member (
  contest_id    INTEGER NOT NULL,
  artifact_id   TEXT NOT NULL,
  outcome       TEXT NOT NULL,
  graft         TEXT,
  graft_cost    TEXT,
  graft_verdict TEXT,
  PRIMARY KEY (contest_id, artifact_id)
);

CREATE TABLE IF NOT EXISTS skill_usage (
  artifact_id   TEXT NOT NULL,
  window_start  TEXT NOT NULL,
  window_end    TEXT NOT NULL,
  sessions_seen INTEGER NOT NULL,
  source        TEXT NOT NULL,
  PRIMARY KEY (artifact_id, window_start, source)
);

CREATE TABLE IF NOT EXISTS skill_group (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  kind  TEXT NOT NULL,
  notes TEXT,
  UNIQUE(name, kind)
);
CREATE TABLE IF NOT EXISTS skill_group_member (
  group_id    INTEGER NOT NULL,
  artifact_id TEXT NOT NULL,
  added_by    TEXT NOT NULL,
  PRIMARY KEY (group_id, artifact_id)
);

CREATE TABLE IF NOT EXISTS skill_action (
  id          INTEGER PRIMARY KEY,
  created_at  TEXT NOT NULL,
  action      TEXT NOT NULL,
  artifact_id TEXT,
  target      TEXT,
  reason      TEXT NOT NULL,
  evidence_id INTEGER,
  state       TEXT NOT NULL DEFAULT 'proposed',
  decided_at  TEXT,
  decided_by  TEXT,
  UNIQUE(action, artifact_id, target, reason)
);
CREATE INDEX IF NOT EXISTS idx_action_state ON skill_action(state);
"""


def load(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def build_name_index(db):
    """activation name and directory name -> artifact id.

    Both are needed: verdicts key on the deployed directory, contests key on the
    activation name from frontmatter, and for gstack builds those differ
    (`gstack-autoplan/` holds `name: autoplan`).
    """
    idx = {}
    for aid, path in db.execute("SELECT id, path FROM artifacts WHERE path LIKE '%/SKILL.md'"):
        d = os.path.basename(os.path.dirname(path or ""))
        idx.setdefault(d, aid)
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                head = fh.read(700)
            m = re.search(r"^name:\s*(.+)$", head, re.M)
            if m:
                idx.setdefault(m.group(1).strip().strip("\"'"), aid)
        except OSError:
            pass
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit-dir", default=os.path.expanduser("~/.quartermaster/skill-audit-20260824"))
    ap.add_argument("--db", default=os.path.expanduser("~/.quartermaster/catalog-v3-prelaunch.db"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    stamp = os.path.basename(args.audit_dir.rstrip("/")).replace("skill-audit-", "")
    stamp = f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}" if len(stamp) == 8 else stamp

    db = sqlite3.connect(args.db)
    db.executescript(SCHEMA)
    idx = build_name_index(db)
    counts = {}

    def bump(k, n=1):
        counts[k] = counts.get(k, 0) + n

    # ---- description gradings -------------------------------------------
    verdicts = load(f"{args.audit_dir}/verdicts.json") or {}
    for name, v in verdicts.items():
        aid = idx.get(name)
        if not aid:
            bump("verdict-unmatched"); continue
        db.execute(
            "INSERT OR IGNORE INTO skill_assessment"
            "(artifact_id,assessed_at,assessor,method,verdict,issue,suggestion)"
            " VALUES (?,?,?,?,?,?,?)",
            (aid, stamp, "opencode-go/muse-spark-1.2-contributor", "description-grade",
             v.get("verdict", ""), v.get("issue"), v.get("fix")))
        bump("assessment")

    # ---- mechanical checks ----------------------------------------------
    mech = load(f"{args.audit_dir}/mechanical.json") or {}
    for name in (mech.get("undeclared_triggers") or []):
        aid = idx.get(name if isinstance(name, str) else name.get("skill", ""))
        if aid:
            db.execute(
                "INSERT OR IGNORE INTO skill_assessment"
                "(artifact_id,assessed_at,assessor,method,verdict,issue) VALUES (?,?,?,?,?,?)",
                (aid, stamp, "mechanical", "mechanical", "NO_TRIGGERS",
                 "quotes no trigger phrases; cannot activate on intent"))
            bump("assessment")

    # ---- contests --------------------------------------------------------
    for fn, assessor in (("h2h/results.json", "opencode-go/muse-spark-1.2-contributor"),
                         ("deep2-results/parsed.json", "openrouter/stealth/ox-alpha")):
        for r in (load(f"{args.audit_dir}/{fn}") or []):
            label = (r.get("label") or f"{r.get('winner','?')} vs {r.get('loser','?')}")[:200]
            same = r.get("same")
            same_i = 1 if same == "yes" else (0 if same == "no" else None)
            win = idx.get((r.get("winner") or "").strip())
            cur = db.execute(
                "INSERT OR IGNORE INTO skill_contest"
                "(label,assessed_at,assessor,same_task,winner_id,rationale) VALUES (?,?,?,?,?,?)",
                (label, stamp, assessor, same_i, win, r.get("why")))
            row = db.execute(
                "SELECT id FROM skill_contest WHERE label=? AND assessed_at=? AND assessor=?",
                (label, stamp, assessor)).fetchone()
            if not row:
                continue
            cid = row[0]
            bump("contest") if cur.rowcount else None
            members = [(r.get("winner"), "winner")]
            members += [(x.strip(), "coexist" if same_i == 0 else "loser")
                        for x in (r.get("loser") or "").split(",") if x.strip()]
            for nm, outcome in members:
                aid = idx.get((nm or "").strip())
                if not aid:
                    continue
                db.execute(
                    "INSERT OR IGNORE INTO skill_contest_member"
                    "(contest_id,artifact_id,outcome,graft,graft_cost,graft_verdict)"
                    " VALUES (?,?,?,?,?,?)",
                    (cid, aid, outcome,
                     r.get("graft") or r.get("take"), r.get("cost"), r.get("gv") or r.get("verdict")))
                bump("contest-member")

    # ---- usage -----------------------------------------------------------
    usage = load(f"{args.audit_dir}/usage-counts.json") or {}
    for name, n in usage.items():
        aid = idx.get(name)
        if aid:
            db.execute(
                "INSERT OR REPLACE INTO skill_usage"
                "(artifact_id,window_start,window_end,sessions_seen,source) VALUES (?,?,?,?,?)",
                (aid, "all-time", stamp, int(n), "session-scan"))
            bump("usage")

    # ---- groups: source and theme ---------------------------------------
    for rec in (load(f"{args.audit_dir}/final-manifest.json") or []):
        aid = idx.get(rec.get("name", ""))
        if not aid:
            continue
        for kind, val in (("source", rec.get("source")),):
            if not val:
                continue
            db.execute("INSERT OR IGNORE INTO skill_group(name,kind) VALUES (?,?)", (val, kind))
            gid = db.execute("SELECT id FROM skill_group WHERE name=? AND kind=?", (val, kind)).fetchone()[0]
            db.execute("INSERT OR IGNORE INTO skill_group_member(group_id,artifact_id,added_by)"
                       " VALUES (?,?,?)", (gid, aid, "model"))
            bump("group-member")

    tsv = f"{args.audit_dir}/candidates-all.tsv"
    if os.path.exists(tsv):
        with open(tsv, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                p = [x.strip() for x in line.split("|")]
                if len(p) < 5 or p[2] not in ("ADOPT", "MODIFY", "OMIT"):
                    continue
                aid = idx.get(p[0])
                theme = p[3].lower()
                if aid and theme:
                    db.execute("INSERT OR IGNORE INTO skill_group(name,kind) VALUES (?,?)", (theme, "theme"))
                    gid = db.execute("SELECT id FROM skill_group WHERE name=? AND kind=?",
                                     (theme, "theme")).fetchone()[0]
                    db.execute("INSERT OR IGNORE INTO skill_group_member(group_id,artifact_id,added_by)"
                               " VALUES (?,?,?)", (gid, aid, "model"))
                    bump("group-member")

    # ---- proposed actions: every graft judged worth it --------------------
    for r in (load(f"{args.audit_dir}/deep2-results/parsed.json") or []):
        if (r.get("gv") or "").startswith("worth") and r.get("graft"):
            aid = idx.get((r.get("winner") or "").strip())
            if aid:
                db.execute(
                    "INSERT OR IGNORE INTO skill_action"
                    "(created_at,action,artifact_id,target,reason,state) VALUES (?,?,?,?,?,?)",
                    (stamp, "graft", aid, r.get("loser"), r.get("graft")[:2000], "proposed"))
                bump("action")

    if args.dry_run:
        db.rollback()
        print("dry run — rolled back")
    else:
        db.commit()
    for k in sorted(counts):
        print(f"  {counts[k]:5d}  {k}")
    db.close()


if __name__ == "__main__":
    sys.exit(main())
