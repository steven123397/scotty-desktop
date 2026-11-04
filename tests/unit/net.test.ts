import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import { pickPort } from "../../src/main/net";

describe("pickPort", () => {
  it("returns a port that can be bound on 127.0.0.1", async () => {
    const port = await pickPort();
    const probe = createServer();

    await new Promise<void>((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolve);
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    expect(port).toBeGreaterThan(0);
  });

  it("retries after a failed bind and eventually returns a port", async () => {
    let calls = 0;

    const port = await pickPort({
      attempts: 3,
      bind: async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error("port in use");
        }
        return 45123;
      },
    });

    expect(port).toBe(45123);
    expect(calls).toBe(3);
  });

  it("throws after exhausting all attempts", async () => {
    await expect(
      pickPort({
        attempts: 2,
        bind: async () => {
          throw new Error("port in use");
        },
      }),
    ).rejects.toThrow(/after 2 attempts/);
  });
});