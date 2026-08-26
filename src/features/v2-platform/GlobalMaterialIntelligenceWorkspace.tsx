import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Atom,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Search,
  ShieldCheck,
  Tags,
} from "lucide-react";

type ResolutionStatus =
  | "UNRESOLVED"
  | "RESOLVED"
  | "CONFLICTED"
  | "NOT_APPLICABLE";
type EvidenceStatus =
  | "UNVERIFIED"
  | "VERIFIED"
  | "CONFLICTED"
  | "REJECTED";
type LifecycleStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED";

export type GlobalMaterialReference = {
  id: string;
  canonicalName: string;
  scope: "GLOBAL";
  readOnly: true;
  releaseKey: string;
};

type GlobalMaterialListItem = GlobalMaterialReference & {
  name: string;
  lifecycleStatus: LifecycleStatus;
  evidenceStatus: EvidenceStatus;
  chemicalEntityId?: string | null;
  chemicalEntityName?: string | null;
  resolutionStatus?: ResolutionStatus | null;
  entityEvidenceStatus?: EvidenceStatus | null;
  molecularFormula?: string | null;
  molecularWeight?: number | null;
  exactMass?: number | null;
  inchiKey?: string | null;
  structureHash?: string | null;
  sourceVersion?: string | null;
  sourceObservationCount: number;
  physicalPropertyCount: number;
  taxonomyLabels: string[];
  eligibilityResult: "ELIGIBLE" | "REVIEW_REQUIRED";
};

type Identifier = {
  id: string;
  type: string;
  value: string;
  sourceKind: string;
  sourceRef: string;
  sourceVersion: string;
  evidenceStatus: EvidenceStatus;
};
export type PhysicalProperty = {
  id: string;
  propertyKey: string;
  valueKind: string;
  numericValue?: number | null;
  numericMin?: number | null;
  numericMax?: number | null;
  textValue?: string | null;
  unit?: string | null;
  conditions?: Record<string, unknown> | null;
  sourceKind: string;
  sourceRef: string;
  sourceVersion: string;
  evidenceStatus: EvidenceStatus;
};
type EligibilityDecision = {
  result: "ELIGIBLE" | "NOT_ELIGIBLE" | "REVIEW_REQUIRED";
  reasonCodes: string[];
  policyVersion: string;
};
type TaxonomyAssignment = {
  id: string;
  upstreamNodeKey: string;
  label: string;
  description?: string | null;
  parentLabel?: string | null;
  assignmentKind: string;
  confidence?: number | null;
  evidenceStatus: EvidenceStatus;
  upstreamRepository: string;
  upstreamCommit: string;
  licenseSpdx: string;
};
type ProvenanceSource = {
  sourceRowNumber: number;
  sourceRecordKey: string;
  sourceName: string;
  disposition: string;
  dispositionReason: string;
  contentHash: string;
};
type GlobalMaterialDetail = GlobalMaterialListItem & {
  entityType?: string | null;
  molecularIdentityId?: string | null;
  canonicalSmiles?: string | null;
  isomericSmiles?: string | null;
  inchi?: string | null;
  normalizationVersion?: string | null;
  sourceKind: string;
  sourceSha256: string;
  schemaVersion: string;
  releaseActivatedAt?: string | null;
  identifiers: Identifier[];
  physicalProperties: PhysicalProperty[];
  taxonomy: TaxonomyAssignment[];
  provenanceSources: ProvenanceSource[];
  eligibility: {
    material: EligibilityDecision;
    chemicalEntity?: EligibilityDecision | null;
  };
};
type ListPayload = {
  scope: "GLOBAL";
  readOnly: true;
  items: GlobalMaterialListItem[];
  page: number;
  pageSize: number;
  total: number;
};
export type GlobalMaterialFilters = {
  text: string;
  lifecycleStatus: LifecycleStatus;
  evidenceStatus: "" | EvidenceStatus;
  resolutionStatus: "" | ResolutionStatus;
  taxonomyNode: string;
  page: number;
};

class MaterialIntelligenceFailure extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function globalMaterialFiltersFromSearch(search: string): GlobalMaterialFilters {
  const query = new URLSearchParams(search);
  const lifecycle = query.get("lifecycleStatus");
  const evidence = query.get("evidenceStatus");
  const resolution = query.get("resolutionStatus");
  const rawPage = Number(query.get("page") ?? "1");
  return {
    text: query.get("text")?.slice(0, 160) ?? "",
    lifecycleStatus: ["DRAFT", "ACTIVE", "SUPERSEDED", "ARCHIVED"].includes(
      lifecycle ?? "",
    )
      ? (lifecycle as LifecycleStatus)
      : "ACTIVE",
    evidenceStatus: [
      "UNVERIFIED",
      "VERIFIED",
      "CONFLICTED",
      "REJECTED",
    ].includes(evidence ?? "")
      ? (evidence as EvidenceStatus)
      : "",
    resolutionStatus: [
      "UNRESOLVED",
      "RESOLVED",
      "CONFLICTED",
      "NOT_APPLICABLE",
    ].includes(resolution ?? "")
      ? (resolution as ResolutionStatus)
      : "",
    taxonomyNode: query.get("taxonomyNode")?.slice(0, 160) ?? "",
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

export function globalMaterialSearch(filters: GlobalMaterialFilters) {
  const query = new URLSearchParams({
    lifecycleStatus: filters.lifecycleStatus,
    page: String(filters.page),
  });
  if (filters.text.trim()) query.set("text", filters.text.trim());
  if (filters.evidenceStatus) {
    query.set("evidenceStatus", filters.evidenceStatus);
  }
  if (filters.resolutionStatus) {
    query.set("resolutionStatus", filters.resolutionStatus);
  }
  if (filters.taxonomyNode.trim()) {
    query.set("taxonomyNode", filters.taxonomyNode.trim());
  }
  return query.toString();
}

export function globalMaterialListPath(filters: GlobalMaterialFilters) {
  return `/material-intelligence?${globalMaterialSearch(filters)}`;
}

export function globalMaterialDetailPath(
  materialId: string,
  filters: GlobalMaterialFilters,
) {
  return `/material-intelligence/materials/${encodeURIComponent(materialId)}?${globalMaterialSearch(filters)}`;
}

export function globalMaterialIdFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const materialIndex = segments.lastIndexOf("materials");
  const isCatalogRoute =
    segments[0] === "material-intelligence" ||
    (segments[0] === "v2" && segments[1] === "material-intelligence") ||
    (segments[0] === "v2" &&
      segments[1] === "workspace" &&
      segments[2] === "material-intelligence");
  if (!isCatalogRoute || materialIndex < 0 || !segments[materialIndex + 1]) {
    return undefined;
  }
  try {
    return decodeURIComponent(segments[materialIndex + 1]);
  } catch {
    return undefined;
  }
}

async function intelligenceRequest<T>(
  apiBase: string,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new MaterialIntelligenceFailure(
      payload.error?.code ?? "REQUEST_FAILED",
      payload.error?.message ?? "Material Intelligence request failed.",
    );
  }
  return payload as T;
}

function label(value: string | null | undefined) {
  return value
    ? value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
    : "Not available";
}

function Status({
  value,
  tone,
  verbatim = false,
}: {
  value: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  verbatim?: boolean;
}) {
  return (
    <span className={`v2-mi-status is-${tone ?? "neutral"}`}>
      {verbatim ? value : label(value)}
    </span>
  );
}

function Field({
  label: fieldLabel,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="v2-mi-field">
      <dt>{fieldLabel}</dt>
      <dd className={mono ? "v2-mono" : undefined}>
        {value === null || value === undefined || value === ""
          ? "Not available"
          : String(value)}
      </dd>
    </div>
  );
}

export function GlobalMaterialIntelligenceWorkspace({
  apiBase,
  initialMaterialId,
  onNavigate,
}: {
  apiBase: string;
  initialMaterialId?: string;
  onNavigate: (path: string) => void;
}) {
  const [filters, setFilters] = useState<GlobalMaterialFilters>(() =>
    globalMaterialFiltersFromSearch(
      typeof window === "undefined" ? "" : window.location.search,
    ),
  );
  const [materialId, setMaterialId] = useState(
    initialMaterialId ??
      (typeof window === "undefined"
        ? undefined
        : globalMaterialIdFromPath(window.location.pathname)),
  );
  const [items, setItems] = useState<GlobalMaterialListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listState, setListState] = useState<
    "LOADING" | "READY" | "ERROR"
  >("LOADING");
  const [detail, setDetail] = useState<GlobalMaterialDetail | null>(null);
  const [detailState, setDetailState] = useState<
    "IDLE" | "LOADING" | "READY" | "ERROR"
  >("IDLE");
  const [notice, setNotice] = useState("");
  const pageSize = 25;

  useEffect(() => {
    const onPop = () => {
      setMaterialId(globalMaterialIdFromPath(window.location.pathname));
      setFilters(globalMaterialFiltersFromSearch(window.location.search));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (materialId || typeof window === "undefined") return;
    const next = globalMaterialListPath(filters);
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState({}, "", next);
    }
  }, [filters, materialId]);

  const loadList = useCallback(
    (signal?: AbortSignal) => {
      const query = new URLSearchParams(globalMaterialSearch(filters));
      query.set("pageSize", String(pageSize));
      setListState("LOADING");
      return intelligenceRequest<ListPayload>(
        apiBase,
        `/materials?${query}`,
        signal,
      )
        .then((payload) => {
          if (payload.scope !== "GLOBAL" || payload.readOnly !== true) {
            throw new MaterialIntelligenceFailure(
              "GLOBAL_READ_CONTRACT_INVALID",
              "The catalog response did not prove its global read-only scope.",
            );
          }
          setItems(payload.items);
          setTotal(payload.total);
          setListState("READY");
          setNotice("");
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setItems([]);
          setTotal(0);
          setListState("ERROR");
          setNotice(
            error instanceof MaterialIntelligenceFailure &&
              error.code === "MATERIAL_INTELLIGENCE_NOT_AVAILABLE"
              ? "The global catalog is not available in this staging revision."
              : "The global catalog could not be loaded. No fallback material data was generated.",
          );
        });
    },
    [apiBase, filters],
  );

  useEffect(() => {
    if (materialId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void loadList(controller.signal),
      180,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadList, materialId]);

  useEffect(() => {
    if (!materialId) {
      setDetail(null);
      setDetailState("IDLE");
      return;
    }
    const controller = new AbortController();
    setDetailState("LOADING");
    void intelligenceRequest<{ material: GlobalMaterialDetail }>(
      apiBase,
      `/materials/${encodeURIComponent(materialId)}`,
      controller.signal,
    )
      .then(({ material }) => {
        if (material.scope !== "GLOBAL" || material.readOnly !== true) {
          throw new MaterialIntelligenceFailure(
            "GLOBAL_READ_CONTRACT_INVALID",
            "The material did not prove its global read-only scope.",
          );
        }
        setDetail(material);
        setDetailState("READY");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setDetail(null);
        setDetailState("ERROR");
      });
    return () => controller.abort();
  }, [apiBase, materialId]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const summary = useMemo(
    () => ({
      resolved: items.filter((item) => item.resolutionStatus === "RESOLVED")
        .length,
      verified: items.filter((item) => item.evidenceStatus === "VERIFIED")
        .length,
      classified: items.filter((item) => item.taxonomyLabels.length > 0)
        .length,
    }),
    [items],
  );

  const updateFilters = (next: Partial<GlobalMaterialFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
  };
  const openDetail = (item: GlobalMaterialListItem) => {
    const next = globalMaterialDetailPath(item.id, filters);
    setMaterialId(item.id);
    onNavigate(next);
  };
  const backToList = () => {
    setMaterialId(undefined);
    onNavigate(globalMaterialListPath(filters));
  };

  if (materialId) {
    return (
      <GlobalMaterialDetailView
        detail={detail}
        state={detailState}
        onBack={backToList}
      />
    );
  }

  return (
    <div
      className="v2-mi-workspace"
      data-testid="v2-global-material-intelligence"
    >
      <header className="v2-mi-header">
        <div>
          <span className="v2-section-kicker">Global scientific reference</span>
          <h2>Global Material Intelligence</h2>
          <p>
            A verified, platform-wide reference catalog. Tenant preparations,
            stock, formulas and supplier records remain separate operational
            data.
          </p>
        </div>
        <div className="v2-mi-count">
          <strong>{total.toLocaleString()}</strong>
          <span>global canonical materials</span>
          <Status value="GLOBAL · READ ONLY" tone="good" verbatim />
        </div>
      </header>

      <section
        className="v2-mi-toolbar v2-mi-global-toolbar"
        aria-label="Global Material Intelligence filters"
      >
        <label className="v2-search-field">
          <Search size={16} aria-hidden="true" />
          <span className="v2-visually-hidden">Search global materials</span>
          <input
            value={filters.text}
            onChange={(event) =>
              updateFilters({ text: event.target.value, page: 1 })
            }
            placeholder="Search canonical name, entity or identifier"
          />
        </label>
        <label>
          Lifecycle
          <select
            value={filters.lifecycleStatus}
            onChange={(event) =>
              updateFilters({
                lifecycleStatus: event.target.value as LifecycleStatus,
                page: 1,
              })
            }
          >
            {["ACTIVE", "DRAFT", "SUPERSEDED", "ARCHIVED"].map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evidence
          <select
            value={filters.evidenceStatus}
            onChange={(event) =>
              updateFilters({
                evidenceStatus: event.target.value as
                  | ""
                  | EvidenceStatus,
                page: 1,
              })
            }
          >
            <option value="">All evidence states</option>
            {["VERIFIED", "UNVERIFIED", "CONFLICTED", "REJECTED"].map(
              (value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Identity
          <select
            value={filters.resolutionStatus}
            onChange={(event) =>
              updateFilters({
                resolutionStatus: event.target.value as
                  | ""
                  | ResolutionStatus,
                page: 1,
              })
            }
          >
            <option value="">All identity states</option>
            {["RESOLVED", "UNRESOLVED", "CONFLICTED", "NOT_APPLICABLE"].map(
              (value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Taxonomy node
          <input
            value={filters.taxonomyNode}
            onChange={(event) =>
              updateFilters({ taxonomyNode: event.target.value, page: 1 })
            }
            placeholder="e.g. woody"
          />
        </label>
      </section>

      <div className="v2-mi-summary" aria-label="Current global result page">
        <span>
          <Database size={15} aria-hidden="true" />
          {items.length} shown
        </span>
        <span>
          <ShieldCheck size={15} aria-hidden="true" />
          {summary.verified} verified
        </span>
        <span>
          <FlaskConical size={15} aria-hidden="true" />
          {summary.resolved} resolved
        </span>
        <span>
          <Tags size={15} aria-hidden="true" />
          {summary.classified} taxonomy classified
        </span>
      </div>

      <div className="v2-mi-layout is-list-route">
        <section
          className="v2-mi-catalog"
          aria-labelledby="v2-mi-global-catalog-title"
        >
          <div className="v2-mi-section-heading">
            <div>
              <span className="v2-section-kicker">Canonical catalog</span>
              <h3 id="v2-mi-global-catalog-title">
                Verified global reference materials
              </h3>
            </div>
            <Atom size={20} aria-hidden="true" />
          </div>
          {listState === "LOADING" ? (
            <div className="v2-table-empty" role="status">
              Loading global catalog...
            </div>
          ) : null}
          {listState === "ERROR" ? (
            <div className="v2-alert is-error" role="alert">
              {notice}
            </div>
          ) : null}
          {listState === "READY" ? (
            <div
              className="v2-mi-list is-route-list"
              aria-label="Global Material Intelligence results"
            >
              {items.length ? (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="v2-mi-row v2-mi-global-row"
                    onClick={() => openDetail(item)}
                    aria-label={`Open ${item.canonicalName} detail`}
                  >
                    <span className="v2-mi-row-main">
                      <strong>{item.canonicalName}</strong>
                      <small>
                        {[
                          item.chemicalEntityName,
                          item.molecularFormula,
                          item.inchiKey,
                        ]
                          .filter(Boolean)
                          .join(" / ") || "Verified identifiers not available"}
                      </small>
                    </span>
                    <span className="v2-mi-row-metrics">
                      <span>
                        {item.sourceObservationCount.toLocaleString()} source
                        {item.sourceObservationCount === 1 ? "" : " rows"}
                      </span>
                      <span>
                        {item.physicalPropertyCount.toLocaleString()} propert
                        {item.physicalPropertyCount === 1 ? "y" : "ies"}
                      </span>
                      <span>
                        {item.taxonomyLabels.length
                          ? item.taxonomyLabels.slice(0, 3).join(", ")
                          : "Taxonomy not assigned"}
                      </span>
                    </span>
                    <span className="v2-mi-row-status">
                      <Status value="GLOBAL" />
                      <Status
                        value={item.lifecycleStatus}
                        tone={item.lifecycleStatus === "ACTIVE" ? "good" : "neutral"}
                      />
                      <Status
                        value={item.resolutionStatus ?? "UNRESOLVED"}
                        tone={
                          item.resolutionStatus === "RESOLVED"
                            ? "good"
                            : item.resolutionStatus === "CONFLICTED"
                              ? "bad"
                              : "warn"
                        }
                      />
                      <Status
                        value={item.evidenceStatus}
                        tone={
                          item.evidenceStatus === "VERIFIED"
                            ? "good"
                            : item.evidenceStatus === "CONFLICTED"
                              ? "bad"
                              : "warn"
                        }
                      />
                    </span>
                    <ExternalLink
                      className="v2-mi-row-open"
                      size={16}
                      aria-hidden="true"
                    />
                  </button>
                ))
              ) : (
                <div className="v2-table-empty">
                  No global canonical material matches these filters.
                </div>
              )}
            </div>
          ) : null}
          <nav
            className="v2-mi-pagination"
            aria-label="Global Material Intelligence pagination"
          >
            <button
              type="button"
              className="v2-text-button"
              disabled={filters.page <= 1 || listState === "LOADING"}
              onClick={() =>
                updateFilters({ page: Math.max(1, filters.page - 1) })
              }
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Previous
            </button>
            <span>
              Page {filters.page.toLocaleString()} of {pages.toLocaleString()}
            </span>
            <button
              type="button"
              className="v2-text-button"
              disabled={filters.page >= pages || listState === "LOADING"}
              onClick={() =>
                updateFilters({ page: Math.min(pages, filters.page + 1) })
              }
            >
              Next
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </nav>
        </section>
      </div>
    </div>
  );
}

export function globalPhysicalPropertyValue(property: PhysicalProperty) {
  const suffix = property.unit ? ` ${property.unit}` : "";
  if (
    property.valueKind === "EXACT_NUMERIC" ||
    property.valueKind === "NUMERIC"
  ) {
    return property.numericValue === null || property.numericValue === undefined
      ? "Not available"
      : `${property.numericValue}${suffix}`;
  }
  if (property.valueKind === "RANGE_NUMERIC") {
    return property.numericMin === null ||
      property.numericMin === undefined ||
      property.numericMax === null ||
      property.numericMax === undefined
      ? "Not available"
      : `${property.numericMin}–${property.numericMax}${suffix}`;
  }
  if (property.valueKind === "TEXT") {
    return property.textValue === null ||
      property.textValue === undefined ||
      property.textValue === ""
      ? "Not available"
      : `${property.textValue}${suffix}`;
  }
  return "Not available";
}

function GlobalMaterialDetailView({
  detail,
  state,
  onBack,
}: {
  detail: GlobalMaterialDetail | null;
  state: "IDLE" | "LOADING" | "READY" | "ERROR";
  onBack: () => void;
}) {
  const materialEligibility = detail?.eligibility?.material;
  const predictionEligibility =
    detail?.eligibility?.chemicalEntity ?? materialEligibility;
  return (
    <div
      className="v2-mi-workspace"
      data-testid="v2-global-material-detail"
    >
      <button
        type="button"
        className="v2-text-button v2-mi-back"
        onClick={onBack}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to global catalog
      </button>
      {state === "LOADING" ? (
        <div className="v2-table-empty" role="status">
          Loading global material evidence...
        </div>
      ) : null}
      {state === "ERROR" ? (
        <div className="v2-alert is-error" role="alert">
          This global material detail could not be loaded.
        </div>
      ) : null}
      {state === "READY" && detail ? (
        <article className="v2-mi-detail is-route-detail">
          <header className="v2-mi-detail-heading">
            <div>
              <span className="v2-section-kicker">
                Global canonical material
              </span>
              <h3>{detail.canonicalName}</h3>
              <p>
                Scientific reference only. Tenant preparations and operational
                materials remain separate records.
              </p>
            </div>
            <div className="v2-mi-row-status">
              <Status value="GLOBAL · READ ONLY" tone="good" verbatim />
              <Status
                value={detail.lifecycleStatus}
                tone={detail.lifecycleStatus === "ACTIVE" ? "good" : "neutral"}
              />
            </div>
          </header>

          <dl className="v2-mi-fields">
            <Field label="Chemical entity" value={detail.chemicalEntityName} />
            <Field label="Entity type" value={label(detail.entityType)} />
            <Field
              label="Identity resolution"
              value={label(detail.resolutionStatus)}
            />
            <Field
              label="Evidence"
              value={label(detail.entityEvidenceStatus)}
            />
            <Field
              label="Molecular formula"
              value={detail.molecularFormula}
              mono
            />
            <Field
              label="Molecular weight"
              value={detail.molecularWeight}
            />
            <Field label="Exact mass" value={detail.exactMass} />
            <Field label="InChIKey" value={detail.inchiKey} mono />
            <Field label="InChI" value={detail.inchi} mono />
            <Field
              label="Canonical SMILES"
              value={detail.canonicalSmiles}
              mono
            />
            <Field
              label="Isomeric SMILES"
              value={detail.isomericSmiles}
              mono
            />
          </dl>

          <section className="v2-mi-detail-section">
            <div className="v2-mi-section-heading">
              <div>
                <span className="v2-section-kicker">Identifiers</span>
                <h4>{detail.identifiers.length} source-backed identifier(s)</h4>
              </div>
              <FileCheck2 size={19} aria-hidden="true" />
            </div>
            {detail.identifiers.length ? (
              <div className="v2-mi-identifiers">
                {detail.identifiers.map((identifier) => (
                  <span key={identifier.id}>
                    <strong>{identifier.type}</strong>
                    <span className="v2-mono">{identifier.value}</span>
                    <Status
                      value={identifier.evidenceStatus}
                      tone={
                        identifier.evidenceStatus === "VERIFIED"
                          ? "good"
                          : "warn"
                      }
                    />
                  </span>
                ))}
              </div>
            ) : (
              <p>No verified identifier assertion is available.</p>
            )}
          </section>

          <section className="v2-mi-detail-section">
            <div className="v2-mi-section-heading">
              <div>
                <span className="v2-section-kicker">Scientific eligibility</span>
                <h4>AI research prediction eligibility</h4>
              </div>
              <ShieldCheck size={19} aria-hidden="true" />
            </div>
            <div className="v2-mi-row-status">
              <Status
                value={materialEligibility?.result ?? "REVIEW_REQUIRED"}
                tone={materialEligibility?.result === "ELIGIBLE" ? "good" : "warn"}
              />
              <Status
                value={predictionEligibility?.result ?? "REVIEW_REQUIRED"}
                tone={predictionEligibility?.result === "ELIGIBLE" ? "good" : "warn"}
              />
            </div>
            <p>
              {(predictionEligibility?.reasonCodes ?? []).length
                ? (predictionEligibility?.reasonCodes ?? []).map(label).join(" · ")
                : "No eligibility reason is available."}
            </p>
            <p className="v2-mi-code v2-mono">
              Policy {predictionEligibility?.policyVersion ?? "Not available"}
            </p>
          </section>

          <section className="v2-mi-detail-section">
            <div className="v2-mi-section-heading">
              <div>
                <span className="v2-section-kicker">Physical properties</span>
                <h4>Source-aware assertions</h4>
              </div>
              <FlaskConical size={19} aria-hidden="true" />
            </div>
            {detail.physicalProperties.length ? (
              <div className="v2-mi-evidence">
                {detail.physicalProperties.map((property) => (
                  <article key={property.id}>
                    <div>
                      <strong>{label(property.propertyKey)}</strong>
                      <small>{label(property.sourceKind)}</small>
                    </div>
                    <span>{globalPhysicalPropertyValue(property)}</span>
                    <span>{property.sourceVersion}</span>
                    <Status
                      value={property.evidenceStatus}
                      tone={
                        property.evidenceStatus === "VERIFIED"
                          ? "good"
                          : "warn"
                      }
                    />
                  </article>
                ))}
              </div>
            ) : (
              <p>No physical-property assertion is available.</p>
            )}
          </section>

          <section className="v2-mi-detail-section">
            <div className="v2-mi-section-heading">
              <div>
                <span className="v2-section-kicker">Osmo taxonomy</span>
                <h4>Versioned odor descriptors</h4>
              </div>
              <Tags size={19} aria-hidden="true" />
            </div>
            {detail.taxonomy.length ? (
              <div className="v2-mi-taxonomy">
                {detail.taxonomy.map((assignment) => (
                  <article key={assignment.id}>
                    <div>
                      <strong>{assignment.label}</strong>
                      <small>
                        {assignment.parentLabel
                          ? `${assignment.parentLabel} / ${assignment.upstreamNodeKey}`
                          : assignment.upstreamNodeKey}
                      </small>
                    </div>
                    <span>{label(assignment.assignmentKind)}</span>
                    <span>
                      {assignment.confidence === null ||
                      assignment.confidence === undefined
                        ? "No confidence asserted"
                        : `${(assignment.confidence * 100).toFixed(1)}%`}
                    </span>
                    <Status
                      value={assignment.evidenceStatus}
                      tone={
                        assignment.evidenceStatus === "VERIFIED"
                          ? "good"
                          : "warn"
                      }
                    />
                  </article>
                ))}
              </div>
            ) : (
              <p>No active taxonomy assignment is available.</p>
            )}
          </section>

          <section className="v2-mi-detail-section">
            <div className="v2-mi-section-heading">
              <div>
                <span className="v2-section-kicker">Source accounting</span>
                <h4>
                  {detail.provenanceSources.length.toLocaleString()} contributing
                  source row(s)
                </h4>
              </div>
              <Database size={19} aria-hidden="true" />
            </div>
            {detail.provenanceSources.length ? (
              <div className="v2-mi-evidence">
                {detail.provenanceSources.map((source) => (
                  <article
                    key={`${source.sourceRecordKey}-${source.sourceRowNumber}`}
                  >
                    <div>
                      <strong>{source.sourceName}</strong>
                      <small>Source row {source.sourceRowNumber}</small>
                    </div>
                    <span>{label(source.disposition)}</span>
                    <span>{label(source.dispositionReason)}</span>
                    <span className="v2-mono">
                      {source.contentHash.slice(0, 12)}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p>No source row is linked to this canonical material.</p>
            )}
          </section>

          <section className="v2-mi-detail-section">
            <div className="v2-mi-section-heading">
              <div>
                <span className="v2-section-kicker">Catalog release</span>
                <h4>Immutable source provenance</h4>
              </div>
              <ShieldCheck size={19} aria-hidden="true" />
            </div>
            <dl className="v2-mi-fields">
              <Field label="Release" value={detail.releaseKey} mono />
              <Field label="Source kind" value={label(detail.sourceKind)} />
              <Field label="Source version" value={detail.sourceVersion} mono />
              <Field label="Schema version" value={detail.schemaVersion} mono />
              <Field
                label="Source SHA-256"
                value={detail.sourceSha256}
                mono
              />
              <Field
                label="Normalization"
                value={detail.normalizationVersion}
                mono
              />
            </dl>
            {detail.taxonomy[0] ? (
              <p className="v2-mi-code v2-mono">
                Taxonomy {detail.taxonomy[0].upstreamRepository} @{" "}
                {detail.taxonomy[0].upstreamCommit} /{" "}
                {detail.taxonomy[0].licenseSpdx}
              </p>
            ) : null}
          </section>
        </article>
      ) : null}
    </div>
  );
}
