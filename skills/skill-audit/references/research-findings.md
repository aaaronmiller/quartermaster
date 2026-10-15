# Research findings

Evidence behind the rules in this skill, from 67 sources (official docs and
specs, GitHub issues, papers, tools, practitioner writing), all checked on
2026-10-15. Each finding cites source IDs from the list at the end. Budgets
and caps change between releases: re-check the source before quoting a
number as current.

## Contents

1. Listing budgets and overflow
2. Discovery paths
3. Descriptions
4. Bodies and structure
5. Collections, duplicates, routing at scale
6. Judging and evaluation
7. Where sources disagree
7a. Superseded
8. Sources

## 1. Listing budgets and overflow

- **F1** Claude Code budgets the skill listing at 1% of the model's context
  window. On overflow it drops descriptions, least-invoked skills first;
  names stay. `/doctor` estimates the listing cost; `/skill-doctor` finds
  unused skills; `skillListingBudgetFraction` or
  `SLASH_COMMAND_TOOL_CHAR_BUDGET` raise it; `skillOverrides` sets a skill
  to `on`, `name-only`, `user-invocable-only` or `off`. [S1, S42]
- **F2** Claude Code truncates `description` plus `when_to_use` at 1,536
  characters per skill. Caps have changed before (see section 7a); text
  placed first survives every cap. [S1, S42]
- **F3** `disable-model-invocation: true` keeps a skill callable by name
  but removes its description from the listing. Pi supports the same
  field. [S1, S12]
- **F4** Codex reserves a hardcoded 2% of the context window. It first
  truncates descriptions (reports of 81 to 223 characters cut per skill),
  then removes all descriptions and drops skills from the visible list.
  The same all-or-nothing message is reported for Claude Code. [S14, S15,
  S16, S17]
- **F5** Codex controls: `[[skills.config]] enabled = false`;
  `policy.allow_implicit_invocation: false` in `agents/openai.yaml`
  (default true). Codex does not merge two skills with the same name; both
  appear. [S7]
- **F6** Spec limits: `name` 1 to 64 chars, matching the directory;
  `description` 1 to 1,024; `compatibility` up to 500; `metadata` a
  string map. OpenCode reads `metadata.opencode/autoinvoke`. Kilo enforces
  the same limits. [S4, S9, S11]
- **F7** Malformed frontmatter in Claude Code loads the body with empty
  metadata, silently: the skill works by name and never routes. [S1, S44]

## 2. Discovery paths

- **F8** `~/.agents/skills` is read by Codex (user scope), Gemini CLI (alias
  that wins over `~/.gemini/skills`), OpenCode, Pi and Kilo. OpenCode also
  reads `~/.claude/skills` and its own folder, so a skill in more than one
  of them loads more than once. Hermes keeps `~/.hermes/skills` as its
  source of truth and lists about 3k tokens at level 0. [S7, S8, S9, S10,
  S11, S12]
- **F9** Skillshare syncs one declared source to many harness targets by
  symlink, with per-target include and exclude filters, project mode and an
  audit command. [S26]

## 3. Descriptions

- **F10** A description states what the skill does and when to use it,
  in third person, with the key terms users say. It is the main routing
  signal. [S2, S3, S5, S6]
- **F11** Models tend to under-trigger skills; Anthropic's skill-creator
  advises descriptions that are "a little bit pushy" (for example "even if
  they don't explicitly ask for X"). [S6]
- **F12** Most non-triggering is vocabulary mismatch between the request
  and the description. In a controlled study, description fixes raised
  routing accuracy by 1.3 to 4.9 points, most for weaker routers and for
  requests that did not share the skill's vocabulary; richer descriptions
  also attracted some off-topic requests. [S47, S65, S44, S45, S43]
- **F13** Codex docs advise concise descriptions with the key use case and
  trigger words first, so matching survives truncation. [S7]
- **F14** The 138K-file study flags descriptions over 300 characters,
  under 30, missing a "when", or with routing information placed in the
  body. Skills with clean routing metadata were retrieved more reliably in
  a 20,000-skill stress test. [S20]

## 4. Bodies and structure

- **F15** Anthropic guidance: assume the model is smart and add only what
  it lacks; match degrees of freedom to fragility; body under 500 lines;
  references one level deep; a table of contents in reference files over
  100 lines; no time-sensitive text; consistent terms; forward slashes;
  build evaluations before writing extensive content. [S2]
- **F16** Explain the reason behind rules instead of capitalized MUST and
  NEVER; keep the prompt lean; read transcripts to see what the skill
  makes the agent waste time on; organize variants as separate reference
  files the agent loads selectively. [S6]
- **F17** SKILL.md smell study (238 skills, 29 sources): 26 smells; more
  than 99% of files have at least one; 11 smells occur in over half of
  files; Rationalization Loophole in 94%; average 10.5 smells per file;
  smells rarely disappear once introduced. [S19]
- **F18** 138K-file study: 91.8% of public skills have at least one defect
  and 89.3% violate the spec. Taxonomy of 31 checks in 7 groups: routing
  metadata, body content, resource organization, prohibited content,
  behavioral safety, portability, persona and scope. [S20]
- **F19** SkillsBench (84 tasks, 7,308 runs): curated skills add 16.2
  points on average; self-generated skills add nothing (minus 1.3); focused
  skills with 2 to 3 modules beat comprehensive documentation. [S21]
- **F20** Practitioner consensus: SKILL.md holds purpose, inputs, steps
  and outputs; context, rules, examples and domain detail live in
  reference files loaded by the steps that need them. [S58, S59, S60, S61,
  S64, S56]
- **F21** Instruction-following degrades as instruction count grows;
  frontier reasoning models hold roughly 150 to 200 instructions. [S52]

## 5. Collections, duplicates, routing at scale

- **F22** Tool and skill selection accuracy falls as the catalog grows.
  Retrieval over tool descriptions raised selection accuracy from 13.62%
  to 43.13% in RAG-MCP; production catalogs follow a power law, which
  argues for a small hot set always loaded and a cold set loaded on
  demand. [S22, S53, S54]
- **F23** A crawl of the open ecosystem found 59.7% of skills are exact
  duplicates; collections over 30 to 40 skills likely carry duplicates.
  [S48]
- **F24** Dedupe tooling converges on: embed or score name, description
  and headings; cluster above a threshold; verify candidates with an LLM;
  resolve each group with a human; disable reversibly. NVIDIA SkillEvaluator
  uses a higher threshold (0.80) inside one skill than across skills.
  SkillComposer finds that merge and improve address different quality
  dimensions. [S34, S35, S37, S38, S36, S23]
- **F25** Manual-only workflows are better as commands or
  `disable-model-invocation` skills, which cost no listing budget. [S1,
  S63]

## 6. Judging and evaluation

- **F26** LLM judges show position bias that varies by model and task;
  swap candidate order and count only consistent wins; verbosity bias also
  varies by model family, so use judges from more than one family. [S24,
  S25]
- **F27** Anthropic's description optimizer: 20 queries, about half
  near-miss negatives, 60/40 train and held-out split, 3 runs per query, up
  to 5 iterations, pick by held-out score. [S6]
- **F28** Skill quality tools: spec linters (skills_lint, skill-check),
  routing testers (SkillSeal), agentic reviewers that score description and
  content (Tessl review, skill-judge). [S28, S29, S30, S31, S32, S33]
- **F29** Test skills like code: write the failing scenario first, then
  the minimal skill that passes it, then pressure-test with scenarios that
  tempt the agent to skip steps. [S27, S62]

## 7. Where sources disagree

| Question | Positions | Rule adopted here |
| --- | --- | --- |
| Description length | 1,024 spec max; 1,536 Claude Code cap; 250 in an older Claude Code; over 300 flagged by the 138K study | Compute the allowance from the budget; typical 120 to 300; over 500 needs a reason |
| Pushy vs short | Anthropic: a little pushy; budget math: short | One "even if" clause where under-triggering is observed; no trigger lists |
| "Use when" first vs "what" first | superpowers: start with "Use when"; Anthropic: what, then when | What, then when; both parts required |
| Many quoted triggers | this skill's v2: 30+ triggers; budget sources: overflow drops them all | 3 to 5 natural phrases inside the "Use when" clause |
| Reddit and Hacker News | searched; no threads returned by the search tools used | Practitioner view comes from blogs and newsletters instead |

## 7a. Superseded (history, do not quote as current)

- An earlier Claude Code release truncated descriptions at 250 characters,
  which cut one skill's "do not trigger" clause and caused wrong
  activations. [S18]
- Gemini CLI was replaced by Antigravity CLI for unpaid users on
  2026-06-18. [S8]

## 8. Sources

Official docs and specs:
S1 https://code.claude.com/docs/en/skills ·
S2 https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices ·
S3 https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview ·
S4 https://agentskills.io/specification ·
S5 https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills ·
S6 https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md ·
S7 https://developers.openai.com/codex/skills ·
S8 https://geminicli.com/docs/cli/skills/ ·
S9 https://opencode.ai/docs/skills/ ·
S10 https://hermes-agent.nousresearch.com/docs/user-guide/features/skills ·
S11 https://kilo.ai/docs/customize/skills ·
S12 https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md ·
S13 https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

Issues:
S14 https://github.com/openai/codex/issues/19679 ·
S15 https://github.com/openai/codex/issues/19911 ·
S16 https://github.com/bmad-code-org/BMAD-METHOD/issues/2343 ·
S17 https://github.com/anthropics/claude-code/issues/89123 ·
S18 https://github.com/anthropics/skills/issues/881

Papers:
S19 https://arxiv.org/abs/2607.01456 ·
S20 https://arxiv.org/abs/2608.08453 ·
S21 https://arxiv.org/abs/2602.12670 ·
S22 https://arxiv.org/abs/2505.03275 ·
S23 https://arxiv.org/abs/2606.06079 ·
S24 https://arxiv.org/abs/2406.07791 ·
S25 https://arxiv.org/abs/2604.23178

Tools and repositories:
S26 https://github.com/runkids/skillshare ·
S27 https://github.com/obra/superpowers (skills/writing-skills) ·
S28 https://github.com/thedaviddias/skill-check ·
S29 https://pypi.org/project/skillseal/ ·
S30 https://pub.dev/packages/skills_lint ·
S31 https://tessl.io/registry/uinaf/skill-audit ·
S32 https://tessl.io/registry/tessleng/default-skill-review ·
S33 https://tessl.io/registry/skills/github/softaworks/agent-toolkit/skill-judge ·
S34 https://docs.nvidia.com/skills/skillevaluator/tier2-deduplication ·
S35 https://github.com/knowledgexlab/skill-git ·
S36 https://skills.sh/shipshitdev/library/skill-auditor ·
S37 https://cdn.jsdelivr.net/npm/aiden-runtime@4.10.0/skills/installed/skill-compact/SKILL.md ·
S38 https://skillsmp.com/creators/ccomkhj/skills/find-overlapping-skills ·
S39 https://github.com/mattpocock/skills ·
S40 https://github.com/addyosmani/agent-skills ·
S41 https://github.com/vercel-labs/skills

Practitioner writing:
S42 https://claudefa.st/blog/guide/mechanics/skill-listing-budget ·
S43 https://smartscope.blog/en/blog/agent-skills-description-guide/ ·
S44 https://localskills.sh/blog/claude-skills-not-triggering ·
S45 https://mcp.directory/blog/why-your-claude-skill-isnt-activating-2026-fixes ·
S46 https://www.web-developpeur.com/en/blog/skills-claude-code-patterns-officiels ·
S47 https://do-skills-md-linter-matter.onrender.com/report.html ·
S48 https://codex.danielvaughan.com/2026/07/27/skillcorpus-open-skill-ecosystem-quality-curation-codex-cli-skill-management/ ·
S49 https://codex.danielvaughan.com/2026/03/26/writing-effective-skillmd-files/ ·
S50 https://simonwillison.net/2025/Oct/16/claude-skills/ ·
S51 https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/ ·
S52 https://www.humanlayer.dev/blog/writing-a-good-claude-md ·
S53 https://tianpan.co/blog/2026-04-19-over-tooled-agent-problem ·
S54 https://tianpan.co/blog/2026/04/27/tool-catalog-power-law-hot-cold-partition ·
S55 https://travis.media/blog/what-are-ai-agent-skills-skill-md/ ·
S56 https://mcp-methods.readthedocs.io/en/latest/guides/writing-effective-skills.html ·
S57 https://www.mindstudio.ai/blog/claude-code-skills-common-mistakes-guide ·
S58 https://www.newsletter.swirlai.com/p/agent-skills-progressive-disclosure ·
S59 https://redreamality.com/blog/progressive-disclosure-agent-skills/ ·
S60 https://noqta.tn/en/blog/production-grade-agent-skills-authoring-guide-2026 ·
S61 https://www.developersdigest.tech/topics/progressive-disclosure ·
S62 https://blog.fsck.com/2025/10/09/superpowers/ ·
S63 https://www.mindstudio.ai/blog/claude-code-skills-vs-slash-commands-2 ·
S64 https://www.mindstudio.ai/blog/claude-code-skills-architecture-skill-md-reference-files ·
S65 https://campus.datacamp.com/courses/introduction-to-agent-skills/sharing-troubleshooting-skills?ex=6 ·
S66 https://acydoan.substack.com/p/skillmd ·
S67 https://tylerfolkman.substack.com/p/the-complete-guide-to-claude-skills
