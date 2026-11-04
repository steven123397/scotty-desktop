import { createServer } from "node:net";

export type BindFreePort = (host: string) => Promise<number>;

export interface PickPortOptions {
  host?: string;
  attempts?: number;
  bind?: BindFreePort;
}

/** Picks a free loopback port, retrying when a bind attempt fails. */
export async function pickPort(options: PickPortOptions = {}): Promise<number> {
  const host = options.host ?? "127.0.0.1";
  const attempts = options.attempts ?? 3;
  const bind = options.bind ?? bindFreePort;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await bind(host);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`could not find a free port on ${host} after ${attempts} attempts`, {
    cause: lastError,
  });
}

function bindFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close(() => reject(new Error(`unexpected address for ${host}`)));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}