import { appendFileSync, existsSync, renameSync, rmSync, statSync } from "node:fs";

export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export interface Logger {
  readonly file: string;
  info(message: string): void;
  error(message: string): void;
  raw(chunk: string): void;
}

/** Creates a line-oriented log writer that rotates to `<file>.1` at the size limit. */
export function createLogger(file: string, maxBytes = DEFAULT_MAX_BYTES): Logger {
  const append = (text: string): void => {
    rotateIfNeeded(file, maxBytes);
    appendFileSync(file, text);
  };

  return {
    file,
    info: (message) => append(`${new Date().toISOString()} INFO ${message}\n`),
    error: (message) => append(`${new Date().toISOString()} ERROR ${message}\n`),
    raw: (chunk) => append(chunk),
  };
}

/** Rotates `file` to `file.1` when it has reached `maxBytes`. */
export function rotateIfNeeded(file: string, maxBytes = DEFAULT_MAX_BYTES): boolean {
  if (!existsSync(file) || statSync(file).size < maxBytes) {
    return false;
  }

  const archive = `${file}.1`;
  rmSync(archive, { force: true });
  renameSync(file, archive);
  return true;
}