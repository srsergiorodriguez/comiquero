import { Electroview } from "electrobun/view";

export let isDesktop = false;
let electroview = null;

try {
  const frontendRPC = Electroview.defineRPC({
    maxRequestTime: 60000, 
    handlers: { requests: {}, messages: {} }
  });
  electroview = new Electroview({ rpc: frontendRPC });
  isDesktop = true;
} catch (error) {
  console.log("Running in standard web browser environment.");
}

export async function loadComicFolder() {
  if (isDesktop && electroview) {
    try {
      const result = await electroview.rpc.request.requestFilePicker({
        canChooseFiles: false, canChooseDirectory: true, allowsMultipleSelection: false
      });
      let selectedPath = null;
      if (typeof result === "string" && result !== "No file selected") {
        selectedPath = result;
      } else if (Array.isArray(result) && result.length > 0) {
        selectedPath = result[0];
      }
      if (!selectedPath) return null;
      return await electroview.rpc.request.scanDirectory(selectedPath);
    } catch (e) { return null; }
  }
  return null;
}

export async function getBackendSrgbImage(filepath) {
  if (isDesktop && electroview && typeof filepath === 'string') {
    try {
      return await electroview.rpc.request.getSrgbImage(filepath);
    } catch (e) { return null; }
  }
  return null;
}

export async function pickSingleFile() {
  if (isDesktop && electroview) {
    try {
      const result = await electroview.rpc.request.requestFilePicker({
        canChooseFiles: true, 
        canChooseDirectory: false, 
        allowsMultipleSelection: false
      });
      let selectedPath = null;
      if (typeof result === "string" && result !== "No file selected") {
        selectedPath = result;
      } else if (Array.isArray(result) && result.length > 0) {
        selectedPath = result[0];
      }
      return selectedPath;
    } catch (e) { 
      return null; 
    }
  }
  return null;
}

export async function getPsdLayers(filepath) {
  if (isDesktop && electroview && typeof filepath === 'string') {
    try {
      return await electroview.rpc.request.readPsdLayers(filepath);
    } catch (e) { 
      return null; 
    }
  }
  return null;
}

export async function getPsdHeaders(folderPath) {
  if (isDesktop && electroview && typeof folderPath === 'string') {
    try {
      return await electroview.rpc.request.scanPsdHeaders(folderPath);
    } catch (e) { 
      return null; 
    }
  }
  return null;
}

// NEW: Ask the user for a destination folder
export async function pickOutputDirectory() {
  if (isDesktop && electroview) {
    try {
      const result = await electroview.rpc.request.requestFilePicker({
        canChooseFiles: false,
        canChooseDirectory: true,
        allowsMultipleSelection: false
      });
      let selectedPath = null;
      if (typeof result === "string" && result !== "No file selected") {
        selectedPath = result;
      } else if (Array.isArray(result) && result.length > 0) {
        selectedPath = result[0];
      }
      return selectedPath;
    } catch (e) {
      return null;
    }
  }
  return null;
}

// NEW: Send the base64 string to the backend to be saved
export async function saveFileToDisk(filepath, base64) {
  if (isDesktop && electroview) {
    try {
      return await electroview.rpc.request.saveExportFile({ filepath, base64 });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: "Not running in desktop environment." };
}