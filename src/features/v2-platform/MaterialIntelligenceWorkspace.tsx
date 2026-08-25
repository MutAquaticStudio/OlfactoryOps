import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Atom,
  ChevronLeft,
  ChevronRight,
  Database,
  FileCheck2,
  FlaskConical,
  Layers3,
  Search,
  ShieldCheck,
} from "lucide-react";
import { OlfactoryResearchPanel } from "./OlfactoryResearchPanel";

type EligibilityResult = "ELIGIBLE" | "NOT_ELIGIBLE" | "REVIEW_REQUIRED";
type ResolutionStatus =
  "UNRESOLVED" | "RESOLVED" | "CONFLICTED" | "NOT_APPLICABLE";
type ProductClassification =
  | "NEAT_SUBSTANCE"
  | "DILUTION"
  | "DEFINED_MIXTURE"
  | "UNDEFINED_MIXTURE"
  | "NATURAL"
  | "BASE"
  | "FORMULATION"
  | "UNKNOWN";
type Eligibility = {
  subjectType: "MATERIAL_PRODUCT" | "CHEMICAL_ENTITY";
  subjectId: string;
  result: EligibilityResult;
  reasonCodes: string[];
  chemicalEntityId?: string | null;
  structureHash?: string | null;
  normalizationVersion?: string | null;
  policyVersion: string;
  evaluatedAt?: string;
};
type MaterialListItem = {
  id: string;
  name: string;
  tradeName?: string | null;
  supplier?: string | null;
  productClassification: ProductClassification;
  resolutionStatus?: ResolutionStatus | null;
  eligibilityResult?: EligibilityResult | null;
  eligibilityReasonCodes?: string[] | null;
  reviewRequired: boolean;
  primaryChemicalEntityId?: string | null;
  primaryChemicalEntityName?: string | null;
};
type MaterialComponent = {
  id: string;
  name: string;
  role: string;
  chemicalEntityId?: string | null;
  chemicalEntityName?: string | null;
  concentrationKind: "EXACT" | "RANGE" | "UNKNOWN";
  concentrationMinimum?: number | null;
  concentrationMaximum?: number | null;
  concentrationUnit: string;
  concentrationBasis: string;
  evidenceStatus: string;
  resolutionStatus?: ResolutionStatus | null;
};
type MaterialEvidence = {
  id: string;
  assertionKey: string;
  sourceKind: string;
  sourceRef: string;
  sourceVersion: string;
  retrievedAt: string;
  evidenceStatus: string;
  subjectType: string;
};
type MaterialDetail = MaterialListItem & {
  internalCode?: string | null;
  status: string;
  supplierProductCode?: string | null;
  grade?: string | null;
  physicalForm?: string | null;
  primaryChemicalEntityType?: string | null;
  evidenceStatus?: string | null;
  components: MaterialComponent[];
  evidence: MaterialEvidence[];
  eligibility: {
    material: Eligibility | null;
    chemicalEntity: Eligibility | null;
  };
};
type ChemicalIdentifier = {
  id: string;
  type: string;
  value: string;
  evidenceStatus: string;
  sourceVersion: string;
};
type ChemicalEntity = {
  id: string;
  preferredName: string;
  entityType: string;
  resolutionStatus: ResolutionStatus;
  evidenceStatus: string;
  canonicalSmiles?: string | null;
  isomericSmiles?: string | null;
  inchi?: string | null;
  inchiKey?: string | null;
  molecularFormula?: string | null;
  molecularWeight?: number | null;
  structureHash?: string | null;
  normalizationVersion?: string | null;
  identifiers: ChemicalIdentifier[];
  eligibility?: Eligibility | null;
};

type ListPayload = {
  items: MaterialListItem[];
  page: number;
  pageSize: number;
  total: number;
};

class MaterialIntelligenceFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function materialIntelligenceBaseFromRuntime(value: string | undefined) {
  return (value || "/api/v1").replace(
    /\/api\/v1\/?$/,
    "/api/v1/v2/material-intelligence",
  );
}

const defaultApiBase = materialIntelligenceBaseFromRuntime(
  import.meta.env.VITE_API_BASE_URL,
);

async function intelligenceRequest<T>(
  base: string,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  if (!response.ok)
    throw new MaterialIntelligenceFailure(
      payload.error?.code || "REQUEST_FAILED",
      payload.error?.message || "Material Intelligence request failed.",
    );
  return payload as T;
}

const reasonCopy: Record<string, string> = {
  RESOLVED_SINGLE_SUBSTANCE:
    "Verified single substance with supported molecular evidence.",
  NATURAL_COMPLEX:
    "Natural complex - direct single-molecule prediction unavailable.",
  DILUTION_PRODUCT:
    "Dilution product - use a verified active Chemical Entity for molecular prediction.",
  PROPRIETARY_BASE:
    "Proprietary base - composition is not represented as one molecule.",
  UNRESOLVED_IDENTITY:
    "Identity unresolved - verified molecular structure required.",
  IDENTITY_CONFLICT:
    "Conflicting identity evidence requires scientific review.",
  NO_STRUCTURE: "No verified molecular structure is available.",
  UNVERIFIED_STRUCTURE: "Structure evidence has not been verified.",
  UNSUPPORTED_STRUCTURE:
    "The resolved structure is outside the supported research contract.",
  STEREOCHEMISTRY_UNRESOLVED:
    "Stereochemistry must be resolved before molecular prediction.",
  DEFINED_MIXTURE:
    "Defined mixture - select a verified component for molecular prediction.",
  UNDEFINED_MIXTURE:
    "Variable-composition mixture - direct single-molecule prediction unavailable.",
  FORMULATION:
    "Formulation - direct single-molecule prediction is not applicable.",
  UNKNOWN_COMPOSITION: "Composition is unknown and requires review.",
};

export function materialIntelligenceReasonText(
  reasonCodes: string[] | null | undefined,
) {
  if (!reasonCodes?.length)
    return "Scientific eligibility has not been evaluated.";
  return reasonCodes
    .map(
      (reason) =>
        reasonCopy[reason] ?? reason.replaceAll("_", " ").toLowerCase(),
    )
    .join(" ");
}

function label(value: string | null | undefined) {
  return value
    ? value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
    : "Not evaluated";
}

function concentration(component: MaterialComponent) {
  if (component.concentrationKind === "UNKNOWN")
    return "Concentration not asserted";
  const unit =
    component.concentrationUnit === "PERCENT"
      ? "%"
      : label(component.concentrationUnit);
  if (component.concentrationKind === "EXACT")
    return `${component.concentrationMinimum ?? component.concentrationMaximum ?? 0}${unit}`;
  return `${component.concentrationMinimum ?? 0}-${component.concentrationMaximum ?? 0}${unit}`;
}

function Status({
  value,
  tone,
}: {
  value: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  return (
    <span className={`v2-mi-status is-${tone ?? "neutral"}`}>
      {label(value)}
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
  const display =
    value === null || value === undefined || value === ""
      ? "Not available"
      : String(value);
  return (
    <div className="v2-mi-field">
      <dt>{fieldLabel}</dt>
      <dd className={mono ? "v2-mono" : undefined}>{display}</dd>
    </div>
  );
}

export function MaterialIntelligenceWorkspace({
  capabilities,
  apiBase = defaultApiBase,
}: {
  capabilities: Record<string, boolean>;
  apiBase?: string;
}) {
  const [items, setItems] = useState<MaterialListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [text, setText] = useState("");
  const [classification, setClassification] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [resolution, setResolution] = useState("");
  const [reviewRequired, setReviewRequired] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<MaterialDetail | null>(null);
  const [entity, setEntity] = useState<ChemicalEntity | null>(null);
  const [listState, setListState] = useState<"LOADING" | "READY" | "ERROR">(
    "LOADING",
  );
  const [detailState, setDetailState] = useState<
    "IDLE" | "LOADING" | "READY" | "ERROR"
  >("IDLE");
  const [notice, setNotice] = useState("");

  const loadList = useCallback(
    (signal?: AbortSignal) => {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (text.trim()) query.set("text", text.trim());
      if (classification) query.set("productClassification", classification);
      if (eligibility) query.set("eligibility", eligibility);
      if (resolution) query.set("resolutionStatus", resolution);
      if (reviewRequired) query.set("reviewRequired", reviewRequired);
      setListState("LOADING");
      return intelligenceRequest<ListPayload>(
        apiBase,
        `/materials?${query}`,
        signal,
      )
        .then((payload) => {
          setItems(payload.items);
          setTotal(payload.total);
          setSelectedId((current) =>
            payload.items.some((item) => item.id === current)
              ? current
              : (payload.items[0]?.id ?? ""),
          );
          setListState("READY");
          setNotice("");
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setItems([]);
          setTotal(0);
          setListState("ERROR");
          setNotice(
            error instanceof MaterialIntelligenceFailure &&
              error.code === "MATERIAL_INTELLIGENCE_NOT_AVAILABLE"
              ? "Material Intelligence is not available in this staging revision."
              : "Material Intelligence catalog could not be loaded. No fallback data was generated.",
          );
        });
    },
    [
      apiBase,
      classification,
      eligibility,
      page,
      resolution,
      reviewRequired,
      text,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void loadList(controller.signal),
      180,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setEntity(null);
      setDetailState("IDLE");
      return;
    }
    const controller = new AbortController();
    setDetailState("LOADING");
    setEntity(null);
    void intelligenceRequest<{ material: MaterialDetail }>(
      apiBase,
      `/materials/${encodeURIComponent(selectedId)}`,
      controller.signal,
    )
      .then(async ({ material }) => {
        setDetail(material);
        if (material.primaryChemicalEntityId) {
          const payload = await intelligenceRequest<{
            chemicalEntity: ChemicalEntity;
          }>(
            apiBase,
            `/chemical-entities/${encodeURIComponent(material.primaryChemicalEntityId)}`,
            controller.signal,
          );
          setEntity(payload.chemicalEntity);
        }
        setDetailState("READY");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setDetail(null);
        setEntity(null);
        setDetailState("ERROR");
      });
    return () => controller.abort();
  }, [apiBase, selectedId]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const decision = detail?.eligibility.material ?? null;
  const predictionAllowed = decision?.result === "ELIGIBLE";
  const predictionReason = materialIntelligenceReasonText(
    decision?.reasonCodes,
  );
  const summary = useMemo(() => {
    const resolved = items.filter(
      (item) => item.resolutionStatus === "RESOLVED",
    ).length;
    const eligible = items.filter(
      (item) => item.eligibilityResult === "ELIGIBLE",
    ).length;
    const review = items.filter(
      (item) =>
        item.reviewRequired || item.eligibilityResult === "REVIEW_REQUIRED",
    ).length;
    return { resolved, eligible, review };
  }, [items]);

  return (
    <div className="v2-mi-workspace" data-testid="v2-material-intelligence">
      <header className="v2-mi-header">
        <div>
          <span className="v2-section-kicker">
            Scientific material governance
          </span>
          <h2>Material Intelligence</h2>
          <p>
            Material Products remain separate from verified Chemical Entities.
            Evidence, uncertainty and prediction eligibility stay visible.
          </p>
        </div>
        <div className="v2-mi-count">
          <strong>{total.toLocaleString()}</strong>
          <span>tenant catalog records</span>
        </div>
      </header>

      <section
        className="v2-mi-toolbar"
        aria-label="Material Intelligence filters"
      >
        <label className="v2-search-field">
          <Search size={16} aria-hidden="true" />
          <span className="v2-visually-hidden">Search materials</span>
          <input
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPage(1);
            }}
            placeholder="Search product, trade name or supplier"
          />
        </label>
        <label>
          Classification
          <select
            value={classification}
            onChange={(event) => {
              setClassification(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All classifications</option>
            {[
              "NEAT_SUBSTANCE",
              "NATURAL",
              "DILUTION",
              "BASE",
              "DEFINED_MIXTURE",
              "UNDEFINED_MIXTURE",
              "FORMULATION",
              "UNKNOWN",
            ].map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Eligibility
          <select
            value={eligibility}
            onChange={(event) => {
              setEligibility(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All eligibility</option>
            <option value="ELIGIBLE">Eligible</option>
            <option value="NOT_ELIGIBLE">Not eligible</option>
            <option value="REVIEW_REQUIRED">Review required</option>
          </select>
        </label>
        <label>
          Identity
          <select
            value={resolution}
            onChange={(event) => {
              setResolution(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All identity states</option>
            <option value="RESOLVED">Resolved</option>
            <option value="UNRESOLVED">Unresolved</option>
            <option value="CONFLICTED">Conflicted</option>
            <option value="NOT_APPLICABLE">Not applicable</option>
          </select>
        </label>
        <label>
          Review
          <select
            value={reviewRequired}
            onChange={(event) => {
              setReviewRequired(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All records</option>
            <option value="true">Review required</option>
            <option value="false">No product review flag</option>
          </select>
        </label>
      </section>

      <div className="v2-mi-summary" aria-label="Current page summary">
        <span>
          <Database size={15} />
          {items.length} shown
        </span>
        <span>
          <ShieldCheck size={15} />
          {summary.resolved} resolved
        </span>
        <span>
          <FlaskConical size={15} />
          {summary.eligible} eligible
        </span>
        <span>
          <FileCheck2 size={15} />
          {summary.review} review
        </span>
      </div>

      <div className="v2-mi-layout">
        <section
          className="v2-mi-catalog"
          aria-labelledby="v2-mi-catalog-title"
        >
          <div className="v2-mi-section-heading">
            <div>
              <span className="v2-section-kicker">Material Catalog</span>
              <h3 id="v2-mi-catalog-title">Products and scientific status</h3>
            </div>
            <Atom size={20} aria-hidden="true" />
          </div>
          {listState === "LOADING" ? (
            <div className="v2-table-empty" role="status">
              Loading tenant catalog...
            </div>
          ) : null}
          {listState === "ERROR" ? (
            <div className="v2-alert is-error" role="alert">
              {notice}
            </div>
          ) : null}
          {listState === "READY" ? (
            <div className="v2-mi-list" aria-label="Material catalog results">
              {items.length ? (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`v2-mi-row ${selectedId === item.id ? "is-selected" : ""}`}
                    aria-pressed={selectedId === item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="v2-mi-row-main">
                      <strong>{item.name}</strong>
                      <small>
                        {[item.tradeName, item.supplier]
                          .filter(Boolean)
                          .join(" / ") ||
                          "Supplier or trade summary not asserted"}
                      </small>
                    </span>
                    <span className="v2-mi-row-status">
                      <Status value={item.productClassification} />
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
                        value={item.eligibilityResult ?? "REVIEW_REQUIRED"}
                        tone={
                          item.eligibilityResult === "ELIGIBLE"
                            ? "good"
                            : item.eligibilityResult === "NOT_ELIGIBLE"
                              ? "neutral"
                              : "warn"
                        }
                      />
                      {item.reviewRequired ? (
                        <Status value="REVIEW_REQUIRED" tone="warn" />
                      ) : null}
                    </span>
                  </button>
                ))
              ) : (
                <div className="v2-table-empty">
                  No tenant material matches these filters.
                </div>
              )}
            </div>
          ) : null}
          <nav
            className="v2-mi-pagination"
            aria-label="Material catalog pagination"
          >
            <button
              type="button"
              className="v2-text-button"
              disabled={page <= 1 || listState === "LOADING"}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span>
              Page {page.toLocaleString()} of {pages.toLocaleString()}
            </span>
            <button
              type="button"
              className="v2-text-button"
              disabled={page >= pages || listState === "LOADING"}
              onClick={() => setPage((current) => Math.min(pages, current + 1))}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </nav>
        </section>

        <section className="v2-mi-detail" aria-labelledby="v2-mi-detail-title">
          {detailState === "IDLE" ? (
            <div className="v2-table-empty">
              Select a material to inspect its governed identity.
            </div>
          ) : null}
          {detailState === "LOADING" ? (
            <div className="v2-table-empty" role="status">
              Loading material evidence...
            </div>
          ) : null}
          {detailState === "ERROR" ? (
            <div className="v2-alert is-error" role="alert">
              Material detail could not be loaded.
            </div>
          ) : null}
          {detailState === "READY" && detail ? (
            <>
              <div className="v2-mi-detail-heading">
                <div>
                  <span className="v2-section-kicker">Material Product</span>
                  <h3 id="v2-mi-detail-title">{detail.name}</h3>
                  <p>
                    {[detail.tradeName, detail.supplier]
                      .filter(Boolean)
                      .join(" / ") || "No supplier or trade claim is asserted."}
                  </p>
                </div>
                <Status
                  value={
                    detail.reviewRequired ? "REVIEW_REQUIRED" : detail.status
                  }
                  tone={detail.reviewRequired ? "warn" : "neutral"}
                />
              </div>
              <dl className="v2-mi-fields">
                <Field label="Internal code" value={detail.internalCode} mono />
                <Field
                  label="Classification"
                  value={label(detail.productClassification)}
                />
                <Field
                  label="Supplier product"
                  value={detail.supplierProductCode}
                />
                <Field
                  label="Grade / form"
                  value={[detail.grade, detail.physicalForm]
                    .filter(Boolean)
                    .join(" / ")}
                />
              </dl>

              <section
                className="v2-mi-detail-section"
                aria-labelledby="v2-mi-identity-title"
              >
                <div className="v2-mi-section-heading">
                  <div>
                    <span className="v2-section-kicker">Chemical Identity</span>
                    <h4 id="v2-mi-identity-title">
                      {entity?.preferredName ||
                        detail.primaryChemicalEntityName ||
                        "No resolved Chemical Entity"}
                    </h4>
                  </div>
                  <Status
                    value={
                      entity?.resolutionStatus ||
                      detail.resolutionStatus ||
                      "UNRESOLVED"
                    }
                    tone={
                      (entity?.resolutionStatus || detail.resolutionStatus) ===
                      "RESOLVED"
                        ? "good"
                        : "warn"
                    }
                  />
                </div>
                {entity ? (
                  <>
                    <dl className="v2-mi-fields">
                      <Field
                        label="Entity type"
                        value={label(entity.entityType)}
                      />
                      <Field
                        label="Evidence"
                        value={label(entity.evidenceStatus)}
                      />
                      <Field
                        label="Molecular formula"
                        value={entity.molecularFormula}
                        mono
                      />
                      <Field
                        label="Molecular weight"
                        value={entity.molecularWeight}
                      />
                      <Field
                        label="Canonical SMILES"
                        value={entity.canonicalSmiles}
                        mono
                      />
                      <Field
                        label="Isomeric SMILES"
                        value={entity.isomericSmiles}
                        mono
                      />
                      <Field label="InChIKey" value={entity.inchiKey} mono />
                      <Field
                        label="Structure hash"
                        value={
                          entity.structureHash
                            ? entity.structureHash.slice(0, 20)
                            : null
                        }
                        mono
                      />
                    </dl>
                    {entity.identifiers?.length ? (
                      <div className="v2-mi-identifiers">
                        {entity.identifiers.map((identifier) => (
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
                    ) : null}
                  </>
                ) : (
                  <p className="v2-muted">
                    Identity remains explicitly unresolved or not applicable. No
                    molecular structure is inferred from name, formula or CAS
                    alone.
                  </p>
                )}
              </section>

              <section
                className="v2-mi-detail-section"
                aria-labelledby="v2-mi-components-title"
              >
                <div className="v2-mi-section-heading">
                  <div>
                    <span className="v2-section-kicker">
                      Composition / Components
                    </span>
                    <h4 id="v2-mi-components-title">
                      {detail.components.length} recorded component
                      {detail.components.length === 1 ? "" : "s"}
                    </h4>
                  </div>
                  <Layers3 size={19} aria-hidden="true" />
                </div>
                {detail.components.length ? (
                  <div className="v2-mi-components">
                    {detail.components.map((component) => (
                      <article key={component.id}>
                        <div>
                          <strong>{component.name}</strong>
                          <small>
                            {component.chemicalEntityName ||
                              "No verified Chemical Entity link"}
                          </small>
                        </div>
                        <span>{label(component.role)}</span>
                        <span>{concentration(component)}</span>
                        <Status
                          value={component.evidenceStatus}
                          tone={
                            component.evidenceStatus === "VERIFIED"
                              ? "good"
                              : "warn"
                          }
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="v2-muted">
                    No component assertion is recorded. A complex product is
                    never collapsed into one representative molecule.
                  </p>
                )}
              </section>

              <section
                className="v2-mi-detail-section"
                aria-labelledby="v2-mi-eligibility-title"
              >
                <div className="v2-mi-section-heading">
                  <div>
                    <span className="v2-section-kicker">
                      Scientific Eligibility
                    </span>
                    <h4 id="v2-mi-eligibility-title">
                      Molecular prediction boundary
                    </h4>
                  </div>
                  <Status
                    value={decision?.result || "REVIEW_REQUIRED"}
                    tone={
                      predictionAllowed
                        ? "good"
                        : decision?.result === "NOT_ELIGIBLE"
                          ? "neutral"
                          : "warn"
                    }
                  />
                </div>
                <p>{predictionReason}</p>
                {decision?.structureHash ? (
                  <p className="v2-mono v2-mi-code">
                    Verified structure {decision.structureHash.slice(0, 20)} /{" "}
                    {decision.normalizationVersion}
                  </p>
                ) : null}
              </section>

              <section
                className="v2-mi-detail-section"
                aria-labelledby="v2-mi-evidence-title"
              >
                <div className="v2-mi-section-heading">
                  <div>
                    <span className="v2-section-kicker">
                      Evidence / Provenance
                    </span>
                    <h4 id="v2-mi-evidence-title">
                      {detail.evidence.length} recorded assertion
                      {detail.evidence.length === 1 ? "" : "s"}
                    </h4>
                  </div>
                  <FileCheck2 size={19} aria-hidden="true" />
                </div>
                {detail.evidence.length ? (
                  <div className="v2-mi-evidence">
                    {detail.evidence.map((evidence) => (
                      <article key={evidence.id}>
                        <div>
                          <strong>{label(evidence.assertionKey)}</strong>
                          <small>
                            {label(evidence.subjectType)} /{" "}
                            {label(evidence.sourceKind)}
                          </small>
                        </div>
                        <span className="v2-mi-source">
                          {evidence.sourceRef}
                        </span>
                        <span>{evidence.sourceVersion}</span>
                        <Status
                          value={evidence.evidenceStatus}
                          tone={
                            evidence.evidenceStatus === "VERIFIED"
                              ? "good"
                              : evidence.evidenceStatus === "CONFLICTED"
                                ? "bad"
                                : "warn"
                          }
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="v2-muted">
                    No evidence assertion is recorded for this product.
                    Scientific inference remains fail-closed.
                  </p>
                )}
              </section>

              <section
                className="v2-mi-detail-section"
                aria-labelledby="v2-mi-ai-title"
              >
                <div className="v2-mi-section-heading">
                  <div>
                    <span className="v2-section-kicker">
                      AI / Molecular Intelligence
                    </span>
                    <h4 id="v2-mi-ai-title">
                      Research molecular odor prediction
                    </h4>
                  </div>
                  <FlaskConical size={19} aria-hidden="true" />
                </div>
                {capabilities["scientific_ai.predict"] ? (
                  <OlfactoryResearchPanel
                    material={{ id: detail.id, name: detail.name }}
                    predictionAllowed={predictionAllowed}
                    predictionBlockReason={predictionReason}
                  />
                ) : (
                  <p className="v2-muted">
                    Your workspace role does not include research prediction
                    capability.
                  </p>
                )}
              </section>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
