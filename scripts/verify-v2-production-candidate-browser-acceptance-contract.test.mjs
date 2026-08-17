import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const source = readFileSync("scripts/verify-v2-production-candidate-browser-acceptance.mjs", "utf8");

test("browser acceptance accepts only the immutable RC9 and RC10 identities", () => {
  expect(source).toContain('"de0734df2d2b5b2dd3a2a67ee542131235e75eb7"');
  expect(source).toContain('"fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd"');
  expect(source).toContain("acceptedReleaseShas.has(releaseSha)");
  expect(source).not.toContain("releaseSha === \"de0734df2d2b5b2dd3a2a67ee542131235e75eb7\"");
});

test("browser acceptance keeps the exact isolated fixture contract", () => {
  expect(source).toContain(
    'tenantUrl === "https://rc9-release-31736285494-469ca8942a.next.labofscents.org"',
  );
  expect(source).toContain('apiOrigin = "https://api-next.labofscents.org"');
});
