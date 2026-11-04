import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";

import { serverEnv } from "./env";
import type { Logger } from "./log";

export interface StartServerOptions {
  serverPath: string;
  port: number;
  bdPath: string | null;
  logger: Logger;
  readyTimeoutMs?: number;
  baseEnv?: NodeJS.ProcessEnv;
}

export interface ServerExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface ServerHandle {
  readonly port: number;
  readonly url: string;
  readonly exited: Promise<ServerExit>;
  stop(): Promise<void>;
}

const DEFAULT_READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 250;
const STOP_GRACE_MS = 3000;

/** Spawns the standalone server, waits for HTTP 200, and exposes a clean stop. */
export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
  const serverPath = path.resolve(options.serverPath);
  const cwd = path.dirname(serverPath);
  const url = `http://127.0.0.1:${options.port}/`;
  const timeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;

  options.logger.info(
    `starting server: ${process.execPath} ${serverPath} (cwd ${cwd}, port ${options.port})`,
  );

  const child = spawn(process.execPath, [serverPath], {
    cwd,
    env: serverEnv(options.baseEnv ?? process.env, {
      port: options.port,
      bdPath: options.bdPath,
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let failure: Error | null = null;
  const exited = new Promise<ServerExit>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  child.once("error", (error) => {
    failure = error instanceof Error ? error : new Error(String(error));
    options.logger.error(`server failed to spawn: ${failure.message}`);
  });
  child.once("exit", (code, signal) => {
    options.logger.info(`server exited: code=${code ?? "null"} signal=${signal ?? "none"}`);
    if (failure === null) {
      failure = new Error(`server exited before ready (code=${code}, signal=${signal})`);
    }
  });
  child.stdout?.on("data", (chunk: Buffer) => options.logger.raw(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => options.logger.raw(chunk.toString()));

  let ready: boolean;
  try {
    ready = await waitForReady(url, timeoutMs, () => failure);
  } catch (error) {
    await stopChild(child, options.logger);
    throw error;
  }

  if (!ready) {
    await stopChild(child, options.logger);
    throw new Error(`server did not become ready at ${url} within ${timeoutMs}ms; log: ${options.logger.file}`);
  }

  options.logger.info(`server ready at ${url}`);
  return {
    port: options.port,
    url,
    exited,
    stop: () => stopChild(child, options.logger),
  };
}

async function waitForReady(
  url: string,
  timeoutMs: number,
  failure: () => Error | null,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const error = failure();
    if (error) {
      throw error;
    }
    if ((await statusOf(url)) === 200) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
  return false;
}

function statusOf(url: string): Promise<number> {
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

async function stopChild(child: ChildProcess, logger: Logger): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  logger.info("stopping server");
  child.kill();

  const forceTimer = setTimeout(() => {
    if (child.exitCode !== null) {
      return;
    }
    logger.error(`server did not exit in ${STOP_GRACE_MS}ms; killing process tree`);
    if (child.pid !== undefined) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        child.kill("SIGKILL");
      }
    }
  }, STOP_GRACE_MS);

  const giveUp = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
  await Promise.race([exited, giveUp]);
  clearTimeout(forceTimer);
}