import type { Logger } from "./log";

export const INITIAL_CHECK_DELAY_MS = 10_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const PROMPT_BUTTONS = ["重启安装", "退出时安装"];

export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  on(event: string, listener: (payload: unknown) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface MessageBoxLikeOptions {
  type?: string;
  title?: string;
  message?: string;
  detail?: string;
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
  noLink?: boolean;
}

export interface DialogLike {
  showMessageBox(options: MessageBoxLikeOptions): Promise<{ response: number }>;
}

export interface TimerApi {
  setTimeout(callback: () => void, delayMs: number): unknown;
}

export interface StartUpdaterOptions {
  isPackaged: boolean;
  logger: Logger;
  updater: UpdaterLike;
  dialog: DialogLike;
  timers?: TimerApi;
  initialDelayMs?: number;
  intervalMs?: number;
}

/**
 * Wires electron-updater: packaged builds only, first check after 10 seconds,
 * then every 6 hours. Failures are logged; the only dialog is the one shown
 * after a download completes.
 */
export function startUpdater(options: StartUpdaterOptions): void {
  const { updater, logger } = options;

  if (!options.isPackaged) {
    logger.info("updater: disabled (not packaged)");
    return;
  }

  const timers = options.timers ?? {
    setTimeout: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
  };
  const initialDelayMs = options.initialDelayMs ?? INITIAL_CHECK_DELAY_MS;
  const intervalMs = options.intervalMs ?? CHECK_INTERVAL_MS;

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;

  let promptedVersion: string | null = null;

  updater.on("checking-for-update", () => logger.info("updater: checking for update"));
  updater.on("update-available", (payload) =>
    logger.info(`updater: available ${versionOf(payload)}`),
  );
  updater.on("update-not-available", (payload) =>
    logger.info(`updater: not available ${versionOf(payload)}`),
  );
  updater.on("download-progress", (payload) =>
    logger.info(`updater: downloading ${percentOf(payload)}%`),
  );
  updater.on("update-downloaded", (payload) => {
    const version = versionOf(payload);
    logger.info(`updater: downloaded ${version}`);
    if (promptedVersion === version) {
      return;
    }
    promptedVersion = version;
    void promptInstall(options, version);
  });
  updater.on("error", (payload) => logger.error(`updater: error ${messageOf(payload)}`));

  const check = (): void => {
    void updater.checkForUpdates().catch((error: unknown) => {
      logger.error(
        `updater: check failed ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };

  const schedule = (delayMs: number): void => {
    timers.setTimeout(() => {
      check();
      schedule(intervalMs);
    }, delayMs);
  };

  schedule(initialDelayMs);
}

async function promptInstall(options: StartUpdaterOptions, version: string): Promise<void> {
  const { updater, logger } = options;
  try {
    const result = await options.dialog.showMessageBox({
      type: "info",
      title: "Scotty Desktop",
      message: `新版本 ${version} 已下载`,
      detail: "可以立即重启安装，或在退出应用时自动安装。",
      buttons: PROMPT_BUTTONS,
      defaultId: 0,
      cancelId: PROMPT_BUTTONS.length - 1,
      noLink: true,
    });

    if (result.response === 0) {
      logger.info("updater: installing now");
      updater.quitAndInstall(true, true);
      return;
    }

    logger.info("updater: update will install on exit");
    updater.autoInstallOnAppQuit = true;
  } catch (error: unknown) {
    logger.error(
      `updater: prompt failed ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function versionOf(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "version" in payload) {
    const version = (payload as { version?: unknown }).version;
    if (typeof version === "string") {
      return version;
    }
  }
  return "unknown";
}

function percentOf(payload: unknown): number {
  if (typeof payload === "object" && payload !== null && "percent" in payload) {
    const percent = (payload as { percent?: unknown }).percent;
    if (typeof percent === "number") {
      return Math.round(percent);
    }
  }
  return 0;
}

function messageOf(payload: unknown): string {
  if (payload instanceof Error) {
    return payload.message;
  }
  return String(payload);
}