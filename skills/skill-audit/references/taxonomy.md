# Function taxonomy

One primary category per skill, chosen by the job the skill does for the
user, not by the tools it uses. A skill that runs several gates (create,
implement, audit) or spans two jobs gets a `secondary_category` and is
compared against the skills of both. Add up to three free-form tags.

| Category | The skill's job | Boundary notes |
| --- | --- | --- |
| `planning-spec` | Turn an idea or request into requirements, specs, plans, task lists; plan reviews | Executing a plan is `software-build`; auditing a spec stays here |
| `software-build` | Write or change application code for a stack, framework or API | Visual design choices are `design-ui`; tests and debugging are `code-quality` |
| `code-quality` | Debug, test, review code, security review, refactor | Reviewing prose is `writing` |
| `git-release` | Git, PRs, CI, merges, shipping, release notes | Repo-wide sync tooling stays here |
| `agent-orchestration` | Run, coordinate or delegate to other agents, subagents, CLIs, loops | Writing skills or configs for agents is `agent-tooling` |
| `agent-tooling` | Build, audit or configure skills, plugins, hooks, MCP servers, rule files, harness settings | Using an MCP server for a task belongs to that task's category |
| `memory-continuity` | Session history, handoffs, intent recovery, living documents, context compaction | State across sessions and projects; one task's own history belongs to that task's category |
| `research` | Find and synthesize information from the web, papers, repos, transcripts | The job is finding and synthesizing; turning findings into requirements is `planning-spec` |
| `reasoning-decision` | Structured thinking, deciding, verifying claims, explaining why or how | Deciding and verifying; carrying out the decision belongs to the job's category |
| `writing` | Produce or edit prose: tone, humanizing, humor, marketing copy, internal comms | Office file formats are `documents` |
| `documents` | Create or edit docx, pdf, pptx, xlsx, OCR, file conversion | |
| `design-ui` | Visual direction, UI and UX quality, design systems, taste, redesigns | Building the components in code is `software-build` |
| `media-motion` | Video, animation, motion graphics, captions, audio-to-video | Still images are `image-art` |
| `image-art` | Generate or edit images, generative art, ascii art, brand boards | |
| `diagrams-data-viz` | Diagrams, charts, canvases, knowledge graphs | |
| `integrations` | Operate a specific external service or app (Notion, Linear, Google Workspace, email, Obsidian, S3) | When the service is incidental, use the job's category |
| `system-ops` | Machine and environment upkeep: OS checkups, deploys, local services, kernels, browsers | |
| `personal-domain` | Tied to the operator's own life or business (job search, weekly reports, a specific hardware hobby) | Generalizable workflows belong to their job category |

## Using the taxonomy

- Write the category into the verdict, and into the skill as
  `metadata.category` when changes are applied.
- When a cluster decision keeps two or more related skills, write the
  relation into each kept skill at apply time as `metadata.related`
  (for example `related: "overlap:pdf-forms, pipeline:spec-implement"`), so
  the next audit starts from the known graph instead of rediscovering it.
- Clusters for review are formed within a category first, then checked
  across categories by description (see `cluster-and-dedupe.md` section 3).
- A new category needs at least three skills that fit no existing one, and
  the orchestrator's approval, recorded in the decision log.
