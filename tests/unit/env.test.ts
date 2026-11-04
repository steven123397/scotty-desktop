import { describe, expect, it } from "vitest";

import { serverEnv } from "../../src/main/env";

describe("serverEnv", () => {
  it("sets the standalone server environment and keeps base variables", () => {
    const env = serverEnv({ PATH: "C:\\Windows" }, { port: 43123, bdPath: null });

    expect(env.PATH).toBe("C:\\Windows");
    expect(env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(env.PORT).toBe("43123");
    expect(env.HOSTNAME).toBe("127.0.0.1");
    expect(env.POSTHOG_KEY).toBe("");
    expect("BD_BIN" in env).toBe(false);
  });

  it("passes BD_BIN through when bd was resolved", () => {
    const env = serverEnv({}, { port: 1, bdPath: "C:\\tools\\bd.exe" });

    expect(env.BD_BIN).toBe("C:\\tools\\bd.exe");
  });
});