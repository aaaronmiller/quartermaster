# Harness Profile Contract

Harness profiles are declarative YAML documents. They describe target capabilities and filesystem
conventions; they do not execute code.

## Required Fields

```yaml
id: claude-code
name: Claude Code
version: 1
artifact_types:
  skill:
    supported: true
    layout: flat
    targets:
      global: ~/.claude/skills
      project: .claude/skills
  hook:
    supported: true
    dialect: claude-code
capabilities:
  hooks:
    supported: true
    dialects: [claude-code]
  mcp:
    supported: true
    config_formats: [json]
deactivation:
  strategy: remove_from_active_target
```

## Validation Rules

- `id`, `name`, and `version` are required.
- Every supported artifact type must declare a `layout` value of `flat`, `nested`, or `config`.
- Every filesystem target must state whether it is global, project, or both.
- Capabilities that have incompatible implementations must declare dialects.
- Unsupported artifact types may be omitted or declared with `supported: false`.
- Profiles must not contain executable code.

## Compatibility Mapping

The audit engine compares:

- Artifact type against `artifact_types`.
- Artifact required capabilities against `capabilities`.
- Artifact dialects against supported dialects.
- Artifact layout against target `layout`.
- Configuration artifact formats against `config_formats`.

The result is:

- `deployable`: no transform required.
- `transform`: target supports the artifact after a named transformation.
- `incompatible`: target lacks the artifact type, capability, dialect, or required format.
