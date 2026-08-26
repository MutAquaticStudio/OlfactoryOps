import { useState } from "react";
import type { FormEvent } from "react";

type GlobalMaterialReference = {
  id: string;
  canonicalName: string;
  name?: string;
  scope: "GLOBAL";
  readOnly: true;
  chemicalEntityName?: string | null;
  entityEvidenceStatus?: string | null;
  molecularFormula?: string | null;
  inchiKey?: string | null;
  taxonomyLabels?: string[];
  identifiers?: Array<{ type: string; value: string }>;
};

type GlobalMaterialListPayload = {
  scope: "GLOBAL";
  readOnly: true;
  items: GlobalMaterialReference[];
};

type GlobalMaterialDetailPayload = {
  material: GlobalMaterialReference;
};

function isGlobalMaterialReference(value: unknown): value is GlobalMaterialReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlobalMaterialReference>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.canonicalName === "string" &&
    candidate.scope === "GLOBAL" &&
    candidate.readOnly === true
  );
}

export function designStudioGlobalMaterialListPath(query: string) {
  const params = new URLSearchParams({
    lifecycleStatus: "ACTIVE",
    evidenceStatus: "VERIFIED",
    resolutionStatus: "RESOLVED",
    page: "1",
    pageSize: "8",
  });
  const text = query.trim().slice(0, 160);
  if (text) params.set("text", text);
  return `/materials?${params.toString()}`;
}

export function designStudioGlobalMaterialDetailPath(materialId: string) {
  return `/materials/${encodeURIComponent(materialId)}`;
}

export async function designStudioGlobalMaterialRead<T>(
  apiBase: string,
  path: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(`${apiBase.replace(/\/$/, "")}${path}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "The global material catalog could not be read.",
    );
  }
  return payload as T;
}

export function DesignStudioGlobalMaterialReference({
  apiBase,
}: {
  apiBase: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalMaterialReference[]>([]);
  const [selected, setSelected] = useState<GlobalMaterialReference | null>(null);
  const [state, setState] = useState<"IDLE" | "LOADING" | "READY" | "ERROR">(
    "IDLE",
  );
  const [selectionState, setSelectionState] = useState<
    "IDLE" | "LOADING" | "READY" | "ERROR"
  >("IDLE");

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setState("LOADING");
    try {
      const payload = await designStudioGlobalMaterialRead<GlobalMaterialListPayload>(
        apiBase,
        designStudioGlobalMaterialListPath(query),
      );
      if (
        payload.scope !== "GLOBAL" ||
        payload.readOnly !== true ||
        !Array.isArray(payload.items) ||
        !payload.items.every(isGlobalMaterialReference)
      ) {
        throw new Error("The catalog did not prove its global read-only scope.");
      }
      setResults(payload.items);
      setState("READY");
    } catch {
      setResults([]);
      setState("ERROR");
    }
  };

  const selectReference = async (material: GlobalMaterialReference) => {
    setSelectionState("LOADING");
    setSelected(null);
    try {
      const payload = await designStudioGlobalMaterialRead<GlobalMaterialDetailPayload>(
        apiBase,
        designStudioGlobalMaterialDetailPath(material.id),
      );
      if (!isGlobalMaterialReference(payload.material)) {
        throw new Error("The material did not prove its global read-only scope.");
      }
      setSelected(payload.material);
      setSelectionState("READY");
    } catch {
      setSelectionState("ERROR");
    }
  };

  const cas = selected?.identifiers?.find((identifier) => identifier.type === "CAS")
    ?.value;

  return (
    <section
      className="v2-design-global-material-reference"
      data-testid="v2-design-global-material-reference"
      aria-labelledby="design-global-material-heading"
    >
      <div className="v2-panel-heading">
        <div>
          <span className="v2-section-kicker">Canonical material reference</span>
          <h3 id="design-global-material-heading">Search verified global materials</h3>
          <p>
            Select a canonical scientific reference for research context. No global
            record is modified, and this selection does not change formula composition.
          </p>
        </div>
        <div className="v2-scope-legend">
          <span className="v2-scope-chip is-active">GLOBAL · READ ONLY</span>
        </div>
      </div>

      <form className="v2-inline-form" onSubmit={(event) => void search(event)}>
        <label>
          Global material
          <input
            required
            maxLength={160}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ambroxan, vanillin, linalool…"
          />
        </label>
        <button className="v2-secondary-button" type="submit" disabled={state === "LOADING"}>
          {state === "LOADING" ? "Searching…" : "Search global catalog"}
        </button>
      </form>

      {state === "ERROR" ? (
        <div className="v2-alert is-error" role="alert">
          The global material catalog could not be loaded. No fallback reference was
          generated.
        </div>
      ) : null}
      {state === "READY" && results.length === 0 ? (
        <p className="v2-muted">No verified global material matches this search.</p>
      ) : null}
      {results.length ? (
        <div className="v2-member-list" aria-label="Verified global material results">
          {results.map((material) => (
            <div className="v2-member-row" key={material.id}>
              <strong>{material.canonicalName}</strong>
              <span>{material.chemicalEntityName || "Chemical identity not available"}</span>
              <span>
                {material.taxonomyLabels?.slice(0, 2).join(" · ") ||
                  material.entityEvidenceStatus ||
                  "Verified reference"}
              </span>
              <button
                className="v2-text-button"
                type="button"
                onClick={() => void selectReference(material)}
                disabled={selectionState === "LOADING"}
              >
                Select reference
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {selectionState === "ERROR" ? (
        <div className="v2-alert is-error" role="alert">
          The selected global reference could not be verified from its detail record.
        </div>
      ) : null}
      {selected ? (
        <div className="v2-member-list" aria-label="Selected global material reference">
          <div className="v2-member-row">
            <strong>{selected.canonicalName}</strong>
            <span>{selected.chemicalEntityName || "Chemical identity not available"}</span>
            <span>{cas ? `CAS ${cas}` : selected.molecularFormula || "Formula not available"}</span>
            <a
              className="v2-text-button"
              href={`/material-intelligence/materials/${encodeURIComponent(selected.id)}`}
            >
              Open full material detail
            </a>
          </div>
          <p className="v2-muted">
            Reference selected locally for Design Studio context. Formula lines and
            tenant preparations remain unchanged.
          </p>
        </div>
      ) : null}
    </section>
  );
}
