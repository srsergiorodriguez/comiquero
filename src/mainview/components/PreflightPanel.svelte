<script>
  import { appState, applyPreflight } from '../store.svelte.js';

  // Reactively calculate final pixel targets whenever physical dimensions or DPI change
  $effect(() => {
    const opts = appState.preflightOptions;
    let multiplier = 1;
    
    if (opts.unit === 'in') multiplier = opts.dpi;
    else if (opts.unit === 'mm') multiplier = opts.dpi / 25.4;
    else if (opts.unit === 'cm') multiplier = opts.dpi / 2.54;
    
    opts.targetWidth = Math.round(opts.physicalWidth * multiplier);
    opts.targetHeight = Math.round(opts.physicalHeight * multiplier);
  });

  // Intercept the unit switch to dynamically convert the input box values
  function handleUnitChange(e) {
    const newUnit = e.target.value;
    const opts = appState.preflightOptions;
    
    // Grab the absolute pixels BEFORE switching units
    const currentPixelsW = opts.targetWidth;
    const currentPixelsH = opts.targetHeight;
    
    let divisor = 1;
    if (newUnit === 'in') divisor = opts.dpi;
    else if (newUnit === 'mm') divisor = opts.dpi / 25.4;
    else if (newUnit === 'cm') divisor = opts.dpi / 2.54;
    
    opts.unit = newUnit;
    
    // Update the physical inputs to match the exact same pixel dimensions
    opts.physicalWidth = Number((currentPixelsW / divisor).toFixed(2));
    opts.physicalHeight = Number((currentPixelsH / divisor).toFixed(2));
  }

  async function handleApply() {
    if (!appState.files || appState.files.length === 0) return;
    appState.isProcessing = true;
    
    // Slight timeout allows the UI to render the "Processing" overlay before blocking the thread
    setTimeout(async () => {
      await applyPreflight();
      appState.isProcessing = false;
    }, 50);
  }
</script>

<div class="preflight-panel flex-col">
  
  <div class="sidebar-section">
    <div class="toggle-header">
      <h3>Batch Resizing</h3>
      <label class="toggle-label">
        <input type="checkbox" bind:checked={appState.preflightOptions.enabled}>
        Enable
      </label>
    </div>
    
    <p class="desc">Normalize all pages in the folder before color separation to maintain consistent halftone frequencies.</p>

    <div class="controls-wrapper" style={!appState.preflightOptions.enabled ? 'opacity: 0.5; pointer-events: none;' : ''}>
      <div class="input-grid" style="margin-top: 12px;">
        <label>
          <span class="label-text">Unit</span>
          <!-- THE FIX: Replaced two-way bind with a one-way value and interceptor function -->
          <select value={appState.preflightOptions.unit} onchange={handleUnitChange} class="full-width-select">
            <option value="px">Pixels</option>
            <option value="in">Inches</option>
            <option value="mm">Millimeters</option>
            <option value="cm">Centimeters</option>
          </select>
        </label>
        <label>
          <span class="label-text">Resolution (DPI)</span>
          <input 
            type="number" 
            bind:value={appState.preflightOptions.dpi} 
            class="number-input" 
            disabled={appState.preflightOptions.unit === 'px'} 
            style={appState.preflightOptions.unit === 'px' ? 'opacity: 0.5;' : ''}
          />
        </label>
      </div>

      <div class="input-grid" style="margin-top: 8px;">
        <label>
          <span class="label-text">Target Width</span>
          <input type="number" step="any" bind:value={appState.preflightOptions.physicalWidth} class="number-input" />
        </label>
        <label>
          <span class="label-text">Target Height</span>
          <input type="number" step="any" bind:value={appState.preflightOptions.physicalHeight} class="number-input" />
        </label>
      </div>

      {#if appState.preflightOptions.unit !== 'px'}
        <p class="pixel-readout">
          Final dimensions: <strong>{appState.preflightOptions.targetWidth}px</strong> × <strong>{appState.preflightOptions.targetHeight}px</strong>
        </p>
      {/if}

      <label style="display: block; margin-top: 12px;">
        <span class="label-text">Scaling Method</span>
        <select bind:value={appState.preflightOptions.scaleMode} class="full-width-select">
          <option value="fit">Fit (Preserve Aspect Ratio, Pad with White)</option>
          <option value="fill">Fill (Preserve Aspect Ratio, Crop Excess)</option>
          <option value="stretch">Stretch (Ignore Aspect Ratio)</option>
        </select>
      </label>

      <button class="action-btn" style="margin-top: 16px;" onclick={handleApply}>Apply to Folder</button>
    </div>
  </div>

  <div class="sidebar-section">
    <h3>Tonal Adjustments</h3>
    <p class="desc">Global levels and threshold utilities will go here.</p>
    <button class="action-btn disabled">Coming Soon</button>
  </div>

</div>

<style>
  .preflight-panel { gap: var(--spacing-md); }
  .sidebar-section { display: flex; flex-direction: column; gap: 8px; padding-bottom: var(--spacing-md); border-bottom: var(--border-width) solid var(--border-color); }
  .sidebar-section:last-child { border-bottom: none; }
  
  .toggle-header { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 0; font-size: var(--fs-md); text-transform: uppercase; letter-spacing: 0.05em; }
  .toggle-label { font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; }
  
  .desc { font-size: 11px; color: #666; margin: 0; }
  .pixel-readout { font-size: 10px; color: #666; text-align: right; margin-top: 4px; margin-bottom: 0; }
  
  .input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .label-text { font-size: 10px; text-transform: uppercase; font-weight: bold; color: #666; margin-bottom: 4px; display: block; }
  .number-input, .full-width-select { width: 100%; padding: 6px; font-family: var(--font-mono); font-size: var(--fs-sm); border: var(--border-width) solid var(--border-color); background: var(--bg-color); }
  
  .action-btn { background: var(--fg-color); color: var(--bg-color); border: none; padding: 8px; font-weight: bold; cursor: pointer; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; width: 100%; }
  .action-btn.disabled { background: transparent; color: #999; border: 1px dashed #999; cursor: not-allowed; }
</style>