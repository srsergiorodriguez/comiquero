<script>
  import { appState, processSpotMixdown, applyTints, defaultPalettes, initializePsdRouting } from '../store.svelte.js';

  let aliasStrings = $state({});

  $effect(() => {
    if (appState.psdMasterLayers) {
      appState.psdMasterLayers.forEach(layer => {
        if (aliasStrings[layer] === undefined) {
          aliasStrings[layer] = '';
        }
      });
    }
  });

  function updateAliases() {
    const newAliases = {};
    const absorbedAliases = new Set();

    appState.psdMasterLayers.forEach(master => {
      newAliases[master] = master; 
      if (aliasStrings[master]) {
        aliasStrings[master].split(',').forEach(alias => {
          const cleanAlias = alias.trim();
          if (cleanAlias && cleanAlias !== master) {
            newAliases[cleanAlias] = master;
            absorbedAliases.add(cleanAlias); 
          }
        });
      }
    });

    appState.psdScannedLayers.forEach(scanned => {
      if (!absorbedAliases.has(scanned) && !appState.psdMasterLayers.includes(scanned)) {
        appState.psdMasterLayers.push(scanned); 
      }
    });

    appState.psdMasterLayers = appState.psdMasterLayers.filter(name => !absorbedAliases.has(name));
    appState.layerAliases = newAliases;

    initializePsdRouting();
    processSpotMixdown();
  }

  function toggleMasterLayer(layerName) {
    if (appState.masterLayerActive[layerName] === undefined) {
      appState.masterLayerActive[layerName] = true;
    }
    appState.masterLayerActive[layerName] = !appState.masterLayerActive[layerName];
    processSpotMixdown();
  }

  function moveMasterLayer(index, direction) {
    if (direction === -1 && index > 0) {
      const temp = appState.psdMasterLayers[index];
      appState.psdMasterLayers[index] = appState.psdMasterLayers[index - 1];
      appState.psdMasterLayers[index - 1] = temp;
    } else if (direction === 1 && index < appState.psdMasterLayers.length - 1) {
      const temp = appState.psdMasterLayers[index];
      appState.psdMasterLayers[index] = appState.psdMasterLayers[index + 1];
      appState.psdMasterLayers[index + 1] = temp;
    }
    initializePsdRouting();
    processSpotMixdown();
  }

  function applyPreset() {
    if (appState.activePalette !== 'custom') {
      appState.customColors = JSON.parse(JSON.stringify(defaultPalettes[appState.activePalette]));
      initializePsdRouting(); 
      processSpotMixdown();   
    }
  }

  function addColor() {
    const newId = `spot_${Date.now()}`;
    appState.customColors.push({
      id: newId,
      name: `Ink ${appState.customColors.length + 1}`,
      color: '#000000',
      blendMode: 'multiply'
    });
    
    appState.psdMasterLayers.forEach(layer => {
      if (!appState.psdRouting[layer]) appState.psdRouting[layer] = { _texture: 'none', _lumaToAlpha: false };
      appState.psdRouting[layer][newId] = 0;
    });
    
    appState.activePalette = 'custom';
    processSpotMixdown();
  }

  function removeColor(index) {
    appState.customColors.splice(index, 1);
    appState.activePalette = 'custom';
    processSpotMixdown();
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

<div class="spot-mapper flex-col">
  
  <div class="sidebar-section">
    <h3>Spot Palette</h3>
    <select class="full-width-select" bind:value={appState.activePalette} onchange={applyPreset}>
      <option value="digital_cmyk">Digital CMYK</option>
      <option value="print_cmyk">Standard CMYK</option>
      <option value="riso">Riso Basic (Red/Blue/Black)</option>
      <option value="custom">Custom Palette...</option>
    </select>

    <div class="color-list flex-col">
      <div class="color-header">
        <span class="flex-grow">Ink Color & Name</span>
      </div>
      {#each appState.customColors as ink, i (ink.id)}
        <div class="color-row">
          <input type="color" bind:value={ink.color} onchange={() => { appState.activePalette = 'custom'; processSpotMixdown(); }} />
          <input type="text" class="color-name-input" bind:value={ink.name} oninput={() => appState.activePalette = 'custom'} />
          <button class="delete-btn" onclick={() => removeColor(i)} title="Remove Ink">✕</button>
        </div>
      {/each}
    </div>
    <button class="add-color-btn" onclick={addColor}>+ Add Spot Ink</button>
  </div>

  <div class="sidebar-section">
    <h3>Layer Organizer</h3>
    <p class="desc">Define your master layer order and map typos via comma-separated aliases.</p>

    <label style="display: block; margin-top: 12px; margin-bottom: 12px;">
      <span class="label-text">Processing Mode</span>
      <select bind:value={appState.batchRoutingMode} onchange={processSpotMixdown} class="full-width-select">
        <option value="name">Resilient (Match by Layer Name & Aliases)</option>
        <option value="index">Strict (Match by 1:1 Sequential Order)</option>
      </select>
    </label>

    {#if appState.psdMasterLayers && appState.psdMasterLayers.length > 0}
      <table class="daw-table">
        <thead>
          <tr>
            <th class="col-order">Order</th>
            <th class="col-master">Master Layer</th>
            <th>Aliases</th>
            <th class="col-delete"></th>
          </tr>
        </thead>
        <tbody>
          {#each appState.psdMasterLayers as layerName, i (layerName)}
            <tr style={appState.masterLayerActive[layerName] === false ? 'opacity: 0.4;' : ''}>
              <td>
                <div class="daw-controls">
                  <button class="daw-btn" onclick={() => moveMasterLayer(i, -1)} disabled={i === 0}>↑</button>
                  <button class="daw-btn" onclick={() => moveMasterLayer(i, 1)} disabled={i === appState.psdMasterLayers.length - 1}>↓</button>
                </div>
              </td>
              <td>
                <strong class="channel-name" title={appState.batchRoutingMode === 'index' ? `Layer ${i + 1}` : layerName}>
                  {appState.batchRoutingMode === 'index' ? `Layer ${i + 1}` : layerName}
                </strong>
              </td>
              <td>
                <input 
                  type="text" 
                  class="alias-input" 
                  placeholder="e.g. red, red ink" 
                  bind:value={aliasStrings[layerName]} 
                  oninput={updateAliases} 
                  disabled={appState.batchRoutingMode === 'index' || appState.masterLayerActive[layerName] === false}
                  style={(appState.batchRoutingMode === 'index' || appState.masterLayerActive[layerName] === false) ? 'opacity: 0.5;' : ''}
                />
              </td>
              <td>
                <button class="daw-btn {appState.masterLayerActive[layerName] === false ? 'active' : ''}" onclick={() => toggleMasterLayer(layerName)} title="Mute/Bypass Layer">M</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="desc">Load a folder to scan master layers.</p>
    {/if}
  </div>

  <div class="sidebar-section">
    <h3>Routing Matrix</h3>
    <p class="desc">Map master layers to ink opacities and procedural textures.</p>

    {#if appState.psdMasterLayers && appState.psdMasterLayers.length > 0 && Object.keys(appState.psdRouting).length > 0}
      <div class="routing-matrix">
        
        <div class="matrix-row header">
          <div class="layer-col sticky-col-1">Master Layer</div>
          <!-- NEW: Modified header to squeeze in the Luma label -->
          <div class="tex-col sticky-col-2" style="justify-content: space-between; padding: 0 6px;">
            <span>Texture</span>
            <span title="Convert Lightness to Opacity">Luma</span>
          </div>
          {#each appState.customColors as ink (ink.id)}
            <div class="ink-col" style="border-bottom: 3px solid {ink.color};" title={ink.name}>
              {ink.name.substring(0, 3).toUpperCase()}
            </div>
          {/each}
        </div>

        {#each appState.psdMasterLayers as layerName, i (layerName)}
          {#if appState.psdRouting[layerName] && appState.masterLayerActive[layerName] !== false}
            <div class="matrix-row">
              <div class="layer-col sticky-col-1" title={appState.batchRoutingMode === 'index' ? `Layer ${i + 1}` : layerName}>
                {appState.batchRoutingMode === 'index' ? `Layer ${i + 1}` : layerName}
              </div>
              <div class="tex-col sticky-col-2">
                <select class="tex-select" bind:value={appState.psdRouting[layerName]._texture} onchange={processSpotMixdown}>
                  <option value="none">Solid</option>
                  <option value="grid">Grid</option>
                  <option value="lines">Lines</option>
                  <option value="dots">Dots</option>
                </select>
                <!-- NEW: The Luma to Alpha Toggle Button -->
                <button 
                  class="daw-btn {appState.psdRouting[layerName]._lumaToAlpha ? 'active' : ''}" 
                  onclick={() => { appState.psdRouting[layerName]._lumaToAlpha = !appState.psdRouting[layerName]._lumaToAlpha; processSpotMixdown(); }}
                  title="Extract Opacity from Lightness"
                  style="padding: 2px 4px; margin-left: 4px;"
                >L</button>
              </div>
              
              {#each appState.customColors as ink (ink.id)}
                <div class="ink-col">
                  <input 
                    type="number" 
                    min="0" 
                    max="100" 
                    step="10"
                    value={appState.psdRouting[layerName]?.[ink.id] ?? 0} 
                    oninput={(e) => {
                      let val = parseInt(e.target.value);
                      appState.psdRouting[layerName][ink.id] = isNaN(val) ? 0 : val;
                      processSpotMixdown();
                    }}
                  />
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {:else}
      <p class="desc">Waiting for layer index...</p>
    {/if}
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
          {#each appState.activeChannels as ch, i (ch.id)}
            <tr>
              <td>
                <div class="daw-controls">
                  <button class="daw-btn" onclick={() => moveChannel(i, -1)} disabled={i === 0}>↑</button>
                  <button class="daw-btn" onclick={() => moveChannel(i, 1)} disabled={i === appState.activeChannels.length - 1}>↓</button>
                  <button class="daw-btn {ch.isVisible ? '' : 'active'}" onclick={() => toggleMute(ch.id)}>M</button>
                  <button class="daw-btn {ch.isSoloed ? 'active' : ''}" onclick={() => toggleSolo(ch.id)}>S</button>
                </div>
              </td>
              <td>
                <div class="channel-info">
                  <input type="color" bind:value={ch.colorHex} onchange={applyTints} class="tint-picker" />
                  <strong class="channel-name" title={ch.name}>{ch.name}</strong>
                  {#if !appState.forceMultiplyAll}
                    <select bind:value={ch.blendMode} onchange={() => appState.renderTrigger++} class="blend-mode-select">
                      <option value="multiply">Multiply</option>
                      <option value="screen">Screen</option>
                      <option value="overlay">Overlay</option>
                      <option value="difference">Difference</option>
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
  .spot-mapper { gap: var(--spacing-md); }
  .sidebar-section { display: flex; flex-direction: column; gap: 8px; padding-bottom: var(--spacing-md); border-bottom: var(--border-width) solid var(--border-color); }
  .sidebar-section:last-child { border-bottom: none; }
  h3 { margin: 0; font-size: var(--fs-md); text-transform: uppercase; letter-spacing: 0.05em; }
  .desc { font-size: 11px; color: #666; margin: 0; }
  
  .full-width-select { width: 100%; padding: 6px; font-family: var(--font-mono); font-size: var(--fs-sm); border: var(--border-width) solid var(--border-color); background: var(--bg-color); }
  .color-list { gap: 8px; margin-top: 8px; }
  .color-header { display: flex; font-size: 10px; text-transform: uppercase; font-weight: bold; padding-right: 24px; color: #666; }
  .flex-grow { flex: 1; }
  
  .color-row { display: flex; gap: 6px; align-items: center; }
  .color-row input[type="color"] { cursor: pointer; width: 32px; height: 32px; padding: 0; border: var(--border-width) solid var(--border-color); }
  .color-name-input { flex: 1; padding: 6px; font-family: var(--font-mono); font-size: var(--fs-sm); border: var(--border-width) solid var(--border-color); min-width: 0; }
  .delete-btn { background: transparent; border: none; color: #d00; cursor: pointer; font-weight: bold; width: 24px; }
  .add-color-btn { background: transparent; border: 1px dashed var(--fg-color); padding: 6px; font-weight: bold; cursor: pointer; margin-top: 4px; font-family: var(--font-mono); font-size: var(--fs-sm); }

  .alias-input { width: 100%; padding: 4px; font-family: var(--font-mono); font-size: 10px; border: var(--border-width) solid var(--border-color); background: var(--bg-color); }
  .col-order { width: 55px; }
  .col-master { width: 90px; }
  .col-delete { width: 24px; }

  .routing-matrix { 
    display: block; 
    overflow-x: auto;
    border: var(--border-width) solid var(--border-color); 
    background: var(--bg-color); 
    border-radius: var(--border-radius); 
    margin-top: 4px;
    padding-bottom: 12px; 
  }
  
  .matrix-row { 
    display: flex; 
    width: max-content; 
    min-width: 100%;
    border-bottom: var(--border-width) solid var(--border-color); 
    align-items: center; 
  }
  .matrix-row:last-child { border-bottom: none; }
  .matrix-row.header { 
    background: #f1f5f9; 
    font-weight: bold; 
    font-size: 10px; 
    align-items: stretch; 
  }
  
  .sticky-col-1 { position: sticky; left: 0; z-index: 20; background: var(--bg-color); }
  .sticky-col-2 { position: sticky; left: 100px; z-index: 20; background: var(--bg-color); border-right: var(--border-width) solid var(--border-color); }
  .header .sticky-col-1, .header .sticky-col-2 { background: #f1f5f9; border-bottom: 3px solid #f1f5f9; }
  
  .layer-col { width: 100px; flex-shrink: 0; padding: 6px 8px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-right: var(--border-width) solid var(--border-color); }
  
  /* NEW: Expanded tex-col to 90px and made it a flexbox to hold both the select and the Luma button */
  .tex-col { width: 90px; flex-shrink: 0; padding: 2px; text-align: center; display: flex; align-items: center; }
  
  .ink-col { width: 50px; flex-shrink: 0; padding: 4px; text-align: center; border-right: var(--border-width) solid var(--border-color); position: relative; z-index: 1; }
  .ink-col:last-child { border-right: none; }
  
  .tex-select { width: 100%; font-size: 10px; padding: 2px; font-family: var(--font-mono); border: var(--border-width) solid var(--border-color); background: var(--bg-color); border-radius: var(--border-radius); cursor: pointer; }
  .ink-col input { width: 100%; padding: 2px; font-size: 11px; text-align: center; border: var(--border-width) solid var(--border-color); border-radius: var(--border-radius); -moz-appearance: textfield; }
  .ink-col input::-webkit-outer-spin-button, .ink-col input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  
  .toggle-container { display: flex; justify-content: flex-end; align-items: center; margin-bottom: 8px; }
  .toggle-label { font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; }
  .daw-table { width: 100%; border-collapse: collapse; text-align: left; font-size: var(--fs-sm); margin-top: 8px; table-layout: fixed; }
  .daw-table th { background-color: var(--fg-color); color: var(--bg-color); padding: 4px; }
  .daw-table td { padding: 8px 4px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
  .daw-controls { display: flex; gap: 4px; justify-content: flex-start; }
  .daw-btn { background: transparent; border: var(--border-width) solid var(--border-color); padding: 2px 6px; font-size: 11px; font-weight: bold; cursor: pointer; font-family: var(--font-mono); }
  .daw-btn.active { background-color: var(--fg-color); color: var(--bg-color); }
  
  .channel-info { display: flex; align-items: center; gap: 8px; width: 100%; }
  .tint-picker { width: 24px; height: 24px; padding: 0; border: var(--border-width) solid var(--border-color); cursor: pointer; flex-shrink: 0; }
  .channel-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1; font-size: 12px; }
  .blend-mode-select { font-size: 10px; padding: 2px; width: 85px; flex-shrink: 0; }
</style>