<script>
  import { onMount } from 'svelte';
  import { select } from 'd3-selection';
  import { zoom, zoomIdentity } from 'd3-zoom';
  import { appState } from '../store.svelte.js';

  let canvasElement;
  let ctx;
  let zoomBehavior;

  let transform = $state({ x: 0, y: 0, k: 1 });
  let width = 800; 
  let height = 600;

  // Track the trigger locally to prevent false firings
  let lastFitTrigger = 0;

  $effect(() => {
    if (appState.activeChannels) appState.activeChannels.map(c => c.isVisible);
    
    // Only execute Auto-Fit if the file load trigger has actually incremented
    if (appState.fitTrigger > lastFitTrigger) {
      lastFitTrigger = appState.fitTrigger;
      
      if (appState.docWidth > 0) {
        fitToScreen(0); 
      }
    }
    
    const rt = appState.renderTrigger; // Subscribe to render updates
    requestAnimationFrame(renderCanvas);
  });

  onMount(() => {
    ctx = canvasElement.getContext('2d');
    zoomBehavior = zoom().scaleExtent([0.05, 10]).on("zoom", (e) => {
      transform = e.transform;
      requestAnimationFrame(renderCanvas);
    });

    select(canvasElement).call(zoomBehavior);

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        width = entry.contentRect.width; 
        height = entry.contentRect.height;
        canvasElement.width = width; 
        canvasElement.height = height;
        
        if (transform.k === 1 && transform.x === 0 && transform.y === 0) fitToScreen(0); 
        else renderCanvas();
      }
    });
    
    resizeObserver.observe(canvasElement.parentElement);
    return () => resizeObserver.disconnect();
  });

  function renderCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    
    // Draw white paper base
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, appState.docWidth, appState.docHeight); 
    
    if (appState.activeChannels && appState.activeChannels.length > 0) {
      
      for (let i = 0; i < appState.activeChannels.length; i++) {
        const ch = appState.activeChannels[i];
        if (ch.isVisible && ch.tintedBitmap) {
          ctx.globalCompositeOperation = appState.forceMultiplyAll ? 'multiply' : ch.blendMode;
          ctx.drawImage(ch.tintedBitmap, 0, 0);
        }
      }
      // Reset after drawing inks
      ctx.globalCompositeOperation = 'source-over';
      
    } else if (appState.activeBitmap) {
      ctx.drawImage(appState.activeBitmap, 0, 0);
    }
    
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2 / transform.k; 
    ctx.strokeRect(0, 0, appState.docWidth, appState.docHeight);
    ctx.restore();
  }
  
  function fitToScreen(duration = 250) {
    if (!canvasElement || appState.docWidth === 0) return;
    const scale = Math.min((width - 80) / appState.docWidth, (height - 80) / appState.docHeight);
    const tx = (width - appState.docWidth * scale) / 2;
    const ty = (height - appState.docHeight * scale) / 2;
    select(canvasElement).transition().duration(duration).call(zoomBehavior.transform, zoomIdentity.translate(tx, ty).scale(scale));
  }
  
  function zoomTo100() { select(canvasElement).transition().duration(250).call(zoomBehavior.transform, zoomIdentity.translate((width - appState.docWidth) / 2, (height - appState.docHeight) / 2).scale(1)); }
  function zoomIn() { select(canvasElement).transition().duration(250).call(zoomBehavior.scaleBy, 1.3); }
  function zoomOut() { select(canvasElement).transition().duration(250).call(zoomBehavior.scaleBy, 0.7); }
</script>

<div class="preview-container flex-col">
  <div class="canvas-toolbar panel flex-row">
    {#if appState.isSeparating}
      <span class="loading-status">Processing Inks...</span>
    {:else if appState.isTinting}
      <span class="loading-status">Applying Tints...</span>
    {/if}
    {#if appState.errorMessage}
      <span class="error-status">{appState.errorMessage}</span>
    {/if}
    <span class="zoom-readout">{Math.round(transform.k * 100)}%</span>
    <div class="toolbar-divider"></div>
    <button title="Zoom Out" onclick={zoomOut}>－</button>
    <button title="Zoom In" onclick={zoomIn}>＋</button>
    <button title="Actual Size (100%)" onclick={zoomTo100}>1:1</button>
    <button title="Fit to Screen" onclick={() => fitToScreen()}>⛶</button>
  </div>
  <div class="canvas-wrapper"><canvas bind:this={canvasElement}></canvas></div>
</div>

<style>
  /* Leave styles exactly as they were */
  .preview-container { width: 100%; height: 100%; gap: 0; border: var(--border-width) solid var(--border-color); border-radius: var(--border-radius); overflow: hidden; }
  .canvas-toolbar { border: none; border-bottom: var(--border-width) solid var(--fg-color); border-radius: 0; padding: var(--spacing-sm) var(--spacing-md); background-color: var(--bg-color); justify-content: flex-end; gap: var(--spacing-sm); }
  .loading-status { margin-right: auto; font-weight: var(--fw-bold); font-size: var(--fs-sm); color: #666; }
  .error-status { margin-right: auto; font-weight: var(--fw-bold); font-size: var(--fs-sm); color: #d00; }
  .zoom-readout { font-weight: var(--fw-bold); font-size: var(--fs-sm); min-width: 48px; text-align: right; }
  .toolbar-divider { width: var(--border-width); height: 16px; background-color: var(--fg-color); margin: 0 var(--spacing-sm); }
  .canvas-toolbar button { padding: var(--spacing-sm); min-width: 32px; display: flex; align-items: center; justify-content: center; font-size: var(--fs-md); cursor: pointer;}
  .canvas-wrapper { flex: 1; width: 100%; position: relative; overflow: hidden; background-color: #f0f0f0; }
  canvas { display: block; cursor: grab; width: 100%; height: 100%; }
  canvas:active { cursor: grabbing; }
</style>