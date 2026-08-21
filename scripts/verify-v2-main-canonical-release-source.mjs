import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const temporaryBranches = [
  ["codex", "v2-production-go-live"].join("/"),
  ["codex", "cloudflare-cloud-native-runtime"].join("/"),
];

const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const localPackageLinks = Object.entries(packageLock.packages ?? {}).filter(
  ([path, entry]) =>
    path.startsWith("../") ||
    (entry?.link === true && String(entry.resolved ?? "").startsWith("../")),
);

if (localPackageLinks.length > 0) {
  throw new Error("package lock must not contain local worktree package links");
}

function sourceFiles(root) {
  return readdirSync(root, { recursive: true })
    .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".mjs"))
    .map((entry) => join(root, entry));
}

const forbiddenReferences = [];
for (const root of [".github/workflows", "scripts"]) {
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, "utf8");
    for (const branch of temporaryBranches) {
      if (source.includes(branch)) forbiddenReferences.push(`${file}:${branch}`);
    }
  }
}

if (forbiddenReferences.length > 0) {
  throw new Error(
    `temporary release branch dependency remains: ${forbiddenReferences.join(",")}`,
  );
}

const requiredTagContracts = [
  [
    ".github/workflows/v2-production-release-dispatch.yml",
    [
      "ACTIVE_RC_TAG: v2-production-rc10",
      "ACTIVE_RC_SHA: fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd",
      "READINESS_TAG: v2-production-ready",
      'test "$(git rev-list -n 1 "$ACTIVE_RC_TAG")" = "$ACTIVE_RC_SHA"',
      'test "$(git rev-list -n 1 "$READINESS_TAG")" = "$ACTIVE_RC_SHA"',
    ],
  ],
  [
    ".github/workflows/v2-production-live-finalization.yml",
    [
      "RC10_TAG: v2-production-rc10",
      "READY_TAG: v2-production-ready",
      "LIVE_TAG: v2-production-live",
      "RC9_TAG: v2-production-rc9",
      "RC11_TAG: v2-production-rc11",
      '! git show-ref --verify --quiet "refs/tags/$RC11_TAG"',
    ],
  ],
  [
    ".github/workflows/v2-production-first-release-rollback.yml",
    [
      "ACTIVE_RC_TAG: v2-production-rc10",
      "RC9_TAG: v2-production-rc9",
      "RC11_TAG: v2-production-rc11",
      '! git show-ref --verify --quiet "refs/tags/$RC11_TAG"',
    ],
  ],
  [
    ".github/workflows/v2-rc10-production-postcutover-route-rollback-preflight.yml",
    ["RC10_TAG: v2-production-rc10", "READY_TAG: v2-production-ready"],
  ],
];

for (const [file, fragments] of requiredTagContracts) {
  const source = readFileSync(file, "utf8");
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(`immutable release contract missing: ${file}:${fragment}`);
    }
  }
}

console.log("TEMP_RELEASE_BRANCH_RUNTIME_REFERENCES=0");
console.log("IMMUTABLE_RELEASE_TAG_CONTRACTS=PASS");
console.log("PORTABLE_PACKAGE_LOCK_CONTRACT=PASS");
