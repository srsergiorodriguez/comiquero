import { BrowserWindow, BrowserView, Utils, Updater } from "electrobun/bun";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, extname } from "path";
import sharp from 'sharp';
import { initializeImageMagick, ImageMagick, MagickFormat, MagickReadSettings } from '@imagemagick/magick-wasm';
import { createRequire } from "module";

// Create a require function to resolve the physical path of the WASM file inside node_modules
const require = createRequire(import.meta.url);
const wasmPath = require.resolve('@imagemagick/magick-wasm/magick.wasm');

// Read the raw binary file
const wasmBytes = readFileSync(wasmPath);

// Feed the raw bytes directly into the engine, bypassing the fetch() error
await initializeImageMagick(wasmBytes);

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const backendRPC = BrowserView.defineRPC({
  handlers: {
    requests: {
      requestFilePicker: async (options) => {
        const opts = options || {};
        let fileTypesString = "*";
        if (Array.isArray(opts.allowedFileTypes) && opts.allowedFileTypes.length > 0) {
          fileTypesString = opts.allowedFileTypes.join(",");
        } else if (typeof opts.allowedFileTypes === "string") {
          fileTypesString = opts.allowedFileTypes;
        }
        try {
          return await Utils.openFileDialog({
            canChooseFiles: opts.canChooseFiles ?? true,
            canChooseDirectory: opts.canChooseDirectory ?? false,
            allowsMultipleSelection: opts.allowsMultipleSelection ?? false,
            allowedFileTypes: fileTypesString 
          });
        } catch (err) { return null; }
      },

      scanDirectory: (folderPath) => {
        try {
          const files = readdirSync(folderPath);
          
          const supportedFiles = files.filter(file => {
            const ext = extname(file).toLowerCase();
            return ext === '.tif' || ext === '.tiff' || ext === '.psd' || ext === '.png' || ext === '.jpg' || ext === '.jpeg';
          });
          
          return {
            success: true,
            folderPath,
            files: supportedFiles.map(file => ({ 
              name: file, 
              path: join(folderPath, file),
              isPsd: extname(file).toLowerCase() === '.psd' 
            }))
          };
        } catch (err) { 
          return { success: false, error: err.message }; 
        }
      },

      getSrgbImage: async (filepath) => {
        try {
          const ext = extname(filepath).toLowerCase();
          
          if (ext === '.psd') {
            const buffer = readFileSync(filepath);
            let result = null;
            
            // ImageMagick.read (unlike readCollection) automatically grabs only the flattened composite preview
            ImageMagick.read(buffer, (image) => {
              image.write(MagickFormat.Png, (data) => {
                result = Buffer.from(data).toString('base64');
              });
            });
            
            return result;
          } else {
            // Standard TIFF processing
            const pngBuffer = await sharp(filepath).png().toBuffer();
            return pngBuffer.toString('base64');
          }
        } catch (err) {
          console.error(`Failed to process ${filepath}:`, err);
          return null;
        }
      },

      readRawFile: (filepath) => {
        try {
          const buffer = readFileSync(filepath);
          return buffer.toString('base64');
        } catch (error) {
          console.error("Failed to read raw file:", error);
          return null;
        }
      },

      scanPsdHeaders: (folderPath) => {
        try {
          const files = readdirSync(folderPath);
          const psdFiles = files.filter(file => extname(file).toLowerCase() === '.psd');
          
          const layerMap = {};
          const uniqueLayers = new Set();

          const settings = new MagickReadSettings();
          settings.ping = true; 

          for (const file of psdFiles) {
            const filepath = join(folderPath, file);
            const buffer = readFileSync(filepath);
            
            const names = [];
            
            ImageMagick.readCollection(buffer, settings, (images) => {
              // Index 0 is the composite image; skip it to match readPsdLayers
              for (let i = 1; i < images.length; i++) {
                const label = images[i].getAttribute('label');
                const layerName = label ? label : `Layer ${i}`;
                
                names.push(layerName);
                uniqueLayers.add(layerName);
              }
            });
            
            layerMap[file] = names;
          }

          return { 
            success: true, 
            layerMap, 
            uniqueLayers: Array.from(uniqueLayers) 
          };
        } catch (error) {
          console.error("Failed to scan PSD headers with WASM:", error);
          return { success: false, error: error.message };
        }
      },

      readPsdLayers: (filepath) => {
        try {
          const buffer = readFileSync(filepath);
          const extractedLayers: any[] = [];
          let docWidth = 0;
          let docHeight = 0;
          
          ImageMagick.readCollection(buffer, (images) => {
            images.forEach((image, index) => {
              if (index === 0 && images.length > 1) {
                docWidth = image.width;
                docHeight = image.height;
                return; 
              }
              
              // Extract the actual label attribute matching scanPsdHeaders
              const label = image.getAttribute('label');
              const layerName = label ? label : `Layer ${index}`;
              
              image.write(MagickFormat.Png, (data) => {
                extractedLayers.push({
                  name: layerName,
                  width: image.width,
                  height: image.height,
                  left: image.page.x,
                  top: image.page.y,
                  base64: Buffer.from(data).toString('base64')
                });
              });
            });
          });
          
          return {
            width: docWidth,
            height: docHeight,
            layers: extractedLayers
          };
          
        } catch (error) {
          console.error("Failed to parse PSD layers with ImageMagick:", error);
          return null;
        }
      },
      
      saveExportFile: (data) => {
        try {
          const { filepath, base64 } = data;
          
          // Strip the "data:image/png;base64," prefix if the frontend happens to send it
          const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(cleanBase64, 'base64');
          
          // Write the raw bytes directly to the hard drive
          writeFileSync(filepath, buffer);
          
          return { success: true, filepath };
        } catch (error) {
          console.error("Failed to save file:", error);
          return { success: false, error: error.message };
        }
      },
    },
    messages: {}
  }
});

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      return DEV_SERVER_URL;
    } catch { }
  }
  return "views://mainview/index.html";
}

const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
  title: "comiquero",
  url,
  frame: { width: 1920, height: 1080, x: 200, y: 200 },
  styleMask: { Borderless: true, Titled: true, Closable: true, Miniaturizable: true, Resizable: true },
  rpc: backendRPC 
});