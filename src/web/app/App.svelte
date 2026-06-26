<script lang="ts">
  export let artifacts: { id: string; type: string; name: string; org_path: string }[] = [];
</script>

<main>
  <h1>Quartermaster</h1>
  <table>
    <thead>
      <tr><th>Name</th><th>Type</th><th>Path</th></tr>
    </thead>
    <tbody>
      {#each artifacts as artifact}
        <tr><td>{artifact.name}</td><td>{artifact.type}</td><td>{artifact.org_path}</td></tr>
      {/each}
    </tbody>
  </table>
</main>
