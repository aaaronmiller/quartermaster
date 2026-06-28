<script lang="ts">
  type MetricValue = string | number;
  type Artifact = {
    id: string;
    type: string;
    name: string;
    description?: string | null;
    org_path: string;
    required_capabilities?: { name: string; dialect?: string }[];
    risk_flags?: string[];
    source_id?: string;
  };
  type Verdict = {
    artifact_id: string;
    harness_id: string;
    result: "deployable" | "transform" | "incompatible";
    reason?: string | null;
    transformation?: string | null;
  };
  type Named = { id: string; name: string; description?: string | null; members?: string[] };
  type Proposal = { id: string; kind: string; rationale: string; model: string; turns: number; accepted: boolean | null };
  type Summary = {
    catalog: { total: number; risky: number; locally_modified: number; sources: number; by_type: Record<string, number> };
    compatibility: { deployable: number; transform: number; incompatible: number; by_harness: Record<string, { deployable: number; transform: number; incompatible: number }> };
    loadouts: { total: number; names: string[] };
    activation: { total: number; active: number; by_harness: Record<string, { loadout_id: string; loadout_name: string; active: boolean; members: number }> };
    pipelines: { total: number; names: string[] };
    proposals: { pending: number; accepted: number; rejected: number };
    deployments: { total: number; latest: { harness_id: string; applied_at: string; operations: number } | null };
    recommendations: string[];
  };

  export let summary: Summary | null = null;
  export let artifacts: Artifact[] = [];
  export let verdicts: Verdict[] = [];
  export let loadouts: Named[] = [];
  export let pipelines: Named[] = [];
  export let proposals: Proposal[] = [];

  $: catalogMetrics = summary
    ? [
        ["Artifacts", summary.catalog.total],
        ["Sources", summary.catalog.sources],
        ["Risk flags", summary.catalog.risky],
        ["Local edits", summary.catalog.locally_modified]
      ]
    : [];
  $: readinessMetrics = summary
    ? [
        ["Deployable", summary.compatibility.deployable],
        ["Transform", summary.compatibility.transform],
        ["Blocked", summary.compatibility.incompatible],
        ["Deployments", summary.deployments.total]
      ]
    : [];
  $: reviewMetrics = summary
    ? [
        ["Pending", summary.proposals.pending],
        ["Accepted", summary.proposals.accepted],
        ["Rejected", summary.proposals.rejected],
        ["Loadouts", summary.loadouts.total]
      ]
    : [];
  $: harnessRows = summary ? Object.entries(summary.compatibility.by_harness) : [];
  $: activationRows = summary ? Object.entries(summary.activation.by_harness) : [];
</script>

<main class="shell">
  <section class="mast">
    <div>
      <p class="kicker">Quartermaster</p>
      <h1>Artifact fleet control for local agent harnesses</h1>
      <p class="lede">
        Catalog, compatibility, loadouts, pipelines, safety review, and deploy previews from the same local source of truth.
      </p>
    </div>
    <aside class="latest" aria-label="Latest deployment">
      <span>Latest deployment</span>
      {#if summary?.deployments.latest}
        <strong>{summary.deployments.latest.harness_id}</strong>
        <small>{summary.deployments.latest.operations} operations at {summary.deployments.latest.applied_at}</small>
      {:else}
        <strong>None recorded</strong>
        <small>Run qm deploy apply after reviewing a preview.</small>
      {/if}
    </aside>
  </section>

  <section class="metrics" aria-label="Catalog metrics">
    <MetricStrip title="Catalog" metrics={catalogMetrics} />
    <MetricStrip title="Harness readiness" metrics={readinessMetrics} />
    <MetricStrip title="Review queue" metrics={reviewMetrics} />
  </section>

  <section class="workspace">
    <article class="panel wide">
      <header>
        <h2>Compatibility Matrix</h2>
        <code>qm audit --matrix --json</code>
      </header>
      {#if harnessRows.length}
        <div class="matrix">
          {#each harnessRows as [harness, counts]}
            <div class="matrix-row">
              <span>{harness}</span>
              <b>{counts.deployable}</b>
              <b>{counts.transform}</b>
              <b>{counts.incompatible}</b>
            </div>
          {/each}
        </div>
      {:else}
        <EmptyState command="qm audit --matrix --json" message="No compatibility verdicts are stored yet." />
      {/if}
    </article>

    <article class="panel">
      <header>
        <h2>Recommendations</h2>
        <code>qm query summary --json</code>
      </header>
      {#if summary?.recommendations.length}
        <ul class="plain-list">
          {#each summary.recommendations as recommendation}
            <li>{recommendation}</li>
          {/each}
        </ul>
      {:else}
        <EmptyState command="qm query summary --json" message="No recommendations need attention." />
      {/if}
    </article>
  </section>

  <section class="workspace">
    <article class="panel wide">
      <header>
        <h2>Harness Assignments</h2>
        <code>qm loadout assign &lt;name&gt; --harness &lt;id&gt;</code>
      </header>
      {#if activationRows.length}
        <div class="matrix">
          {#each activationRows as [harness, state]}
            <div class="matrix-row">
              <span>{harness}</span>
              <b>{state.active ? state.loadout_name : 'inactive'}</b>
              <b>{state.members}</b>
              <b>{state.active ? 'active' : 'inactive'}</b>
            </div>
          {/each}
        </div>
      {:else}
        <EmptyState command="qm loadout assign <name> --harness <id>" message="No harness assignments are configured yet." />
      {/if}
    </article>
  </section>

  <section class="workspace">
    <article class="panel wide">
      <header>
        <h2>Catalog</h2>
        <code>qm query search &lt;text&gt; --json</code>
      </header>
      {#if artifacts.length}
        <div class="table" role="table" aria-label="Catalog artifacts">
          <div class="table-head" role="row">
            <span>Name</span><span>Type</span><span>Path</span><span>Signals</span>
          </div>
          {#each artifacts as artifact}
            <div class="table-row" role="row">
              <span>
                <strong>{artifact.name}</strong>
                {#if artifact.description}<small>{artifact.description}</small>{/if}
              </span>
              <span>{artifact.type}</span>
              <span>{artifact.org_path}</span>
              <span>{[...(artifact.required_capabilities ?? []).map((c) => c.name), ...(artifact.risk_flags ?? [])].join(", ") || "clear"}</span>
            </div>
          {/each}
        </div>
      {:else}
        <EmptyState command="qm scan --root <library>" message="No artifacts are cataloged yet." />
      {/if}
    </article>

    <article class="panel">
      <header>
        <h2>Activation</h2>
        <code>qm loadout list --json</code>
      </header>
      <NameList title="Loadouts" items={loadouts} empty="No loadouts defined." />
      <NameList title="Pipelines" items={pipelines} empty="No pipelines defined." />
    </article>
  </section>

  <section class="workspace">
    <article class="panel wide">
      <header>
        <h2>Proposal Review</h2>
        <code>qm query proposals --json</code>
      </header>
      {#if proposals.length}
        <div class="proposal-grid">
          {#each proposals as proposal}
            <section class="proposal">
              <span>{proposal.kind}</span>
              <strong>{proposal.accepted === null ? "pending" : proposal.accepted ? "accepted" : "rejected"}</strong>
              <p>{proposal.rationale}</p>
              <small>{proposal.model}, {proposal.turns} turns</small>
            </section>
          {/each}
        </div>
      {:else}
        <EmptyState command="qm eval loadout --json" message="No agentic proposals are waiting for review." />
      {/if}
    </article>

    <article class="panel">
      <header>
        <h2>Type Mix</h2>
        <code>qm catalog --json</code>
      </header>
      {#if summary}
        <div class="type-mix">
          {#each Object.entries(summary.catalog.by_type) as [type, count]}
            <div><span>{type}</span><b>{count}</b></div>
          {/each}
        </div>
      {/if}
    </article>
  </section>
</main>

{#snippet MetricStrip(title: string, metrics: [string, MetricValue][])}
  <article class="metric-strip">
    <h2>{title}</h2>
    <div>
      {#each metrics as [label, value]}
        <span><b>{value}</b>{label}</span>
      {/each}
    </div>
  </article>
{/snippet}

{#snippet EmptyState(message: string, command: string)}
  <div class="empty">
    <p>{message}</p>
    <code>{command}</code>
  </div>
{/snippet}

{#snippet NameList(title: string, items: Named[], empty: string)}
  <section class="name-list">
    <h3>{title}</h3>
    {#if items.length}
      <ul>
        {#each items as item}
          <li><span>{item.name}</span><small>{item.members?.length ?? 0} members</small></li>
        {/each}
      </ul>
    {:else}
      <p>{empty}</p>
    {/if}
  </section>
{/snippet}

<style>
  :global(:root) {
    --bg: #080b0f;
    --surface: #10171d;
    --surface-2: #162128;
    --line: #27404a;
    --text: #e8ece8;
    --muted: #91a39f;
    --accent: #5be0b3;
    --warn: #f7b267;
    --danger: #ff6b6b;
    --duration-fast: 160ms;
    --duration-med: 240ms;
    --ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-exit: cubic-bezier(0.7, 0, 0.84, 0);
  }

  :global(body) {
    margin: 0;
    background:
      radial-gradient(circle at top left, rgba(91, 224, 179, 0.12), transparent 34rem),
      linear-gradient(135deg, #080b0f 0%, #0b1216 44%, #101314 100%);
    color: var(--text);
    font-family: ui-sans-serif, "Aptos", "Segoe UI", sans-serif;
  }

  .shell {
    width: min(1440px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 32px 0 56px;
  }

  .mast {
    min-height: 310px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 32px;
    align-items: end;
    border-bottom: 1px solid var(--line);
  }

  .kicker {
    color: var(--accent);
    font-weight: 800;
    letter-spacing: 0;
    margin: 0 0 18px;
  }

  h1 {
    max-width: 920px;
    margin: 0;
    font-size: clamp(42px, 7vw, 96px);
    line-height: 0.92;
    letter-spacing: 0;
  }

  .lede {
    max-width: 760px;
    color: var(--muted);
    font-size: 18px;
    line-height: 1.55;
  }

  .latest,
  .panel,
  .metric-strip {
    background: linear-gradient(180deg, rgba(22, 33, 40, 0.96), rgba(12, 18, 22, 0.96));
    border: 1px solid var(--line);
  }

  .latest {
    padding: 22px;
    margin-bottom: 28px;
  }

  .latest span,
  code,
  small {
    color: var(--muted);
  }

  .latest strong {
    display: block;
    margin: 10px 0;
    font-size: 28px;
  }

  .metrics,
  .workspace {
    display: grid;
    gap: 16px;
    margin-top: 16px;
  }

  .metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .workspace {
    grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.8fr);
  }

  .metric-strip,
  .panel {
    border-radius: 8px;
    padding: 20px;
  }

  .metric-strip h2,
  .panel h2,
  .name-list h3 {
    margin: 0;
    letter-spacing: 0;
  }

  .metric-strip > div {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-top: 20px;
  }

  .metric-strip span {
    display: grid;
    gap: 6px;
    color: var(--muted);
  }

  .metric-strip b {
    color: var(--text);
    font-size: 30px;
  }

  .panel header {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: start;
    margin-bottom: 18px;
  }

  code {
    font-family: "Cascadia Code", "SFMono-Regular", monospace;
    font-size: 12px;
  }

  .matrix,
  .table,
  .type-mix,
  .proposal-grid {
    display: grid;
    gap: 8px;
  }

  .matrix-row,
  .table-head,
  .table-row,
  .type-mix div,
  .name-list li {
    display: grid;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    border-bottom: 1px solid rgba(39, 64, 74, 0.72);
  }

  .matrix-row {
    grid-template-columns: 1fr 80px 80px 80px;
  }

  .matrix-row b:nth-child(2) { color: var(--accent); }
  .matrix-row b:nth-child(3) { color: var(--warn); }
  .matrix-row b:nth-child(4) { color: var(--danger); }

  .table-head,
  .table-row {
    grid-template-columns: minmax(180px, 1.2fr) 110px minmax(160px, 1fr) minmax(120px, 0.8fr);
  }

  .table-head {
    color: var(--muted);
    font-weight: 700;
  }

  .table-row strong,
  .table-row small {
    display: block;
  }

  .plain-list,
  .name-list ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plain-list li {
    padding: 12px 0;
    border-bottom: 1px solid rgba(39, 64, 74, 0.72);
  }

  .name-list {
    margin-top: 18px;
  }

  .name-list li {
    grid-template-columns: 1fr auto;
  }

  .name-list p,
  .empty p {
    color: var(--muted);
  }

  .proposal-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .proposal {
    min-height: 140px;
    padding: 16px;
    border: 1px solid rgba(91, 224, 179, 0.24);
    background: rgba(91, 224, 179, 0.06);
  }

  .proposal span {
    color: var(--accent);
  }

  .proposal strong {
    display: block;
    margin-top: 8px;
  }

  .type-mix div {
    grid-template-columns: 1fr auto;
  }

  .empty {
    min-height: 120px;
    display: grid;
    place-content: center;
    gap: 10px;
    border: 1px dashed var(--line);
    text-align: center;
  }

  @media (max-width: 900px) {
    .mast,
    .metrics,
    .workspace {
      grid-template-columns: 1fr;
    }

    .metric-strip > div,
    .table-head,
    .table-row {
      grid-template-columns: 1fr 1fr;
    }

    .latest {
      margin-bottom: 0;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .panel,
    .metric-strip,
    .latest {
      transition: border-color var(--duration-med) var(--ease-enter), background-color var(--duration-med) var(--ease-enter);
    }

    .panel:hover,
    .metric-strip:hover,
    .latest:hover {
      border-color: rgba(91, 224, 179, 0.56);
    }
  }

  @media print {
    :global(body) {
      background: white;
      color: black;
    }

    .latest,
    .panel,
    .metric-strip {
      border-color: #999;
      background: white;
      break-inside: avoid;
    }
  }
</style>
