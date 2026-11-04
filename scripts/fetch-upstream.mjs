import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_FIELDS = ["repo", "tag", "commit", "eleventyVersion"];

function parseArgs(argv) {
  const options = {
    config: path.join(ROOT, "upstream.json"),
    cacheDir: path.join(ROOT, ".cache", "upstream"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--config" && flag !== "--cache-dir") {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (!value) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === "--config") {
      options.config = path.resolve(value);
    } else {
      options.cacheDir = path.resolve(value);
    }
    index += 1;
  }
  return options;
}

function readConfig(file) {
  const config = JSON.parse(readFileSync(file, "utf8"));
  for (const field of REQUIRED_FIELDS) {
    if (typeof config[field] !== "string" || config[field].length === 0) {
      throw new Error(`upstream config ${file} is missing "${field}"`);
    }
  }
  return config;
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed in ${cwd} (exit ${result.status}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

function assertCommit(dir, expected) {
  const actual = git(["rev-parse", "HEAD"], dir);
  if (actual !== expected) {
    throw new Error(`upstream commit mismatch at ${dir}: expected ${expected}, got ${actual}`);
  }
}

function resolveCheckout(options, config) {
  if (process.env.SCOTTY_SRC) {
    const dir = path.resolve(process.env.SCOTTY_SRC);
    console.log(`Using SCOTTY_SRC checkout: ${dir}`);
    assertCommit(dir, config.commit);
    return { dir, cloned: false };
  }

  const dir = path.join(options.cacheDir, config.tag);
  if (existsSync(dir)) {
    assertCommit(dir, config.commit);
    return { dir, cloned: false };
  }

  mkdirSync(options.cacheDir, { recursive: true });
  git(["clone", "--depth", "1", "--branch", config.tag, config.repo, dir], options.cacheDir);
  assertCommit(dir, config.commit);
  return { dir, cloned: true };
}

function applyPatches(dir) {
  const patchDir = path.join(ROOT, "patches");
  if (!existsSync(patchDir)) {
    return [];
  }
  const patches = readdirSync(patchDir)
    .filter((name) => name.endsWith(".patch"))
    .sort();
  for (const name of patches) {
    const file = path.join(patchDir, name);
    git(["apply", "--check", file], dir);
    git(["apply", file], dir);
  }
  return patches;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = readConfig(options.config);
  const { dir, cloned } = resolveCheckout(options, config);
  const patches = cloned ? applyPatches(dir) : [];
  const patchSummary = patches.length > 0 ? `, patches: ${patches.join(", ")}` : "";
  console.log(`Upstream ready at ${dir} (${config.tag} @ ${config.commit}${patchSummary})`);
}

try {
  main();
} catch (error) {
  console.error(
    `fetch-upstream failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}