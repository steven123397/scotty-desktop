export interface ServerEnvOptions {
  port: number;
  bdPath: string | null;
}

/** Builds the environment for the standalone Next.js server child process. */
export function serverEnv(base: NodeJS.ProcessEnv, options: ServerEnvOptions): NodeJS.ProcessEnv {
  return {
    ...base,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(options.port),
    HOSTNAME: "127.0.0.1",
    POSTHOG_KEY: "",
    ...(options.bdPath ? { BD_BIN: options.bdPath } : {}),
  };
}