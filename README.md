# comiquero

A lightweight, cross-platform prepress and spot-color separation tool built for indie publishers, comic creators, and printmakers. It bridges the gap between digital illustration and physical printing by offering non-destructive batch resizing, resilient PSD layer routing, and procedural halftone generation—all processed entirely locally.

---

## Installation (Pre-built Binaries)

Download the latest release archive for your operating system from the Releases page and extract it.

### macOS Gatekeeper Fix (App is damaged / Cannot be opened)

Because the pre-built macOS binary is ad-hoc signed and downloaded directly from the web, macOS assigns it a strict quarantine attribute. To bypass this and run the app:

1. Extract the downloaded `.zip` file.


2. Open **Terminal**.


3. Type the following command followed by a space (do not hit Enter yet):
`sudo xattr -cr `


4. Drag and drop `comiquero.app` from Finder directly into the Terminal window to complete the path.


5. Press **Enter**, input your Mac administrator password when prompted, and press **Enter** again.


6. Double-click `comiquero.app` to launch.



*(If the app still prompts a gatekeeper error, re-apply a local ad-hoc signature with: `codesign --force --deep -s - /path/to/comiquero.app`)*.

---

## Building from Source

If you prefer to compile the application yourself, you will need **[Bun](https://bun.sh/)** installed.

### Prerequisites

* **macOS:** Install the Xcode Command Line Tools by running `xcode-select --install` in your terminal.


* **Linux (Debian/Ubuntu/Mint):** You need WebKit2GTK and standard build essentials. Run:
`sudo apt-get update && sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev`


* **Linux (Arch):** Install the equivalents via pacman (`base-devel`, `pkgconf`, `webkit2gtk`).
* **Windows:** Standard C++ build tools and Node/Bun environment are required.



### Setup & Compilation Steps

1. **Clone the repository:**
`git clone [https://github.com/your-username/comiquero.git](https://github.com/your-username/comiquero.git)`


`cd comiquero`

2. **Install dependencies:**
`bun install`

3. **Run in development mode:** Launch the app with live reload to test changes.
`bun run dev`


4. **Build release binaries:**
`bun run build:stable`


The compiled binaries will be output to the `build/` directory matching your platform target. Inside, you will find the standalone executable folder ready to zip and distribute.

---

## The Workflow

comiquero operates sequentially from top to bottom. Load a folder containing your comic pages (supporting raw images and multi-layered PSDs), and move through the tools to prepare your print plates.

### 1. Preflight (Batch Resizing)

Halftone frequencies (Lines Per Inch) are directly tied to your document's physical pixel grid. Scaling an image *after* generating halftones will crush the dots and cause severe moiré patterns on the press.

* **Physical Units:** Enter your target print dimensions (e.g., 6 × 9 inches, millimeters, centimeters, or pixels) and your target DPI (e.g., 300). The app dynamically calculates the precise pixel grid.


* **Scaling Methods:** Choose whether to **Fit** (preserve aspect ratio and pad with white), **Fill** (crop to aspect ratio), or **Stretch** your pages.


* **Apply:** Clicking **Apply to Folder** normalizes all pages in memory instantly using hardware-accelerated offscreen canvases.



### 2. Spot Mapper (PSD Mode)

When working with layered PSD files, the Spot Mapper allows you to assign specific layers to custom physical ink colors (such as Riso inks or CMYK plates).

* **Layer Organizer:** The app scans all loaded PSDs in the folder and compiles a master list of unique layer names.


* **Aliases:** If a layer name is misspelled on a specific page (e.g., `rd ink` instead of `red ink`), enter `rd ink` as a comma-separated alias next to the master `red ink` layer. The engine will seamlessly merge them into a single routing row.


* **Strict Index Mode:** Toggle from **Resilient (Name)** to **Strict (Index)** mode to completely ignore layer names and route strictly by numerical stack order (Layer 1, Layer 2, etc.).



### 3. The Routing Matrix

Map your master layers to target ink opacities and visual textures.

* **Solid & Procedural Textures:** Assign standard flat opacities, or inject procedural grid, line, and dot patterns directly into the layer's channel.


* **Luma-to-Alpha (`L` Toggle):** Designed for expressive, painterly layers where artists used lighter color values instead of brush opacity. Clicking the **L** button anchors the darkest pixel in the layer as 100% solid ink and automatically normalizes all lighter strokes into transparency gradients for spot color mixdown.


* **Mute/Bypass (`M` Toggle):** Use the **M** button in the organizer to completely hide and bypass a layer from processing without deleting its matrix mapping.



### 4. Export

Switch to the Export panel to produce print-ready plates. comiquero generates perfectly registered, separated grayscale or pre-tinted plates matching your target Preflight dimensions, ready to be sent to your RIP software, screen printer, or risograph.