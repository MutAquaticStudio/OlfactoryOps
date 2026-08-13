import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const releaseSha = process.env.V2_REQUEST_PATH_SHADOW_RELEASE_SHA ?? "";
const worktree = process.env.V2_REQUEST_PATH_SHADOW_WORKTREE ?? "";
const hyperdriveId = process.env.V2_REQUEST_PATH_SHADOW_HYPERDRIVE_ID ?? "";
const outputPath = process.env.V2_REQUEST_PATH_SHADOW_CONFIG ?? "";
const shadowWorkerName = process.env.V2_REQUEST_PATH_SHADOW_WORKER_NAME ?? "";
const pagesOrigin =
  "https://production-candidate.olfactoryops-v2-production-candidate.pages.dev";

if (!/^[a-f0-9]{40}$/i.test(releaseSha))
  throw new Error("shadow release SHA must be exact");
if (!worktree || !outputPath)
  throw new Error("shadow worktree and config path are required");
if (!/^[0-9a-f-]{32,36}$/i.test(hyperdriveId))
  throw new Error("shadow Hyperdrive ID is invalid");
if (!/^oo-v2-router-rc9-shadow-[0-9]+$/.test(shadowWorkerName))
  throw new Error("shadow Worker name is invalid");
if (resolve(worktree) === resolve("."))
  throw new Error("shadow source worktree cannot be the operations checkout");
if (!existsSync(resolve(worktree, "worker/v2-tenant-router.ts")))
  throw new Error("exact RC9 shadow source is missing its tenant Router");

const packageJson = JSON.parse(
  readFileSync(resolve(worktree, "package.json"), "utf8"),
);
const packageLock = readFileSync(
  resolve(worktree, "package-lock.json"),
  "utf8",
);
if (packageJson.dependencies?.pg !== "^8.13.0")
  throw new Error("exact RC9 package.json must retain pg 8.13.0");
if (
  !/"node_modules\/wrangler":\s*\{\s*"version":\s*"4\.118\.0"/s.test(
    packageLock,
  )
)
  throw new Error("exact RC9 package-lock must retain Wrangler 4.118.0");

const outputDirectory = dirname(resolve(outputPath));
mkdirSync(outputDirectory, { recursive: true });
const main = relative(
  outputDirectory,
  resolve(worktree, "worker/v2-tenant-router.ts"),
).replaceAll("\\", "/");
const rendered = `# Exact RC9 shadow: service-bound only, never public.\nname = "${shadowWorkerName}"\nmain = "${main}"\ncompatibility_date = "2026-08-11"\ncompatibility_flags = ["nodejs_compat"]\nworkers_dev = false\n\n[vars]\nPAGES_ORIGIN = "${pagesOrigin}"\nV2_WORKSPACE_BASE_DOMAIN = "next.labofscents.org"\nRELEASE_ENVIRONMENT = "production"\nRELEASE_GIT_SHA = "${releaseSha}"\n\n[[hyperdrive]]\nbinding = "HYPERDRIVE"\nid = "${hyperdriveId}"\n`;
if (
  /^\s*(?:routes\s*=|\[\[routes\]\]|custom_domain\s*=)/m.test(rendered) ||
  !/^workers_dev\s*=\s*false$/m.test(rendered) ||
  rendered.includes("REPLACE_WITH_")
)
  throw new Error(
    "shadow config must be service-bound only without routes or custom domains",
  );
writeFileSync(outputPath, rendered, "utf8");
console.log("EXACT_RC9_SHADOW_CONFIG=PASS");
