import { BrowserWindow, shell } from "electron";

import { isAllowedUrl, isExternalHttpUrl, readSkinCss } from "./window-rules";

export interface MainWindowOptions {
  skinCssFile: string;
}

/** Creates the Scotty window, locks it to the local origin and applies the skin. */
export function createMainWindow(port: number, options: MainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    title: "Bead Me Up, Scotty",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const origin = `http://127.0.0.1:${port}`;

  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedUrl(url, port)) {
      return;
    }
    event.preventDefault();
    openExternal(url);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("dom-ready", () => {
    const css = readSkinCss(options.skinCssFile);
    if (css !== null) {
      void window.webContents.insertCSS(css);
    }
  });

  void window.loadURL(`${origin}/`);
  return window;
}

function openExternal(url: string): void {
  if (process.env.SCOTTY_NO_EXTERNAL_OPEN === "1") {
    return;
  }
  if (!isExternalHttpUrl(url)) {
    return;
  }
  void shell.openExternal(url);
}