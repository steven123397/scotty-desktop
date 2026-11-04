/* global document */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "build", "server", "server.js");
const MAIN = path.join(ROOT, "dist-electron", "main.cjs");
const CONFIG = path.join(os.homedir(), ".config", "bead-me-up-scotty", "config.json");
const APP_DATA = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
const LOG = path.join(APP_DATA, "Scotty Desktop", "logs", "server.log");
const APP_TITLE = "Bead Me Up, Scotty";
const COLD_START_LIMIT_MS = 10_000;

function projectNames() {
  if (!existsSync(CONFIG)) {
    return [];
  }
  const config = JSON.parse(readFileSync(CONFIG, "utf8"));
  return (config.projects ?? []).map((project) => project.name).filter(Boolean);
}

function launchEnv(overrides = {}) {
  const env = { ...process.env };
  delete env.SCOTTY_SERVER_PATH;
  delete env.SCOTTY_SKIN_PATH;
  delete env.SCOTTY_NO_EXTERNAL_OPEN;
  return { ...env, ...overrides };
}

function logSize() {
  return existsSync(LOG) ? statSync(LOG).size : 0;
}

function logSince(offset) {
  if (!existsSync(LOG)) {
    return "";
  }
  const buffer = readFileSync(LOG);
  return buffer.subarray(Math.min(offset, buffer.length)).toString("utf8");
}

async function waitForLauncher(page) {
  await page.waitForFunction((title) => document.title === title, APP_TITLE, {
    timeout: 60_000,
  });
}

function leftoverServerProcesses() {
  if (process.platform !== "win32") {
    return 0;
  }
  const script =
    `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*${SERVER}*' } | ` +
    `Measure-Object | Select-Object -ExpandProperty Count`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
  });
  return Number(result.stdout.trim() || "0");
}

async function expectNoServerProcesses() {
  const deadline = Date.now() + 5000;
  let count = leftoverServerProcesses();
  while (count !== 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    count = leftoverServerProcesses();
  }
  if (count !== 0) {
    throw new Error(`${count} server process(es) still running after quit`);
  }
  console.log("no server processes after quit");
}

async function phaseRealScotty() {
  const names = projectNames();
  console.log(`config: ${CONFIG}`);
  console.log(`projects: ${names.join(", ") || "(none)"}`);

  const startedAt = Date.now();
  const app = await electron.launch({ args: [ROOT], env: launchEnv() });
  try {
    const page = await app.firstWindow();
    await waitForLauncher(page);
    for (const name of names) {
      await page.getByText(name, { exact: true }).first().waitFor({
        state: "visible",
        timeout: 60_000,
      });
    }
    const elapsed = Date.now() - startedAt;
    console.log(`cold start: ${elapsed}ms (limit ${COLD_START_LIMIT_MS}ms)`);
    if (elapsed >= COLD_START_LIMIT_MS) {
      throw new Error(`cold start took ${elapsed}ms, over the ${COLD_START_LIMIT_MS}ms limit`);
    }
    console.log(`projects visible in UI: ${names.length}/${names.length}`);
    console.log(
      "manual check: open a project, change one bead's status in the UI, then run `bd show <id>` in that repo and compare.",
    );
  } finally {
    await app.close();
  }
  await expectNoServerProcesses();
}

async function phaseWithoutBd() {
  const offset = logSize();
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const env = launchEnv({
    PATH: [path.join(systemRoot, "System32"), systemRoot].join(path.delimiter),
  });
  delete env.BD_BIN;

  const app = await electron.launch({ args: [ROOT], env });
  try {
    const page = await app.firstWindow();
    await waitForLauncher(page);

    const appended = logSince(offset);
    if (!/WARN bd not found on PATH/.test(appended)) {
      throw new Error(`expected a bd warning in ${LOG}`);
    }
    console.log("bd missing: app started and logged a warning");
  } finally {
    await app.close();
  }
}

async function main() {
  if (!existsSync(SERVER)) {
    throw new Error(`build/server missing at ${SERVER}; run npm run build:server first`);
  }
  if (!existsSync(MAIN)) {
    throw new Error(`main process bundle missing at ${MAIN}; run npm run build:main first`);
  }

  await phaseRealScotty();
  await phaseWithoutBd();
  console.log("e2e-real: ok");
}

try {
  await main();
} catch (error) {
  console.error(`e2e-real failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}