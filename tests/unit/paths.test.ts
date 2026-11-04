import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveBd, serverDir, skinCssPath } from "../../src/main/paths";

describe("resolveBd", () => {
  it("prefers BD_BIN without looking anything up", () => {
    const lookups: string[] = [];

    const bd = resolveBd({ BD_BIN: " C:\\tools\\bd.exe " }, (command) => {
      lookups.push(command);
      return null;
    });

    expect(bd).toBe("C:\\tools\\bd.exe");
    expect(lookups).toEqual([]);
  });

  it("falls back to the first line of `where.exe bd`", () => {
    const bd = resolveBd({}, (command, args) => {
      expect(command).toBe("where.exe");
      expect(args).toEqual(["bd"]);
      return "C:\\first\\bd.exe\r\nC:\\second\\bd.exe\r\n";
    });

    expect(bd).toBe("C:\\first\\bd.exe");
  });

  it("returns null when where.exe finds nothing", () => {
    expect(resolveBd({}, () => null)).toBeNull();
    expect(resolveBd({}, () => "")).toBeNull();
  });

  it("ignores a blank BD_BIN and falls back to where.exe", () => {
    const bd = resolveBd({ BD_BIN: "   " }, () => "C:\\found\\bd.exe\n");

    expect(bd).toBe("C:\\found\\bd.exe");
  });
});

describe("resource paths", () => {
  it("places the server and skin asset under the resources directory", () => {
    const resources = path.join("C:\\", "App", "resources");

    expect(serverDir(resources)).toBe(path.join(resources, "server"));
    expect(skinCssPath(resources)).toBe(path.join(resources, "skin.css"));
  });
});