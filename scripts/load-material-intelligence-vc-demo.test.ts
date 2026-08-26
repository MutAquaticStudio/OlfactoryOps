import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateDemoFixture, type DemoFixture } from "./load-material-intelligence-vc-demo.js";

const fixturePath = "services/scientific/testdata/material-intelligence-vc-demo30.json";

describe("Material Intelligence VC demo30 fixture", () => {
  it("contains exactly 30 evidence-backed identities with properties, taxonomy, and dilution provenance", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as DemoFixture;
    expect(validateDemoFixture(fixture)).toEqual({
      verifiedEntities: 30,
      verifiedIdentities: 30,
      sourceRows: expect.any(Number),
      canonicalRowCount: expect.any(Number),
      dilutionCount: expect.any(Number),
      taxonomyPopulated: expect.any(Number),
    });
    const result = validateDemoFixture(fixture);
    expect(result.sourceRows).toBeGreaterThanOrEqual(31);
    expect(result.dilutionCount).toBeGreaterThanOrEqual(1);
    expect(result.taxonomyPopulated).toBeGreaterThanOrEqual(10);
  });

  it("fails closed when a structure or authoritative evidence hash is removed", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as DemoFixture;
    const invalid = structuredClone(fixture);
    invalid.materials[0]!.molecularIdentity.inchiKey = "";
    expect(() => validateDemoFixture(invalid)).toThrow("VC_DEMO_VERIFIED_IDENTITY_INVALID");
  });
});
