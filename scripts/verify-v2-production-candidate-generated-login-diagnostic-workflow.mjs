import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  new URL(
    "../.github/workflows/v2-production-candidate-generated-login-diagnostic.yml",
    import.meta.url,
  ),
  "utf8",
);
const diagnostic = readFileSync(
  new URL(
    "./diagnose-v2-production-candidate-generated-login.mjs",
    import.meta.url,
  ),
  "utf8",
);
const required = [
  "name: V2 Production Candidate Generated Login Diagnostic",
  "workflow_dispatch:",
  "release_sha:",
  "confirm:",
  "DIAGNOSE_RC9_GENERATED_LOGIN",
  "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
  "github.ref == 'refs/heads/main'",
  "github.ref_type == 'branch'",
  "environment: production",
  "PRODUCTION_CANDIDATE_ACCEPTANCE_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}",
  "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
  "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
  "V2_PASSWORD_PEPPER: ${{ secrets.V2_PASSWORD_PEPPER }}",
  "npm ci --ignore-scripts",
  "V2_PRODUCTION_CANDIDATE_TENANT_URL: ${{ vars.PRODUCTION_CANDIDATE_SMOKE_TENANT_URL }}",
  "node scripts/diagnose-v2-production-candidate-generated-login.mjs",
];
for (const fragment of required)
  if (!source.includes(fragment))
    throw new Error(
      "generated login diagnostic workflow missing required protected contract",
    );
if (
  !/^on:\n  workflow_dispatch:/m.test(source) ||
  /\n  (?:push|pull_request|schedule|workflow_call|workflow_run):/m.test(source)
)
  throw new Error("generated login diagnostic must be workflow_dispatch only");
for (const forbidden of [
  /wrangler\s+(?:deploy|delete|secret)/,
  /wrangler\s+pages/,
  /workers\/domains/,
  /workers\/routes/,
  /psql\b/,
  /git worktree/,
  /V2_SESSION_PEPPER:\s*\$\{\{ secrets/,
  /V2_INVITATION_ENCRYPTION_KEY:\s*\$\{\{ secrets/,
]) {
  if (forbidden.test(source))
    throw new Error(
      "generated login diagnostic workflow contains a forbidden remediation or secret operation",
    );
}
const identity = source.indexOf("Run one guarded generated-login diagnostic");
if (identity < source.indexOf("Verify the immutable RC9 login"))
  throw new Error(
    "fixture-capable diagnostic must follow immutable RC9 validation",
  );
for (const fragment of [
  "CANDIDATE_API_RELEASE_IDENTITY",
  "CANDIDATE_API_ACTIVE_VERSION_CAPTURED",
  "CANDIDATE_API_HYPERDRIVE_BINDING",
  "CANDIDATE_API_SECRET_BINDING_NAMES",
  "CANDIDATE_API_RUNTIME_VARS",
  "FIXTURE_CREATION_GUARDS",
  "let fixtureCreated = false",
  'if (fixtureCreated) fail("SECOND_FIXTURE_REJECTED")',
  "finally",
  "cleanupFixture",
])
  if (!diagnostic.includes(fragment))
    throw new Error(
      "generated login diagnostic is missing a fixture safety invariant",
    );
if (
  diagnostic.indexOf("FIXTURE_CREATION_GUARDS") >
  diagnostic.indexOf("const signup = await adapters.signup")
)
  throw new Error("fixture creation can occur before all same-run guards pass");
console.log(
  JSON.stringify({
    GENERATED_LOGIN_DIAGNOSTIC_WORKFLOW: "PASS",
    GENERATED_LOGIN_DIAGNOSTIC_NO_REMEDIATION: "PASS",
  }),
);

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = 0;
