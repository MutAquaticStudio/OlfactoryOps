import { expect, test } from "vitest";

import {
  attachCandidateDomain,
  candidateDomainPreflightEvidence,
  candidateDomainResetConfig,
  candidateDomainResetExpectation,
  detachCandidateDomain,
  inspectCandidateDomainList,
  restoreCandidateDomain,
  waitForCandidateDomain,
} from "./reset-v2-production-candidate-custom-domain.mjs";

const domainId = "11111111111111111111111111111111";
const zoneId = "22222222222222222222222222222222";

function environment(overrides = {}) {
  return {
    CLOUDFLARE_ACCOUNT_ID: "account-id-not-emitted",
    CLOUDFLARE_API_TOKEN: "token-not-emitted",
    CANDIDATE_DOMAIN_RESET_RELEASE_SHA:
      candidateDomainResetExpectation.releaseSha,
    CANDIDATE_DOMAIN_RESET_FIXTURE_HOSTNAME:
      candidateDomainResetExpectation.fixtureHostname,
    ...overrides,
  };
}

function config(overrides = {}) {
  return candidateDomainResetConfig(environment(overrides));
}

function envelope(result, { success = true, status = 200 } = {}) {
  return new Response(JSON.stringify({ success, result }), { status });
}

function candidateDomain(overrides = {}) {
  return {
    id: domainId,
    hostname: candidateDomainResetExpectation.fixtureHostname,
    service: candidateDomainResetExpectation.routerService,
    zone_id: zoneId,
    zone_name: candidateDomainResetExpectation.zoneName,
    ...overrides,
  };
}

test("pins the immutable RC9 reset inputs", () => {
  expect(config()).toMatchObject({
    releaseSha: candidateDomainResetExpectation.releaseSha,
    fixtureHostname: candidateDomainResetExpectation.fixtureHostname,
  });
  expect(() =>
    config({ CANDIDATE_DOMAIN_RESET_RELEASE_SHA: "not-the-active-rc" }),
  ).toThrow("INVALID_IMMUTABLE_INPUT");
  expect(() =>
    config({
      CANDIDATE_DOMAIN_RESET_FIXTURE_HOSTNAME: "public-production.invalid",
    }),
  ).toThrow("INVALID_IMMUTABLE_INPUT");
});

test("accepts only one exact candidate Router Custom Domain", () => {
  const state = inspectCandidateDomainList({
    result: [candidateDomain()],
    success: true,
  });

  expect(state).toMatchObject({
    listRead: true,
    attachment: "CANDIDATE_ROUTER",
    domainId,
    zoneId,
    exactHostRows: "ONE",
    serviceMatch: "PASS",
    zoneMatch: "PASS",
    domainIdState: "PRESENT",
    zoneIdState: "PRESENT",
  });
  expect(
    inspectCandidateDomainList({
      result: [candidateDomain(), candidateDomain()],
      success: true,
    }),
  ).toMatchObject({ attachment: "AMBIGUOUS" });
  expect(
    inspectCandidateDomainList({
      result: [candidateDomain({ service: "other-service" })],
      success: true,
    }),
  ).toMatchObject({ attachment: "OTHER_SERVICE" });
  expect(
    inspectCandidateDomainList({
      result: [candidateDomain({ hostname: "other.next.labofscents.org" })],
      success: true,
    }),
  ).toMatchObject({ attachment: "ABSENT" });
});

test("accepts opaque Cloudflare control-plane identifiers without logging them", () => {
  const opaqueDomainId = "domain:opaque-rc9_42";
  const opaqueZoneId = "zone:opaque-rc9_42";
  const state = inspectCandidateDomainList({
    result: [candidateDomain({ id: opaqueDomainId, zone_id: opaqueZoneId })],
    success: true,
  });

  expect(state).toMatchObject({
    attachment: "CANDIDATE_ROUTER",
    domainId: opaqueDomainId,
    zoneId: opaqueZoneId,
    domainIdState: "PRESENT",
    zoneIdState: "PRESENT",
  });
  const evidence = candidateDomainPreflightEvidence(state);
  expect(evidence).toMatchObject({
    apiRead: "PASS",
    exactHostRows: "ONE",
    serviceMatch: "PASS",
    zoneMatch: "PASS",
    domainId: "PRESENT",
    zoneId: "PRESENT",
    classification: "EXACT_CANDIDATE_ROUTER",
  });
  expect(JSON.stringify(evidence)).not.toContain(opaqueDomainId);
  expect(JSON.stringify(evidence)).not.toContain(opaqueZoneId);
});

test("fails closed when a candidate domain identifier is missing or unsafe", () => {
  const missing = inspectCandidateDomainList({
    result: [candidateDomain({ zone_id: undefined })],
    success: true,
  });
  const unsafe = inspectCandidateDomainList({
    result: [candidateDomain({ id: "contains\na newline" })],
    success: true,
  });

  expect(missing).toMatchObject({
    attachment: "INVALID",
    exactHostRows: "ONE",
    serviceMatch: "PASS",
    zoneMatch: "PASS",
    zoneIdState: "MISSING_OR_UNSUPPORTED",
  });
  expect(unsafe).toMatchObject({
    attachment: "INVALID",
    domainIdState: "MISSING_OR_UNSUPPORTED",
  });
});

test("rechecks ownership and detaches only the exact candidate domain id", async () => {
  const calls = [];
  const fetchFn = async (request, options) => {
    calls.push({ url: new URL(request), options });
    if (options.method === "GET") return envelope([candidateDomain()]);
    if (options.method === "DELETE") return envelope(null);
    throw new Error("unexpected request");
  };

  await expect(
    detachCandidateDomain({
      config: config(),
      expectedDomainId: domainId,
      expectedZoneId: zoneId,
      fetchFn,
    }),
  ).resolves.toEqual({ detached: true });
  expect(calls.map(({ options }) => options.method)).toEqual(["GET", "DELETE"]);
  expect(calls[0].url.searchParams.get("hostname")).toBe(
    candidateDomainResetExpectation.fixtureHostname,
  );
  expect(calls[1].url.pathname).toMatch(new RegExp(`/${domainId}$`));
  expect(calls.some(({ options }) => options.method === "PUT")).toBe(false);
});

test("does not detach after a candidate-domain ownership change", async () => {
  const calls = [];
  await expect(
    detachCandidateDomain({
      config: config(),
      expectedDomainId: domainId,
      expectedZoneId: zoneId,
      fetchFn: async (request, options) => {
        calls.push(options.method);
        return envelope([candidateDomain({ service: "other-service" })]);
      },
    }),
  ).rejects.toThrow("CUSTOM_DOMAIN_OWNERSHIP_MISMATCH");
  expect(calls).toEqual(["GET"]);
});

test("never detaches when exact candidate ownership lacks a usable identifier", async () => {
  const calls = [];
  await expect(
    detachCandidateDomain({
      config: config(),
      expectedDomainId: domainId,
      expectedZoneId: zoneId,
      fetchFn: async (_request, options) => {
        calls.push(options.method);
        return envelope([candidateDomain({ zone_id: undefined })]);
      },
    }),
  ).rejects.toThrow("CUSTOM_DOMAIN_OWNERSHIP_MISMATCH");
  expect(calls).toEqual(["GET"]);
});

test("never detaches when the candidate domain moves to another zone after preflight", async () => {
  const calls = [];
  await expect(
    detachCandidateDomain({
      config: config(),
      expectedDomainId: domainId,
      expectedZoneId: zoneId,
      fetchFn: async (_request, options) => {
        calls.push(options.method);
        return envelope([
          candidateDomain({ zone_id: "zone:changed-after-preflight" }),
        ]);
      },
    }),
  ).rejects.toThrow("CUSTOM_DOMAIN_OWNERSHIP_CHANGED");
  expect(calls).toEqual(["GET"]);
});

test("can restore the exact candidate domain after an ambiguous detach response", async () => {
  const calls = [];
  let getCount = 0;
  const fetchFn = async (_request, options) => {
    calls.push(options.method);
    if (options.method === "GET") {
      getCount += 1;
      return envelope(
        getCount === 1
          ? [candidateDomain()]
          : getCount < 4
            ? []
            : [candidateDomain()],
      );
    }
    if (options.method === "DELETE")
      return envelope(null, { success: false, status: 522 });
    if (options.method === "PUT") return envelope(candidateDomain());
    throw new Error("unexpected request");
  };

  await expect(
    detachCandidateDomain({
      config: config(),
      expectedDomainId: domainId,
      expectedZoneId: zoneId,
      fetchFn,
    }),
  ).rejects.toThrow("CUSTOM_DOMAIN_DETACH_FAILED");
  await expect(
    restoreCandidateDomain({
      config: config(),
      zoneId,
      fetchFn,
      sleep: async () => undefined,
    }),
  ).resolves.toEqual({ restoration: "RESTORED" });
  expect(calls).toContain("DELETE");
  expect(calls).toContain("PUT");
});

test("reattaches only the exact candidate hostname and Router service", async () => {
  const calls = [];
  await expect(
    attachCandidateDomain({
      config: config(),
      zoneId,
      fetchFn: async (request, options) => {
        calls.push({ url: new URL(request), options });
        if (options.method === "GET") return envelope([]);
        if (options.method === "PUT") return envelope(candidateDomain());
        throw new Error("unexpected request");
      },
    }),
  ).resolves.toEqual({ attached: true });
  expect(calls.map(({ options }) => options.method)).toEqual(["GET", "PUT"]);
  expect(JSON.parse(calls[1].options.body)).toEqual({
    hostname: candidateDomainResetExpectation.fixtureHostname,
    service: candidateDomainResetExpectation.routerService,
    zone_id: zoneId,
    zone_name: candidateDomainResetExpectation.zoneName,
  });
  expect(calls[1].options.body).not.toContain("*");
});

test("refuses an attach unless the exact candidate hostname is confirmed absent", async () => {
  const calls = [];
  await expect(
    attachCandidateDomain({
      config: config(),
      zoneId,
      fetchFn: async (_request, options) => {
        calls.push(options.method);
        return envelope([candidateDomain()]);
      },
    }),
  ).rejects.toThrow("CUSTOM_DOMAIN_DETACHMENT_UNCONFIRMED");
  expect(calls).toEqual(["GET"]);
});

test("requires the preflight-verified zone id for an exact reattach", async () => {
  const calls = [];
  await expect(
    attachCandidateDomain({
      config: config(),
      zoneId: "not\na zone id",
      fetchFn: async (_request, options) => {
        calls.push(options.method);
        return envelope([]);
      },
    }),
  ).rejects.toThrow("INVALID_CUSTOM_DOMAIN_ZONE_ID");
  expect(calls).toEqual([]);

  await expect(
    attachCandidateDomain({
      config: config(),
      zoneId,
      fetchFn: async (_request, options) => {
        if (options.method === "GET") return envelope([]);
        return envelope(
          candidateDomain({ zone_id: "33333333333333333333333333333333" }),
        );
      },
    }),
  ).rejects.toThrow("CUSTOM_DOMAIN_ATTACH_FAILED");
});

test("waits only within a bounded candidate-domain propagation window", async () => {
  let reads = 0;
  const result = await waitForCandidateDomain({
    config: config(),
    desiredAttachment: "CANDIDATE_ROUTER",
    maxAttempts: 3,
    intervalMilliseconds: 0,
    sleep: async () => undefined,
    fetchFn: async () => {
      reads += 1;
      return envelope(reads === 1 ? [] : [candidateDomain()]);
    },
  });
  expect(result.attempts).toBe(2);
  expect(reads).toBe(2);
});

test("restores only an absent candidate domain and never changes another service", async () => {
  const calls = [];
  await expect(
    restoreCandidateDomain({
      config: config(),
      zoneId,
      sleep: async () => undefined,
      fetchFn: async (_request, options) => {
        calls.push(options.method);
        if (options.method === "GET") {
          const getCount = calls.filter((method) => method === "GET").length;
          return envelope(getCount < 3 ? [] : [candidateDomain()]);
        }
        if (options.method === "PUT") return envelope(candidateDomain());
        throw new Error("unexpected request");
      },
    }),
  ).resolves.toEqual({ restoration: "RESTORED" });
  expect(calls).toContain("PUT");

  const otherServiceCalls = [];
  await expect(
    restoreCandidateDomain({
      config: config(),
      zoneId,
      fetchFn: async (_request, options) => {
        otherServiceCalls.push(options.method);
        return envelope([candidateDomain({ service: "other-service" })]);
      },
    }),
  ).rejects.toThrow("CUSTOM_DOMAIN_DETACHMENT_UNCONFIRMED");
  expect(otherServiceCalls).toEqual(["GET"]);
});

test("safe domain state never carries account credentials", () => {
  const emitted = JSON.stringify(
    inspectCandidateDomainList({ result: [candidateDomain()], success: true }),
  );
  expect(emitted).not.toContain("token-not-emitted");
  expect(emitted).not.toContain("account-id-not-emitted");
});
