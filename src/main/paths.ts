import { spawnSync } from "node:child_process";
import path from "node:path";

export type CommandRunner = (command: string, args: string[]) => string | null;

/** Resolves the bd executable: BD_BIN first, then the first `where.exe bd` hit. */
export function resolveBd(
  env: NodeJS.ProcessEnv = process.env,
  run: CommandRunner = runCommand,
): string | null {
  const configured = env.BD_BIN?.trim();
  if (configured) {
    return configured;
  }

  const output = run("where.exe", ["bd"]);
  if (!output) {
    return null;
  }

  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? null;
}

export function serverDir(resourcesPath: string): string {
  return path.join(resourcesPath, "server");
}

export function skinCssPath(resourcesPath: string): string {
  return path.join(resourcesPath, "skin.css");
}

function runCommand(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout;
}