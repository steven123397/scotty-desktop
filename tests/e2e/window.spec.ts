/// <reference lib="dom" />

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FAKE_SERVER = path.join(root, "fixtures", "fake-server.mjs");
const require = createRequire(import.meta.url);

function launchEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return { ...env, SCOTTY_SERVER_PATH: FAKE_SERVER, SCOTTY_NO_EXTERNAL_OPEN: "1", ...extra };
}

function createUserData(): string {
  return mkdtempSync(path.join(os.tmpdir(), "scotty-e2e-"));
}

function launchArgs(userData: string): string[] {
  return [`--user-data-dir=${userData}`, root];
}

async function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({ args: launchArgs(userData), env: launchEnv() });
}

test("shows the fixture page in the window", async () => {
  const userData = createUserData();
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await expect(page.locator("#fixture")).toHaveText("fake scotty server");
    expect(await page.title()).toBe("Fake Scotty");
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});

test("keeps the window on the local origin when an external link is clicked", async () => {
  const userData = createUserData();
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await expect(page.locator("#fixture")).toBeVisible();
    const before = page.url();

    await page.evaluate(() => {
      window.location.href = "https://example.com/";
    });
    await page.waitForTimeout(1000);

    expect(page.url()).toBe(before);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});

test("exits a second instance instead of starting another server", async () => {
  const userData = createUserData();
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await expect(page.locator("#fixture")).toBeVisible();

    const electronPath = require("electron") as string;
    const second = spawn(electronPath, launchArgs(userData), {
      env: launchEnv(),
      stdio: "ignore",
    });
    const exitCode = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        second.kill();
        resolve(-1);
      }, 15_000);
      second.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    expect(exitCode).toBe(0);
    expect(await page.title()).toBe("Fake Scotty");
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});

test("injects skin.css when it has content", async () => {
  const userData = createUserData();
  const skinDir = mkdtempSync(path.join(os.tmpdir(), "scotty-skin-"));
  const skin = path.join(skinDir, "skin.css");
  writeFileSync(skin, "body { background-color: rgb(1, 2, 3); }\n");

  const app = await electron.launch({
    args: launchArgs(userData),
    env: launchEnv({ SCOTTY_SKIN_PATH: skin }),
  });
  try {
    const page = await app.firstWindow();
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe("rgb(1, 2, 3)");
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
    rmSync(skinDir, { recursive: true, force: true });
  }
});