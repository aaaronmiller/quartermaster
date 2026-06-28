export function renderWebShell(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quartermaster</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap" rel="stylesheet">
  <style>
    :root{
      --base-100:#070a0d;--base-200:#0d1418;--base-300:#142127;--base-400:#1b2b31;
      --line:#24424a;--line-strong:#38616b;--text:#e8ece8;--muted:#8ea49f;
      --primary:#5be0b3;--primary-soft:rgba(91,224,179,.12);--accent:#f7b267;--danger:#ff6b6b;
      --info:#7aa8ff;--shadow:rgba(0,0,0,.38);
      --duration-fast:120ms;--duration-enter:240ms;--duration-exit:160ms;
      --ease-enter:cubic-bezier(.2,0,0,1);--ease-exit:cubic-bezier(.3,0,.8,.15);--ease-standard:cubic-bezier(.2,0,0,1);
    }
    *{box-sizing:border-box}
    body{
      margin:0;min-width:320px;color:var(--text);
      font-family:"IBM Plex Sans","Aptos","Segoe UI",sans-serif;
      background:
        radial-gradient(circle at 14% 6%,rgba(91,224,179,.16),transparent 34rem),
        radial-gradient(circle at 88% 16%,rgba(247,178,103,.10),transparent 28rem),
        linear-gradient(135deg,var(--base-100),#091014 44%,#101412);
    }
    body:before{
      content:"";position:fixed;inset:0;pointer-events:none;opacity:.22;
      background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
      background-size:42px 42px;mask-image:linear-gradient(to bottom,#000,transparent 78%);
    }
    button,input{font:inherit}
    button{cursor:pointer}
    button:focus-visible,input:focus-visible{outline:2px solid var(--primary);outline-offset:4px}
    main{position:relative;width:min(1500px,calc(100vw - 32px));margin:0 auto;padding:28px 0 64px}
    .topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:44px}
    .brand{display:flex;align-items:center;gap:12px;font-weight:800}
    .mark{width:28px;height:28px;border:1px solid var(--primary);background:linear-gradient(135deg,var(--primary-soft),transparent);box-shadow:0 0 28px rgba(91,224,179,.22)}
    .commandbar{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
    .cmd{
      min-height:40px;padding:9px 12px;border:1px solid var(--line);border-radius:7px;background:rgba(13,20,24,.76);
      color:var(--muted);text-decoration:none;font-family:"IBM Plex Mono","Cascadia Code",monospace;font-size:12px;
      transition:border-color var(--duration-enter) var(--ease-enter),color var(--duration-enter) var(--ease-enter),background var(--duration-enter) var(--ease-enter);
    }
    .cmd:hover{border-color:var(--primary);color:var(--text);background:rgba(91,224,179,.08)}
    .hero{min-height:330px;display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:36px;align-items:end;padding:44px 0 30px;border-bottom:1px solid var(--line)}
    h1{max-width:980px;margin:0;font-family:"Syne","IBM Plex Sans",sans-serif;font-size:clamp(44px,7.2vw,104px);line-height:.9;letter-spacing:0}
    .lede{max-width:760px;color:var(--muted);font-size:18px;line-height:1.6;margin:22px 0 0}
    .hero-side{display:grid;gap:14px}
    .radar{min-height:220px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px;background:linear-gradient(180deg,rgba(20,33,39,.84),rgba(8,13,16,.92));box-shadow:0 24px 60px var(--shadow)}
    .radar svg{width:min(240px,78%);height:auto;overflow:visible}
    .latest{border:1px solid var(--line);border-radius:8px;background:rgba(13,20,24,.8);padding:16px}
    .label{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
    .latest strong{display:block;margin:8px 0 4px;font-size:24px}
    .metrics,.workspace{display:grid;gap:16px;margin-top:16px}
    .metrics{grid-template-columns:repeat(3,minmax(0,1fr))}
    .workspace{grid-template-columns:minmax(0,1.55fr) minmax(320px,.85fr)}
    .actions{display:grid;gap:16px;grid-template-columns:minmax(0,1fr) minmax(320px,.85fr);margin-top:16px}
    .ops{display:grid;gap:16px;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:16px}
    .panel,.metric{border:1px solid var(--line);border-radius:8px;background:linear-gradient(180deg,rgba(20,33,39,.92),rgba(10,16,19,.96));box-shadow:0 16px 50px rgba(0,0,0,.22)}
    .panel{padding:20px}
    .metric{padding:18px;transition:border-color var(--duration-enter) var(--ease-enter),transform var(--duration-enter) var(--ease-enter)}
    .metric:hover,.panel:hover{border-color:rgba(91,224,179,.5)}
    .metric header,.panel header{display:flex;align-items:start;justify-content:space-between;gap:16px;margin-bottom:16px}
    h2,h3{margin:0;letter-spacing:0}
    h2{font-size:18px}h3{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
    code{font-family:"IBM Plex Mono","Cascadia Code",monospace;color:var(--muted);font-size:12px}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .metric-grid span{display:grid;gap:4px;color:var(--muted);font-size:13px}
    .metric-grid b{font-family:"IBM Plex Mono","Cascadia Code",monospace;color:var(--text);font-size:28px;font-variant-numeric:tabular-nums}
    .matrix-row,.artifact-row,.head,.simple-row{display:grid;gap:12px;align-items:center;min-height:46px;border-bottom:1px solid rgba(36,66,74,.72)}
    .matrix-row{grid-template-columns:1fr 86px 86px 86px}
    .artifact-row,.head{grid-template-columns:minmax(190px,1.2fr) 106px minmax(170px,1fr) minmax(130px,.8fr)}
    .head{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:800}
    .simple-row{grid-template-columns:1fr auto}
    .dot{display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:999px;background:var(--muted)}
    .ok{color:var(--primary)}.warn{color:var(--accent)}.bad{color:var(--danger)}.info{color:var(--info)}
    .ok .dot,.dot.ok{background:var(--primary);box-shadow:0 0 12px rgba(91,224,179,.58)}
    .warn .dot,.dot.warn{background:var(--accent);box-shadow:0 0 12px rgba(247,178,103,.45)}
    .bad .dot,.dot.bad{background:var(--danger);box-shadow:0 0 12px rgba(255,107,107,.42)}
    .searchbar{display:flex;gap:10px;align-items:center;margin-bottom:12px}
    .searchbar input{width:100%;min-height:42px;border:1px solid var(--line);border-radius:7px;background:rgba(7,10,13,.72);color:var(--text);padding:0 12px}
    .searchbar button{min-height:42px;border:1px solid var(--line);border-radius:7px;background:var(--primary-soft);color:var(--text);padding:0 14px;transition:background var(--duration-fast) var(--ease-standard),border-color var(--duration-fast) var(--ease-standard)}
    .searchbar button:hover{border-color:var(--primary);background:rgba(91,224,179,.18)}
    .fieldgrid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:12px}
    .fieldgrid label{display:grid;gap:6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
    .fieldgrid input,.fieldgrid textarea,.fieldgrid select{
      width:100%;border:1px solid var(--line);border-radius:7px;background:rgba(7,10,13,.72);color:var(--text);padding:10px 12px;min-height:42px;
    }
    .fieldgrid textarea{min-height:110px;resize:vertical;line-height:1.5;text-transform:none;letter-spacing:0}
    .fieldgrid .full{grid-column:1/-1}
    .buttonrow{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
    .primarybtn,.ghostbtn{
      min-height:42px;border-radius:7px;padding:0 14px;border:1px solid var(--line);color:var(--text);
      transition:border-color var(--duration-fast) var(--ease-standard),background var(--duration-fast) var(--ease-standard),transform var(--duration-fast) var(--ease-standard);
    }
    .primarybtn{background:rgba(91,224,179,.14)}
    .ghostbtn{background:rgba(13,20,24,.76)}
    .primarybtn:hover,.ghostbtn:hover{border-color:var(--primary);background:rgba(91,224,179,.18)}
    .primarybtn:active,.ghostbtn:active{transform:translateY(1px)}
    .selectionbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:10px 0 14px;color:var(--muted);font-size:13px}
    .selectionbar strong{display:inline}
    .checkbox-cell{display:flex;align-items:center;gap:10px}
    .checkbox-cell input{accent-color:var(--primary)}
    ul{margin:0;padding:0;list-style:none}li{padding:11px 0;border-bottom:1px solid rgba(36,66,74,.72)}
    small,.muted{color:var(--muted)}strong,small{display:block}.artifact-row strong{margin-bottom:3px}
    .chipline{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid var(--line);border-radius:5px;padding:3px 6px;color:var(--muted);font-size:12px}
    .empty{min-height:128px;display:grid;place-content:center;gap:10px;text-align:center;border:1px dashed var(--line);border-radius:7px;background:rgba(7,10,13,.35)}
    .type-mix{display:grid;gap:8px}.type-mix div{display:grid;grid-template-columns:1fr auto;align-items:center;min-height:36px;border-bottom:1px solid rgba(36,66,74,.72)}
    .bar{height:8px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}.bar span{display:block;height:100%;background:linear-gradient(90deg,var(--primary),var(--accent))}
    @media(max-width:1200px){.ops{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:980px){.hero,.metrics,.workspace,.actions,.ops{grid-template-columns:1fr}.hero{min-height:auto}.metric-grid,.artifact-row,.head{grid-template-columns:1fr 1fr}.commandbar{justify-content:flex-start}}
    @media(max-width:560px){main{width:min(100vw - 20px,1500px);padding-top:16px}.topbar{align-items:flex-start;flex-direction:column}.metric-grid,.matrix-row,.artifact-row,.head,.fieldgrid{grid-template-columns:1fr}.cmd,.primarybtn,.ghostbtn{width:100%}.searchbar,.buttonrow{flex-direction:column;align-items:stretch}}
    @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
    @media print{body{background:white;color:black}.topbar,.commandbar{display:none}.panel,.metric,.latest,.radar{background:white;border-color:#999;box-shadow:none;break-inside:avoid}}
  </style>
</head>
<body>
  <main>
    <nav class="topbar" aria-label="Quartermaster commands">
      <div class="brand"><span class="mark" aria-hidden="true"></span><span>Quartermaster</span></div>
      <div class="commandbar">
        <button class="cmd" type="button" data-jump="overview">Overview</button>
        <button class="cmd" type="button" data-jump="catalog">Catalog</button>
        <button class="cmd" type="button" data-jump="audit">Audit</button>
        <button class="cmd" type="button" data-jump="operations">Operations</button>
        <button class="cmd" type="button" data-jump="loadouts">Loadouts</button>
        <button class="cmd" type="button" data-jump="pipelines">Pipelines</button>
        <button class="cmd" type="button" data-jump="proposals">Proposals</button>
      </div>
    </nav>
    <section class="hero" id="overview">
      <div>
        <h1>Artifact fleet control for local agent harnesses</h1>
        <p class="lede">One organized source library, compatibility verdicts before deployment, loadouts for focus, and proposal review without surrendering deterministic control.</p>
      </div>
      <aside class="hero-side">
        <div class="radar" aria-label="Compatibility radar">
          <svg viewBox="0 0 220 220" role="img" aria-label="Quartermaster compatibility rings">
            <defs><linearGradient id="ring" x1="0" x2="1"><stop stop-color="#5be0b3"/><stop offset="1" stop-color="#f7b267"/></linearGradient></defs>
            <circle cx="110" cy="110" r="86" fill="none" stroke="rgba(91,224,179,.18)" stroke-width="1"/>
            <circle cx="110" cy="110" r="58" fill="none" stroke="rgba(247,178,103,.18)" stroke-width="1"/>
            <circle cx="110" cy="110" r="30" fill="none" stroke="rgba(122,168,255,.18)" stroke-width="1"/>
            <path d="M110 24 A86 86 0 0 1 196 110" fill="none" stroke="url(#ring)" stroke-width="8" stroke-linecap="round"/>
            <path d="M43 164 A86 86 0 0 1 110 24" fill="none" stroke="#7aa8ff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
            <circle cx="110" cy="110" r="9" fill="#5be0b3"/><line x1="110" y1="110" x2="170" y2="62" stroke="#5be0b3" stroke-width="2"/>
          </svg>
        </div>
        <div class="latest" id="latest"><span class="label">Latest deployment</span><strong>Loading</strong><small>Reading local catalog</small></div>
      </aside>
    </section>
    <section class="metrics" id="metrics" aria-label="Dashboard metrics"></section>
    <section class="actions" id="actions">
      <article class="panel">
        <header><div><h2>Skill Sequence Controls</h2><code>ordered skill pointers for a task</code></div></header>
        <div class="selectionbar"><span><strong id="selected-count">0</strong> selected skills</span><span>The order below is the execution sequence.</span></div>
        <form class="fieldgrid" id="loadout-form" method="post" action="/web/loadouts">
          <label>Loadout name<input id="loadout-name" type="text" placeholder="coding"></label>
          <label>Loadout description<input id="loadout-desc" type="text" placeholder="Focused coding set"></label>
          <label class="full">Selected sequence<textarea id="loadout-members" readonly placeholder="Selected skill names will appear here in order"></textarea></label>
          <label class="full">Artifact ids<textarea id="selected-artifact-ids" name="artifactIds" placeholder="Select rows below or paste one artifact id per line"></textarea></label>
          <input id="loadout-name-submit" name="name" type="hidden">
          <input id="loadout-desc-submit" name="description" type="hidden">
        </form>
        <form class="fieldgrid" id="loadout-member-form" method="post" action="/web/loadouts/members">
          <label>Existing loadout<select id="existing-loadout"><option value="">Select a loadout</option></select></label>
          <input id="existing-loadout-submit" name="loadoutId" type="hidden">
          <input id="member-artifact-ids" name="artifactIds" type="hidden">
        </form>
        <form class="fieldgrid" id="loadout-edit-form" method="post" action="/web/loadouts/update">
          <label>Edit loadout<select id="edit-loadout"><option value="">Select a loadout</option></select></label>
          <label>Description<input id="edit-loadout-desc" name="description" type="text" placeholder="Updated description"></label>
          <label class="full">Replacement ordered members<textarea id="edit-loadout-members" name="artifactIds" placeholder="One artifact or pipeline id per line, in order"></textarea></label>
          <input id="edit-loadout-submit" name="loadoutId" type="hidden">
        </form>
        <form class="fieldgrid" id="loadout-remove-form" method="post" action="/web/loadouts/remove-member">
          <label>Remove from loadout<select id="remove-loadout"><option value="">Select a loadout</option></select></label>
          <label>Member id<input id="remove-member-id" name="memberId" type="text" placeholder="artifact or pipeline id"></label>
          <input id="remove-loadout-submit" name="loadoutId" type="hidden">
        </form>
        <form class="fieldgrid" id="assignment-form" method="post" action="/web/loadouts/assign">
          <label>Harness<select id="assignment-harness"><option value="">Select a harness</option></select></label>
          <label>Assign loadout<select id="assignment-loadout"><option value="">Select a loadout</option></select></label>
          <label><span>Active</span><input id="assignment-active" type="checkbox" checked></label>
          <input id="assignment-harness-submit" name="harness" type="hidden">
          <input id="assignment-loadout-submit" name="loadoutId" type="hidden">
          <input id="assignment-active-submit" name="active" type="hidden" value="true">
        </form>
        <form id="audit-form" method="post" action="/web/audit/run"></form>
        <div class="buttonrow">
          <button class="primarybtn" type="submit" form="loadout-form" id="create-loadout">Create Loadout</button>
          <button class="ghostbtn" type="submit" form="loadout-member-form" id="add-to-loadout">Add Selected to Loadout</button>
          <button class="ghostbtn" type="submit" form="loadout-edit-form" id="edit-loadout-submit-button">Replace/Reorder Loadout</button>
          <button class="ghostbtn" type="submit" form="loadout-remove-form" id="remove-loadout-member">Remove Member</button>
          <button class="ghostbtn" type="submit" form="assignment-form" id="assign-loadout">Assign Loadout to Harness</button>
          <button class="ghostbtn" type="submit" form="llm-form" name="mode" value="audit" id="llm-audit">LLM Audit Selected</button>
          <button class="ghostbtn" type="submit" form="llm-form" name="mode" value="improvement" id="llm-improve">LLM Improve Selected</button>
          <button class="ghostbtn" type="submit" form="llm-form" name="mode" value="fix" id="llm-fix">LLM Fix Selected</button>
          <button class="ghostbtn" type="submit" form="audit-form" id="run-audit">Run Audit</button>
          <button class="ghostbtn" type="button" id="refresh-data">Refresh</button>
        </div>
      </article>
      <article class="panel">
        <header><div><h2>Sequence Builder</h2><code>selected skills become a reusable sequence</code></div></header>
        <form class="fieldgrid" id="pipeline-form" method="post" action="/web/pipelines">
          <label>Sequence name<input id="pipeline-name" type="text" placeholder="research-report"></label>
          <label>Use case<input id="pipeline-usecase" type="text" placeholder="Research report drafting"></label>
          <label class="full">Directive<textarea id="pipeline-directive" placeholder="Use the selected skills in sequence for the stated use case."></textarea></label>
          <input id="pipeline-name-submit" name="name" type="hidden">
          <input id="pipeline-usecase-submit" name="use_case" type="hidden">
          <input id="pipeline-directive-submit" name="directive" type="hidden">
          <input id="pipeline-artifact-ids" name="artifactIds" type="hidden">
        </form>
        <form class="fieldgrid" id="llm-form" method="post" action="/web/evaluate/skill-review">
          <label class="full">LLM instruction<textarea id="llm-instruction" placeholder="Audit these skills for overlap, safety, and how to improve the sequence."></textarea></label>
          <label>Model<input id="llm-model" type="text" placeholder="Uses QM_MODEL_NAME when empty"></label>
          <input id="llm-instruction-submit" name="instruction" type="hidden">
          <input id="llm-model-submit" name="model" type="hidden">
          <input id="llm-artifact-ids" name="artifactIds" type="hidden">
        </form>
        <div class="buttonrow">
          <button class="primarybtn" type="submit" form="pipeline-form" id="create-pipeline">Create Skill Sequence</button>
          <button class="ghostbtn" type="button" id="clear-selection">Clear Selection</button>
        </div>
      </article>
    </section>
    <section class="ops" id="operations" aria-label="Quartermaster operations">
      <article class="panel">
        <header><div><h2>Scan</h2><code>qm scan</code></div></header>
        <form class="fieldgrid" method="post" action="/web/scan">
          <label class="full">Library root<input name="root" type="text" placeholder="/home/misscheta/code/agents/skills"></label>
          <button class="primarybtn" type="submit">Scan Library</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Catalog</h2><code>qm catalog</code></div></header>
        <form class="fieldgrid" method="get" action="/web/catalog/search">
          <label>Text<input name="q" type="text" placeholder="research"></label>
          <label>Type<select name="type"><option value="">Any</option><option>skill</option><option>agent</option><option>hook</option><option>mcp</option><option>command</option><option>plugin</option><option>script</option><option>output_style</option></select></label>
          <label>Capability<input name="capability" type="text" placeholder="hooks"></label>
          <label>Path<input name="path" type="text" placeholder="productivity/"></label>
          <button class="primarybtn" type="submit">Search Catalog</button>
        </form>
        <form class="fieldgrid" method="get" action="/web/catalog/show">
          <label class="full">Artifact id<input name="id" type="text" placeholder="artifact id"></label>
          <button class="ghostbtn" type="submit">Show Artifact</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Compatibility</h2><code>qm audit</code></div></header>
        <form class="fieldgrid" method="post" action="/web/audit/run">
          <label>Harness<input name="harness" type="text" placeholder="claude-code"></label>
          <button class="primarybtn" type="submit">Run Audit</button>
        </form>
        <form class="fieldgrid" method="get" action="/web/audit/active">
          <button class="ghostbtn" type="submit">Audit Active Skills for All CLIs</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Deploy</h2><code>qm deploy preview/apply</code></div></header>
        <form class="fieldgrid" method="post" action="/web/deploy/preview">
          <label>Harness<input name="harness" type="text" value="claude-code"></label>
          <label>Target root<input name="targetRoot" type="text" placeholder="/tmp/qm-target"></label>
          <label>Loadout<input name="loadout" type="text" placeholder="coding"></label>
          <label>Path scope<input name="path" type="text" placeholder="optional subfolder"></label>
          <button class="primarybtn" type="submit">Preview Deploy</button>
        </form>
        <form class="fieldgrid" method="post" action="/web/deploy/apply">
          <label>Harness<input name="harness" type="text" value="claude-code"></label>
          <label>Target root<input name="targetRoot" type="text" placeholder="/tmp/qm-target"></label>
          <label>Loadout<input name="loadout" type="text" placeholder="coding"></label>
          <label><span>Confirm apply</span><input name="confirmApply" type="checkbox" value="true"></label>
          <button class="ghostbtn" type="submit">Apply Deploy</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Rollback</h2><code>qm deploy rollback</code></div></header>
        <form class="fieldgrid" method="post" action="/web/deploy/rollback">
          <label class="full">Deployment id<input name="id" type="text" placeholder="deployment id"></label>
          <label><span>Apply rollback</span><input name="confirmApply" type="checkbox" value="true"></label>
          <button class="primarybtn" type="submit">Preview or Apply Rollback</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Sources</h2><code>qm import / sync</code></div></header>
        <form class="fieldgrid" method="post" action="/web/import">
          <label>Kind<select name="kind"><option>local</option><option>git</option><option>git_subdir</option><option>marketplace</option><option>self</option></select></label>
          <label>Destination<input name="dest" type="text" value=".quartermaster/imports"></label>
          <label class="full">Source<input name="source" type="text" placeholder="/path/or/repo.git"></label>
          <button class="primarybtn" type="submit">Import Source</button>
        </form>
        <form class="fieldgrid" method="post" action="/web/sync">
          <button class="ghostbtn" type="submit">Check Sync</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Guidance</h2><code>qm guidance render</code></div></header>
        <form class="fieldgrid" method="post" action="/web/guidance/render">
          <label>Harness<input name="harness" type="text" placeholder="claude-code"></label>
          <button class="primarybtn" type="submit">Render Guidance</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Status</h2><code>qm status / query</code></div></header>
        <form class="fieldgrid" method="get" action="/web/status">
          <button class="primarybtn" type="submit">Show Status</button>
        </form>
        <form class="fieldgrid" method="get" action="/web/query/deployment">
          <label class="full">Harness<input name="harness" type="text" value="claude-code"></label>
          <button class="ghostbtn" type="submit">Query Deployment</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Proposals</h2><code>qm proposal</code></div></header>
        <form class="fieldgrid" method="get" action="/web/proposals">
          <button class="primarybtn" type="submit">List Proposals</button>
        </form>
        <form class="fieldgrid" method="post" action="/web/proposals/decision">
          <label>Proposal id<input name="id" type="text" placeholder="proposal id"></label>
          <label>Decision<select name="decision"><option>accept</option><option>reject</option></select></label>
          <button class="ghostbtn" type="submit">Apply Decision</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Loadout Admin</h2><code>qm loadout switch/copy/move</code></div></header>
        <form class="fieldgrid" method="post" action="/web/loadouts/copy">
          <label>From harness<input name="from" type="text" placeholder="claude-code"></label>
          <label>To harness<input name="to" type="text" placeholder="codex"></label>
          <label>Mode<select name="mode"><option>copy</option><option>move</option></select></label>
          <button class="primarybtn" type="submit">Copy or Move Assignment</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Pipeline Admin</h2><code>qm pipeline validate/add-to</code></div></header>
        <form class="fieldgrid" method="get" action="/web/pipelines/validate">
          <label class="full">Pipeline id or name<input name="id" type="text" placeholder="research-report"></label>
          <button class="primarybtn" type="submit">Validate Pipeline</button>
        </form>
        <form class="fieldgrid" method="post" action="/web/pipelines/add-to-loadout">
          <label>Pipeline<input name="pipeline" type="text" placeholder="research-report"></label>
          <label>Loadout<input name="loadout" type="text" placeholder="coding"></label>
          <button class="ghostbtn" type="submit">Add Pipeline to Loadout</button>
        </form>
      </article>
      <article class="panel">
        <header><div><h2>Compatibility Query</h2><code>qm query compatibility</code></div></header>
        <form class="fieldgrid" method="get" action="/web/query/compatibility">
          <label class="full">Artifact id<input name="artifact" type="text" placeholder="artifact id"></label>
          <button class="primarybtn" type="submit">Query Compatibility</button>
        </form>
      </article>
    </section>
    <section class="workspace" id="audit">
      <article class="panel"><header><div><h2>Compatibility Matrix</h2><code>qm audit --matrix --json</code></div></header><div id="matrix"></div></article>
      <article class="panel"><header><div><h2>Recommendations</h2><code>qm query summary --json</code></div></header><ul id="recommendations"></ul></article>
    </section>
    <section class="workspace" id="catalog">
      <article class="panel">
        <header><div><h2>Catalog</h2><code>qm query search &lt;text&gt; --json</code></div></header>
        <div class="searchbar"><input id="catalog-filter" aria-label="Filter catalog" placeholder="Filter artifacts by name, type, path, signal"><button id="clear-filter" type="button">Clear</button></div>
        <div class="head"><span>Select</span><span>Name</span><span>Type</span><span>Path</span><span>Signals</span></div><div id="catalog"></div>
      </article>
      <article class="panel" id="loadouts"><header><div><h2>Activation</h2><code>qm loadout list --json</code></div></header><div id="activation"></div></article>
    </section>
    <section class="workspace">
      <article class="panel" id="proposals"><header><div><h2>Proposal Review</h2><code>qm query proposals --json</code></div></header><div id="proposal-list"></div></article>
      <article class="panel" id="pipelines"><header><div><h2>Type Mix</h2><code>qm catalog --json</code></div></header><div id="typemix"></div></article>
    </section>
  </main>
  <script>
    const get = (url) => fetch(url).then((response) => response.json());
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const empty = (message, command) => '<div class="empty"><p class="muted">'+esc(message)+'</p><code>'+esc(command)+'</code></div>';
    const metric = (title, rows) => '<article class="metric"><header><h2>'+esc(title)+'</h2></header><div class="metric-grid">'+rows.map(([label,value]) => '<span><b>'+esc(value)+'</b>'+esc(label)+'</span>').join('')+'</div></article>';
    const chipline = (items) => items.length ? '<span class="chipline">'+items.map((item)=>'<span class="chip">'+esc(item)+'</span>').join('')+'</span>' : '<span class="muted">clear</span>';
    let catalogRows = [];
    let harnessRows = [];
    let selectedIds = [];
    function renderCatalog(rows){
      document.getElementById('catalog').innerHTML = rows.length ? rows.map((a) => {
        const signals = [...(a.required_capabilities || []).map((c)=>c.name),...(a.risk_flags || [])];
        const checked = selectedIds.includes(a.id) ? 'checked' : '';
        return '<div class="artifact-row"><span class="checkbox-cell"><input type="checkbox" data-artifact-select="'+esc(a.id)+'" '+checked+'><span><strong>'+esc(a.name)+'</strong><small>'+esc(a.description || '')+'</small></span></span><span>'+esc(a.type)+'</span><span>'+esc(a.org_path)+'</span><span>'+chipline(signals)+'</span></div>';
      }).join('') : empty('No artifacts match this view.', 'qm scan --root <library>');
      updateSelectionUI();
    }
    function renderTypeMix(summary){
      const entries = Object.entries(summary.catalog.by_type);
      const max = Math.max(1,...entries.map(([,count])=>count));
      document.getElementById('typemix').innerHTML = entries.length ? '<div class="type-mix">'+entries.map(([type,count]) => '<div><span>'+esc(type)+'</span><b>'+esc(count)+'</b></div><div class="bar" aria-hidden="true"><span style="width:'+Math.round((count/max)*100)+'%"></span></div>').join('')+'</div>' : empty('No artifact types are cataloged yet.', 'qm scan --root <library>');
    }
    function updateSelectionUI(){
      const selected = selectedIds.map((id) => catalogRows.find((artifact) => artifact.id === id)).filter(Boolean);
      document.getElementById('selected-count').textContent = String(selected.length);
      document.getElementById('loadout-members').value = selected.map((artifact, index) => String(index + 1)+'. '+artifact.name+' -> '+artifact.org_path).join('\n');
      document.getElementById('selected-artifact-ids').value = selectedIds.join('\n');
      document.getElementById('member-artifact-ids').value = selectedIds.join('\n');
      document.getElementById('pipeline-artifact-ids').value = selectedIds.join('\n');
      document.getElementById('llm-artifact-ids').value = selectedIds.join('\n');
      document.getElementById('loadout-name-submit').value = document.getElementById('loadout-name').value;
      document.getElementById('loadout-desc-submit').value = document.getElementById('loadout-desc').value;
      document.getElementById('existing-loadout-submit').value = document.getElementById('existing-loadout').value;
      document.getElementById('edit-loadout-submit').value = document.getElementById('edit-loadout').value;
      document.getElementById('remove-loadout-submit').value = document.getElementById('remove-loadout').value;
      document.getElementById('assignment-harness-submit').value = document.getElementById('assignment-harness').value;
      document.getElementById('assignment-loadout-submit').value = document.getElementById('assignment-loadout').value;
      document.getElementById('assignment-active-submit').value = document.getElementById('assignment-active').checked ? 'true' : 'false';
      document.getElementById('pipeline-name-submit').value = document.getElementById('pipeline-name').value;
      document.getElementById('pipeline-usecase-submit').value = document.getElementById('pipeline-usecase').value;
      document.getElementById('pipeline-directive-submit').value = document.getElementById('pipeline-directive').value;
      document.getElementById('llm-instruction-submit').value = document.getElementById('llm-instruction').value;
      document.getElementById('llm-model-submit').value = document.getElementById('llm-model').value;
    }
    function populateLoadoutSelect(loadouts){
      document.getElementById('existing-loadout').innerHTML = '<option value="">Select a loadout</option>' + loadouts.map((loadout) => '<option value="'+esc(loadout.id)+'">'+esc(loadout.name)+'</option>').join('');
      document.getElementById('assignment-loadout').innerHTML = '<option value="">Select a loadout</option>' + loadouts.map((loadout) => '<option value="'+esc(loadout.id)+'">'+esc(loadout.name)+'</option>').join('');
      document.getElementById('edit-loadout').innerHTML = '<option value="">Select a loadout</option>' + loadouts.map((loadout) => '<option value="'+esc(loadout.id)+'" data-members="'+esc((loadout.members || []).join('\\n'))+'" data-description="'+esc(loadout.description || '')+'">'+esc(loadout.name)+'</option>').join('');
      document.getElementById('remove-loadout').innerHTML = '<option value="">Select a loadout</option>' + loadouts.map((loadout) => '<option value="'+esc(loadout.id)+'">'+esc(loadout.name)+'</option>').join('');
    }
    function populateHarnessSelect(harnesses){
      document.getElementById('assignment-harness').innerHTML = '<option value="">Select a harness</option>' + harnesses.map((harness) => '<option value="'+esc(harness.id)+'">'+esc(harness.name)+'</option>').join('');
    }
    async function apiJson(url, method, body) {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }
    async function reloadData() {
      const [summary, catalog, loadouts, pipelines, proposals, harnesses] = await Promise.all([get('/api/dashboard'), get('/api/catalog'), get('/api/loadouts'), get('/api/pipelines'), get('/api/proposals'), get('/api/harnesses')]);
      catalogRows = catalog.artifacts;
      harnessRows = harnesses.harnesses;
      document.getElementById('latest').innerHTML = summary.deployments.latest
        ? '<span class="label">Latest deployment</span><strong>'+esc(summary.deployments.latest.harness_id)+'</strong><small>'+esc(summary.deployments.latest.operations)+' operations at '+esc(summary.deployments.latest.applied_at)+'</small>'
        : '<span class="label">Latest deployment</span><strong>None recorded</strong><small>Run qm deploy apply after reviewing a preview.</small>';
      document.getElementById('metrics').innerHTML = [
        metric('Catalog', [['Artifacts',summary.catalog.total],['Sources',summary.catalog.sources],['Risk flags',summary.catalog.risky],['Local edits',summary.catalog.locally_modified]]),
        metric('Harness readiness', [['Deployable',summary.compatibility.deployable],['Transform',summary.compatibility.transform],['Blocked',summary.compatibility.incompatible],['Deployments',summary.deployments.total]]),
        metric('Review queue', [['Pending',summary.proposals.pending],['Accepted',summary.proposals.accepted],['Rejected',summary.proposals.rejected],['Loadouts',summary.loadouts.total]])
      ].join('');
      const matrixRows = Object.entries(summary.compatibility.by_harness);
      document.getElementById('matrix').innerHTML = matrixRows.length ? matrixRows.map(([h,c]) => '<div class="matrix-row"><span>'+esc(h)+'</span><b class="ok"><span class="dot ok"></span>'+esc(c.deployable)+'</b><b class="warn"><span class="dot warn"></span>'+esc(c.transform)+'</b><b class="bad"><span class="dot bad"></span>'+esc(c.incompatible)+'</b></div>').join('') : empty('No compatibility verdicts are stored yet.', 'qm audit --matrix --json');
      document.getElementById('recommendations').innerHTML = summary.recommendations.length ? summary.recommendations.map((item) => '<li>'+esc(item)+'</li>').join('') : '<li class="muted">No recommendations need attention.</li>';
      renderCatalog(catalogRows);
      document.getElementById('activation').innerHTML = '<h3>Loadouts</h3>'+(loadouts.loadouts.length ? '<ul>'+loadouts.loadouts.map((l)=>'<li class="simple-row"><span>'+esc(l.name)+'</span><small>'+esc(l.members.length)+' members</small></li>').join('')+'</ul>' : empty('No loadouts defined.', 'qm loadout create <name>'))+'<h3 style="margin-top:20px">Pipelines</h3>'+(pipelines.pipelines.length ? '<ul>'+pipelines.pipelines.map((p)=>'<li class="simple-row"><span>'+esc(p.name)+'</span><small>'+esc(p.members.length)+' members</small></li>').join('')+'</ul>' : empty('No pipelines defined.', 'qm eval pipeline --json'));
      document.getElementById('activation').innerHTML += '<h3 style="margin-top:20px">Harness assignments</h3>'+(harnessRows.length ? '<ul>'+harnessRows.map((h)=>'<li class="simple-row"><span>'+esc(h.name)+' <small>'+esc(h.id)+'</small></span><small>'+(h.active_loadout ? esc(h.active_loadout) + ' • ' + esc(String(h.active_artifacts)) + ' active' : 'inactive')+'</small></li>').join('')+'</ul>' : empty('No harnesses available.', 'qm query deployment --harness <id> --json'));
      document.getElementById('proposal-list').innerHTML = proposals.proposals.length ? '<ul>'+proposals.proposals.map((p)=>'<li><span class="'+(p.accepted === null ? 'warn' : p.accepted ? 'ok' : 'bad')+'"><span class="dot '+(p.accepted === null ? 'warn' : p.accepted ? 'ok' : 'bad')+'"></span>'+esc(p.kind)+' '+esc(p.accepted === null ? 'pending' : p.accepted ? 'accepted' : 'rejected')+'</span><small>'+esc(p.rationale)+'</small>'+(p.accepted === null ? '<div class="buttonrow"><button class="ghostbtn" type="button" data-proposal-accept="'+esc(p.id)+'">Accept</button><button class="ghostbtn" type="button" data-proposal-reject="'+esc(p.id)+'">Reject</button></div>' : '')+'</li>').join('')+'</ul>' : empty('No agentic proposals are waiting for review.', 'qm eval loadout --json');
      renderTypeMix(summary);
      populateLoadoutSelect(loadouts.loadouts);
      populateHarnessSelect(harnessRows);
      updateSelectionUI();
    }
    Promise.resolve().then(reloadData);
    document.getElementById('refresh-data').addEventListener('click', reloadData);
    document.getElementById('clear-selection').addEventListener('click', () => {
      selectedIds = [];
      document.querySelectorAll('[data-artifact-select]').forEach((checkbox) => { checkbox.checked = false; });
      updateSelectionUI();
    });
    document.addEventListener('submit', () => updateSelectionUI());
    document.querySelectorAll('[data-jump]').forEach((el) => {
      el.addEventListener('click', () => {
        document.getElementById(String(el.getAttribute('data-jump')))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    document.addEventListener('input', (event) => {
      if (event.target && event.target.id === 'catalog-filter') {
        const value = event.target.value.toLowerCase();
        renderCatalog(catalogRows.filter((a) => [a.name,a.description,a.type,a.org_path,...(a.risk_flags||[]),...(a.required_capabilities||[]).map((c)=>c.name)].join(' ').toLowerCase().includes(value)));
      }
      if (event.target && event.target.matches('[data-artifact-select]')) {
        const id = event.target.getAttribute('data-artifact-select');
        if (event.target.checked && !selectedIds.includes(id)) selectedIds.push(id);
        if (!event.target.checked) selectedIds = selectedIds.filter((selectedId) => selectedId !== id);
        updateSelectionUI();
      }
      if (event.target && ['loadout-name','loadout-desc','existing-loadout','edit-loadout','edit-loadout-desc','edit-loadout-members','remove-loadout','remove-member-id','assignment-harness','assignment-loadout','assignment-active','pipeline-name','pipeline-usecase','pipeline-directive','llm-instruction','llm-model','selected-artifact-ids'].includes(event.target.id)) {
        if (event.target.id === 'selected-artifact-ids') selectedIds = event.target.value.split(/[\\n, ]+/).map((id) => id.trim()).filter(Boolean);
        updateSelectionUI();
      }
    });
    document.addEventListener('change', (event) => {
      if (event.target && event.target.id === 'edit-loadout') {
        const option = event.target.options[event.target.selectedIndex];
        document.getElementById('edit-loadout-members').value = option?.getAttribute('data-members') || '';
        document.getElementById('edit-loadout-desc').value = option?.getAttribute('data-description') || '';
      }
      if (event.target && ['existing-loadout','edit-loadout','remove-loadout','assignment-harness','assignment-loadout','assignment-active'].includes(event.target.id)) updateSelectionUI();
    });
    document.addEventListener('click', (event) => {
      if (event.target && event.target.id === 'clear-filter') {
        document.getElementById('catalog-filter').value = '';
        renderCatalog(catalogRows);
      }
      if (event.target && event.target.matches('[data-proposal-accept]')) {
        apiJson('/api/proposals/' + encodeURIComponent(event.target.getAttribute('data-proposal-accept')) + '/accept', 'POST').then(reloadData);
      }
      if (event.target && event.target.matches('[data-proposal-reject]')) {
        apiJson('/api/proposals/' + encodeURIComponent(event.target.getAttribute('data-proposal-reject')) + '/reject', 'POST').then(reloadData);
      }
    });
  </script>
</body>
</html>`;
}
