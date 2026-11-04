import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { isAllowedPermission, isAllowedUrl, isExternalHttpUrl, readSkinCss } from "../../src/main/window-rules";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "scotty-window-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("isAllowedPermission", () => {
  it("allows clipboard access", () => {
    expect(isAllowedPermission("clipboard-read")).toBe(true);
    expect(isAllowedPermission("clipboard-sanitized-write")).toBe(true);
  });

  it("denies everything else", () => {
    expect(isAllowedPermission("notifications")).toBe(false);
    expect(isAllowedPermission("media")).toBe(false);
    expect(isAllowedPermission("geolocation")).toBe(false);
  });
});

describe("isAllowedUrl", () => {
  it("accepts pages on the local server origin", () => {
    expect(isAllowedUrl("http://127.0.0.1:43123/", 43123)).toBe(true);
    expect(isAllowedUrl("http://127.0.0.1:43123/p/project", 43123)).toBe(true);
  });

  it("rejects other origins", () => {
    expect(isAllowedUrl("http://127.0.0.1:43124/", 43123)).toBe(false);
    expect(isAllowedUrl("https://example.com/", 43123)).toBe(false);
    expect(isAllowedUrl("http://localhost:43123/", 43123)).toBe(false);
    expect(isAllowedUrl("file:///C:/secrets.txt", 43123)).toBe(false);
    expect(isAllowedUrl("not a url", 43123)).toBe(false);
  });
});

describe("isExternalHttpUrl", () => {
  it("accepts http and https links", () => {
    expect(isExternalHttpUrl("https://example.com/")).toBe(true);
    expect(isExternalHttpUrl("http://example.com/")).toBe(true);
  });

  it("rejects other schemes and malformed urls", () => {
    expect(isExternalHttpUrl("file:///C:/secrets.txt")).toBe(false);
    expect(isExternalHttpUrl("mailto:someone@example.com")).toBe(false);
    expect(isExternalHttpUrl("nonsense")).toBe(false);
  });
});

describe("readSkinCss", () => {
  it("returns the css when the file has content", () => {
    const file = path.join(tempDir(), "skin.css");
    writeFileSync(file, "  body { color: red; }  \n");

    expect(readSkinCss(file)).toBe("body { color: red; }");
  });

  it("returns null for an empty or blank file", () => {
    const file = path.join(tempDir(), "skin.css");
    writeFileSync(file, "  \n\t\n");

    expect(readSkinCss(file)).toBeNull();
  });

  it("returns null when the file does not exist", () => {
    expect(readSkinCss(path.join(tempDir(), "missing.css"))).toBeNull();
  });
});