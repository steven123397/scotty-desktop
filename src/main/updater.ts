import { app } from "electron";
import { autoUpdater } from "electron-updater";

import type { Logger } from "./log";

export interface SpikeUpdaterOptions {
  logger: Logger;
  feedUrl?: string;
}

/**
 * Spike-only updater entry (scd-3o0). Enabled by SCOTTY_UPDATE_SPIKE=1 in a
 * packaged build; scd-350 replaces this with the scheduled updater + prompts.
 */
export function startSpikeUpdater(options: SpikeUpdaterOptions): void {
  const { logger } = options;
  if (!app.isPackaged) {
    logger.info("updater: skipped (not packaged)");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  if (options.feedUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: options.feedUrl });
    logger.info(`updater: feed ${options.feedUrl}`);
  }

  autoUpdater.on("checking-for-update", () => logger.info("updater: checking for update"));
  autoUpdater.on("update-available", (info) => logger.info(`updater: available ${info.version}`));
  autoUpdater.on("update-not-available", (info) =>
    logger.info(`updater: not available ${info.version}`),
  );
  autoUpdater.on("download-progress", (progress) =>
    logger.info(`updater: downloading ${Math.round(progress.percent)}%`),
  );
  autoUpdater.on("update-downloaded", (info) => {
    logger.info(`updater: downloaded ${info.version}; installing`);
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 1000);
  });
  autoUpdater.on("error", (error) => logger.error(`updater: error ${error.message}`));

  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    logger.error(
      `updater: check failed ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}