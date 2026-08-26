import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DesignStudioGlobalMaterialReference,
  designStudioGlobalMaterialDetailPath,
  designStudioGlobalMaterialListPath,
  designStudioGlobalMaterialRead,
} from "./DesignStudioGlobalMaterialReference";

describe("Design Studio global material reference", () => {
  it("renders a compact, explicitly read-only global reference seam", () => {
    const markup = renderToStaticMarkup(
      <DesignStudioGlobalMaterialReference
        apiBase="/api/v1/v2/material-intelligence"
      />,
    );

    expect(markup).toContain("GLOBAL · READ ONLY");
    expect(markup).toContain("Search verified global materials");
    expect(markup).toContain("does not change formula composition");
  });

  it("builds bounded list and detail GET paths", () => {
    expect(designStudioGlobalMaterialListPath(" Ambroxan ")).toBe(
      "/materials?lifecycleStatus=ACTIVE&evidenceStatus=VERIFIED&resolutionStatus=RESOLVED&page=1&pageSize=8&text=Ambroxan",
    );
    expect(designStudioGlobalMaterialDetailPath("material/a")).toBe(
      "/materials/material%2Fa",
    );
  });

  it("uses an authenticated GET with no global mutation body", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ scope: "GLOBAL", readOnly: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await designStudioGlobalMaterialRead(
      "https://api-beta.labofscents.org/api/v1/v2/material-intelligence",
      "/materials?page=1",
      undefined,
      fetcher as typeof fetch,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://api-beta.labofscents.org/api/v1/v2/material-intelligence/materials?page=1",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    );
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });
});
