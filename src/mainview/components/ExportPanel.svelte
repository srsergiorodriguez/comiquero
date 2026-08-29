<script>
  import { appState, setActivePage, separateColors, processSpotMixdown } from '../store.svelte.js';
  import { pickOutputDirectory, saveFileToDisk } from '../io.js';
  import { writePsd } from 'ag-psd';

  let isExporting = $state(false);
  let exportType = $state('stencils'); 
  let exportBg = $state('transparent'); 
  let exportScope = $state('current'); 
  let stencilColor = $state('black'); 
  let exportProgress = $state({ current: 0, total: 0 });

  async function handleExport() {
    if (exportScope === 'current' && (!appState.activeChannels || appState.activeChannels.length === 0)) {
      alert("No separated channels to export. Run the separation or mixdown engine first.");
      return;
    }

    if (exportScope === 'batch' && (!appState.files || appState.files.length === 0)) {
      alert("No folder loaded to batch process.");
      return;
    }

    const outputDir = await pickOutputDirectory();
    if (!outputDir) return; 

    isExporting = true;
    appState.isProcessing = true; 

    try {
      if (exportScope === 'current') {
        await exportCurrentSeparations(outputDir);
      } else {
        await processBatchPipeline(outputDir);
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed: " + error.message);
    } finally {
      isExporting = false;
      appState.isProcessing = false;
      exportProgress = { current: 0, total: 0 };
    }
  }

  async function processBatchPipeline(outputDir) {
    exportProgress.total = appState.files.length;
    exportProgress.current = 0;

    const originalIndex = appState.activePageIndex;
    const masterPsdRouting = Object.values(appState.psdRouting);

    for (let i = 0; i < appState.files.length; i++) {
      await setActivePage(i);
      await new Promise(resolve => setTimeout(resolve, 150));

      if (appState.isPsdMode) {
        const newRouting = {};
        appState.psdLayers.forEach((layer, index) => {
           newRouting[layer.name] = masterPsdRouting[index] || {}; 
        });
        
        appState.psdRouting = newRouting;
        await processSpotMixdown();
      } else {
        await separateColors();
      }

      await exportCurrentSeparations(outputDir, true); 
      exportProgress.current++;
    }

    await setActivePage(originalIndex);
    if (appState.isPsdMode) {
      await processSpotMixdown();
    } else {
      await separateColors();
    }
  }

  async function exportCurrentSeparations(outputDir, isBatch = false) {
    let baseName = "Untitled";
    if (appState.files && appState.files.length > 0) {
      const activeFile = appState.files[appState.activePageIndex];
      baseName = activeFile.name.substring(0, activeFile.name.lastIndexOf('.')) || activeFile.name;
    }

    const channelsToExport = appState.activeChannels.filter(ch => ch.isVisible);
    
    if (!isBatch) {
      exportProgress.total = exportType === 'composite' ? 1 : channelsToExport.length;
      exportProgress.current = 0;
    }

    const separator = outputDir.includes('\\') ? '\\' : '/';

    const saveCanvas = async (canvas, filename) => {
      const base64 = canvas.toDataURL('image/png');
      const filepath = outputDir + separator + filename;
      const result = await saveFileToDisk(filepath, base64);
      if (result && !result.success) throw new Error(result.error);
    };

    if (exportType === 'composite') {
      const canvas = document.createElement('canvas');
      canvas.width = appState.docWidth;
      canvas.height = appState.docHeight;
      const ctx = canvas.getContext('2d');

      if (exportBg === 'white') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      for (const ch of channelsToExport) {
        if (ch.tintedBitmap) {
          ctx.globalCompositeOperation = appState.forceMultiplyAll ? 'multiply' : (ch.blendMode || 'source-over');
          ctx.drawImage(ch.tintedBitmap, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      await saveCanvas(canvas, `${baseName}_composite.png`);
      if (!isBatch) exportProgress.current++;

    } else if (exportType === 'psd') {
      // --- EXPORT LAYERED PSD ---
      const psdDocument = {
        width: appState.docWidth,
        height: appState.docHeight,
        children: []
      };

      for (const ch of channelsToExport) {
        const canvas = document.createElement('canvas');
        canvas.width = appState.docWidth;
        canvas.height = appState.docHeight;
        const ctx = canvas.getContext('2d');

        if (stencilColor === 'ink' && ch.tintedBitmap) {
          ctx.drawImage(ch.tintedBitmap, 0, 0);
        } else {
          ctx.drawImage(ch.rawBitmap, 0, 0);
        }

        psdDocument.children.push({
          name: ch.name,
          canvas: canvas,
          blendMode: 'multiply' 
        });
        
        if (!isBatch) exportProgress.current++;
      }

      // Append background layer at the very bottom if requested
      if (exportBg === 'white') {
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = appState.docWidth;
        bgCanvas.height = appState.docHeight;
        const bgCtx = bgCanvas.getContext('2d');
        bgCtx.fillStyle = '#ffffff';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        
        psdDocument.children.push({
          name: 'Background',
          canvas: bgCanvas,
          blendMode: 'normal'
        });
      }

      const buffer = writePsd(psdDocument);
      const blob = new Blob([buffer]);
      
      const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      // Strip the prefix just in case the backend expects raw base64 payload
      const cleanBase64 = typeof base64 === 'string' ? base64.replace(/^data:.*?;base64,/, "") : base64;
      const filepath = outputDir + separator + `${baseName}.psd`;
      
      const result = await saveFileToDisk(filepath, cleanBase64);
      if (result && !result.success) throw new Error(result.error);

    } else {
      // --- EXPORT STENCILS ---
      for (const ch of channelsToExport) {
        const canvas = document.createElement('canvas');
        canvas.width = appState.docWidth;
        canvas.height = appState.docHeight;
        const ctx = canvas.getContext('2d');

        if (exportBg === 'white') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        if (stencilColor === 'ink' && ch.tintedBitmap) {
          ctx.drawImage(ch.tintedBitmap, 0, 0);
        } else {
          ctx.drawImage(ch.rawBitmap, 0, 0);
        }

        const safeInkName = ch.name.replace(/[^a-z0-9]/gi, '_');
        await saveCanvas(canvas, `${baseName}_${safeInkName}.png`);
        
        if (!isBatch) exportProgress.current++;
      }
    }
  }
</script>

<div class="sidebar-section">
  <h3>Export Output</h3>
  
  <div class="flex-col" style="margin-top: 8px;">
    
    <label>
      <span class="label-text">Export Type</span>
      <select bind:value={exportType} class="full-width-select">
        <option value="stencils">Separated Stencils (Physical Print)</option>
        <option value="psd">Layered PSD Document</option>
        <option value="composite">Flat Composite (Digital / Web)</option>
      </select>
    </label>

    {#if exportType === 'stencils' || exportType === 'psd'}
      <label>
        <span class="label-text">Stencil Color</span>
        <select bind:value={stencilColor} class="full-width-select">
          <option value="black">Pure Black (Standard)</option>
          <option value="ink">Actual Ink Color (Preview)</option>
        </select>
      </label>
    {/if}

    <label>
      <span class="label-text">Background</span>
      <select bind:value={exportBg} class="full-width-select">
        <option value="transparent">Transparent</option>
        <option value="white">Solid White</option>
      </select>
    </label>

    <label>
      <span class="label-text">Scope</span>
      <select bind:value={exportScope} class="full-width-select">
        <option value="current">Current Page Only</option>
        <option value="batch">Entire Folder (Batch Process)</option>
      </select>
    </label>

    <div class="info-box" style="margin-top: 8px;">
      <p class="help-text">
        {#if exportType === 'stencils'}
          Saves PNG stencils ready for RIP software or screen printing.
        {:else if exportType === 'psd'}
          Saves a single multi-layered PSD document preserving channel opacities and blend modes.
        {:else}
          Saves a single full-color PNG exactly as it appears in the preview canvas.
        {/if}
      </p>
    </div>

    <button 
      class="process-btn" 
      onclick={handleExport} 
      disabled={isExporting || (exportScope === 'current' && appState.activeChannels.length === 0)} 
      style="margin-top: 8px;"
    >
      {#if isExporting}
        {#if exportScope === 'batch'}
          Processing Page {exportProgress.current + 1} of {exportProgress.total}...
        {:else}
          Saving ({exportProgress.current}/{exportProgress.total})...
        {/if}
      {:else}
        Select Destination Folder...
      {/if}
    </button>
  </div>
</div>

<style>
  .sidebar-section { padding: var(--spacing-md); border-bottom: var(--border-width) solid var(--border-color); }
  h3 { margin: 0; font-size: var(--fs-md); text-transform: uppercase; letter-spacing: 0.05em; }
  .label-text { font-size: 12px; font-weight: bold; margin-bottom: 4px; margin-top: 8px; display: block; }
  .full-width-select { width: 100%; padding: 6px; font-family: var(--font-mono); font-size: var(--fs-sm); border: var(--border-width) solid var(--border-color); background: var(--bg-color); }
  
  .info-box { background: var(--bg-color); padding: 8px; border: var(--border-width) solid var(--border-color); border-radius: var(--border-radius); }
  .help-text { font-size: 10px; line-height: 1.4; color: #555; margin: 0; text-align: center; }
  
  .process-btn { padding: 12px; font-weight: bold; background: var(--fg-color); color: var(--bg-color); cursor: pointer; border: none; border-radius: var(--border-radius); transition: opacity 0.2s; }
  .process-btn:hover:not(:disabled) { opacity: 0.8; }
  .process-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>