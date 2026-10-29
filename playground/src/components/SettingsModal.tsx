import { useState } from "react";
import { HOST_URL, LOOP_LEVELS, loopLevelForIterations } from "../config";
import { deleteProvider, fetchProviderModels, saveProvider } from "../lib/host";
import { newId } from "../lib/id";
import type {
  AgentCard,
  Pricing,
  Provider,
  ProviderKind,
  ProviderPreset,
} from "../types";

type SettingsSection = "general" | "servers" | "providers" | "models";

type SettingsModalProps = {
  open: boolean;
  initialSection?: SettingsSection;
  providers: Provider[];
  presets: Record<ProviderKind, ProviderPreset>;
  pricing: Pricing;
  maxIterations: number;
  autoExpandTrace: boolean;
  showComparison: boolean;
  hostOnline: boolean | null;
  cards: Record<string, AgentCard>;
  onClose: () => void;
  onProvidersChanged: () => Promise<void>;
  onPricingChange: (pricing: Pricing) => void;
  onMaxIterationsChange: (value: number) => void;
  onAutoExpandTraceChange: (value: boolean) => void;
  onShowComparisonChange: (value: boolean) => void;
  onReconnectHost: () => Promise<void>;
};

const EDITABLE_KINDS: ProviderKind[] = [
  "opencode-go",
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "openrouter",
  "ollama",
  "custom",
];

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "provider"
  );
}

export function SettingsModal({
  open,
  initialSection = "general",
  providers,
  presets,
  pricing,
  maxIterations,
  autoExpandTrace,
  showComparison,
  hostOnline,
  cards,
  onClose,
  onProvidersChanged,
  onPricingChange,
  onMaxIterationsChange,
  onAutoExpandTraceChange,
  onShowComparisonChange,
  onReconnectHost,
}: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const customProviders = providers.filter((p) => !p.builtin);
  const hasOpencodeGo = providers.some((p) => p.kind === "opencode-go");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [kind, setKind] = useState<ProviderKind>("openai");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [newModelInput, setNewModelInput] = useState<Record<string, string>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const selectedLoopLevel = loopLevelForIterations(maxIterations);

  if (!open) return null;

  function openNewProvider(defaultKind: ProviderKind = "openai") {
    const preset = presets[defaultKind];
    setEditingId(null);
    setCreatingNew(true);
    setKind(defaultKind);
    setName(preset?.label ?? "OpenAI");
    setApiKey("");
    setBaseUrl(preset?.baseUrl ?? "");
    setModelsText((preset?.suggestedModels ?? []).join(", "));
    setFeedback(null);
  }

  function openEditProvider(provider: Provider) {
    setCreatingNew(false);
    setEditingId(provider.id);
    setKind(provider.kind);
    setName(provider.name);
    setApiKey("");
    setBaseUrl(provider.baseUrl);
    setModelsText(provider.models.join(", "));
    setFeedback(null);
  }

  function handleKindChange(nextKind: ProviderKind) {
    const preset = presets[nextKind];
    setKind(nextKind);
    if (!editingId) {
      setName(preset?.label ?? nextKind);
    }
    setBaseUrl(preset?.baseUrl ?? "");
    if (preset?.suggestedModels?.length) {
      setModelsText(preset.suggestedModels.join(", "));
    }
  }

  function parseModels(raw: string): string[] {
    return Array.from(
      new Set(
        raw
          .split(/[\n,]+/)
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    );
  }

  async function handleSaveProvider() {
    setBusy(true);
    setFeedback(null);
    try {
      const id = editingId ?? `${slugify(name || kind)}-${newId().slice(0, 4)}`;
      const saved = await saveProvider(id, {
        kind,
        name: name.trim() || (presets[kind]?.label ?? kind),
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim(),
        models: parseModels(modelsText),
      });
      await onProvidersChanged();
      setEditingId(saved.id);
      setCreatingNew(false);
      setApiKey("");
      setModelsText(saved.models.join(", "));

      let modelCount = saved.models.length;
      let syncError: string | null = null;
      if (saved.kind === "opencode-go") {
        // Al guardar dejamos los modelos listos para elegir en cada nodo.
        try {
          const fetched = await fetchProviderModels(saved.id);
          if (fetched.length > 0) {
            const merged = Array.from(new Set([...saved.models, ...fetched]));
            await saveProvider(saved.id, {
              kind: saved.kind,
              name: saved.name,
              baseUrl: saved.baseUrl,
              models: merged,
            });
            await onProvidersChanged();
            setModelsText(merged.join(", "));
            modelCount = merged.length;
          }
        } catch (err) {
          syncError = err instanceof Error ? err.message : String(err);
        }
      }

      setFeedback(
        syncError
          ? {
              type: "err",
              text: `${saved.name} guardado, pero no pude cargar los modelos: ${syncError}. Verificá la API key y usá Sincronizar.`,
            }
          : {
              type: "ok",
              text: `${saved.name} guardado correctamente.${
                saved.kind === "opencode-go"
                  ? ` ${modelCount} modelos disponibles en cada nodo.`
                  : ""
              }`,
            },
      );
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncModels(provider: Provider) {
    setBusy(true);
    setFeedback(null);
    try {
      const fetched = await fetchProviderModels(provider.id);
      if (fetched.length > 0) {
        const merged = Array.from(new Set([...provider.models, ...fetched]));
        await saveProvider(provider.id, {
          kind: provider.kind,
          name: provider.name,
          baseUrl: provider.baseUrl,
          models: merged,
        });
        await onProvidersChanged();
      }
      setFeedback({
        type: "ok",
        text: `${fetched.length} modelos sincronizados desde ${provider.name}.`,
      });
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveProvider(providerId: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await deleteProvider(providerId);
      await onProvidersChanged();
      if (editingId === providerId) {
        setEditingId(null);
      }
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddModelToProvider(provider: Provider) {
    const raw = (newModelInput[provider.id] ?? "").trim();
    if (!raw) return;
    setBusy(true);
    setFeedback(null);
    try {
      const merged = Array.from(new Set([...provider.models, raw]));
      await saveProvider(provider.id, {
        kind: provider.kind,
        name: provider.name,
        baseUrl: provider.baseUrl,
        models: merged,
      });
      setNewModelInput((curr) => ({ ...curr, [provider.id]: "" }));
      await onProvidersChanged();
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveModelFromProvider(
    provider: Provider,
    modelId: string,
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      const filtered = provider.models.filter((m) => m !== modelId);
      await saveProvider(provider.id, {
        kind: provider.kind,
        name: provider.name,
        baseUrl: provider.baseUrl,
        models: filtered,
      });
      await onProvidersChanged();
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="oc-backdrop" onClick={onClose}>
      <div
        className="oc-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Left Sidebar like OpenCode */}
        <aside className="oc-sidebar">
          <div className="oc-nav-group">
            <span className="oc-group-label">Desktop</span>
            <button
              type="button"
              className={`oc-nav-item ${section === "general" ? "is-active" : ""}`}
              onClick={() => {
                setSection("general");
                setFeedback(null);
              }}
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
                <circle cx="5.5" cy="4.5" r="1.4" fill="currentColor" />
                <circle cx="10.5" cy="8" r="1.4" fill="currentColor" />
                <circle cx="6.5" cy="11.5" r="1.4" fill="currentColor" />
              </svg>
              <span>General</span>
            </button>
          </div>

          <div className="oc-nav-group">
            <span className="oc-group-label">Server</span>
            <button
              type="button"
              className={`oc-nav-item ${section === "servers" ? "is-active" : ""}`}
              onClick={() => {
                setSection("servers");
                setFeedback(null);
              }}
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect
                  x="2.2"
                  y="3"
                  width="11.6"
                  height="4"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <rect
                  x="2.2"
                  y="9"
                  width="11.6"
                  height="4"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <circle cx="4.5" cy="5" r="0.7" fill="currentColor" />
                <circle cx="4.5" cy="11" r="0.7" fill="currentColor" />
              </svg>
              <span>Servers</span>
            </button>

            <button
              type="button"
              className={`oc-nav-item ${
                section === "providers" ? "is-active" : ""
              }`}
              onClick={() => {
                setSection("providers");
                setFeedback(null);
              }}
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect
                  x="2.5"
                  y="3"
                  width="11"
                  height="10"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="2.2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
              </svg>
              <span>Providers</span>
            </button>

            <button
              type="button"
              className={`oc-nav-item ${section === "models" ? "is-active" : ""}`}
              onClick={() => {
                setSection("models");
                setFeedback(null);
              }}
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 2l1.4 3.6L13 7l-3.6 1.4L8 12 6.6 8.4 3 7l3.6-1.4L8 2z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Models</span>
            </button>
          </div>

          <div className="oc-sidebar-footer">
            <strong>A2A Playground</strong>
            <span>Protocol v0.3.0</span>
          </div>
        </aside>

        {/* Right Content Area */}
        <section className="oc-content">
          {section === "general" && (
            <>
              <h2 className="oc-section-title">General</h2>

              <div className="oc-card-group">
                <div className="oc-row">
                  <div className="oc-row-copy">
                    <strong>Nivel de procesamiento del loop</strong>
                    <span>
                      Cuánto puede insistir el crítico antes de cortar. Más
                      nivel, más reescrituras y más consumo de tokens y tiempo.
                    </span>
                  </div>
                  <div className="oc-level-control">
                    <select
                      className="oc-select-inline"
                      value={maxIterations}
                      onChange={(e) =>
                        onMaxIterationsChange(Number(e.target.value))
                      }
                      aria-label="Nivel de procesamiento del loop"
                    >
                      {LOOP_LEVELS.map((level) => (
                        <option key={level.id} value={level.iterations}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                    <span className="oc-level-hint">
                      {selectedLoopLevel.description}
                    </span>
                  </div>
                </div>

                <div className="oc-row">
                  <div className="oc-row-copy">
                    <strong>Expandir última traza automáticamente</strong>
                    <span>
                      Abre el detalle JSON-RPC del último paso ejecutado en la
                      línea de tiempo
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoExpandTrace}
                    className={`oc-switch ${autoExpandTrace ? "is-on" : ""}`}
                    onClick={() => onAutoExpandTraceChange(!autoExpandTrace)}
                  >
                    <span />
                  </button>
                </div>

                <div className="oc-row">
                  <div className="oc-row-copy">
                    <strong>Mostrar comparación entre corridas</strong>
                    <span>
                      Habilita el comparador lado a lado cuando cambia el
                      borrador o las instrucciones
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showComparison}
                    className={`oc-switch ${showComparison ? "is-on" : ""}`}
                    onClick={() => onShowComparisonChange(!showComparison)}
                  >
                    <span />
                  </button>
                </div>

                <div className="oc-row">
                  <div className="oc-row-copy">
                    <strong>Tarifa manual Input (USD / 1K tokens)</strong>
                    <span>
                      Fallback para modelos sin tarifa oficial o Mock.
                      Referencia: Gemini 2.5 Flash.
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={0.0001}
                    className="oc-input-inline mono"
                    value={pricing.inputPer1K}
                    onChange={(e) =>
                      onPricingChange({
                        ...pricing,
                        inputPer1K: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>

                <div className="oc-row">
                  <div className="oc-row-copy">
                    <strong>Tarifa manual Output (USD / 1K tokens)</strong>
                    <span>
                      Fallback para modelos sin tarifa oficial o Mock.
                      Referencia: Gemini 2.5 Flash.
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={0.0001}
                    className="oc-input-inline mono"
                    value={pricing.outputPer1K}
                    onChange={(e) =>
                      onPricingChange({
                        ...pricing,
                        outputPer1K: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
              </div>

              <p className="oc-pricing-note">
                Tokens: los informa el proveedor de cada agente; en Mock se
                estiman de forma aproximada. Costos: OpenRouter devuelve el
                costo facturado por request; los modelos del catálogo (Gemini,
                GPT, Claude, Llama) usan tarifa oficial; el resto usa la tarifa
                manual de arriba. No se cobra nada ni afecta la ejecución.
              </p>
            </>
          )}

          {section === "servers" && (
            <>
              <h2 className="oc-section-title">Servers</h2>

              <div className="oc-banner-box">
                <div className="oc-row-copy">
                  <strong>
                    Agent Host A2A · {hostOnline ? "Conectado" : "Sin conexión"}
                  </strong>
                  <span className="mono">{HOST_URL}</span>
                </div>
                <button
                  type="button"
                  className="oc-text-btn"
                  onClick={() => void onReconnectHost()}
                >
                  Reconectar
                </button>
              </div>

              <div className="oc-card-group">
                {Object.entries(cards).length === 0 ? (
                  <div className="oc-row">
                    <div className="oc-row-copy">
                      <strong>Agent Cards publicadas</strong>
                      <span>
                        Dispará el flujo o seleccioná un agente para consultar
                        su Agent Card en /.well-known/agent-card.json
                      </span>
                    </div>
                  </div>
                ) : (
                  Object.entries(cards).map(([id, card]) => (
                    <div key={id} className="oc-row">
                      <div className="oc-row-copy">
                        <strong>{card.name}</strong>
                        <span className="mono">{card.url}</span>
                      </div>
                      <a
                        href={`${card.url}.well-known/agent-card.json`}
                        target="_blank"
                        rel="noreferrer"
                        className="oc-text-btn"
                      >
                        Agent Card ↗
                      </a>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {section === "providers" && (
            <>
              <div className="oc-title-bar">
                <h2 className="oc-section-title">Providers</h2>
                <button
                  type="button"
                  className="oc-action-btn"
                  onClick={() => openNewProvider("openai")}
                >
                  + Agregar proveedor
                </button>
              </div>

              {feedback && (
                <div
                  className={`oc-feedback ${
                    feedback.type === "ok" ? "is-ok" : "is-err"
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              {(creatingNew || editingId) && (
                <div className="oc-editor-box">
                  <div className="oc-editor-head">
                    <strong>
                      {creatingNew
                        ? "Nuevo proveedor LLM"
                        : `Configurar ${name}`}
                    </strong>
                    <button
                      type="button"
                      className="oc-text-btn"
                      onClick={() => {
                        setCreatingNew(false);
                        setEditingId(null);
                      }}
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="oc-editor-grid">
                    <label className="oc-field">
                      <span>Proveedor</span>
                      <select
                        value={kind}
                        onChange={(e) =>
                          handleKindChange(e.target.value as ProviderKind)
                        }
                        disabled={busy}
                      >
                        {EDITABLE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {presets[k]?.label ?? k}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="oc-field">
                      <span>Nombre</span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={busy}
                        placeholder="OpenAI"
                      />
                    </label>

                    <label className="oc-field">
                      <span>API Key</span>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        disabled={busy}
                        placeholder={
                          editingId
                            ? "Vacío = mantener key actual"
                            : presets[kind]?.needsKey === false
                              ? "No requiere API key"
                              : kind === "opencode-go"
                                ? "oc_sk_..."
                                : "sk-..."
                        }
                      />
                    </label>

                    {kind !== "opencode-go" && (
                      <label className="oc-field">
                        <span>Base URL</span>
                        <input
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          disabled={busy}
                          className="mono"
                        />
                      </label>
                    )}
                  </div>

                  {kind === "opencode-go" ? (
                    <p className="oc-field-hint">
                      Al guardar se cargan automáticamente los modelos de Go
                      disponibles y quedan listos para elegir en cada nodo.
                    </p>
                  ) : (
                    <label className="oc-field">
                      <span>Modelos (separados por coma)</span>
                      <input
                        value={modelsText}
                        onChange={(e) => setModelsText(e.target.value)}
                        disabled={busy}
                        className="mono"
                        placeholder="gpt-4o-mini, gpt-4o"
                      />
                    </label>
                  )}

                  <div className="oc-editor-foot">
                    <button
                      type="button"
                      className="oc-action-btn primary"
                      onClick={() => void handleSaveProvider()}
                      disabled={busy}
                    >
                      {busy ? "Guardando…" : "Guardar proveedor"}
                    </button>
                  </div>
                </div>
              )}

              {!hasOpencodeGo && (
                <div className="oc-banner-box">
                  <div className="oc-row-copy">
                    <strong>OpenCode Go</strong>
                    <span>
                      Pegá tu API key y elegí cualquiera de los modelos de Go en
                      cada nodo.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="oc-action-btn primary"
                    onClick={() => openNewProvider("opencode-go")}
                    disabled={busy}
                  >
                    Conectar
                  </button>
                </div>
              )}

              <div className="oc-card-group">
                <div className="oc-row">
                  <div className="oc-row-copy">
                    <strong>Mock (sin red)</strong>
                    <span>
                      Proveedor determinístico local para probar el loop A2A sin
                      API key
                    </span>
                  </div>
                  <span className="oc-pill-muted">Integrado</span>
                </div>

                {customProviders.map((p) => (
                  <div key={p.id} className="oc-row">
                    <div className="oc-row-copy">
                      <strong>{p.name}</strong>
                      <span className="mono">
                        {p.kind} ·{" "}
                        {p.hasKey ? `Key ${p.keyPreview}` : "Sin API key"} ·{" "}
                        {p.models.length} modelos
                      </span>
                    </div>
                    <div className="oc-row-actions">
                      <button
                        type="button"
                        className="oc-text-btn"
                        onClick={() => void handleSyncModels(p)}
                        disabled={busy}
                      >
                        Sincronizar
                      </button>
                      <button
                        type="button"
                        className="oc-text-btn"
                        onClick={() => openEditProvider(p)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="oc-text-btn danger"
                        onClick={() => void handleRemoveProvider(p.id)}
                        disabled={busy}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}

                {customProviders.length === 0 && !creatingNew && (
                  <div className="oc-row">
                    <div className="oc-row-copy">
                      <strong>No agregaste proveedores externos todavía</strong>
                      <span>
                        Agregá OpenAI, Anthropic, Gemini, Groq, OpenRouter u
                        Ollama para usarlos en tus nodos
                      </span>
                    </div>
                    <button
                      type="button"
                      className="oc-text-btn"
                      onClick={() => openNewProvider("openai")}
                    >
                      Configurar →
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {section === "models" && (
            <>
              <h2 className="oc-section-title">Models</h2>

              {customProviders.length === 0 ? (
                <div className="oc-banner-box">
                  <div className="oc-row-copy">
                    <strong>Sin proveedores con modelos externos</strong>
                    <span>
                      Primero agregá un proveedor en la pestaña Providers para
                      habilitar sus modelos.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="oc-text-btn"
                    onClick={() => {
                      setSection("providers");
                      openNewProvider("openai");
                    }}
                  >
                    Ir a Providers
                  </button>
                </div>
              ) : (
                customProviders.map((provider) => (
                  <div key={provider.id} className="oc-models-block">
                    <div className="oc-models-head">
                      <strong>{provider.name}</strong>
                      <button
                        type="button"
                        className="oc-text-btn"
                        onClick={() => void handleSyncModels(provider)}
                        disabled={busy}
                      >
                        ↻ Consultar API /models
                      </button>
                    </div>

                    <div className="oc-card-group">
                      {provider.models.map((modelId) => (
                        <div key={modelId} className="oc-row">
                          <div className="oc-row-copy">
                            <strong className="mono">{modelId}</strong>
                            <span>Disponible en el selector de cada nodo</span>
                          </div>
                          <button
                            type="button"
                            className="oc-text-btn danger"
                            onClick={() =>
                              void handleRemoveModelFromProvider(
                                provider,
                                modelId,
                              )
                            }
                          >
                            Quitar
                          </button>
                        </div>
                      ))}

                      <div className="oc-row">
                        <input
                          className="oc-inline-add mono"
                          placeholder="Agregar ID de modelo (ej. gpt-4o-mini)…"
                          value={newModelInput[provider.id] ?? ""}
                          onChange={(e) =>
                            setNewModelInput((curr) => ({
                              ...curr,
                              [provider.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void handleAddModelToProvider(provider);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="oc-text-btn"
                          onClick={() =>
                            void handleAddModelToProvider(provider)
                          }
                        >
                          + Agregar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
