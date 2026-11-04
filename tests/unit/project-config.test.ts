import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8")) as T;
}

function readLines(relativePath: string): string[] {
  return readFileSync(path.join(root, relativePath), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim());
}

interface PackageJson {
  engines?: { node?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

describe("project skeleton", () => {
  it("requires Node 22 or newer", () => {
    const pkg = readJson<PackageJson>("package.json");

    expect(pkg.engines?.node).toMatch(/^>=\s*22/);
  });

  it("exposes every command listed in SPEC", () => {
    const pkg = readJson<PackageJson>("package.json");
    const scripts = Object.keys(pkg.scripts ?? {});

    expect(scripts).toEqual(
      expect.arrayContaining([
        "upstream:fetch",
        "build:server",
        "build:main",
        "dev",
        "dev:attach",
        "dist",
        "release",
        "test",
        "test:e2e",
        "typecheck",
        "lint",
        "verify",
      ]),
    );
  });

  it("ignores dependencies and generated build output", () => {
    const lines = readLines(".gitignore");

    for (const ignored of [
      "node_modules/",
      ".cache/",
      "build/server/",
      "dist-electron/",
      "release/",
      "test-results/",
    ]) {
      expect(lines).toContain(ignored);
    }
  });

  it("enables TypeScript strict mode", () => {
    const tsconfig = readJson<{ compilerOptions?: { strict?: boolean } }>("tsconfig.json");

    expect(tsconfig.compilerOptions?.strict).toBe(true);
  });

  it("pins the Electron version that ships Node 24", () => {
    const pkg = readJson<PackageJson>("package.json");

    expect(pkg.devDependencies?.electron).toBe("43.3.0");
  });
});