import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "comiquero",
		identifier: "comiquero.electrobun.dev",
		version: "1.0.0",
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
			icons: "assets/comiqueroIcon.iconset",
		},
		linux: {
			bundleCEF: false,
			icon: "assets/icon.png",
		},
		win: {
			bundleCEF: false,
			icon: "assets/icon.svg",
		},
	},
} satisfies ElectrobunConfig;
