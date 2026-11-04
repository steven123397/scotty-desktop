import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(root, "scripts", "build-server.mjs");
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "scotty-build-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("build-server", () => {
  it("exits non-zero and points at the build log when the build fails", () => {
    const scratch = tempDir();
    const upstream = path.join(scratch, "upstream");
    const log = path.join(scratch, "build.log");
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        "--upstream",
        upstream,
        "--out",
        path.join(scratch, "out"),
        "--log",
        log,
      ],
      { encoding: "utf8", timeout: 120_000, env: process.env },
    );

    expect(result.status).not.toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain(log);
    expect(output).toMatch(/failed/i);
  });
});