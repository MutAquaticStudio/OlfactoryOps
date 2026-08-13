import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const fixtureDirectory = mkdtempSync(join(tmpdir(), "olfactoryops-pg-probe-"));
const fixtureScript = join(
  fixtureDirectory,
  "verify-production-database-connectivity.mjs",
);
const fixturePgPackage = join(fixtureDirectory, "node_modules", "pg");
mkdirSync(fixturePgPackage, { recursive: true });
writeFileSync(
  join(fixturePgPackage, "package.json"),
  JSON.stringify({ type: "module", exports: "./index.mjs" }),
);
writeFileSync(
  join(fixturePgPackage, "index.mjs"),
  "export default { Client: class {} };\n",
);
writeFileSync(
  fixtureScript,
  readFileSync("scripts/verify-production-database-connectivity.mjs", "utf8"),
);
const { verifyProductionDatabaseConnectivity } = await import(
  pathToFileURL(fixtureScript).href
);

afterAll(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

function pgClient({ connect, query }) {
  const calls = { end: 0, options: undefined, query: [] };
  return {
    calls,
    pgModule: {
      Client: class {
        constructor(options) {
          this.options = options;
          calls.options = options;
        }

        async connect() {
          return connect?.();
        }

        async query(statement) {
          calls.query.push(statement);
          return query?.(statement);
        }

        async end() {
          calls.end += 1;
        }
      },
    },
  };
}

function runProbe(options = {}) {
  const lines = [];
  return {
    lines,
    result: verifyProductionDatabaseConnectivity({
      connectionString: "sensitive-connection-string",
      output: (line) => lines.push(line),
      ...options,
    }),
  };
}

describe("production database connectivity verifier", () => {
  it("reports a successful pg connection and SELECT 1", async () => {
    const client = pgClient({});
    const probe = runProbe({ pgModule: client.pgModule });
    await expect(probe.result).resolves.toEqual({ pass: true });
    expect(probe.lines).toEqual([
      "PRODUCTION_DATABASE_DRIVER=PASS",
      "PRODUCTION_DATABASE_CONNECTIVITY=PASS",
    ]);
    expect(client.calls.query).toEqual(["SELECT 1"]);
    expect(client.calls.options).toMatchObject({
      connectionTimeoutMillis: 15_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    });
    expect(client.calls.end).toBe(1);
  });

  it("classifies a connection timeout without emitting the raw error", async () => {
    const client = pgClient({
      connect: () =>
        Promise.reject(
          Object.assign(new Error("sensitive-host"), { code: "ETIMEDOUT" }),
        ),
    });
    const probe = runProbe({ pgModule: client.pgModule });
    await expect(probe.result).resolves.toEqual({
      pass: false,
      classification: "DATABASE_CONNECTION_TIMEOUT",
    });
    expect(probe.lines).toContain(
      "PRODUCTION_DATABASE_FAILURE_CLASS=DATABASE_CONNECTION_TIMEOUT",
    );
    expect(client.calls.end).toBe(1);
  });

  it("classifies authentication and TLS-like failures safely", async () => {
    const client = pgClient({
      connect: () =>
        Promise.reject(
          Object.assign(new Error("sensitive-password"), { code: "28P01" }),
        ),
    });
    const probe = runProbe({ pgModule: client.pgModule });
    await expect(probe.result).resolves.toEqual({
      pass: false,
      classification: "DATABASE_TLS_OR_AUTH_FAILURE",
    });
    expect(probe.lines).toContain(
      "PRODUCTION_DATABASE_FAILURE_CLASS=DATABASE_TLS_OR_AUTH_FAILURE",
    );
    expect(client.calls.end).toBe(1);
  });

  it("classifies query failures and still closes the client", async () => {
    const client = pgClient({
      query: () => Promise.reject(new Error("sensitive query error")),
    });
    const probe = runProbe({ pgModule: client.pgModule });
    await expect(probe.result).resolves.toEqual({
      pass: false,
      classification: "DATABASE_QUERY_FAILURE",
    });
    expect(probe.lines).toContain(
      "PRODUCTION_DATABASE_FAILURE_CLASS=DATABASE_QUERY_FAILURE",
    );
    expect(client.calls.query).toEqual(["SELECT 1"]);
    expect(client.calls.end).toBe(1);
  });

  it("never emits a connection string, host, database name, username, stack, or raw error", async () => {
    const client = pgClient({
      connect: () =>
        Promise.reject(
          new Error("sensitive-host sensitive-database sensitive-user"),
        ),
    });
    const probe = runProbe({ pgModule: client.pgModule });
    await probe.result;
    const output = probe.lines.join("\n");
    expect(output).not.toContain("sensitive-connection-string");
    expect(output).not.toMatch(/sensitive-(?:host|database|user|password)/);
    expect(output).not.toMatch(/Error:|at verify|stack/i);
    const source = readFileSync(
      "scripts/verify-production-database-connectivity.mjs",
      "utf8",
    );
    expect(source).toContain('const healthQuery = "SELECT 1"');
    expect(source).not.toMatch(
      /console\.(?:log|error)\([^)]*(?:error|connectionString|stack|host|user)/i,
    );
  });
});
