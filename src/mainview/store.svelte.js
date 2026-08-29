import { loadComicFolder, getBackendSrgbImage, pickSingleFile, getPsdLayers, getPsdHeaders } from './io.js';

// ==========================================
// 1. CONSTANTS & INITIAL STATE
// ==========================================

export const defaultPalettes = {
  digital_cmyk: [
    { id: 'c', name: 'Pure Cyan', color: '#00FFFF', angle: 15, blendMode: 'multiply', toneMin: 0, toneMax: 25 },
    { id: 'm', name: 'Pure Magenta', color: '#FF00FF', angle: 75, blendMode: 'multiply', toneMin: 26, toneMax: 50 },
    { id: 'y', name: 'Pure Yellow', color: '#FFFF00', angle: 0, blendMode: 'multiply', toneMin: 51, toneMax: 75 },
    { id: 'k', name: 'Pure Black', color: '#000000', angle: 45, blendMode: 'multiply', toneMin: 76, toneMax: 100 }
  ],
  print_cmyk: [
    { id: 'c', name: 'Print Cyan', color: '#00AEEF', angle: 15, blendMode: 'multiply', toneMin: 0, toneMax: 25 },
    { id: 'm', name: 'Print Magenta', color: '#EC008C', angle: 75, blendMode: 'multiply', toneMin: 26, toneMax: 50 },
    { id: 'y', name: 'Print Yellow', color: '#FFF200', angle: 0, blendMode: 'multiply', toneMin: 51, toneMax: 75 },
    { id: 'k', name: 'Print Black', color: '#000000', angle: 45, blendMode: 'multiply', toneMin: 76, toneMax: 100 }
  ],
  riso: [
    { id: 'r_red', name: 'Bright Red', color: '#F15060', angle: 15, blendMode: 'multiply', toneMin: 20, toneMax: 50 },
    { id: 'r_blue', name: 'Blue', color: '#0078BF', angle: 75, blendMode: 'multiply', toneMin: 51, toneMax: 80 },
    { id: 'r_black', name: 'Black', color: '#000000', angle: 45, blendMode: 'multiply', toneMin: 0, toneMax: 19 }
  ],
  custom: []
};

export const appState = $state({
  currentMode: 'edit', 
  activePageIndex: 0,
  zoomTransform: { x: 0, y: 0, k: 1 },
  fitTrigger: 0, 
  renderTrigger: 0, 
  
  loadedFolder: null,
  files: [], 
  thumbnails: [], 
  bufferCache: {},
  
  docWidth: 800,
  docHeight: 1200,
  rawImageData: null, 
  activeBitmap: null, 

  activePalette: 'digital_cmyk',
  customColors: JSON.parse(JSON.stringify(defaultPalettes.digital_cmyk)),
  
  selectedAlgorithm: 'smooth',
  halftoneLPI: 60,  
  halftoneDPI: 300, 
  forceMultiplyAll: true,
  activeChannels: [], 
  isSeparating: false,
  isTinting: false,

  isProcessing: false,
  loadingProgress: { current: 0, total: 0 }, 
  errorMessage: null,

  isPsdMode: false,
  psdLayers: [],     
  psdRouting: {}, 
  psdCache: {},

  psdMasterLayers: [], 
  layerAliases: {},
  psdScannedLayers: [], 
  masterLayerActive: {}, 
  batchRoutingMode: 'name',

  preflightOptions: {
    enabled: false,
    unit: 'px', 
    dpi: 300,
    physicalWidth: 1800,
    physicalHeight: 2700,
    targetWidth: 1800, 
    targetHeight: 2700, 
    scaleMode: 'fit'
  }
});

export function setMode(mode) { 
  appState.currentMode = mode; 
}

// ==========================================
// 2. PREFLIGHT & TRANSFORM LOGIC
// ==========================================

function getPreflightTransform(srcW, srcH) {
  const opts = appState.preflightOptions;
  if (!opts.enabled) return { tgtW: srcW, tgtH: srcH, drawX: 0, drawY: 0, drawW: srcW, drawH: srcH, scaleX: 1, scaleY: 1 };

  let tgtW = opts.targetWidth, tgtH = opts.targetHeight;
  let drawX = 0, drawY = 0, drawW = tgtW, drawH = tgtH;
  let scaleX = 1, scaleY = 1;

  if (opts.scaleMode === 'fit') {
    const scale = Math.min(tgtW / srcW, tgtH / srcH);
    drawW = srcW * scale; drawH = srcH * scale;
    drawX = (tgtW - drawW) / 2; drawY = (tgtH - drawH) / 2;
    scaleX = scale; scaleY = scale;
  } else if (opts.scaleMode === 'fill') {
    const scale = Math.max(tgtW / srcW, tgtH / srcH);
    drawW = srcW * scale; drawH = srcH * scale;
    drawX = (tgtW - drawW) / 2; drawY = (tgtH - drawH) / 2;
    scaleX = scale; scaleY = scale;
  } else {
    scaleX = tgtW / srcW; scaleY = tgtH / srcH;
  }

  return { tgtW, tgtH, drawX, drawY, drawW, drawH, scaleX, scaleY };
}

export async function applyPreflight() {
  appState.activeChannels.forEach(ch => { if(ch.rawBitmap) ch.rawBitmap.close(); if(ch.tintedBitmap) ch.tintedBitmap.close(); });
  appState.activeChannels = [];
  if (appState.activeBitmap) { appState.activeBitmap.close(); appState.activeBitmap = null; }
  
  appState.psdLayers.forEach(l => { if(l.bitmap) { l.bitmap.close(); l.bitmap = null; } });
  
  await setActivePage(appState.activePageIndex);
}

// ==========================================
// 3. FILE & FOLDER I/O
// ==========================================

export async function openFolder() {
  appState.isProcessing = true;
  appState.errorMessage = null;
  appState.loadingProgress = { current: 0, total: 0 };
  
  const result = await loadComicFolder();
  
  if (result && result.success) {
    appState.loadedFolder = result.folderPath;
    appState.files = result.files.sort((a, b) => a.name.localeCompare(b.name));
    
    const headerData = await getPsdHeaders(result.folderPath);
    if (headerData && headerData.success) {
      appState.psdMasterLayers = [...headerData.uniqueLayers];
      appState.psdScannedLayers = [...headerData.uniqueLayers]; 
      
      const newAliases = {};
      const activeStates = {}; 
      headerData.uniqueLayers.forEach(name => {
        newAliases[name] = name;
        activeStates[name] = true; 
      });
      appState.layerAliases = newAliases;
      appState.masterLayerActive = activeStates; 
    }

    appState.thumbnails = new Array(appState.files.length).fill(null);
    appState.activePageIndex = 0;
    appState.bufferCache = {};
    appState.loadingProgress.total = appState.files.length;
    
    generateThumbnails();
    await setActivePage(0);
  } else {
    appState.isProcessing = false;
  }
}

async function generateThumbnails() {
  for (let i = 0; i < appState.files.length; i++) {
    const file = appState.files[i];
    appState.loadingProgress.current = i + 1;
    try {
      const base64 = await getCachedBase64(file);
      if (base64) {
        const img = new Image();
        await new Promise(resolve => {
          img.onload = () => {
            const thumbCanvas = document.createElement('canvas');
            const scale = Math.min(200 / img.width, 200 / img.height);
            thumbCanvas.width = img.width * scale; 
            thumbCanvas.height = img.height * scale;
            const ctx = thumbCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
            appState.thumbnails[i] = thumbCanvas.toDataURL('image/png');
            resolve();
          };
          img.src = `data:image/png;base64,${base64}`;
        });
      }
    } catch (err) {}
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  appState.isProcessing = false;
}

// ==========================================
// 4. PAGE LOADING & ROUTING
// ==========================================

export async function setActivePage(index) {
  if (index < 0 || index >= appState.files.length) return;
  
  appState.activePageIndex = index;
  appState.errorMessage = null;
  
  const activeFile = appState.files[index];
  appState.isPsdMode = activeFile.isPsd; 
  
  if (appState.isPsdMode) {
    appState.isProcessing = true;
    appState.loadingProgress = { current: 0, total: 0 };
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    let psdData = appState.psdCache[activeFile.name];
    
    if (!psdData) {
      psdData = await getPsdLayers(activeFile.path);
      if (psdData) {
        appState.psdCache[activeFile.name] = psdData; 
      }
    }
    
    if (psdData) {
      appState.docWidth = psdData.width;
      appState.docHeight = psdData.height;
      appState.psdLayers = psdData.layers;
      
      if (!appState.psdMasterLayers || appState.psdMasterLayers.length === 0) {
        appState.psdMasterLayers = psdData.layers.map(l => l.name);
        appState.psdScannedLayers = [...appState.psdMasterLayers]; 
        const defaultAliases = {};
        const activeStates = {}; 
        appState.psdMasterLayers.forEach(name => { 
          defaultAliases[name] = name; 
          activeStates[name] = true;
        });
        appState.layerAliases = defaultAliases;
        appState.masterLayerActive = activeStates; 
      }

      initializePsdRouting();
      await preparePsdBitmaps();
      await processSpotMixdown();
      appState.fitTrigger++; 
    } else {
      appState.errorMessage = "Failed to load PSD layers.";
    }
    appState.isProcessing = false;
    
  } else {
    await loadActivePageData();
  }
}

export function initializePsdRouting() {
  if (!appState.psdRouting) appState.psdRouting = {};
  
  appState.psdMasterLayers.forEach(layerName => {
    // NEW: Initialize _lumaToAlpha alongside _texture
    if (!appState.psdRouting[layerName]) {
      appState.psdRouting[layerName] = { _texture: 'none', _lumaToAlpha: false };
    }
    
    const row = appState.psdRouting[layerName];
    const oldInkIds = Object.keys(row).filter(key => key !== '_texture' && key !== '_lumaToAlpha');
    
    appState.customColors.forEach((color, index) => {
      if (row[color.id] !== undefined) return;
      
      let val = 0;
      if (oldInkIds[index] && row[oldInkIds[index]] !== undefined) {
        val = row[oldInkIds[index]];
      }
      
      row[color.id] = (val !== undefined && val !== null && !isNaN(val)) ? Number(val) : 0;
    });

    const currentInkIds = appState.customColors.map(c => c.id);
    oldInkIds.forEach(oldId => {
      if (!currentInkIds.includes(oldId)) {
        delete row[oldId];
      }
    });
  });
}

async function loadActivePageData() {
  const file = appState.files[appState.activePageIndex];
  if (!file) return;

  if (appState.activeBitmap) {
    appState.activeBitmap.close();
    appState.activeBitmap = null;
  }
  appState.activeChannels.forEach(ch => { 
    if (ch.rawBitmap) ch.rawBitmap.close(); 
    if (ch.tintedBitmap) ch.tintedBitmap.close(); 
  });
  appState.activeChannels = [];

  try {
    const base64 = await getCachedBase64(file);
    if (base64) {
      const { imageData, width, height, bitmap } = await base64ToImageData(base64, true);
      appState.docWidth = width;
      appState.docHeight = height;
      appState.rawImageData = imageData;
      appState.activeBitmap = bitmap;
      appState.fitTrigger++; 
    }
  } catch (e) {
    appState.errorMessage = "Failed to load image data.";
  }
}

// ==========================================
// 5. IMAGE PROCESSING HELPERS
// ==========================================

export async function getCachedBase64(file) {
  if (appState.bufferCache[file.name]) return appState.bufferCache[file.name];
  const b64 = await getBackendSrgbImage(file.path);
  if (b64) appState.bufferCache[file.name] = b64;
  return b64;
}

function base64ToImageData(base64, useDocPreflight = false, customTransform = null) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      let cW = img.width, cH = img.height;
      let dX = 0, dY = 0, dW = cW, dH = cH;

      if (useDocPreflight && appState.preflightOptions.enabled) {
         const t = getPreflightTransform(cW, cH);
         cW = t.tgtW; cH = t.tgtH;
         dX = t.drawX; dY = t.drawY;
         dW = t.drawW; dH = t.drawH;
      } else if (customTransform) {
         cW = customTransform.tgtW; cH = customTransform.tgtH;
         dX = customTransform.drawX; dY = customTransform.drawY;
         dW = customTransform.drawW; dH = customTransform.drawH;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, cW); 
      canvas.height = Math.max(1, cH);
      const ctx = canvas.getContext('2d');
      
      if (useDocPreflight || customTransform) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
      
      if (useDocPreflight && appState.preflightOptions.enabled && appState.preflightOptions.scaleMode === 'fit') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      ctx.drawImage(img, dX, dY, dW, dH);
      const bitmap = await createImageBitmap(canvas);
      
      resolve({
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
        width: canvas.width,
        height: canvas.height,
        bitmap: bitmap
      });
    };
    img.src = `data:image/png;base64,${base64}`;
  });
}

// ==========================================
// 6. HALFTONE WORKER & ENGINE
// ==========================================

const workerCode = `
  function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  const bayer4x4 = [ 0, 128, 32, 160, 192, 64, 224, 96, 48, 176, 16, 144, 240, 112, 208, 80 ];
  const bayer8x8 = [ 0, 192, 48, 240, 12, 204, 60, 252, 128, 64, 176, 112, 140, 76, 188, 124, 32, 224, 16, 208, 44, 236, 28, 220, 160, 96, 144, 80, 172, 108, 156, 92, 12, 204, 60, 252, 3, 195, 51, 243, 140, 76, 188, 124, 131, 67, 179, 115, 44, 236, 28, 220, 35, 227, 19, 211, 172, 108, 156, 92, 163, 99, 147, 83 ];

  self.onmessage = function(e) {
    const { imageData, palette, algorithm, lpi, dpi } = e.data;
    const frequency = (lpi / dpi) * Math.PI * 2;
    const { data, width, height } = imageData;
    const numPixels = width * height;
    const buffers = {};
    
    const inks = palette.map(ink => {
      const rgb = hexToRgb(ink.color);
      let iC = 1 - (rgb[0] / 255);
      let iM = 1 - (rgb[1] / 255);
      let iY = 1 - (rgb[2] / 255);
      let iK = Math.min(iC, iM, iY);
      let iGcr = iK * iK; 
      if (iGcr < 1) { iC = (iC - iGcr) / (1 - iGcr); iM = (iM - iGcr) / (1 - iGcr); iY = (iY - iGcr) / (1 - iGcr); } 
      else { iC = 0; iM = 0; iY = 0; }
      iK = iGcr;
      const max = Math.max(iC, iM, iY, iK, 0.001);
      buffers[ink.id] = new Uint8ClampedArray(numPixels * 4);
      return { id: ink.id, iC: iC / max, iM: iM / max, iY: iY / max, iK: iK / max, angle: ink.angle || 0 };
    });

    for (let p = 0; p < numPixels; p++) {
      const idx = p * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2], alpha = data[idx+3];
      if (alpha === 0) continue;

      const x = p % width, y = Math.floor(p / width);
      let pC = 1 - (r / 255); let pM = 1 - (g / 255); let pY = 1 - (b / 255);
      let pK_raw = Math.min(pC, pM, pY); let gcr = pK_raw * pK_raw; 
      
      if (gcr < 1) { pC = (pC - gcr) / (1 - gcr); pM = (pM - gcr) / (1 - gcr); pY = (pY - gcr) / (1 - gcr); } 
      else { pC = 0; pM = 0; pY = 0; }
      let pK = gcr;

      for (let i = 0; i < inks.length; i++) {
        const ink = inks[i];
        let intensity = 0; let weight = 0;
        
        if (ink.iC > 0.1) { intensity += (pC * ink.iC); weight += ink.iC; }
        if (ink.iM > 0.1) { intensity += (pM * ink.iM); weight += ink.iM; }
        if (ink.iY > 0.1) { intensity += (pY * ink.iY); weight += ink.iY; }
        if (ink.iK > 0.1) { intensity += (pK * ink.iK); weight += ink.iK; }
        
        if (weight > 0) { intensity /= weight; }
        intensity = Math.max(0, Math.min(1, intensity));
        if (intensity < 0.015) intensity = 0;

        let alphaOut = 0;
        if (algorithm === 'smooth') alphaOut = intensity * 255; 
        else if (algorithm === 'threshold') alphaOut = intensity > 0.5 ? 255 : 0;
        else if (algorithm.startsWith('bayer')) {
          let bayerValue = algorithm === 'bayer4x4' ? bayer4x4[(y % 4) * 4 + (x % 4)] / 255 : bayer8x8[(y % 8) * 8 + (x % 8)] / 255;
          alphaOut = intensity > bayerValue ? 255 : 0;
        } else if (algorithm === 'halftone') {
          const rad = ink.angle * (Math.PI / 180);
          const xx = x * Math.cos(rad) - y * Math.sin(rad); const yy = x * Math.sin(rad) + y * Math.cos(rad);
          const pattern = (Math.sin(xx * frequency) * Math.sin(yy * frequency) + 1) / 2;
          alphaOut = intensity > pattern ? 255 : 0;
        } else if (algorithm === 'linescreen') {
          const rad = ink.angle * (Math.PI / 180);
          const yy = x * Math.sin(rad) + y * Math.cos(rad);
          const pattern = (Math.sin(yy * frequency) + 1) / 2;
          alphaOut = intensity > pattern ? 255 : 0;
        } else if (algorithm === 'crosshatch') {
          const rad1 = ink.angle * (Math.PI / 180); const rad2 = (ink.angle + 90) * (Math.PI / 180);
          const y1 = x * Math.sin(rad1) + y * Math.cos(rad1); const y2 = x * Math.sin(rad2) + y * Math.cos(rad2);
          const pat1 = (Math.sin(y1 * frequency) + 1) / 2; const pat2 = (Math.sin(y2 * frequency) + 1) / 2;
          if (intensity > 0.65) alphaOut = (pat1 < 0.5 || pat2 < 0.5) ? 255 : 0;
          else if (intensity > 0.2) alphaOut = (pat1 < 0.5) ? 255 : 0;
        } else if (algorithm === 'noise') {
          alphaOut = intensity > Math.random() ? 255 : 0;
        }

        if (alphaOut > 0) {
          const buf = buffers[ink.id];
          buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = alphaOut; 
        }
      }
    }
    self.postMessage({ buffers });
  };
`;
const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);

export function separateColors() {
  return new Promise((resolve) => {
    if (!appState.rawImageData) { resolve(); return; }
    appState.isSeparating = true;
    appState.activeChannels.forEach(ch => { if (ch.rawBitmap) ch.rawBitmap.close(); if (ch.tintedBitmap) ch.tintedBitmap.close(); });
    appState.activeChannels = [];

    const worker = new Worker(workerUrl);
    worker.postMessage({ imageData: appState.rawImageData, palette: $state.snapshot(appState.customColors), algorithm: appState.selectedAlgorithm, lpi: appState.halftoneLPI, dpi: appState.halftoneDPI });

    worker.onmessage = async function(e) {
      const { buffers } = e.data;
      const generatedChannels = [];
      for (let i = 0; i < appState.customColors.length; i++) {
        const ink = appState.customColors[i];
        const imgData = new ImageData(buffers[ink.id], appState.rawImageData.width, appState.rawImageData.height);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = appState.rawImageData.width; tempCanvas.height = appState.rawImageData.height;
        tempCanvas.getContext('2d').putImageData(imgData, 0, 0);
        const bitmap = await createImageBitmap(tempCanvas);

        generatedChannels.push({ id: ink.id, name: ink.name, colorHex: ink.color, blendMode: ink.blendMode || 'multiply', isVisible: true, isSoloed: false, rawBitmap: bitmap, tintedBitmap: null });
      }
      appState.activeChannels = generatedChannels;
      appState.isSeparating = false;
      await applyTints();
      resolve(); 
    };
  });
}

// ==========================================
// 7. TONE MAPPING WORKER & ENGINE
// ==========================================

const toneWorkerCode = `
  self.onmessage = function(e) {
    const { imageData, palette } = e.data;
    const { data, width, height } = imageData;
    const numPixels = width * height;
    const buffers = {};
    
    palette.forEach(ink => { buffers[ink.id] = new Uint8ClampedArray(numPixels * 4); });

    for (let p = 0; p < numPixels; p++) {
      const idx = p * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
      if (a === 0) continue;
      
      // Calculate grayscale brightness (0% = black, 100% = white)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const brightness = (lum / 255) * 100;

      for (let i = 0; i < palette.length; i++) {
        const ink = palette[i];
        const tMin = ink.toneMin || 0;
        const tMax = ink.toneMax || 100;
        
        // If pixel falls within the assigned tonal range, draw it black
        if (brightness >= tMin && brightness <= tMax) {
          const buf = buffers[ink.id];
          buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = 255;
        }
      }
    }
    self.postMessage({ buffers });
  };
`;
const toneWorkerBlob = new Blob([toneWorkerCode], { type: 'application/javascript' });
const toneWorkerUrl = URL.createObjectURL(toneWorkerBlob);

export function mapTones() {
  return new Promise((resolve) => {
    if (!appState.rawImageData) { resolve(); return; }
    appState.isSeparating = true; 
    
    appState.activeChannels.forEach(ch => { if (ch.rawBitmap) ch.rawBitmap.close(); if (ch.tintedBitmap) ch.tintedBitmap.close(); });
    appState.activeChannels = [];

    const worker = new Worker(toneWorkerUrl);
    worker.postMessage({ imageData: appState.rawImageData, palette: $state.snapshot(appState.customColors) });

    worker.onmessage = async function(e) {
      const { buffers } = e.data;
      const generatedChannels = [];
      
      for (let i = 0; i < appState.customColors.length; i++) {
        const ink = appState.customColors[i];
        const imgData = new ImageData(buffers[ink.id], appState.rawImageData.width, appState.rawImageData.height);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = appState.rawImageData.width; tempCanvas.height = appState.rawImageData.height;
        tempCanvas.getContext('2d').putImageData(imgData, 0, 0);
        const bitmap = await createImageBitmap(tempCanvas);

        generatedChannels.push({ id: ink.id, name: ink.name, colorHex: ink.color, blendMode: ink.blendMode || 'multiply', isVisible: true, isSoloed: false, rawBitmap: bitmap, tintedBitmap: null });
      }
      appState.activeChannels = generatedChannels;
      appState.isSeparating = false;
      await applyTints();
      resolve(); 
    };
  });
}

// ==========================================
// 8. PSD SPOT MIXDOWN ENGINE
// ==========================================

export async function preparePsdBitmaps() {
  const t = getPreflightTransform(appState.docWidth, appState.docHeight);
  if (appState.preflightOptions.enabled) {
    appState.docWidth = t.tgtW; appState.docHeight = t.tgtH;
  }

  for (let i = 0; i < appState.psdLayers.length; i++) {
    const layer = appState.psdLayers[i];
    if (!layer.bitmap) {
      let layerTransform = null;
      
      if (appState.preflightOptions.enabled) {
         layerTransform = {
           tgtW: Math.round(layer.width * t.scaleX), 
           tgtH: Math.round(layer.height * t.scaleY),
           drawX: 0, drawY: 0, 
           drawW: Math.round(layer.width * t.scaleX), 
           drawH: Math.round(layer.height * t.scaleY)
         };
         layer.scaledLeft = Math.round(layer.left * t.scaleX + t.drawX);
         layer.scaledTop = Math.round(layer.top * t.scaleY + t.drawY);
      } else {
         layer.scaledLeft = layer.left; 
         layer.scaledTop = layer.top;
      }
      
      const { bitmap } = await base64ToImageData(layer.base64, false, layerTransform);
      layer.bitmap = bitmap;
    }
  }
}

function getTexturePattern(type, ctx) {
  if (!type || type === 'none') return '#000000'; 
  
  const patCanvas = document.createElement('canvas');
  patCanvas.width = 20;
  patCanvas.height = 20;
  const pCtx = patCanvas.getContext('2d');
  
  pCtx.fillStyle = '#000000';
  
  if (type === 'grid') {
    pCtx.fillRect(0, 0, 20, 2);
    pCtx.fillRect(0, 0, 2, 20);
  } else if (type === 'lines') {
    pCtx.lineWidth = 2;
    pCtx.beginPath();
    pCtx.moveTo(0, 20);
    pCtx.lineTo(20, 0);
    pCtx.stroke();
  } else if (type === 'dots') {
    pCtx.beginPath();
    pCtx.arc(10, 10, 6, 0, Math.PI * 2);
    pCtx.fill();
  }
  
  return ctx.createPattern(patCanvas, 'repeat');
}

export async function processSpotMixdown() {
  if (!appState.psdLayers || appState.psdLayers.length === 0) return;
  appState.isTinting = true;
  
  appState.activeChannels.forEach(ch => { if (ch.rawBitmap) ch.rawBitmap.close(); if (ch.tintedBitmap) ch.tintedBitmap.close(); });
  const generatedChannels = [];
  
  for (let i = 0; i < appState.customColors.length; i++) {
    const ink = appState.customColors[i];
    const canvas = document.createElement('canvas');
    canvas.width = appState.docWidth; canvas.height = appState.docHeight;
    const ctx = canvas.getContext('2d');
    
    for (let layerIndex = 0; layerIndex < appState.psdLayers.length; layerIndex++) {
       const layer = appState.psdLayers[layerIndex];
       
       let masterName;
       if (appState.batchRoutingMode === 'index') {
         masterName = appState.psdMasterLayers[layerIndex];
       } else {
         masterName = appState.layerAliases[layer.name] || layer.name;
       }
       
       if (!masterName || appState.masterLayerActive[masterName] === false) continue; 
       
       const opacity = appState.psdRouting[masterName]?.[ink.id] || 0;
       const texture = appState.psdRouting[masterName]?._texture || 'none';
       const lumaToAlpha = appState.psdRouting[masterName]?._lumaToAlpha || false;
       
       if (opacity > 0 && layer.bitmap) {
         // NEW: Unified temp canvas logic for both Texture and Luma extraction
         if (texture !== 'none' || lumaToAlpha) {
           const tempCanvas = document.createElement('canvas');
           tempCanvas.width = layer.bitmap.width;
           tempCanvas.height = layer.bitmap.height;
           const tempCtx = tempCanvas.getContext('2d');
           
           tempCtx.drawImage(layer.bitmap, 0, 0);

           if (lumaToAlpha) {
             const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
             const d = imgData.data;
             
             // Pass 1: Find the darkest pixel (minimum luminance) in the layer
             let minLum = 255;
             for (let p = 0; p < d.length; p += 4) {
               if (d[p+3] > 0) {
                 const lum = 0.299 * d[p] + 0.587 * d[p+1] + 0.114 * d[p+2];
                 if (lum < minLum) minLum = lum;
               }
             }

             // Pass 2: Normalize all pixels relative to that darkest point
             const lumRange = 255 - minLum;
             for (let p = 0; p < d.length; p += 4) {
               if (d[p+3] > 0) {
                 const rawLum = 0.299 * d[p] + 0.587 * d[p+1] + 0.114 * d[p+2];
                 
                 // Shift the range so the darkest pixel becomes 0 (pure black)
                 const normalizedLum = lumRange === 0 ? 0 : ((rawLum - minLum) / lumRange) * 255;
                 
                 d[p] = 0; d[p+1] = 0; d[p+2] = 0; 
                 // Blend the inverted normalized luminance with the original brush alpha
                 d[p+3] = ((255 - normalizedLum) * d[p+3]) / 255; 
               }
             }
             tempCtx.putImageData(imgData, 0, 0);
           }
           
           if (texture !== 'none') {
             tempCtx.globalCompositeOperation = 'source-in';
             tempCtx.fillStyle = getTexturePattern(texture, tempCtx);
             tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
           }
           
           ctx.globalAlpha = opacity / 100;
           ctx.drawImage(tempCanvas, layer.scaledLeft ?? layer.left, layer.scaledTop ?? layer.top);
         } else {
           ctx.globalAlpha = opacity / 100;
           ctx.drawImage(layer.bitmap, layer.scaledLeft ?? layer.left, layer.scaledTop ?? layer.top); 
         }
       }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, appState.docWidth, appState.docHeight);
    const rawBitmap = await createImageBitmap(canvas);
    
    const offCanvas = document.createElement('canvas');
    offCanvas.width = appState.docWidth; offCanvas.height = appState.docHeight;
    const offCtx = offCanvas.getContext('2d');
    offCtx.drawImage(rawBitmap, 0, 0);
    offCtx.globalCompositeOperation = 'source-in';
    offCtx.fillStyle = ink.color;
    offCtx.fillRect(0, 0, appState.docWidth, appState.docHeight);
    const tintedBitmap = await createImageBitmap(offCanvas);
    
    generatedChannels.push({ id: ink.id, name: ink.name, colorHex: ink.color, blendMode: ink.blendMode || 'multiply', isVisible: true, isSoloed: false, rawBitmap, tintedBitmap });
  }
  
  appState.activeChannels = generatedChannels;
  appState.isTinting = false;
  appState.renderTrigger++; 
}

export async function applyTints() {
  if (!appState.activeChannels.length) return;
  appState.isTinting = true;
  for (let i = 0; i < appState.activeChannels.length; i++) {
    const ch = appState.activeChannels[i];
    const offCanvas = document.createElement('canvas');
    offCanvas.width = appState.docWidth; offCanvas.height = appState.docHeight;
    const offCtx = offCanvas.getContext('2d');
    offCtx.drawImage(ch.rawBitmap, 0, 0);
    offCtx.globalCompositeOperation = 'source-in';
    offCtx.fillStyle = ch.colorHex;
    offCtx.fillRect(0, 0, appState.docWidth, appState.docHeight);
    
    if (ch.tintedBitmap) ch.tintedBitmap.close();
    ch.tintedBitmap = await createImageBitmap(offCanvas);
  }
  appState.isTinting = false;
  appState.renderTrigger++; 
}