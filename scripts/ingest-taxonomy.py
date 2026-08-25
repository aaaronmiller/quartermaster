#!/usr/bin/env python3
"""Load skill kinds and pipelines into the catalogue.

Two things the audit produced that nothing could store:

The KIND of a skill — AMBIENT, DOMAIN or TOOL. The distinction is operational,
not cosmetic. A DOMAIN skill fires from a normal request because the request
names its domain. An AMBIENT skill improves almost any task and is triggered by
almost nothing, so it goes unused unless the operator knows it exists. A TOOL
skill is a reminder of one command's capabilities, and its value is stopping the
agent from defaulting to the one invocation it already knew.

And PIPELINES — chains where one skill's output is the next one's input. These
are what turn a library into a capability, and they are invisible in a flat
list. AMBIENT skills are deliberately not steps in a chain; they are slots that
can be inserted at any step, which is why they are stored on the edge rather
than in the step sequence.

Usage:
    python3 scripts/ingest-taxonomy.py [--audit-dir DIR] [--db PATH] [--dry-run]
"""
import argparse
import os
import re
import sqlite3
import sys

SCHEMA = """
CREATE TABLE IF NOT EXISTS skill_kind (
  artifact_id TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  reason      TEXT,
  assessed_at TEXT NOT NULL,
  assessor    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kind ON skill_kind(kind);

CREATE TABLE IF NOT EXISTS skill_pipeline (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  origin   TEXT NOT NULL,
  handoff  TEXT,
  ambient  TEXT,
  evidence TEXT
);
CREATE TABLE IF NOT EXISTS skill_pipeline_step (
  pipeline_id INTEGER NOT NULL REFERENCES skill_pipeline(id),
  position    INTEGER NOT NULL,
  artifact_id TEXT,
  skill_name  TEXT NOT NULL,
  PRIMARY KEY (pipeline_id, position)
);
"""


def name_index(db):
    idx = {}
    for aid, path in db.execute("SELECT id, path FROM artifacts WHERE path LIKE '%/SKILL.md'"):
        idx.setdefault(os.path.basename(os.path.dirname(path or "")), aid)
        try:
            head = open(path, encoding="utf-8", errors="replace").read(700)
        except OSError:
            continue
        m = re.search(r"^name:\s*(.+)$", head, re.M)
        if m:
            idx.setdefault(m.group(1).strip().strip("\"'"), aid)
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit-dir", default=os.path.expanduser("~/.quartermaster/skill-audit-20260824"))
    ap.add_argument("--db", default=os.path.expanduser("~/.quartermaster/catalog-v3-prelaunch.db"))
    ap.add_argument("--assessor", default="opencode-go/muse-spark-1.2-contributor")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    stamp = os.path.basename(args.audit_dir.rstrip("/")).replace("skill-audit-", "")
    stamp = f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}" if len(stamp) == 8 else stamp

    db = sqlite3.connect(args.db)
    db.executescript(SCHEMA)
    idx = name_index(db)

    text = ""
    tdir = os.path.join(args.audit_dir, "taxonomy")
    if os.path.isdir(tdir):
        for fn in sorted(os.listdir(tdir)):
            text += open(os.path.join(tdir, fn), encoding="utf-8", errors="replace").read() + "\n"

    kinds = pipes = steps = unmatched = 0

    # `name | KIND | reason`
    for m in re.finditer(r"^\s*([A-Za-z0-9][\w.-]{2,})\s*\|\s*(AMBIENT|DOMAIN|TOOL)\s*\|\s*(.+)$",
                         text, re.M):
        nm, kind, reason = m.group(1), m.group(2), m.group(3).strip()
        aid = idx.get(nm)
        if not aid:
            unmatched += 1
            continue
        db.execute(
            "INSERT OR REPLACE INTO skill_kind(artifact_id,kind,reason,assessed_at,assessor)"
            " VALUES (?,?,?,?,?)", (aid, kind, reason[:400], stamp, args.assessor))
        kinds += 1

    # PIPELINE blocks
    for blk in re.split(r"^PIPELINE:\s*", text, flags=re.M)[1:]:
        name = blk.splitlines()[0].strip()[:120]
        if not name:
            continue

        def field(key):
            mm = re.search(rf"^{key}:\s*(.+)$", blk, re.M)
            return mm.group(1).strip() if mm else None

        chain = field("CHAIN")
        if not chain:
            continue
        cur = db.execute(
            "INSERT OR IGNORE INTO skill_pipeline(name,origin,handoff,ambient,evidence)"
            " VALUES (?,?,?,?,?)",
            (name, "discovered", field("HANDOFF"), field("AMBIENT-SLOTS"), field("EVIDENCE")))
        row = db.execute("SELECT id FROM skill_pipeline WHERE name=?", (name,)).fetchone()
        if not row:
            continue
        pid = row[0]
        if cur.rowcount:
            pipes += 1
        for pos, part in enumerate(s.strip() for s in chain.split("->")):
            if not part:
                continue
            db.execute(
                "INSERT OR REPLACE INTO skill_pipeline_step"
                "(pipeline_id,position,artifact_id,skill_name) VALUES (?,?,?,?)",
                (pid, pos, idx.get(part), part[:120]))
            steps += 1

    if args.dry_run:
        db.rollback()
        print("dry run — rolled back")
    else:
        db.commit()
    print(f"  kinds classified : {kinds}  (unmatched names: {unmatched})")
    print(f"  pipelines        : {pipes}")
    print(f"  pipeline steps   : {steps}")
    db.close()


if __name__ == "__main__":
    sys.exit(main())
