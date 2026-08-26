import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const PINNED_OSMO_TAXONOMY = Object.freeze({
  repository: "https://github.com/osmoai/taxonomy",
  version: "v1.2",
  commitSha: "fcd538b578e0a3c6261503380de03d0691b47344",
  sourcePath: "data/taxonomy.json",
  sourceSha256:
    "3181c43e9d094235eb2125b3301d6d323b1337acea5eaa4242e2e3d3e3493b2d",
  sourceGitBlob: "1dad309279a03e545dabb755f270323bfdafded7",
  license: "ODbL-1.0",
  adapterVersion: "osmo-scent-taxonomy-adapter/1.0.0",
  expectedCounts: Object.freeze({
    GRAND_FAMILY: 11,
    SUBFAMILY: 63,
    DESCRIPTOR: 138,
    TEXTURE: 27,
    SENSATION: 15,
    TOTAL: 254,
  }),
});

export type OsmoTaxonomyKind =
  "GRAND_FAMILY" | "SUBFAMILY" | "DESCRIPTOR" | "TEXTURE" | "SENSATION";

type RawOsmoTaxonomy = {
  GRAND_FAMILIES: string[];
  SUBFAMILIES: string[];
  DESCRIPTORS: string[];
  TEXTURES: string[];
  SENSATIONS: string[];
  GRAND_FAMILY_COLORS: Record<string, string>;
  SUB_TO_GRAND: Record<string, string>;
};

export type OsmoTaxonomyNode = {
  key: string;
  kind: OsmoTaxonomyKind;
  label: string;
  parentKey: string | null;
  ordinal: number;
  metadata: Record<string, string>;
};

export type PinnedOsmoTaxonomy = {
  manifest: typeof PINNED_OSMO_TAXONOMY;
  nodes: OsmoTaxonomyNode[];
  counts: Record<OsmoTaxonomyKind | "TOTAL", number>;
};

const DEFAULT_SOURCE = resolve(
  "services/scientific/resources/osmo-taxonomy/v1.2/taxonomy.json",
);

const sourceDigest = (source: string | Buffer) =>
  createHash("sha256").update(source).digest("hex");

const nodeKey = (kind: OsmoTaxonomyKind, label: string) => {
  const digest = createHash("sha256")
    .update(`${PINNED_OSMO_TAXONOMY.version}\u0000${kind}\u0000${label}`)
    .digest("hex")
    .slice(0, 24);
  return `osmo:${PINNED_OSMO_TAXONOMY.version}:${kind.toLowerCase()}:${digest}`;
};

const requireStringList = (value: unknown, name: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) => typeof item !== "string" || item.trim() !== item || !item,
    )
  ) {
    throw new Error(`OSMO_TAXONOMY_${name}_INVALID`);
  }
  if (new Set(value).size !== value.length)
    throw new Error(`OSMO_TAXONOMY_${name}_DUPLICATE`);
  return value;
};

const requireRecord = (
  value: unknown,
  name: string,
): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`OSMO_TAXONOMY_${name}_INVALID`);
  const entries = Object.entries(value);
  if (
    entries.some(([key, item]) => !key || typeof item !== "string" || !item)
  ) {
    throw new Error(`OSMO_TAXONOMY_${name}_INVALID`);
  }
  return Object.fromEntries(entries);
};

export const parsePinnedOsmoTaxonomy = (
  source: string | Buffer,
): PinnedOsmoTaxonomy => {
  if (sourceDigest(source) !== PINNED_OSMO_TAXONOMY.sourceSha256)
    throw new Error("OSMO_TAXONOMY_SOURCE_SHA256_MISMATCH");

  const raw = JSON.parse(source.toString()) as Partial<RawOsmoTaxonomy>;
  const grandFamilies = requireStringList(raw.GRAND_FAMILIES, "GRAND_FAMILIES");
  const subfamilies = requireStringList(raw.SUBFAMILIES, "SUBFAMILIES");
  const descriptors = requireStringList(raw.DESCRIPTORS, "DESCRIPTORS");
  const textures = requireStringList(raw.TEXTURES, "TEXTURES");
  const sensations = requireStringList(raw.SENSATIONS, "SENSATIONS");
  const colors = requireRecord(raw.GRAND_FAMILY_COLORS, "GRAND_FAMILY_COLORS");
  const subToGrand = requireRecord(raw.SUB_TO_GRAND, "SUB_TO_GRAND");

  const grandSet = new Set(grandFamilies);
  if (
    Object.keys(colors).length !== grandFamilies.length ||
    grandFamilies.some((label) => !colors[label])
  ) {
    throw new Error("OSMO_TAXONOMY_GRAND_FAMILY_COLOR_COVERAGE_INVALID");
  }
  if (
    Object.keys(subToGrand).length !== subfamilies.length ||
    subfamilies.some((label) => !subToGrand[label]) ||
    Object.values(subToGrand).some((label) => !grandSet.has(label))
  ) {
    throw new Error("OSMO_TAXONOMY_SUBFAMILY_HIERARCHY_INVALID");
  }

  const grandKeys = new Map(
    grandFamilies.map((label) => [label, nodeKey("GRAND_FAMILY", label)]),
  );
  const nodes: OsmoTaxonomyNode[] = [
    ...grandFamilies.map((label, ordinal) => ({
      key: grandKeys.get(label)!,
      kind: "GRAND_FAMILY" as const,
      label,
      parentKey: null,
      ordinal,
      metadata: { color: colors[label] },
    })),
    ...subfamilies.map((label, ordinal) => ({
      key: nodeKey("SUBFAMILY", label),
      kind: "SUBFAMILY" as const,
      label,
      parentKey: grandKeys.get(subToGrand[label])!,
      ordinal,
      metadata: {},
    })),
    ...descriptors.map((label, ordinal) => ({
      key: nodeKey("DESCRIPTOR", label),
      kind: "DESCRIPTOR" as const,
      label,
      parentKey: null,
      ordinal,
      metadata: {},
    })),
    ...textures.map((label, ordinal) => ({
      key: nodeKey("TEXTURE", label),
      kind: "TEXTURE" as const,
      label,
      parentKey: null,
      ordinal,
      metadata: {},
    })),
    ...sensations.map((label, ordinal) => ({
      key: nodeKey("SENSATION", label),
      kind: "SENSATION" as const,
      label,
      parentKey: null,
      ordinal,
      metadata: {},
    })),
  ];
  if (new Set(nodes.map((node) => node.key)).size !== nodes.length)
    throw new Error("OSMO_TAXONOMY_NODE_KEY_COLLISION");

  const counts = {
    GRAND_FAMILY: grandFamilies.length,
    SUBFAMILY: subfamilies.length,
    DESCRIPTOR: descriptors.length,
    TEXTURE: textures.length,
    SENSATION: sensations.length,
    TOTAL: nodes.length,
  };
  for (const [key, expected] of Object.entries(
    PINNED_OSMO_TAXONOMY.expectedCounts,
  )) {
    if (counts[key as keyof typeof counts] !== expected)
      throw new Error(`OSMO_TAXONOMY_${key}_COUNT_MISMATCH`);
  }

  return { manifest: PINNED_OSMO_TAXONOMY, nodes, counts };
};

export const loadPinnedOsmoTaxonomy = async (sourcePath = DEFAULT_SOURCE) =>
  parsePinnedOsmoTaxonomy(await readFile(sourcePath));
