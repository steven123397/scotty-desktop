import { app, dialog, type BrowserWindow } from "electron";
import path from "node:path";

import { createLogger } from "./log";
import { pickPort } from "./net";
import { resolveBd } from "./paths";
import { startServer, type ServerHandle } from "./server";
import { createMainWindow } from "./window";

let mainWindow: BrowserWindow | null = null;
let serverHandle: ServerHandle | null = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow === null) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", (event) => {
    if (quitting || serverHandle === null) {
      return;
    }
    event.preventDefault();
    quitting = true;
    const handle = serverHandle;
    serverHandle = null;
    void handle.stop().finally(() => app.quit());
  });

  app
    .whenReady()
    .then(bootstrap)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox("Scotty Desktop failed to start", message);
      app.quit();
    });
}

async function bootstrap(): Promise<void> {
  const serverPath = resolveServerPath();
  const skinCssFile = resolveSkinPath();
  const logger = createLogger(
    path.join(app.getPath("appData"), "Scotty Desktop", "logs", "server.log"),
  );
  logger.info(`scotty-desktop starting (packaged=${app.isPackaged}, server=${serverPath})`);

  const port = await pickPort();
  const bdPath = resolveBd();
  logger.info(`bd: ${bdPath ?? "not found (demo mode)"}`);

  serverHandle = await startServer({ serverPath, port, bdPath, logger });
  mainWindow = createMainWindow(port, { skinCssFile });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function resolveServerPath(): string {
  const override = process.env.SCOTTY_SERVER_PATH;
  if (override) {
    return path.resolve(override);
  }
  return app.isPackaged
    ? path.join(process.resourcesPath, "server", "server.js")
    : path.join(app.getAppPath(), "build", "server", "server.js");
}

function resolveSkinPath(): string {
  const override = process.env.SCOTTY_SKIN_PATH;
  if (override) {
    return path.resolve(override);
  }
  return app.isPackaged
    ? path.join(process.resourcesPath, "skin.css")
    : path.join(app.getAppPath(), "assets", "skin.css");
}