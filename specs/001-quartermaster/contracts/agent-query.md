# Agent Query Contract

Agent query commands expose stable JSON so coding agents can inspect Quartermaster without parsing
human CLI output.

## `qm query artifacts --json`

Returns:

```json
{
  "artifacts": [
    {
      "id": "string",
      "type": "skill",
      "name": "string",
      "org_path": "string",
      "required_capabilities": [],
      "risk_flags": [],
      "source_id": "string"
    }
  ]
}
```

## `qm query compatibility --artifact <id> --json`

Returns:

```json
{
  "artifact_id": "string",
  "verdicts": [
    {
      "harness_id": "string",
      "result": "deployable",
      "reason": null,
      "transformation": null,
      "override_note": null
    }
  ]
}
```

## `qm query deployment --harness <id> --json`

Returns:

```json
{
  "harness_id": "string",
  "active_loadout": "string",
  "deployed_artifacts": [],
  "drift": [],
  "orphans": []
}
```

## Stability Requirements

- JSON field names are stable across patch releases.
- New fields may be added, but existing fields must not change type without a major version.
- Query commands must not write filesystem state.
