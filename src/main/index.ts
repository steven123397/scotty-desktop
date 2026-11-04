import { app, dialog, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";

import { createLogger, type Logger } from "./log";
import { pickPort } from "./net";
import { resolveBd } from "./paths";
import { startServer, type ServerExit, type ServerHandle } from "./server";
import { startUpdater } from "./updater";
import { createMainWindow } from "./window";

const MAX_RESTARTS = 3;
const STABLE_UPTIME_MS = 60_000;

let mainWindow: BrowserWindow | null = null;
let serverHandle: ServerHandle | null = null;
let logger: Logger | null = null;
let serverPath = "";
let skinCssFile = "";
let bdPath: string | null = null;
let currentPort: number | null = null;
let restartCount = 0;
let serverGeneration = 0;
let lastStartAt = 0;
let handlingCrash = false;
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

  app.whenReady().then(bootstrap).catch(handleFatalStartup);
}

async function bootstrap(): Promise<void> {
  serverPath = resolveServerPath();
  skinCssFile = resolveSkinPath();
  logger = createLogger(
    path.join(app.getPath("appData"), "Scotty Desktop", "logs", "server.log"),
  );
  logger.info(`scotty-desktop starting (packaged=${app.isPackaged}, server=${serverPath})`);

  bdPath = resolveBd();
  if (bdPath === null) {
    logger.warn("bd not found on PATH; running in demo mode");
  } else {
    logger.info(`bd: ${bdPath}`);
  }

  currentPort = await pickPort();
  await startAndWatch();

  mainWindow = createMainWindow(currentPort, { skinCssFile });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  startUpdater({ isPackaged: app.isPackaged, logger, updater: autoUpdater, dialog });
}

async function startAndWatch(): Promise<void> {
  if (currentPort === null || logger === null) {
    throw new Error("bootstrap has not initialised the port and logger");
  }

  const handle = await startServer({
    serverPath,
    port: currentPort,
    bdPath,
    logger,
  });
  serverHandle = handle;
  lastStartAt = Date.now();

  const generation = ++serverGeneration;
  void handle.exited.then((exit) => {
    if (quitting || generation !== serverGeneration) {
      return;
    }
    void handleServerExit(exit);
  });
}

async function handleServerExit(exit: ServerExit): Promise<void> {
  if (quitting || handlingCrash) {
    return;
  }
  handlingCrash = true;
  serverHandle = null;

  try {
    if (Date.now() - lastStartAt >= STABLE_UPTIME_MS) {
      restartCount = 0;
    }
    logger?.error(
      `server exited unexpectedly (code=${exit.code ?? "null"}, signal=${exit.signal ?? "none"})`,
    );

    const canRestart = restartCount < MAX_RESTARTS;
    const buttons = canRestart ? ["重启服务", "退出应用"] : ["退出应用"];
    const summary = canRestart
      ? `重启尝试 ${restartCount + 1}/${MAX_RESTARTS}。`
      : `服务端已连续崩溃 ${MAX_RESTARTS} 次，自动重启已停止。`;
    const result = await dialog.showMessageBox({
      type: "error",
      title: "Scotty Desktop",
      message: "Scotty 服务端已停止",
      detail: `${summary}\n日志：${logger?.file ?? "(unknown)"}`,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      noLink: true,
    });

    if (!canRestart || result.response !== 0) {
      app.quit();
      return;
    }

    restartCount += 1;
    try {
      await startAndWatch();
      mainWindow?.webContents.reload();
      logger?.info(`server restarted (${restartCount}/${MAX_RESTARTS})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger?.error(`restart failed: ${message}`);
      handlingCrash = false;
      await handleServerExit({ code: null, signal: null });
    }
  } finally {
    handlingCrash = false;
  }
}

function handleFatalStartup(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logger?.error(`startup failed: ${message}`);
  dialog.showErrorBox("Scotty Desktop failed to start", message);
  app.quit();
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