import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createLogger } from "../../src/main/log";
import { pickPort } from "../../src/main/net";
import { startServer } from "../../src/main/server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FAKE_SERVER = path.join(root, "fixtures", "fake-server.mjs");
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "scotty-server-"));
  tempDirs.push(dir);
  return dir;
}

async function expectPortFree(port: number): Promise<void> {
  const deadline = Date.now() + 3000;
  for (;;) {
    try {
      await new Promise<void>((resolve, reject) => {
        const probe = createServer();
        probe.once("error", reject);
        probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
      });
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("startServer", () => {
  it("starts the fixture server and becomes ready within 3 seconds", async () => {
    const logger = createLogger(path.join(tempDir(), "server.log"));
    const port = await pickPort();

    const startedAt = Date.now();
    const handle = await startServer({
      serverPath: FAKE_SERVER,
      port,
      bdPath: null,
      logger,
      readyTimeoutMs: 10_000,
    });
    const elapsed = Date.now() - startedAt;

    try {
      expect(elapsed).toBeLessThan(3000);
      expect(handle.port).toBe(port);
      const response = await fetch(handle.url);
      expect(response.status).toBe(200);
    } finally {
      await handle.stop();
    }
  });

  it("logs the start command, child output and exit code", async () => {
    const logger = createLogger(path.join(tempDir(), "server.log"));
    const port = await pickPort();

    const handle = await startServer({
      serverPath: FAKE_SERVER,
      port,
      bdPath: null,
      logger,
    });
    await handle.stop();

    const log = readFileSync(logger.file, "utf8");
    expect(log).toContain("starting server");
    expect(log).toContain("fake-server.mjs");
    expect(log).toContain("server exited");
    expect(log).toMatch(/server exited: code=(null|\d+) signal=\S+/);
  });

  it("stops the child so the port is free again", async () => {
    const logger = createLogger(path.join(tempDir(), "server.log"));
    const port = await pickPort();

    const handle = await startServer({
      serverPath: FAKE_SERVER,
      port,
      bdPath: null,
      logger,
    });
    await handle.stop();

    await expectPortFree(port);
  });

  it("fails with a diagnostic message pointing at the log when never ready", async () => {
    const logger = createLogger(path.join(tempDir(), "server.log"));
    const port = await pickPort();

    await expect(
      startServer({
        serverPath: FAKE_SERVER,
        port,
        bdPath: null,
        logger,
        readyTimeoutMs: 1500,
        baseEnv: { ...process.env, FAKE_STATUS: "500" },
      }),
    ).rejects.toThrow(logger.file);

    await expectPortFree(port);
  });
});