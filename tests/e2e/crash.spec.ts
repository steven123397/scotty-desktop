import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FAKE_SERVER = path.join(root, "fixtures", "fake-server.mjs");

function launchEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return {
    ...env,
    SCOTTY_SERVER_PATH: FAKE_SERVER,
    SCOTTY_NO_EXTERNAL_OPEN: "1",
    FAKE_EXIT_AFTER_MS: "4000",
    ...extra,
  };
}

interface RecordedDialog {
  buttons?: string[];
  message?: string;
  detail?: string;
}

async function installDialogStub(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }) => {
    const scope = globalThis as typeof globalThis & { __scottyDialogs?: RecordedDialog[] };
    scope.__scottyDialogs = [];
    const stub = dialog as unknown as {
      showMessageBox: (options: RecordedDialog) => Promise<{
        response: number;
        checkboxChecked: boolean;
      }>;
    };
    stub.showMessageBox = async (options) => {
      scope.__scottyDialogs?.push({ ...options });
      if ((options.buttons ?? []).length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      return { response: 0, checkboxChecked: false };
    };
  });
}

async function recordedDialogs(app: ElectronApplication): Promise<RecordedDialog[]> {
  return app.evaluate(() => {
    const scope = globalThis as typeof globalThis & { __scottyDialogs?: RecordedDialog[] };
    return scope.__scottyDialogs ?? [];
  });
}

function leftoverServerProcesses(): number {
  const script = [
    `Get-CimInstance Win32_Process -Filter "Name='electron.exe'"`,
    `| Where-Object { $_.CommandLine -like '*fake-server.mjs*' }`,
    `| Measure-Object | Select-Object -ExpandProperty Count`,
  ].join(" ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
  });
  return Number(result.stdout.trim() || "0");
}

test("offers a restart after a crash and stops after three consecutive crashes", async () => {
  const userData = mkdtempSync(path.join(os.tmpdir(), "scotty-e2e-"));
  const app = await electron.launch({
    args: [`--user-data-dir=${userData}`, root],
    env: launchEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator("#fixture")).toBeVisible();
    await installDialogStub(app);

    await expect
      .poll(async () => (await recordedDialogs(app)).length, { timeout: 45_000 })
      .toBeGreaterThanOrEqual(4);

    const dialogs = await recordedDialogs(app);
    expect(dialogs[0]?.buttons).toEqual(["重启服务", "退出应用"]);
    expect(dialogs[2]?.buttons).toEqual(["重启服务", "退出应用"]);
    expect(dialogs[3]?.buttons).toEqual(["退出应用"]);

    await expect
      .poll(
        () => {
          try {
            return app.windows().length;
          } catch {
            return 0;
          }
        },
        { timeout: 15_000 },
      )
      .toBe(0);
  } finally {
    await app.close().catch(() => undefined);
    rmSync(userData, { recursive: true, force: true });
  }

  expect(leftoverServerProcesses()).toBe(0);
});