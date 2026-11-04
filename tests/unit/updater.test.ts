import { describe, expect, it } from "vitest";

import type { Logger } from "../../src/main/log";
import {
  CHECK_INTERVAL_MS,
  INITIAL_CHECK_DELAY_MS,
  startUpdater,
  type DialogLike,
  type MessageBoxLikeOptions,
  type TimerApi,
  type UpdaterLike,
} from "../../src/main/updater";

interface FakeLogger extends Logger {
  lines: string[];
}

function fakeLogger(): FakeLogger {
  const lines: string[] = [];
  return {
    file: "test.log",
    lines,
    info: (message) => lines.push(`INFO ${message}`),
    warn: (message) => lines.push(`WARN ${message}`),
    error: (message) => lines.push(`ERROR ${message}`),
    raw: (chunk) => lines.push(`RAW ${chunk}`),
  };
}

class FakeUpdater implements UpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = true;
  checks = 0;
  installs = 0;
  checkResult: Promise<unknown> = Promise.resolve(null);
  private listeners = new Map<string, Array<(payload: unknown) => void>>();

  on(event: string, listener: (payload: unknown) => void): unknown {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  checkForUpdates(): Promise<unknown> {
    this.checks += 1;
    return this.checkResult;
  }

  quitAndInstall(): void {
    this.installs += 1;
  }

  emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}

class FakeTimers implements TimerApi {
  private pending: Array<{ callback: () => void; delayMs: number }> = [];

  setTimeout(callback: () => void, delayMs: number): unknown {
    this.pending.push({ callback, delayMs });
    return this.pending.length;
  }

  get delays(): number[] {
    return this.pending.map((entry) => entry.delayMs);
  }

  get count(): number {
    return this.pending.length;
  }

  runNext(): void {
    const next = this.pending.shift();
    if (!next) {
      throw new Error("no pending timer");
    }
    next.callback();
  }
}

class FakeDialog implements DialogLike {
  response = 0;
  calls: MessageBoxLikeOptions[] = [];

  async showMessageBox(options: MessageBoxLikeOptions): Promise<{ response: number }> {
    this.calls.push(options);
    return { response: this.response };
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("startUpdater", () => {
  it("does nothing in a development build", () => {
    const updater = new FakeUpdater();
    const timers = new FakeTimers();

    startUpdater({
      isPackaged: false,
      logger: fakeLogger(),
      updater,
      dialog: new FakeDialog(),
      timers,
    });

    expect(timers.count).toBe(0);
    expect(updater.checks).toBe(0);
    expect(updater.autoDownload).toBe(false);
  });

  it("configures the updater and checks after the initial delay, then every six hours", () => {
    const updater = new FakeUpdater();
    const timers = new FakeTimers();

    startUpdater({
      isPackaged: true,
      logger: fakeLogger(),
      updater,
      dialog: new FakeDialog(),
      timers,
    });

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.allowPrerelease).toBe(false);
    expect(timers.delays[0]).toBe(INITIAL_CHECK_DELAY_MS);

    timers.runNext();

    expect(updater.checks).toBe(1);
    expect(timers.delays[0]).toBe(CHECK_INTERVAL_MS);
  });

  it("prompts once after a download and installs when restart is chosen", async () => {
    const updater = new FakeUpdater();
    const dialog = new FakeDialog();
    const logger = fakeLogger();
    startUpdater({ isPackaged: true, logger, updater, dialog, timers: new FakeTimers() });

    updater.emit("update-downloaded", { version: "0.2.0" });
    await flush();

    expect(dialog.calls).toHaveLength(1);
    expect(dialog.calls[0]?.buttons).toEqual(["重启安装", "退出时安装"]);
    expect(dialog.calls[0]?.message).toContain("0.2.0");
    expect(updater.installs).toBe(1);

    updater.emit("update-downloaded", { version: "0.2.0" });
    await flush();

    expect(dialog.calls).toHaveLength(1);
  });

  it("defers installation when the user chooses to quit later", async () => {
    const updater = new FakeUpdater();
    const dialog = new FakeDialog();
    const logger = fakeLogger();
    dialog.response = 1;
    startUpdater({ isPackaged: true, logger, updater, dialog, timers: new FakeTimers() });

    updater.emit("update-downloaded", { version: "0.2.0" });
    await flush();

    expect(updater.installs).toBe(0);
    expect(logger.lines.some((line) => line.includes("on exit"))).toBe(true);
  });

  it("logs update events without showing dialogs", () => {
    const updater = new FakeUpdater();
    const dialog = new FakeDialog();
    const logger = fakeLogger();
    startUpdater({ isPackaged: true, logger, updater, dialog, timers: new FakeTimers() });

    updater.emit("update-available", { version: "0.2.0" });
    updater.emit("update-not-available", { version: "0.1.0" });
    updater.emit("download-progress", { percent: 42.4 });
    updater.emit("error", new Error("network down"));

    expect(logger.lines.some((line) => line.includes("available 0.2.0"))).toBe(true);
    expect(logger.lines.some((line) => line.includes("not available 0.1.0"))).toBe(true);
    expect(logger.lines.some((line) => line.includes("downloading 42%"))).toBe(true);
    expect(logger.lines.some((line) => line.includes("network down"))).toBe(true);
    expect(dialog.calls).toHaveLength(0);
  });

  it("logs a failed check without throwing", async () => {
    const updater = new FakeUpdater();
    const timers = new FakeTimers();
    const logger = fakeLogger();
    updater.checkResult = Promise.reject(new Error("feed unreachable"));
    startUpdater({ isPackaged: true, logger, updater, dialog: new FakeDialog(), timers });

    timers.runNext();
    await flush();

    expect(logger.lines.some((line) => line.includes("feed unreachable"))).toBe(true);
  });
});