import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(root, "scripts", "generate-icon.mjs");
const SVG = path.join(root, "fixtures", "test-icon.svg");
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "scotty-icon-"));
  tempDirs.push(dir);
  return dir;
}

function runIcon(out: string) {
  return spawnSync(process.execPath, [SCRIPT, "--source", SVG, "--out", out], {
    encoding: "utf8",
    timeout: 60_000,
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("generate-icon", () => {
  it("writes an ICO containing a 256x256 PNG frame", () => {
    const out = path.join(tempDir(), "icon.ico");

    const result = runIcon(out);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const ico = readFileSync(out);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    expect(count).toBeGreaterThan(0);

    const sizes: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const offset = 6 + index * 16;
      const width = ico[offset] ?? 0;
      sizes.push(width === 0 ? 256 : width);
    }
    expect(sizes).toContain(256);

    const frameOffset = 6 + sizes.indexOf(256) * 16;
    const dataOffset = ico.readUInt32LE(frameOffset + 12);
    expect(ico.subarray(dataOffset, dataOffset + 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("is idempotent", () => {
    const out = path.join(tempDir(), "icon.ico");

    expect(runIcon(out).status).toBe(0);
    const first = readFileSync(out);
    expect(runIcon(out).status).toBe(0);

    expect(readFileSync(out).equals(first)).toBe(true);
  });
});