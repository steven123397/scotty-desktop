import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(root, "scripts", "fetch-upstream.mjs");
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "scotty-upstream-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function createUpstreamRepo(): { dir: string; commit: string } {
  const dir = tempDir();
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(path.join(dir, "README.md"), "upstream\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "initial");
  git(dir, "tag", "v0.4.0");
  return { dir, commit: git(dir, "rev-parse", "HEAD") };
}

function writeConfig(
  dir: string,
  values: { repo: string; commit: string; tag?: string },
): string {
  const file = path.join(dir, "upstream.json");
  writeFileSync(
    file,
    JSON.stringify({
      tag: "v0.4.0",
      eleventyVersion: "3.1.6",
      ...values,
    }),
  );
  return file;
}

function runFetch(
  configPath: string,
  cacheDir: string,
  extraEnv: NodeJS.ProcessEnv = {},
): { status: number | null; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.SCOTTY_SRC;
  Object.assign(env, extraEnv);
  const result = spawnSync(
    process.execPath,
    [SCRIPT, "--config", configPath, "--cache-dir", cacheDir],
    { encoding: "utf8", env },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("fetch-upstream", () => {
  it("clones the pinned tag into the cache and verifies HEAD", () => {
    const scratch = tempDir();
    const upstream = createUpstreamRepo();
    const config = writeConfig(scratch, {
      repo: pathToFileURL(upstream.dir).href,
      commit: upstream.commit,
    });
    const cache = path.join(scratch, "cache");

    const result = runFetch(config, cache);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const checkout = path.join(cache, "v0.4.0");
    expect(existsSync(checkout)).toBe(true);
    expect(git(checkout, "rev-parse", "HEAD")).toBe(upstream.commit);
  });

  it("reuses an existing cache checkout instead of cloning again", () => {
    const scratch = tempDir();
    const upstream = createUpstreamRepo();
    const config = writeConfig(scratch, {
      repo: pathToFileURL(upstream.dir).href,
      commit: upstream.commit,
    });
    const cache = path.join(scratch, "cache");

    expect(runFetch(config, cache).status).toBe(0);
    expect(runFetch(config, cache).status).toBe(0);
  });

  it("fails with expected and actual commits when the pin is wrong", () => {
    const scratch = tempDir();
    const upstream = createUpstreamRepo();
    const cache = path.join(scratch, "cache");
    expect(
      runFetch(
        writeConfig(scratch, {
          repo: pathToFileURL(upstream.dir).href,
          commit: upstream.commit,
        }),
        cache,
      ).status,
    ).toBe(0);

    const wrong = "0".repeat(40);
    const result = runFetch(
      writeConfig(scratch, { repo: pathToFileURL(upstream.dir).href, commit: wrong }),
      cache,
    );

    expect(result.status).not.toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain(wrong);
    expect(output).toContain(upstream.commit);
  });

  it("uses a SCOTTY_SRC checkout without cloning or touching the cache", () => {
    const scratch = tempDir();
    const upstream = createUpstreamRepo();
    const config = writeConfig(scratch, {
      repo: "https://example.invalid/unused.git",
      commit: upstream.commit,
    });
    const cache = path.join(scratch, "cache");
    mkdirSync(cache, { recursive: true });

    const result = runFetch(config, cache, { SCOTTY_SRC: upstream.dir });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SCOTTY_SRC");
    expect(existsSync(path.join(cache, "v0.4.0"))).toBe(false);
  });
});