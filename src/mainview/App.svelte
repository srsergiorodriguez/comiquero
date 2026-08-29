<script>
  import { appState, setMode, openFolder } from './store.svelte.js';
  import PagesPreview from './components/PagesPreview.svelte';
  import ThumbnailsSidebar from './components/ThumbnailsSidebar.svelte';
  import ColorSeparator from './components/ColorSeparator.svelte';
  import SpotMapper from './components/SpotMapper.svelte';
  import ExportPanel from './components/ExportPanel.svelte';
  import PreflightPanel from './components/PreflightPanel.svelte'; 
</script>

<main class="app-container">
  
  <header class="top-bar panel">
    <div class="top-section left">
      <img src="./assets/icon.png" alt="comiquero logo" class="app-icon" />
      <h2>comiquero</h2>
    </div>
    
    <div class="top-section center">
      <button 
        onclick={openFolder} 
        class:processing={appState.isProcessing && appState.loadingProgress.total === 0}
      >
        {#if appState.isProcessing}
          {#if appState.loadingProgress.total > 0} Loading {appState.loadingProgress.current}/{appState.loadingProgress.total}
          {:else} Opening... {/if}
        {:else} Open Folder {/if}
      </button>
    </div>
    
    <div class="top-section right">
      <select bind:value={appState.currentMode} onchange={(e) => setMode(e.target.value)}>
        <option value="preflight">Preflight Utilities</option>
        <option value="edit">Edit Colors</option>
        <option value="export">Export Settings</option>
      </select>
    </div>
  </header>

  <div class="workspace">
    {#if appState.files.length > 0}
      <ThumbnailsSidebar />
    {/if}

    <section class="preview-area flex-col">
      <PagesPreview />
    </section>

    <aside class="sidebar panel flex-col">
      {#if appState.currentMode === 'preflight'}
        <PreflightPanel />
      {:else if appState.currentMode === 'edit'}
        {#if appState.isPsdMode}
          <SpotMapper />
        {:else}
          <ColorSeparator />
        {/if}
      {:else if appState.currentMode === 'export'}
        <ExportPanel />
      {/if}
    </aside>
  </div>

  {#if appState.isProcessing}
    <div class="global-overlay">
      <div class="spinner"></div>
      <h3>Processing</h3>
      {#if appState.loadingProgress.total > 0}
        <p>Loading folder: {appState.loadingProgress.current} / {appState.loadingProgress.total} files</p>
      {:else if appState.isPsdMode}
        <p>Unpacking heavy PSD layers...</p>
      {:else}
        <p>Please wait...</p>
      {/if}
    </div>
  {/if}
  
</main>

<style>
  .app-container { display: flex; flex-direction: column; height: 100vh; padding: var(--spacing-md); gap: var(--spacing-md); }
  .top-bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: var(--spacing-sm) var(--spacing-md); }
  
  /* NEW: Flexbox alignment for the logo and title */
  .top-section.left { justify-self: start; display: flex; align-items: center; gap: 12px; }
  .app-icon { width: 30px; height: auto; display: block; mix-blend-mode: multiply; }
  
  .top-section.center { justify-self: center; }
  .top-section.right { justify-self: end; width: 200px; }
  .top-section h2 { margin: 0; }
  .processing { opacity: 0.7; pointer-events: none; }
  .workspace { display: flex; flex: 1; gap: var(--spacing-md); overflow: hidden; }
  .preview-area { flex: 1; }
  .sidebar { width: 380px; overflow-y: auto; padding: var(--spacing-md); }
</style>