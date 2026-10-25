import {
  CRITIC_CONTRACT_NOTE,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_OPENCODE_MODEL,
  MOCK_PROVIDER_ID,
} from "../config";
import { agentBaseUrl } from "../lib/a2a";
import type {
  AgentData,
  FlowNode,
  FlowNodeData,
  Provider,
  TriggerData,
} from "../types";

type NodeInspectorProps = {
  node: FlowNode | undefined;
  providers: Provider[];
  disabled: boolean;
  onClose: () => void;
  onUpdateNode: (nodeId: string, patch: Partial<FlowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onOpenProviders: () => void;
};

export function NodeInspector({
  node,
  providers,
  disabled,
  onClose,
  onUpdateNode,
  onDeleteNode,
  onOpenProviders,
}: NodeInspectorProps) {
  if (!node) return null;

  return (
    <aside className="node-drawer" aria-label="Editor de nodo">
      <header className="drawer-header">
        <div className="drawer-title-wrap">
          <span className={`drawer-dot kind-${node.data.kind}`} />
          <div>
            <strong>{node.data.name || node.id}</strong>
            <span className="drawer-sub mono">
              {node.data.kind === "trigger"
                ? "Trigger manual"
                : node.data.kind === "writer"
                  ? `Agente Escritor · /agents/${node.id}`
                  : `Agente Crítico · /agents/${node.id}`}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="drawer-close"
          onClick={onClose}
          title="Cerrar (Esc)"
        >
          ✕
        </button>
      </header>

      {node.data.kind === "trigger" ? (
        <TriggerDrawerBody
          data={node.data}
          disabled={disabled}
          onUpdate={(patch) => onUpdateNode(node.id, patch)}
          onDelete={() => onDeleteNode(node.id)}
        />
      ) : (
        <AgentDrawerBody
          nodeId={node.id}
          data={node.data}
          providers={providers}
          disabled={disabled}
          onUpdate={(patch) => onUpdateNode(node.id, patch)}
          onDelete={() => onDeleteNode(node.id)}
          onOpenProviders={onOpenProviders}
        />
      )}
    </aside>
  );
}

function TriggerDrawerBody({
  data,
  disabled,
  onUpdate,
  onDelete,
}: {
  data: TriggerData;
  disabled: boolean;
  onUpdate: (patch: Partial<TriggerData>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="drawer-body">
      <div className="oc-card-group">
        <div className="oc-row">
          <div className="oc-row-copy">
            <strong>Nombre</strong>
            <span>Etiqueta visible en el nodo</span>
          </div>
          <input
            className="oc-input-inline"
            value={data.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>

      <label className="drawer-field">
        <span>Pedido inicial (mensaje enviado por JSON-RPC message/send)</span>
        <textarea
          rows={5}
          value={data.input}
          onChange={(e) => onUpdate({ input: e.target.value })}
          disabled={disabled}
          placeholder="Escribí qué querés que redacte el agente…"
        />
      </label>

      <footer className="drawer-footer">
        <button
          type="button"
          className="oc-text-btn danger"
          onClick={onDelete}
          disabled={disabled}
        >
          Eliminar nodo
        </button>
      </footer>
    </div>
  );
}

function AgentDrawerBody({
  nodeId,
  data,
  providers,
  disabled,
  onUpdate,
  onDelete,
  onOpenProviders,
}: {
  nodeId: string;
  data: AgentData;
  providers: Provider[];
  disabled: boolean;
  onUpdate: (patch: Partial<AgentData>) => void;
  onDelete: () => void;
  onOpenProviders: () => void;
}) {
  const defaultInstructions = DEFAULT_INSTRUCTIONS[data.kind];
  const isDefault = data.instructions === defaultInstructions;
  const currentProvider =
    providers.find((p) => p.id === data.providerId) ??
    providers.find((p) => p.kind === MOCK_PROVIDER_ID) ??
    providers[0];
  const realProviders = providers.filter(
    (p) => p.kind !== MOCK_PROVIDER_ID && p.models.length > 0,
  );
  const hasRealModels = realProviders.length > 0;
  const currentModelValue =
    currentProvider && currentProvider.kind !== MOCK_PROVIDER_ID
      ? `${currentProvider.id}::${data.model}`
      : "";
  const modelValues = new Set(
    realProviders.flatMap((p) => p.models.map((m) => `${p.id}::${m}`)),
  );
  const showModelPlaceholder = !modelValues.has(currentModelValue);
  const cardUrl = `${agentBaseUrl(nodeId)}/.well-known/agent-card.json`;

  function handleProviderChange(providerId: string) {
    const chosen = providers.find((p) => p.id === providerId);
    const preferred =
      chosen?.kind === "opencode-go" &&
      chosen.models.includes(DEFAULT_OPENCODE_MODEL)
        ? DEFAULT_OPENCODE_MODEL
        : (chosen?.models?.[0] ?? "");
    const nextModel =
      chosen?.kind === MOCK_PROVIDER_ID ? MOCK_PROVIDER_ID : preferred;
    onUpdate({ providerId, model: nextModel });
  }

  return (
    <div className="drawer-body">
      <div className="oc-card-group">
        <div className="oc-row">
          <div className="oc-row-copy">
            <strong>Nombre del agente</strong>
            <span>Publicado en la Agent Card</span>
          </div>
          <input
            className="oc-input-inline"
            value={data.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            disabled={disabled}
          />
        </div>

        <div className="oc-row">
          <div className="oc-row-copy">
            <strong>Proveedor LLM</strong>
            <span>
              <button
                type="button"
                className="oc-inline-link"
                onClick={onOpenProviders}
              >
                Configurar API keys en Providers →
              </button>
            </span>
          </div>
          <select
            className="oc-select-inline"
            value={currentProvider?.id ?? MOCK_PROVIDER_ID}
            onChange={(e) => handleProviderChange(e.target.value)}
            disabled={disabled}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="oc-row oc-row-stacked">
          <div className="oc-row-copy">
            <strong>Modelo</strong>
            <span>
              {currentProvider?.kind === MOCK_PROVIDER_ID && hasRealModels
                ? "Elegí un modelo para usar ese proveedor"
                : "Modelo que consume este agente"}
            </span>
          </div>
          {hasRealModels ? (
            <select
              className="oc-select-inline mono"
              value={currentModelValue}
              onChange={(e) => {
                const [providerId, model] = e.target.value.split("::");
                if (providerId && model) {
                  onUpdate({ providerId, model });
                }
              }}
              disabled={disabled}
            >
              {showModelPlaceholder && (
                <option value="">Elegí un modelo…</option>
              )}
              {realProviders.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {p.models.map((m) => (
                    <option key={`${p.id}::${m}`} value={`${p.id}::${m}`}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : currentProvider?.kind === MOCK_PROVIDER_ID ? (
            <span className="oc-pill-muted mono">mock</span>
          ) : (
            <input
              className="oc-input-inline mono"
              value={data.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              disabled={disabled}
              placeholder="gpt-4o-mini"
            />
          )}
        </div>

        <div className="oc-row">
          <div className="oc-row-copy">
            <strong>Temperatura</strong>
            <span>Vacío usa el valor por defecto del modelo</span>
          </div>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            className="oc-input-inline mono"
            style={{ width: "86px" }}
            value={data.temperature ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                onUpdate({ temperature: null });
                return;
              }
              const parsed = Number(raw);
              if (Number.isFinite(parsed)) {
                onUpdate({ temperature: Math.max(0, Math.min(2, parsed)) });
              }
            }}
            disabled={disabled || currentProvider?.kind === MOCK_PROVIDER_ID}
            placeholder="Auto"
          />
        </div>
      </div>

      <label className="drawer-field">
        <div className="drawer-field-head">
          <span>Tarea / Instrucciones del agente</span>
          {!isDefault && (
            <button
              type="button"
              className="oc-inline-link"
              onClick={() => onUpdate({ instructions: defaultInstructions })}
              disabled={disabled}
            >
              Restaurar default
            </button>
          )}
        </div>
        <textarea
          rows={5}
          value={data.instructions}
          onChange={(e) => onUpdate({ instructions: e.target.value })}
          disabled={disabled}
          placeholder="Instrucciones o rol del agente…"
        />
        <small className="drawer-hint">
          {data.kind === "writer"
            ? "En modo mock, incluir 'breve' o 'corto' hace que el escritor genere una respuesta corta aprobada en 1 iteración."
            : CRITIC_CONTRACT_NOTE}
        </small>
      </label>

      <footer className="drawer-footer">
        <a
          href={cardUrl}
          target="_blank"
          rel="noreferrer"
          className="oc-text-btn mono"
        >
          Agent Card JSON ↗
        </a>
        <button
          type="button"
          className="oc-text-btn danger"
          onClick={onDelete}
          disabled={disabled}
        >
          Eliminar agente
        </button>
      </footer>
    </div>
  );
}
