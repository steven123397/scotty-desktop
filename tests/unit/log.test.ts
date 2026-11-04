import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLogger } from "../../src/main/log";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "scotty-log-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createLogger", () => {
  it("appends timestamped lines to the log file", () => {
    const file = path.join(tempDir(), "server.log");
    const logger = createLogger(file);

    logger.info("starting server");
    logger.warn("bd not found");
    logger.error("something broke");

    const log = readFileSync(file, "utf8");
    expect(log).toMatch(/^\d{4}-\d{2}-\d{2}T[^\s]+ INFO starting server$/m);
    expect(log).toMatch(/ WARN bd not found$/m);
    expect(log).toMatch(/ ERROR something broke$/m);
  });

  it("creates the parent directory when it does not exist", () => {
    const file = path.join(tempDir(), "nested", "logs", "server.log");
    const logger = createLogger(file);

    logger.info("hello");

    expect(readFileSync(file, "utf8")).toContain("hello");
  });

  it("rotates the log once it reaches the size limit", () => {
    const file = path.join(tempDir(), "server.log");
    writeFileSync(file, "x".repeat(20));
    const logger = createLogger(file, 10);

    logger.info("after rotation");

    expect(existsSync(`${file}.1`)).toBe(true);
    expect(readFileSync(`${file}.1`, "utf8")).toBe("x".repeat(20));
    expect(readFileSync(file, "utf8")).toContain("after rotation");
  });

  it("keeps only two log files across repeated rotations", () => {
    const file = path.join(tempDir(), "server.log");
    const logger = createLogger(file, 30);

    logger.info("one");
    logger.info("two");
    logger.info("three");

    expect(existsSync(`${file}.1`)).toBe(true);
    expect(existsSync(`${file}.2`)).toBe(false);
    expect(readFileSync(`${file}.1`, "utf8")).toContain("two");
    expect(readFileSync(file, "utf8")).toContain("three");
  });

  it("keeps a single file while below the size limit", () => {
    const file = path.join(tempDir(), "server.log");
    const logger = createLogger(file, 1024);

    logger.info("small");

    expect(existsSync(`${file}.1`)).toBe(false);
  });
});