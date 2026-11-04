import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    server: path.join(ROOT, "build", "server", "server.js"),
    timeoutMs: 60_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--server" && flag !== "--timeout") {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (!value) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === "--server") {
      options.server = path.resolve(value);
    } else {
      options.timeoutMs = Number(value);
    }
    index += 1;
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout must be a positive number of milliseconds");
  }
  return options;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

function statusOf(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.once("error", () => resolve(0));
    request.setTimeout(2000, () => {
      request.destroy();
      resolve(0);
    });
  });
}

async function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    lastStatus = await statusOf(url);
    if (lastStatus === 200) {
      return lastStatus;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return lastStatus;
}

function stop(child) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const forceTimer = setTimeout(() => {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        child.kill("SIGKILL");
      }
    }, 3000);
    const giveUpTimer = setTimeout(() => resolve(), 8000);
    child.once("exit", () => {
      clearTimeout(forceTimer);
      clearTimeout(giveUpTimer);
      resolve();
    });
    child.kill();
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.server)) {
    throw new Error(`server not found: ${options.server} (run npm run build:server first)`);
  }

  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, [options.server], {
    cwd: path.dirname(options.server),
    env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", POSTHOG_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  try {
    const status = await waitForReady(url, options.timeoutMs);
    if (status !== 200) {
      const details = output.trim() ? `\n${output.trim()}` : "";
      throw new Error(
        `server did not answer 200 at ${url} within ${options.timeoutMs}ms ` +
          `(last status: ${status})${details}`,
      );
    }
    console.log(`verify-server: GET / -> 200 (${url})`);
  } finally {
    await stop(child);
  }
}

try {
  await main();
} catch (error) {
  console.error(
    `verify-server failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}