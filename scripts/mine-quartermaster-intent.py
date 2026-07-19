#!/usr/bin/env python3
"""Extract exact user prompts from CASS sessions that mention Quartermaster."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DIRECT_PATTERN = re.compile(r"(?i)(quartermaster|\bqm\b|001-quartermaster)")
DOMAIN_PATTERN = re.compile(
    r"(?i)(skill(?:s|share)?|loadout|pipeline|harness|artifact catalog|"
    r"compatibility matrix|source registry|deploy(?:ment)?|rollback|"
    r"spec(?:ification)? kit|speckit|frontmatter|front-matter)"
)
SYNTHETIC_PATTERNS = (
    re.compile(r"^Review this change for security vulnerabilities\.\s*Changed files", re.S),
    re.compile(r"^Implement FR-[0-9]+.* for Quartermaster\. Create ", re.S),
    re.compile(r"^# AGENTS\.md instructions(?: for )?", re.S),
    re.compile(r"^<recommended_plugins>", re.S),
)


@dataclass(frozen=True)
class Prompt:
    session_path: str
    provider: str
    timestamp: str | None
    text: str
    direct_match: bool
    likely_relevant: bool
    relevance_reason: str


def run_cass(*args: str) -> str:
    completed = subprocess.run(
        ["cass", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout


def provider_for(path: str) -> str:
    markers = (
        ("/.claude/", "claude"),
        ("/.codex/", "codex"),
        ("/.pi/", "pi"),
        ("/.hermes/", "hermes"),
        ("/antigravity-cli/", "antigravity"),
        ("/.gemini/", "gemini"),
    )
    return next((name for marker, name in markers if marker in path), "unknown")


def flatten_content(value: Any, *, user_blocks_only: bool = False) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                block_type = item.get("type")
                if user_blocks_only and block_type not in (None, "text", "input_text"):
                    continue
                text = item.get("text") or item.get("content")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    if isinstance(value, dict):
        return flatten_content(
            value.get("content") or value.get("text") or "",
            user_blocks_only=user_blocks_only,
        )
    return ""


def unwrap_user_request(text: str) -> str:
    match = re.search(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", text, re.S)
    return match.group(1).strip() if match else text.strip()


def extract_user_text(entry: dict[str, Any]) -> str | None:
    entry_type = entry.get("type")

    if entry_type == "response_item":
        payload = entry.get("payload")
        if isinstance(payload, dict) and payload.get("type") == "message" and payload.get("role") == "user":
            return flatten_content(payload.get("content"), user_blocks_only=True)
        return None

    if entry_type == "USER_INPUT":
        return unwrap_user_request(flatten_content(entry.get("content")))

    role = entry.get("role")
    if role == "user":
        return flatten_content(entry.get("content"), user_blocks_only=True)

    message = entry.get("message")
    if (
        entry_type == "user"
        and not entry.get("isSidechain", False)
        and isinstance(message, dict)
        and message.get("role") == "user"
    ):
        return flatten_content(message.get("content"), user_blocks_only=True)

    return None


def classify(path: str, text: str) -> tuple[bool, bool, str]:
    if any(pattern.search(text) for pattern in SYNTHETIC_PATTERNS):
        return False, False, "synthetic-or-delegated-prompt"
    direct = bool(DIRECT_PATTERN.search(text))
    project_session = "quartermaster" in path.lower()
    domain = bool(DOMAIN_PATTERN.search(text))
    if direct:
        return True, True, "direct-quartermaster-reference"
    if project_session:
        return False, True, "quartermaster-project-session"
    if domain:
        return False, False, "domain-only-needs-review"
    return False, False, "no-quartermaster-signal"


def extract_session(path: str) -> list[Prompt]:
    entries = json.loads(run_cass("export", path, "--format", "json"))
    prompts: list[Prompt] = []
    seen: set[tuple[str | None, str]] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        text = extract_user_text(entry)
        if not text:
            continue
        text = text.strip()
        timestamp = entry.get("timestamp") or entry.get("created_at")
        key = (timestamp if isinstance(timestamp, str) else None, text)
        if key in seen:
            continue
        seen.add(key)
        direct, relevant, reason = classify(path, text)
        prompts.append(
            Prompt(
                session_path=path,
                provider=provider_for(path),
                timestamp=key[0],
                text=text,
                direct_match=direct,
                likely_relevant=relevant,
                relevance_reason=reason,
            )
        )
    return prompts


def markdown(prompts: list[Prompt], session_count: int) -> str:
    generated = datetime.now(timezone.utc).isoformat()
    lines = [
        "---",
        f'date: "{generated}"',
        'version: "1.0.0"',
        "status: evidence-corpus",
        "tags: [quartermaster, cass, user-intent, provenance]",
        "---",
        "# Quartermaster User Prompt Corpus",
        "",
        "Exact user-authored prompts extracted from CASS. Classification is a",
        "first-pass filter, not an interpretation of intent. The JSON companion",
        "retains every extracted user prompt, including prompts excluded here.",
        "",
        f"- Candidate sessions: {session_count}",
        f"- Included prompts: {len(prompts)}",
        "",
    ]
    current = None
    for index, prompt in enumerate(prompts, 1):
        if prompt.session_path != current:
            current = prompt.session_path
            lines.extend([f"## Session `{current}`", ""])
        lines.extend(
            [
                f"### Prompt {index}",
                "",
                f"- Provider: `{prompt.provider}`",
                f"- Timestamp: `{prompt.timestamp or 'unavailable'}`",
                f"- Relevance: `{prompt.relevance_reason}`",
                "",
                "```text",
                prompt.text,
                "```",
                "",
            ]
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", type=Path, required=True)
    parser.add_argument("--json", dest="json_path", type=Path, required=True)
    parser.add_argument("--markdown", type=Path, required=True)
    args = parser.parse_args()

    paths = [line.strip() for line in args.sessions.read_text().splitlines() if line.strip()]
    prompts: list[Prompt] = []
    failures: list[dict[str, str]] = []
    for path in paths:
        try:
            prompts.extend(extract_session(path))
        except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
            failures.append({"session_path": path, "error": str(exc)})

    # Some archives expose the same turn through a database path and a session
    # path. Preserve the first provenance record and remove exact replay copies.
    unique: list[Prompt] = []
    seen_text: set[tuple[str | None, str]] = set()
    for prompt in sorted(prompts, key=lambda p: (p.timestamp or "", p.session_path, p.text)):
        key = (prompt.timestamp, prompt.text)
        if key in seen_text:
            continue
        seen_text.add(key)
        unique.append(prompt)

    relevant = [prompt for prompt in unique if prompt.likely_relevant]
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate_sessions": paths,
        "failures": failures,
        "prompt_count": len(unique),
        "likely_relevant_count": len(relevant),
        "prompts": [asdict(prompt) for prompt in unique],
    }
    args.json_path.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json_path.write_text(json.dumps(payload, indent=2) + "\n")
    args.markdown.write_text(markdown(relevant, len(paths)) + "\n")

    print(json.dumps({
        "candidate_sessions": len(paths),
        "prompts": len(unique),
        "likely_relevant": len(relevant),
        "failures": len(failures),
        "json": str(args.json_path),
        "markdown": str(args.markdown),
    }))


if __name__ == "__main__":
    main()
