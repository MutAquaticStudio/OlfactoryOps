import { describe, expect, it } from "vitest";

import { prepareFirstReleaseUnroutedConfig } from "./prepare-v2-first-release-unrouted-config.mjs";

describe("first-release unrouted config", () => {
  it.each([
    [
      "api",
      "olfactoryops-v2-api-production",
      'routes = [{ pattern = "api.labofscents.org/*", zone_name = "labofscents.org" }]',
    ],
    [
      "tenantRouter",
      "olfactoryops-v2-tenant-router-production",
      'routes = [{ pattern = "*.labofscents.org/*", zone_name = "labofscents.org" }]',
    ],
  ])("removes only the approved %s public route", (component, name, route) => {
    const result = prepareFirstReleaseUnroutedConfig({
      component,
      content: 'name = "' + name + '"\nworkers_dev = false\n\n' + route + "\n",
    });
    expect(result).not.toContain("routes =");
    expect(result).toContain('name = "' + name + '"');
  });

  it("refuses a wrong route or service instead of removing arbitrary config", () => {
    expect(() =>
      prepareFirstReleaseUnroutedConfig({
        component: "api",
        content:
          'name = "other"\nworkers_dev = false\nroutes = [{ pattern = "api.labofscents.org/*", zone_name = "labofscents.org" }]\n',
      }),
    ).toThrow("SERVICE_MISMATCH");
    expect(() =>
      prepareFirstReleaseUnroutedConfig({
        component: "api",
        content:
          'name = "olfactoryops-v2-api-production"\nworkers_dev = false\nroutes = [{ pattern = "*.labofscents.org/*", zone_name = "labofscents.org" }]\n',
      }),
    ).toThrow("ROUTE_INVALID");
  });
});
