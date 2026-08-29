<script>
  import { appState, separateColors, mapTones, applyTints, defaultPalettes } from '../store.svelte.js';

  let histogramCanvas = $state();

  // --- REACTIVE HISTOGRAM ENGINE ---
  $effect(() => {
    // Svelte 5 automatically tracks these variables. 
    // If the algorithm, image data, or colors change, the histogram instantly redraws.
    if (appState.selectedAlgorithm === 'luminance_split' && appState.rawImageData && histogramCanvas) {
      // Accessing customColors deep properties to ensure the effect tracks slider changes
      const trigger = appState.customColors.map(c => `${c.toneMin}-${c.toneMax}-${c.color}`).join();
      drawHistogram();
    }
  });

  function drawHistogram() {
    if (!histogramCanvas || !appState.rawImageData) return;
    
    const ctx = histogramCanvas.getContext('2d');
    const width = histogramCanvas.width = histogramCanvas.offsetWidth;
    const height = histogramCanvas.height = 64; // Fixed height in pixels

    ctx.clearRect(0, 0, width, height);

    const data = appState.rawImageData.data;
    const bins = new Array(100).fill(0);
    let maxBin = 0;

    // 1. Calculate the luminance of the image
    // We sample every 16th pixel (step = 4 * 4) to keep the UI lightning fast
    const step = 16; 
    for (let i = 0; i < data.length; i += step) {
      if (data[i + 3] === 0) continue; // Skip transparent pixels
      
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const percent = Math.min(99, Math.floor((lum / 255) * 100));
      
      bins[percent]++;
      if (bins[percent] > maxBin) maxBin = bins[percent];
    }

    // 2. Draw the base grayscale histogram
    ctx.fillStyle = '#cbd5e1'; // Matches your subtle gray global borders
    for (let i = 0; i < 100; i++) {
      if (bins[i] === 0) continue;
      const h = (bins[i] / maxBin) * (height - 4); // Leave a small top margin
      const x = (i / 100) * width;
      const w = Math.ceil(width / 100);
      ctx.fillRect(x, height - h, w, h);
    }

    // 3. Draw the ink range overlays
    appState.customColors.forEach(ink => {
      const minX = (ink.toneMin / 100) * width;
      const maxX = (ink.toneMax / 100) * width;
      const boxWidth = Math.max(1, maxX - minX);

      ctx.fillStyle = ink.color;
      ctx.globalAlpha = 0.35; // Semi-transparent to see overlaps and the curve below
      ctx.fillRect(minX, 0, boxWidth, height);
      
      // Draw solid boundary lines
      ctx.globalAlpha = 0.8;
      ctx.fillRect(minX, 0, 1, height);
      ctx.fillRect(maxX - 1, 0, 1, height);
    });

    ctx.globalAlpha = 1.0;
  }

  // --- STANDARD SEPARATOR LOGIC ---
  function applyPreset() {
    if (appState.activePalette !== 'custom') {
      appState.customColors = JSON.parse(JSON.stringify(defaultPalettes[appState.activePalette]));
    }
  }

  function addColor() {
    appState.customColors.push({
      id: `spot_${Date.now()}`,
      name: `Ink ${appState.customColors.length + 1}`,
      color: '#000000',
      angle: 45,
      toneMin: 0,
      toneMax: 100
    });
    appState.activePalette = 'custom';
  }

  function removeColor(index) {
    appState.customColors.splice(index, 1);
    appState.activePalette = 'custom';
  }

  function toggleMute(id) {
    const ch = appState.activeChannels.find(c => c.id === id);
    if (ch) ch.isVisible = !ch.isVisible;
  }

  function toggleSolo(id) {
    const ch = appState.activeChannels.find(c => c.id === id);
    if (!ch) return;
    ch.isSoloed = !ch.isSoloed;
    const anySoloed = appState.activeChannels.some(c => c.isSoloed);
    appState.activeChannels.forEach(c => {
      c.isVisible = anySoloed ? c.isSoloed : true;
    });
  }

  function moveChannel(index, direction) {
    if (direction === -1 && index > 0) {
      const temp = appState.activeChannels[index];
      appState.activeChannels[index] = appState.activeChannels[index - 1];
      appState.activeChannels[index - 1] = temp;
      appState.renderTrigger++;
    } else if (direction === 1 && index < appState.activeChannels.length - 1) {
      const temp = appState.activeChannels[index];
      appState.activeChannels[index] = appState.activeChannels[index + 1];
      appState.activeChannels[index + 1] = temp;
      appState.renderTrigger++;
    }
  }
</script>

<div class="color-separator flex-col">
  <div class="sidebar-section">
    <h3>Palette Editor</h3>
    <select class="full-width-select" bind:value={appState.activePalette} onchange={applyPreset}>
      <option value="digital_cmyk">Digital CMYK</option>
      <option value="print_cmyk">Standard CMYK</option>
      <option value="riso">Riso Basic (Red/Blue/Black)</option>
      <option value="custom">Custom Palette...</option>
    </select>

    <div class="color-list flex-col">
      <div class="color-header">
        <span class="flex-grow">Color</span>
        {#if appState.selectedAlgorithm === 'halftone' || appState.selectedAlgorithm === 'linescreen'}
          <span class="angle-header">Angle</span>
        {:else if appState.selectedAlgorithm === 'luminance_split'}
          <span class="range-header">Min-Max %</span>
        {/if}
      </div>
      
      {#each appState.customColors as ink, i}
        <div class="color-row">
          <input type="color" bind:value={ink.color} onchange={() => appState.activePalette = 'custom'} />
          <input type="text" class="color-name-input" bind:value={ink.name} oninput={() => appState.activePalette = 'custom'} />
          
          {#if appState.selectedAlgorithm === 'halftone' || appState.selectedAlgorithm === 'linescreen'}
            <input type="number" class="angle-input" bind:value={ink.angle} min="0" max="360" oninput={() => appState.activePalette = 'custom'} title="Rotation Angle" />
            <span class="unit-label">°</span>
          {:else if appState.selectedAlgorithm === 'luminance_split'}
            <input type="number" class="range-input" bind:value={ink.toneMin} min="0" max="100" oninput={() => appState.activePalette = 'custom'} title="Darkest Point" />
            <span class="unit-label">-</span>
            <input type="number" class="range-input" bind:value={ink.toneMax} min="0" max="100" oninput={() => appState.activePalette = 'custom'} title="Lightest Point" />
          {/if}
          
          <button class="delete-btn" onclick={() => removeColor(i)} title="Remove Ink">✕</button>
        </div>
      {/each}
    </div>
    <button class="add-color-btn" onclick={addColor}>+ Add Ink</button>
  </div>

  <div class="sidebar-section">
    <h3>Separation Engine</h3>
    <select class="full-width-select" bind:value={appState.selectedAlgorithm}>
      <option value="smooth">Smooth (Alpha Transparency)</option>
      <option value="halftone">True Semitone (Sine Wave)</option>
      <option value="linescreen">Line Screen (1D Engraving)</option>
      <option value="bayer4x4">Halftone (4x4 Ordered Dither)</option>
      <option value="bayer8x8">Halftone (8x8 Ordered Dither)</option>
      <option value="noise">Stochastic Noise (Random)</option>
      <option value="crosshatch">Crosshatch (2D Pen Shading)</option>
      <option value="threshold">Hard Threshold (1-Bit Solid)</option>
      <option value="luminance_split">Luminance Split (Tone Mapping)</option>
    </select>
    
    {#if ['halftone', 'linescreen', 'crosshatch'].includes(appState.selectedAlgorithm)}
      <div class="info-box">
        <div class="info-row">
          <label class="info-label">
            <span class="label-text">Canvas DPI</span>
            <input type="number" class="full-width-input" bind:value={appState.halftoneDPI} min="72" max="1200" step="1" />
          </label>
          <label class="info-label">
            <span class="label-text">Print LPI</span>
            <input type="number" class="full-width-input" bind:value={appState.halftoneLPI} min="10" max="300" step="1" />
          </label>
        </div>
        <p class="help-text">
          <strong>Golden Rule:</strong> DPI must match your original file. LPI controls dot size (Riso = ~60, Offset = ~150). 
        </p>
      </div>
    {:else if appState.selectedAlgorithm === 'luminance_split'}
      <!-- NEW: The Histogram Display Box -->
      <div class="info-box flex-col">
        <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; color: #666; margin-bottom: 2px;">
          <span>0% (Shadows)</span>
          <span>100% (Highlights)</span>
        </div>
        
        <canvas bind:this={histogramCanvas} class="histogram-canvas"></canvas>
        
        <p class="help-text" style="text-align: center; margin-top: 4px;">
          Map grayscale brightness directly to your spot inks.
        </p>
      </div>
    {/if}
    
    <div class="action-group">
      <button 
        class="process-btn" 
        onclick={appState.selectedAlgorithm === 'luminance_split' ? mapTones : separateColors}
        disabled={appState.isSeparating || !appState.rawImageData}
      >
        {appState.isSeparating ? 'Processing...' : 'Run Separation'}
      </button>
    </div>
  </div>

  {#if appState.activeChannels.length > 0}
    <div class="sidebar-section">
      <div class="toggle-container">
        <label class="toggle-label">
          <input type="checkbox" bind:checked={appState.forceMultiplyAll} onchange={() => appState.renderTrigger++}>
          Print Preview (Force Multiply)
        </label>
      </div>

      <table class="daw-table">
        <thead>
          <tr>
            <th width="110">Order & View</th>
            <th>Channel Controls</th>
          </tr>
        </thead>
        <tbody>
          {#each appState.activeChannels as ch, i}
            <tr>
              <td>
                <div class="daw-controls">
                  <button class="daw-btn" onclick={() => moveChannel(i, -1)} disabled={i === 0} title="Move Layer Down">↑</button>
                  <button class="daw-btn" onclick={() => moveChannel(i, 1)} disabled={i === appState.activeChannels.length - 1} title="Move Layer Up">↓</button>
                  <button class="daw-btn {ch.isVisible ? '' : 'active'}" onclick={() => toggleMute(ch.id)} title="Mute">M</button>
                  <button class="daw-btn {ch.isSoloed ? 'active' : ''}" onclick={() => toggleSolo(ch.id)} title="Solo">S</button>
                </div>
              </td>
              <td>
                <div class="channel-info">
                  <input type="color" bind:value={ch.colorHex} onchange={applyTints} class="tint-picker" title="Change Display Tint" />
                  <strong class="channel-name" title={ch.name}>{ch.name}</strong>
                  {#if !appState.forceMultiplyAll}
                    <select bind:value={ch.blendMode} onchange={() => appState.renderTrigger++} class="blend-mode-select">
                      <option value="multiply">Multiply</option>
                      <option value="screen">Screen</option>
                      <option value="overlay">Overlay</option>
                      <option value="color-dodge">Dodge</option>
                      <option value="difference">Difference</option>
                      <option value="exclusion">Exclusion</option>
                      <option value="source-over">Normal</option>
                    </select>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  /* Layout & Sections */
  .color-separator { gap: var(--spacing-md); }
  .sidebar-section { display: flex; flex-direction: column; gap: 8px; padding-bottom: var(--spacing-md); border-bottom: var(--border-width) solid var(--border-color); }
  .sidebar-section:last-child { border-bottom: none; }
  .sidebar-section h3 { margin: 0; font-size: var(--fs-md); }
  
  /* Inputs & Buttons */
  .full-width-select { width: 100%; padding: 6px; font-family: var(--font-mono); font-size: var(--fs-sm); border: var(--border-width) solid var(--border-color); }
  .process-btn { padding: 12px; font-weight: bold; background: var(--fg-color); color: var(--bg-color); cursor: pointer; border: none; border-radius: var(--border-radius); transition: opacity 0.2s; }
  .process-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .action-group { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }

  /* Palette List */
  .color-list { gap: 8px; margin-top: 8px; }
  .color-header { display: flex; font-size: 10px; text-transform: uppercase; font-weight: bold; padding-right: 24px; color: #666; }
  .flex-grow { flex: 1; }
  .angle-header { width: 50px; text-align: right; }
  .range-header { width: 90px; text-align: center; }
  .color-row { display: flex; gap: 6px; align-items: center; }
  .color-row input[type="color"] { cursor: pointer; width: 32px; height: 32px; padding: 0; border: var(--border-width) solid var(--border-color); }
  .color-name-input { flex: 1; padding: 6px; font-family: var(--font-mono); font-size: var(--fs-sm); border: var(--border-width) solid var(--border-color); min-width: 0; }
  .angle-input { width: 44px; padding: 6px 4px; font-family: var(--font-mono); font-size: var(--fs-sm); border: var(--border-width) solid var(--border-color); text-align: right; }
  .range-input { width: 40px; padding: 6px 2px; font-family: var(--font-mono); font-size: var(--fs-sm); border: var(--border-width) solid var(--border-color); text-align: center; }
  .unit-label { font-size: 10px; }
  .delete-btn { background: transparent; border: none; color: #d00; cursor: pointer; font-weight: bold; width: 24px; }
  .add-color-btn { background: transparent; border: 1px dashed var(--fg-color); padding: 6px; font-weight: bold; cursor: pointer; margin-top: 4px; font-family: var(--font-mono); font-size: var(--fs-sm); }

  /* Info Box (Engine Settings) */
  .info-box { background: var(--bg-color); padding: 8px; border: var(--border-width) solid var(--border-color); border-radius: var(--border-radius); }
  .info-row { display: flex; gap: 8px; margin-bottom: 8px; }
  .info-label { flex: 1; }
  .label-text { font-size: 11px; font-weight: bold; }
  .full-width-input { width: 100%; margin-top: 4px; }
  .help-text { font-size: 10px; line-height: 1.4; color: #555; margin: 0; }

  /* NEW: Histogram Canvas */
  .histogram-canvas { width: 100%; height: 64px; background-color: #f1f5f9; border: 1px solid var(--border-color); border-radius: 2px; display: block; }

  /* Toggles & DAW Table */
  .toggle-container { display: flex; justify-content: flex-end; align-items: center; margin-bottom: 8px; }
  .toggle-label { font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; }
  .daw-table { width: 100%; border-collapse: collapse; text-align: left; font-size: var(--fs-sm); margin-top: 8px; table-layout: fixed; }
  .daw-table th { background-color: var(--fg-color); color: var(--bg-color); padding: 4px; }
  .daw-table td { padding: 8px 4px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
  .daw-controls { display: flex; gap: 4px; justify-content: flex-start; }
  .daw-btn { background: transparent; border: var(--border-width) solid var(--border-color); padding: 2px 6px; font-size: 11px; font-weight: bold; cursor: pointer; font-family: var(--font-mono); }
  .daw-btn.active { background-color: var(--fg-color); color: var(--bg-color); }
  
  /* Channel Row Elements */
  .channel-info { display: flex; align-items: center; gap: 8px; width: 100%; }
  .tint-picker { width: 24px; height: 24px; padding: 0; border: var(--border-width) solid var(--border-color); cursor: pointer; flex-shrink: 0; }
  .channel-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1; font-size: 12px; }
  .blend-mode-select { font-size: 10px; padding: 2px 4px; font-family: var(--font-mono); width: 85px; flex-shrink: 0; }
</style>