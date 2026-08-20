import { describe, expect, it } from "vitest";
import {
  candidateAcceptancePolicy,
  preparePostBootstrapAcceptanceSource,
  rc10Sha,
  sha256,
} from "./prepare-v2-production-candidate-post-bootstrap-acceptance.mjs";

function immutableAcceptanceFixture() {
  return `    await expectStatus(config, '/v2/admin/me', { origin: viewerA.origin }, 403, 'tenant_owner_platform_access_not_denied')
    const controlPlane = await signup('platform-control', credentials(suffix, 'Platform control'))
    const activePlatformOwner = await client.query("SELECT 1 FROM v2_platform_operators WHERE role_key = 'PLATFORM_OWNER' AND status = 'ACTIVE' LIMIT 1")
    assert(activePlatformOwner.rows.length === 0, 'platform_owner_fixture_not_isolated')
    await client.query(
      \`INSERT INTO v2_platform_operators (id, user_id, role_key, status, mfa_required, created_by)
       VALUES ($1, $2, 'PLATFORM_OWNER', 'ACTIVE', false, $2), ($3, $4, 'PLATFORM_SUPPORT', 'ACTIVE', false, $2)\`,
      [\`pop_candidate_owner_\${suffix}\`, first.userId, \`pop_candidate_support_\${suffix}\`, second.userId],
    )
    platformOperatorFixtureIds.push(\`pop_candidate_owner_\${suffix}\`, \`pop_candidate_support_\${suffix}\`)
    await expectStatus(config, '/v2/admin/audit', { origin: viewerA.origin }, 403, 'platform_support_audit_not_denied')

    console.log(JSON.stringify({
      productionCandidateAcceptance: 'PASS', apiWorker: 'PASS', hyperdrive: 'PASS', rlsCandidate: 'PASS',
      tenantIsolationCandidate: 'PASS', roleE2eCandidate: 'PASS', platformAdminCandidate: 'PASS', roles: roleResults,
    }))
`;
}

describe("post-bootstrap candidate acceptance overlay", () => {
  it("keeps the zero-owner legacy harness policy available", () => {
    expect(
      candidateAcceptancePolicy({
        mode: "LEGACY_PRE_BOOTSTRAP",
        releaseSha: "a".repeat(40),
      }),
    ).toEqual({
      mode: "LEGACY_PRE_BOOTSTRAP",
      requiresPlatformOwnerReadiness: false,
      usesImmutableAcceptanceHarness: true,
    });
  });

  it("allows post-bootstrap acceptance only for the immutable RC10 identity", () => {
    expect(
      candidateAcceptancePolicy({
        mode: "POST_BOOTSTRAP",
        releaseSha: rc10Sha,
      }),
    ).toEqual({
      mode: "POST_BOOTSTRAP",
      requiresPlatformOwnerReadiness: true,
      usesImmutableAcceptanceHarness: false,
    });
    expect(() =>
      candidateAcceptancePolicy({
        mode: "POST_BOOTSTRAP",
        releaseSha: "de0734df2d2b5b2dd3a2a67ee542131235e75eb7",
      }),
    ).toThrow("CANDIDATE_ACCEPTANCE_POLICY_INVALID");
  });

  it("removes every synthetic Platform Owner fixture operation while preserving bounded evidence", () => {
    const source = immutableAcceptanceFixture();
    const transformed = preparePostBootstrapAcceptanceSource(source, {
      expectedSourceSha256: sha256(source),
    });

    expect(transformed).toContain("CANDIDATE_ACCEPTANCE_MODE=POST_BOOTSTRAP");
    expect(transformed).toContain("REAL_PLATFORM_OWNER_PRESERVED=PASS");
    expect(transformed).toContain("platformSupportCandidate: 'PASS'");
    expect(transformed).toContain(
      "platformAdminCandidate: 'SUPERSEDED_POST_BOOTSTRAP'",
    );
    expect(transformed).toContain("platformOwnerReadOnlyCandidate: 'PASS'");
    expect(transformed).toContain("VALUES ($1, $2, 'PLATFORM_SUPPORT'");
    expect(transformed).not.toContain("platform_owner_fixture_not_isolated");
    expect(transformed).not.toContain("role_key = 'PLATFORM_OWNER'");
    expect(transformed).not.toContain("VALUES ($1, $2, 'PLATFORM_OWNER'");
    expect(transformed).not.toContain("pop_candidate_owner_");
    expect(transformed).not.toContain("const platformOwner =");
    expect(transformed).not.toContain("platformMutation(");
  });

  it("fails closed when the immutable acceptance source does not match its expected shape or digest", () => {
    const source = immutableAcceptanceFixture();
    expect(() => preparePostBootstrapAcceptanceSource(source)).toThrow(
      "POST_BOOTSTRAP_ACCEPTANCE_SOURCE_IDENTITY_INVALID",
    );
    expect(() =>
      preparePostBootstrapAcceptanceSource(`${source}\n${source}`, {
        expectedSourceSha256: sha256(`${source}\n${source}`),
      }),
    ).toThrow("POST_BOOTSTRAP_ACCEPTANCE_SOURCE_SHAPE_INVALID");
  });
});
