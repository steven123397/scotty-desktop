import { spawn } from "node:child_process";
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    upstream: null,
    out: path.join(ROOT, "build", "server"),
    log: path.join(ROOT, ".cache", "logs", "build-server.log"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--upstream" && flag !== "--out" && flag !== "--log") {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (!value) {
      throw new Error(`${flag} requires a value`);
    }
    options[flag.slice(2)] = path.resolve(value);
    index += 1;
  }
  return options;
}

function readConfig(file) {
  const config = JSON.parse(readFileSync(file, "utf8"));
  for (const field of ["repo", "tag", "commit", "eleventyVersion"]) {
    if (typeof config[field] !== "string" || config[field].length === 0) {
      throw new Error(`upstream config ${file} is missing "${field}"`);
    }
  }
  return config;
}

function npmCommand(args) {
  const execPath = process.env.npm_execpath;
  if (execPath) {
    return { command: process.execPath, args: [execPath, ...args], shell: false };
  }
  return { command: "npm", args, shell: process.platform === "win32" };
}

function runLogged(label, args, cwd, logStream, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const { command, args: commandArgs, shell } = npmCommand(args);
    logStream.write(`\n$ ${label}: ${command} ${commandArgs.join(" ")} (cwd: ${cwd})\n`);
    const child = spawn(command, commandArgs, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
      shell,
    });
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}`));
      }
    });
  });
}

function mergeNodeModules(sourceDir, targetDir) {
  for (const entry of readdirSync(sourceDir)) {
    cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), {
      recursive: true,
      force: true,
    });
  }
}

async function assemble(upstreamDir, outDir, config, logStream) {
  const standalone = path.join(upstreamDir, ".next", "standalone");
  if (!existsSync(standalone)) {
    throw new Error(`standalone output missing at ${standalone}`);
  }

  rmSync(outDir, { recursive: true, force: true });
  cpSync(standalone, outDir, { recursive: true });

  // The tracing step copies a partial @11ty/eleventy (cmd.cjs without its
  // dependencies); drop it before merging the complete tree.
  rmSync(path.join(outDir, "node_modules", "@11ty"), { recursive: true, force: true });

  cpSync(path.join(upstreamDir, ".next", "static"), path.join(outDir, ".next", "static"), {
    recursive: true,
  });
  cpSync(path.join(upstreamDir, "public"), path.join(outDir, "public"), { recursive: true });

  const eleventyDir = path.join(ROOT, ".cache", "eleventy");
  rmSync(eleventyDir, { recursive: true, force: true });
  mkdirSync(eleventyDir, { recursive: true });
  // Without its own package.json, npm walks up to this repo and installs into
  // the project's node_modules instead of the scratch directory.
  writeFileSync(
    path.join(eleventyDir, "package.json"),
    `${JSON.stringify({ name: "scotty-eleventy", private: true }, null, 2)}\n`,
  );
  await runLogged(
    "npm install eleventy",
    ["install", "--no-save", `@11ty/eleventy@${config.eleventyVersion}`],
    eleventyDir,
    logStream,
  );

  const eleventyModules = path.join(eleventyDir, "node_modules");
  if (!existsSync(eleventyModules)) {
    throw new Error(`eleventy install produced no node_modules in ${eleventyDir}`);
  }
  mergeNodeModules(eleventyModules, path.join(outDir, "node_modules"));

  const eleventyBin = path.join(outDir, "node_modules", "@11ty", "eleventy", "cmd.cjs");
  if (!existsSync(eleventyBin)) {
    throw new Error(`@11ty/eleventy/cmd.cjs missing after merge: ${eleventyBin}`);
  }
  logStream.write(`eleventy: ${eleventyBin}\n`);

  if (!existsSync(path.join(outDir, "server.js"))) {
    throw new Error(`server.js missing after assembly in ${outDir}`);
  }
}

function writeBuildInfo(outDir, config) {
  const buildInfo = {
    tag: config.tag,
    commit: config.commit,
    eleventyVersion: config.eleventyVersion,
    builtAt: new Date().toISOString(),
    nodeVersion: process.version,
  };
  writeFileSync(path.join(outDir, "BUILD_INFO.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = readConfig(path.join(ROOT, "upstream.json"));
  const upstreamDir = path.resolve(
    options.upstream ??
      process.env.SCOTTY_SRC ??
      path.join(ROOT, ".cache", "upstream", config.tag),
  );

  mkdirSync(path.dirname(options.log), { recursive: true });
  const logStream = createWriteStream(options.log, { flags: "w" });

  try {
    if (!existsSync(path.join(upstreamDir, "package.json"))) {
      throw new Error(
        `upstream checkout not found at ${upstreamDir} (run npm run upstream:fetch first)`,
      );
    }

    logStream.write(`build-server: ${config.tag} @ ${config.commit}\n`);
    await runLogged("npm ci", ["ci"], upstreamDir, logStream);
    await runLogged("next build", ["run", "build"], upstreamDir, logStream, {
      NEXT_STANDALONE: "1",
    });
    await assemble(upstreamDir, options.out, config, logStream);
    writeBuildInfo(options.out, config);

    console.log(`Build ready at ${options.out}`);
    console.log(`Log: ${options.log}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`build-server failed: ${message}`);
    console.error(`Build log: ${options.log}`);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => logStream.end(resolve));
  }
}

await main();