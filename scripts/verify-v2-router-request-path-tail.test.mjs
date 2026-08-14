import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories = [];
const hostname = "rc9-release-31736285494-469ca8942a.next.labofscents.org";
const nonce = "b".repeat(32);

function run(capture, errors = "") {
  const directory = mkdtempSync(join(tmpdir(), "oo-router-tail-"));
  temporaryDirectories.push(directory);
  const capturePath = join(directory, "capture.jsonl");
  const errorPath = join(directory, "tail.err");
  writeFileSync(capturePath, capture, "utf8");
  writeFileSync(errorPath, errors, "utf8");
  return execFileSync(
    process.execPath,
    ["scripts/verify-v2-router-request-path-tail.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ROUTER_TAIL_CAPTURE_FILE: capturePath,
        ROUTER_TAIL_ERROR_FILE: errorPath,
        ROUTER_TAIL_EXPECTED_NONCE: nonce,
        ROUTER_TAIL_EXPECTED_HOSTNAME: hostname,
        ROUTER_TAIL_VERSION_FILTER: "7640f2d6-0a0e-4fb8-81ed-22f6eb9a56bc",
      },
    },
  );
}

afterEach(() => {
  while (temporaryDirectories.length)
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe("router request-path tail verifier", () => {
  it("extracts only the expected nonce event into safe classifications", () => {
    const unrelated = JSON.stringify({
      event: { request: { url: "https://other.invalid/" } },
    });
    const expected = JSON.stringify({
      outcome: "ok",
      event: {
        request: {
          url: `https://${hostname}/?oo_router_path_diag=${nonce}`,
          method: "GET",
        },
        response: { status: 404 },
      },
      hidden: "must-not-print",
    });
    const output = run(`${unrelated}\n${expected}\n`);
    expect(output).toContain("TAIL_EVENT_CAPTURED=YES");
    expect(output).toContain("TAIL_REQUEST_HOST_MATCHES_EXPECTED=PASS");
    expect(output).toContain("TAIL_RESPONSE_STATUS_CLASS=4XX");
    expect(output).not.toContain("must-not-print");
    expect(output).not.toContain(nonce);
  });

  it("classifies unavailable Tail permission without printing its raw error", () => {
    const output = run("", "HTTP 403 permission denied for tail credential");
    expect(output).toContain("TAIL_PERMISSION_AVAILABLE=NO");
    expect(output).toContain("TAIL_EVENT_CAPTURED=NO");
    expect(output).not.toContain("403");
    expect(output).not.toContain("permission denied");
  });

  it("does not treat malformed or unrelated capture as an expected event", () => {
    const output = run(
      '{not-json}\n{"event":{"request":{"url":"https://wrong.invalid/"}}}\n',
    );
    expect(output).toContain("TAIL_EVENT_CAPTURED=NO");
    expect(output).not.toContain("wrong.invalid");
  });

  it("keeps a nonce-matching host transformation visible only as a safe failure", () => {
    const output = run(
      `${JSON.stringify({
        outcome: "ok",
        event: {
          request: {
            url: `https://host-transformed.invalid/?oo_router_path_diag=${nonce}`,
            method: "GET",
          },
          response: { status: 404 },
        },
      })}\n`,
    );
    expect(output).toContain("TAIL_EVENT_CAPTURED=YES");
    expect(output).toContain("TAIL_REQUEST_HOST_MATCHES_EXPECTED=FAIL");
    expect(output).not.toContain("host-transformed.invalid");
  });
});
