import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadPinnedOsmoTaxonomy,
  parsePinnedOsmoTaxonomy,
  PINNED_OSMO_TAXONOMY,
} from "./osmo-scent-taxonomy.js";

const sourcePath = resolve(
  "services/scientific/resources/osmo-taxonomy/v1.2/taxonomy.json",
);

describe("pinned Osmo Scent Taxonomy", () => {
  it("loads the exact v1.2 artifact and complete published node set", async () => {
    const taxonomy = await loadPinnedOsmoTaxonomy(sourcePath);

    expect(taxonomy.manifest).toMatchObject({
      version: "v1.2",
      commitSha: "fcd538b578e0a3c6261503380de03d0691b47344",
      license: "ODbL-1.0",
      adapterVersion: "osmo-scent-taxonomy-adapter/1.0.0",
    });
    expect(taxonomy.counts).toEqual(PINNED_OSMO_TAXONOMY.expectedCounts);
    expect(taxonomy.nodes).toHaveLength(254);
  });

  it("preserves every official subfamily parent and never invents descriptor hierarchy", async () => {
    const taxonomy = await loadPinnedOsmoTaxonomy(sourcePath);
    const grandFamilyKeys = new Set(
      taxonomy.nodes
        .filter((node) => node.kind === "GRAND_FAMILY")
        .map((node) => node.key),
    );
    const subfamilies = taxonomy.nodes.filter(
      (node) => node.kind === "SUBFAMILY",
    );
    const descriptors = taxonomy.nodes.filter(
      (node) => node.kind === "DESCRIPTOR",
    );

    expect(subfamilies).toHaveLength(63);
    expect(
      subfamilies.every(
        (node) => node.parentKey && grandFamilyKeys.has(node.parentKey),
      ),
    ).toBe(true);
    expect(descriptors.every((node) => node.parentKey === null)).toBe(true);
  });

  it("fails closed when the vendored artifact changes", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(() =>
      parsePinnedOsmoTaxonomy(source.replace("Animalic", "Animal-like")),
    ).toThrow("OSMO_TAXONOMY_SOURCE_SHA256_MISMATCH");
  });

  it("produces stable unique keys without upgrading model predictions to verified taxonomy evidence", async () => {
    const first = await loadPinnedOsmoTaxonomy(sourcePath);
    const second = await loadPinnedOsmoTaxonomy(sourcePath);

    expect(first.nodes.map((node) => node.key)).toEqual(
      second.nodes.map((node) => node.key),
    );
    expect(new Set(first.nodes.map((node) => node.key)).size).toBe(
      first.nodes.length,
    );
    expect(JSON.stringify(first)).not.toContain("MODEL_PREDICTED");
    expect(JSON.stringify(first)).not.toContain("SOURCE_VERIFIED");
  });
  it("matches the machine-readable runtime component pin", async () => {
    const registry = JSON.parse(
      await readFile(
        resolve("services/scientific/runtime/component-pins.json"),
        "utf8",
      ),
    ) as {
      components: {
        OSMO_SCENT_TAXONOMY: Record<string, string>;
      };
    };
    const pin = registry.components.OSMO_SCENT_TAXONOMY;

    expect(pin).toMatchObject({
      repository: PINNED_OSMO_TAXONOMY.repository,
      license: PINNED_OSMO_TAXONOMY.license,
      upstreamRef: PINNED_OSMO_TAXONOMY.version,
      upstreamCommit: PINNED_OSMO_TAXONOMY.commitSha,
      sourcePath: PINNED_OSMO_TAXONOMY.sourcePath,
      sourceSha256: PINNED_OSMO_TAXONOMY.sourceSha256,
      adapterVersion: PINNED_OSMO_TAXONOMY.adapterVersion,
    });
  });

});
