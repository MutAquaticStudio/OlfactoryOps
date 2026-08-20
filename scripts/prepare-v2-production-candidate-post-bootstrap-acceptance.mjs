import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const rc10Sha = "fe77c96f9306e3a0ce9622e9f7eef6ee2b5cf6dd";
export const candidateAcceptanceSourcePath =
  "scripts/verify-v2-production-candidate-acceptance.mjs";
export const rc10CandidateAcceptanceSourceSha256 =
  "36287bdc62cd192b2b8d999b6f0e72f0346b140de02b541d0ec1c3841826acf6";

const postBootstrapMode = "POST_BOOTSTRAP";
const legacyPreBootstrapMode = "LEGACY_PRE_BOOTSTRAP";
const platformFixtureStart =
  "    const controlPlane = await signup('platform-control', credentials(suffix, 'Platform control'))";
const acceptanceResultStart = `    console.log(JSON.stringify({
      productionCandidateAcceptance: 'PASS', apiWorker: 'PASS', hyperdrive: 'PASS', rlsCandidate: 'PASS',
      tenantIsolationCandidate: 'PASS', roleE2eCandidate: 'PASS', platformAdminCandidate: 'PASS', roles: roleResults,
    }))`;

function occurrences(source, value) {
  return source.split(value).length - 1;
}

export function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function candidateAcceptancePolicy({ mode, releaseSha }) {
  if (mode === legacyPreBootstrapMode) {
    return {
      mode,
      requiresPlatformOwnerReadiness: false,
      usesImmutableAcceptanceHarness: true,
    };
  }

  if (mode === postBootstrapMode && releaseSha === rc10Sha) {
    return {
      mode,
      requiresPlatformOwnerReadiness: true,
      usesImmutableAcceptanceHarness: false,
    };
  }

  throw new Error("CANDIDATE_ACCEPTANCE_POLICY_INVALID");
}

export function preparePostBootstrapAcceptanceSource(
  source,
  { expectedSourceSha256 = rc10CandidateAcceptanceSourceSha256 } = {},
) {
  if (sha256(source) !== expectedSourceSha256) {
    throw new Error("POST_BOOTSTRAP_ACCEPTANCE_SOURCE_IDENTITY_INVALID");
  }
  if (
    occurrences(source, platformFixtureStart) !== 1 ||
    occurrences(source, acceptanceResultStart) !== 1
  ) {
    throw new Error("POST_BOOTSTRAP_ACCEPTANCE_SOURCE_SHAPE_INVALID");
  }

  const fixtureStart = source.indexOf(platformFixtureStart);
  const resultStart = source.indexOf(acceptanceResultStart);
  const platformFixture = source.slice(fixtureStart, resultStart);
  for (const requiredFragment of [
    "platform_owner_fixture_not_isolated",
    "INSERT INTO v2_platform_operators",
    "platformOperatorFixtureIds.push",
  ]) {
    if (!platformFixture.includes(requiredFragment)) {
      throw new Error("POST_BOOTSTRAP_ACCEPTANCE_SOURCE_SHAPE_INVALID");
    }
  }

  const postBootstrapEvidence = `    await client.query(
      \`INSERT INTO v2_platform_operators (id, user_id, role_key, status, mfa_required, created_by)
       VALUES ($1, $2, 'PLATFORM_SUPPORT', 'ACTIVE', false, $2)\`,
      [\`pop_candidate_support_\${suffix}\`, second.userId],
    )
    platformOperatorFixtureIds.push(\`pop_candidate_support_\${suffix}\`)
    const platformSupport = await login(second, candidateAdminHostname)
    const supportOverview = await expectStatus(config, '/v2/admin/overview', { origin: platformSupport.origin, cookie: platformSupport.cookie }, 200, 'platform_support_overview_failed')
    assert(Number.isInteger(supportOverview.body?.activeWorkspaces), 'platform_overview_projection_invalid')
    await expectStatus(config, '/v2/admin/audit', { origin: platformSupport.origin, cookie: platformSupport.cookie }, 403, 'platform_support_audit_not_denied')
    console.log('CANDIDATE_ACCEPTANCE_MODE=POST_BOOTSTRAP')
    console.log('REAL_PLATFORM_OWNER_PRESERVED=PASS')

`;
  const postBootstrapResult = `    console.log(JSON.stringify({
      productionCandidateAcceptance: 'PASS', apiWorker: 'PASS', hyperdrive: 'PASS', rlsCandidate: 'PASS',
      tenantIsolationCandidate: 'PASS', roleE2eCandidate: 'PASS', platformSupportCandidate: 'PASS',
      platformAdminCandidate: 'SUPERSEDED_POST_BOOTSTRAP', platformOwnerReadOnlyCandidate: 'PASS', roles: roleResults,
    }))`;
  const transformed =
    `${source.slice(0, fixtureStart)}${postBootstrapEvidence}${source.slice(resultStart)}`.replace(
      acceptanceResultStart,
      postBootstrapResult,
    );

  if (
    transformed.includes("platform_owner_fixture_not_isolated") ||
    transformed.includes("VALUES ($1, $2, 'PLATFORM_OWNER'") ||
    transformed.includes("const platformOwner =") ||
    transformed.includes("platformMutation(")
  ) {
    throw new Error("POST_BOOTSTRAP_ACCEPTANCE_OWNER_MUTATION_PRESENT");
  }
  return transformed;
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (!value) throw new Error("POST_BOOTSTRAP_ACCEPTANCE_ARGUMENT_INVALID");
  return value;
}

function parseOptions(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || options.has(name)) {
      throw new Error("POST_BOOTSTRAP_ACCEPTANCE_ARGUMENT_INVALID");
    }
    options.set(name, value);
  }
  return options;
}

function readImmutableAcceptanceSource(releaseWorktree, releaseSha) {
  const head = execFileSync(
    "git",
    ["-C", releaseWorktree, "rev-parse", "HEAD"],
    {
      encoding: "utf8",
    },
  ).trim();
  if (head !== releaseSha) {
    throw new Error("POST_BOOTSTRAP_ACCEPTANCE_RELEASE_IDENTITY_INVALID");
  }
  return execFileSync(
    "git",
    [
      "-C",
      releaseWorktree,
      "show",
      `${releaseSha}:${candidateAcceptanceSourcePath}`,
    ],
    { encoding: "utf8" },
  );
}

export function preparePostBootstrapAcceptanceOverlay({
  releaseWorktree,
  releaseSha,
  outputPath,
}) {
  candidateAcceptancePolicy({ mode: postBootstrapMode, releaseSha });
  const source = readImmutableAcceptanceSource(
    resolve(releaseWorktree),
    releaseSha,
  );
  const transformed = preparePostBootstrapAcceptanceSource(source);
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  chmodSync(dirname(output), 0o700);
  writeFileSync(output, transformed, { encoding: "utf8", mode: 0o600 });
  chmodSync(output, 0o600);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const options = parseOptions(process.argv.slice(2));
    preparePostBootstrapAcceptanceOverlay({
      releaseWorktree: requiredOption(options, "--release-worktree"),
      releaseSha: requiredOption(options, "--release-sha"),
      outputPath: requiredOption(options, "--output"),
    });
    console.log("POST_BOOTSTRAP_ACCEPTANCE_OVERLAY=PASS");
  } catch {
    console.log("POST_BOOTSTRAP_ACCEPTANCE_OVERLAY=FAIL");
    process.exitCode = 1;
  }
}
