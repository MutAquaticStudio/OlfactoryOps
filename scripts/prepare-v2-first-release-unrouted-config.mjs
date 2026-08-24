import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const expected = {
  api: {
    name: "olfactoryops-v2-api-production",
    route:
      'routes = [{ pattern = "api.labofscents.org/*", zone_name = "labofscents.org" }]',
  },
  tenantRouter: {
    name: "olfactoryops-v2-tenant-router-production",
    route:
      'routes = [{ pattern = "*.labofscents.org/*", zone_name = "labofscents.org" }]',
  },
};

export function prepareFirstReleaseUnroutedConfig({ content, component }) {
  const specification = expected[component];
  if (!specification || typeof content !== "string") {
    throw new Error("FIRST_RELEASE_UNROUTED_CONFIG_INVALID");
  }
  if (!content.includes('name = "' + specification.name + '"')) {
    throw new Error("FIRST_RELEASE_UNROUTED_CONFIG_SERVICE_MISMATCH");
  }
  if (!content.includes("workers_dev = false")) {
    throw new Error("FIRST_RELEASE_UNROUTED_CONFIG_WORKERS_DEV_INVALID");
  }
  const occurrences = content.split(specification.route).length - 1;
  if (occurrences !== 1) {
    throw new Error("FIRST_RELEASE_UNROUTED_CONFIG_ROUTE_INVALID");
  }
  const prepared = content.replace(specification.route, "");
  if (prepared.includes("routes =") || prepared.includes("[[routes]]")) {
    throw new Error("FIRST_RELEASE_UNROUTED_CONFIG_ROUTE_REMAINS");
  }
  return prepared;
}

export function prepareFirstReleaseUnroutedConfigFile({ file, component }) {
  const prepared = prepareFirstReleaseUnroutedConfig({
    content: readFileSync(file, "utf8"),
    component,
  });
  writeFileSync(file, prepared, "utf8");
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const [file, component] = process.argv.slice(2);
  prepareFirstReleaseUnroutedConfigFile({ file, component });
  console.log("FIRST_RELEASE_UNROUTED_CONFIG=PASS");
}
