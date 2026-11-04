import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(root, "scripts", "verify-server.mjs");
const FAKE_SERVER = path.join(root, "fixtures", "fake-server.mjs");

function runVerify(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
}

describe("verify-server", () => {
  it("exits 0 when the server answers GET / with 200", () => {
    const result = runVerify(["--server", FAKE_SERVER]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("200");
  });

  it("exits non-zero when the server answers with a non-200 status", () => {
    const result = runVerify(["--server", FAKE_SERVER, "--timeout", "2000"], {
      FAKE_STATUS: "500",
    });

    expect(result.status).not.toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toMatch(/did not answer/i);
  });
});