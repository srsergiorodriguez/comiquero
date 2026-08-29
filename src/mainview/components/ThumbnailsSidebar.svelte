<!-- src/mainview/components/ThumbnailsSidebar.svelte -->
<script>
  import { appState, setActivePage } from '../store.svelte.js';
</script>

<aside class="thumbnails-sidebar panel flex-col">
  {#each appState.files as file, i}
    <button 
      class="thumbnail-btn flex-col {appState.activePageIndex === i ? 'active-thumb' : ''}"
      onclick={() => setActivePage(i)}
      title={file.name}
    >
      <div class="thumb-image-container">
        {#if appState.thumbnails[i]}
          <img src={appState.thumbnails[i]} alt="Page {i + 1}" />
        {:else}
          <div class="thumb-placeholder">...</div>
        {/if}
      </div>
      <span class="thumb-label">{file.name}</span>
    </button>
  {/each}
</aside>

<style>
  .thumbnails-sidebar {
    width: 180px;
    overflow-y: auto;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
  }

  .thumbnail-btn {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    align-items: center;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s ease;
  }

  .thumbnail-btn:hover {
    opacity: 0.9;
    background: transparent;
    color: var(--fg-color);
  }

  .active-thumb {
    opacity: 1;
  }

  .thumb-image-container {
    width: 100%;
    /* Removed the fixed aspect-ratio. It now wraps the image tightly. */
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--border-radius);
    overflow: hidden;
    background-color: var(--bg-color);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px; /* Provides body while the background task runs */
  }

  .active-thumb .thumb-image-container {
    border-width: 4px; 
  }

  .thumb-image-container img {
    width: 100%;
    height: auto;
    display: block;
  }

  .thumb-placeholder {
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
    color: #999;
  }

  .thumb-label {
    font-size: var(--fs-sm);
    text-align: center;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: var(--spacing-sm);
  }
</style>