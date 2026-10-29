import { useState } from "react";
import { STATUS_COLORS, toAgentStatus } from "../lib/status";
import type { RunResult, TraceStep } from "../types";

const COST_SOURCE_LABELS: Record<TraceStep["costSource"], string> = {
  provider: "facturado",
  catalog: "oficial",
  local: "local",
  manual: "estimado",
};

function formatCost(value: number): string {
  return `$${value.toFixed(6)}`;
}

export function TracePanel({
  steps,
  autoExpandLast,
  previousRun,
  lastRun,
  showComparison,
  onClose,
}: {
  steps: TraceStep[];
  autoExpandLast: boolean;
  previousRun: RunResult | null;
  lastRun: RunResult | null;
  showComparison: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"traces" | "compare">("traces");
  const [copied, setCopied] = useState(false);

  async function copyDraft() {
    if (!lastRun?.draft) return;
    try {
      await navigator.clipboard.writeText(lastRun.draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // El portapapeles puede estar bloqueado por el navegador.
    }
  }
  const hasCompare =
    showComparison &&
    Boolean(
      previousRun &&
      lastRun &&
      (previousRun.draft !== lastRun.draft ||
        previousRun.systemPrompt !== lastRun.systemPrompt),
    );

  const totalTokens = steps.reduce(
    (sum, s) => sum + s.tokensInput + s.tokensOutput,
    0,
  );
  const totalCost = steps.reduce((sum, s) => sum + s.cost, 0);
  const costSources = [...new Set(steps.map((step) => step.costSource))];
  const costSourceLabel =
    costSources.length === 0
      ? ""
      : costSources.length === 1
        ? COST_SOURCE_LABELS[costSources[0]]
        : "mixto";

  return (
    <aside className="trace-sidebar" id="trace-panel">
      <header className="trace-header">
        <div className="trace-header-top">
          <span className="trace-title">Run details</span>
          <div className="trace-head-right">
            {steps.length > 0 && (
              <span className="trace-totals mono">
                {totalTokens}t · {formatCost(totalCost)}
              </span>
            )}
            <button
              type="button"
              className="drawer-close"
              onClick={onClose}
              title="Ocultar panel"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="trace-tabs">
          <button
            type="button"
            className={`trace-tab ${tab === "traces" ? "is-active" : ""}`}
            onClick={() => setTab("traces")}
          >
            Trace <span className="trace-tab-count">{steps.length}</span>
          </button>
          {hasCompare && (
            <button
              type="button"
              className={`trace-tab ${tab === "compare" ? "is-active" : ""}`}
              onClick={() => setTab("compare")}
            >
              Compare
            </button>
          )}
        </div>
      </header>

      {tab === "compare" && hasCompare && previousRun && lastRun ? (
        <div className="trace-scroll">
          <div className="diff-block">
            <span className="diff-label">
              Corrida anterior ({previousRun.iterations} iter)
            </span>
            <pre>{previousRun.draft || "(vacío)"}</pre>
          </div>
          <div className="diff-block">
            <span className="diff-label">
              Corrida actual ({lastRun.iterations} iter)
            </span>
            <pre>{lastRun.draft || "(vacío)"}</pre>
          </div>
        </div>
      ) : steps.length === 0 ? (
        <div className="trace-empty">
          <span>No activity yet</span>
          <small>Run the flow to inspect each A2A request and response.</small>
        </div>
      ) : (
        <div className="trace-scroll">
          {lastRun?.draft.trim() && (
            <section className={`final-answer ${lastRun.status}`}>
              <div className="final-answer-head">
                <span className="final-answer-kicker">
                  {lastRun.status === "failed"
                    ? "Borrador parcial"
                    : "Resultado final"}
                </span>
                <button
                  type="button"
                  className="final-answer-copy"
                  onClick={() => void copyDraft()}
                >
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>

              <div className="final-answer-text">{lastRun.draft}</div>

              <div className="final-answer-foot mono">
                <span
                  className={`final-answer-badge ${
                    lastRun.status === "failed"
                      ? "is-failed"
                      : lastRun.approved
                        ? "is-approved"
                        : ""
                  }`}
                >
                  {lastRun.status === "failed"
                    ? "Falló"
                    : lastRun.approved
                      ? "Aprobado"
                      : "Sin aprobar"}
                </span>
                <span>{lastRun.iterations} iter</span>
                <span>{lastRun.totalTokens} tok</span>
                <span
                  title={`Fuente del costo: ${costSourceLabel || "sin datos"}`}
                >
                  {formatCost(lastRun.totalCost)}
                  {costSourceLabel ? ` · ${costSourceLabel}` : ""}
                </span>
              </div>
            </section>
          )}

          {steps.map((step, idx) => {
            const uiStatus = toAgentStatus(step.state);
            const color = STATUS_COLORS[uiStatus];
            return (
              <details
                key={step.id}
                className="trace-item"
                open={autoExpandLast && idx === steps.length - 1}
              >
                <summary>
                  <div className="trace-item-top">
                    <span className="trace-step-num mono">#{idx + 1}</span>
                    <span className="trace-step-name">{step.nodeName}</span>
                    <span className="trace-step-iter mono">
                      i{step.iteration}
                    </span>
                    <i
                      className="trace-state-dot"
                      style={{ backgroundColor: color }}
                      title={step.state}
                    />
                  </div>
                  <div className="trace-item-meta mono">
                    <span>
                      {step.tokensInput}→{step.tokensOutput} tok
                    </span>
                    <span>{step.clientLatencyMs.toFixed(0)}ms</span>
                    <span
                      title={`Fuente del costo: ${COST_SOURCE_LABELS[step.costSource]}`}
                    >
                      {formatCost(step.cost)} ·{" "}
                      {COST_SOURCE_LABELS[step.costSource]}
                    </span>
                    {step.model && <span>{step.model}</span>}
                  </div>
                </summary>

                <div className="trace-item-body">
                  <div className="trace-token-line mono">
                    <span>input {step.tokensInput}</span>
                    <span>output {step.tokensOutput}</span>
                    {step.cacheReadTokens > 0 && (
                      <span>cache read {step.cacheReadTokens}</span>
                    )}
                    {step.cacheWriteTokens > 0 && (
                      <span>cache write {step.cacheWriteTokens}</span>
                    )}
                    {step.reasoningTokens > 0 && (
                      <span>reasoning {step.reasoningTokens}</span>
                    )}
                  </div>

                  {step.review && (
                    <div className="trace-review">
                      <div className="trace-scores mono">
                        <span>
                          {step.review.approved ? "✓ aprobado" : "↻ rehacer"}
                        </span>
                        {Object.entries(step.review.scores).map(([k, v]) => (
                          <span key={k}>
                            {k}:{v}/5
                          </span>
                        ))}
                      </div>
                      {step.review.observations.map((obs, i) => (
                        <p key={i} className="trace-obs">
                          • {obs}
                        </p>
                      ))}
                    </div>
                  )}

                  {step.output && (
                    <div className="trace-block">
                      <span>Output</span>
                      <pre>{step.output}</pre>
                    </div>
                  )}

                  <div className="trace-block">
                    <span>Prompt</span>
                    <pre>{step.prompt}</pre>
                  </div>

                  <div className="trace-block">
                    <span>Request JSON-RPC</span>
                    <pre>{JSON.stringify(step.request, null, 2)}</pre>
                  </div>

                  <div className="trace-block">
                    <span>Response JSON-RPC</span>
                    <pre>
                      {step.error && !step.response
                        ? step.error
                        : JSON.stringify(step.response, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </aside>
  );
}
