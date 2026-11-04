import { existsSync, readFileSync } from "node:fs";

const ALLOWED_PERMISSIONS = ["clipboard-read", "clipboard-sanitized-write"];

/** Only clipboard access is granted; everything else is denied. */
export function isAllowedPermission(permission: string): boolean {
  return ALLOWED_PERMISSIONS.includes(permission);
}

/** True when the url points at the local Scotty server origin. */
export function isAllowedUrl(url: string, port: number): boolean {
  const parsed = parseUrl(url);
  return (
    parsed !== null &&
    parsed.protocol === "http:" &&
    parsed.hostname === "127.0.0.1" &&
    parsed.port === String(port)
  );
}

/** True for links that should be handed to the system browser. */
export function isExternalHttpUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== null && (parsed.protocol === "http:" || parsed.protocol === "https:");
}

/** Reads skin CSS; empty or missing files mean "no override". */
export function readSkinCss(file: string): string | null {
  if (!existsSync(file)) {
    return null;
  }
  const css = readFileSync(file, "utf8").trim();
  return css.length > 0 ? css : null;
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    // Malformed urls are never allowed and never external.
    return null;
  }
}