"""Agent host A2A: un solo proceso que aloja agentes creados desde la UI.

Cada agente es un agente A2A real e independiente, con su propia URL base:
- Agent Card: GET  /agents/{id}/.well-known/agent-card.json (A2A v0.3.0, sección 5.3).
- RPC:        POST /agents/{id}/ con JSON-RPC 2.0 y message/send (sección 9.4.1).

La spec permite servir varios agentes desde un mismo servidor siempre que cada
uno publique su card con su propia `url`. Fuente:
https://a2a-protocol.org/v0.3.0/specification/ (sección 5.3, "Discovery").

Además expone una API de gestión (NO es parte de A2A) para que el playground
cree agentes y configure proveedores: /agents, /providers, /presets.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from typing import Annotated, Any, Literal

from fastapi import FastAPI, HTTPException, Path, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from agents.common import pricing
from agents.common.a2a import (
    PARSE_ERROR,
    build_artifact,
    build_task,
    data_part,
    estimate_tokens,
    jsonrpc_error,
    jsonrpc_ok,
    parse_send_request,
    text_from_message,
    text_part,
)
from agents.common.app_info import A2A_PROTOCOL_VERSION, APP_NAME, APP_VERSION
from agents.common.llm import PROVIDER_PRESETS, LLMError, chat_completion, list_models
from agents.host import roles
from agents.host.providers import MOCK_PROVIDER_ID, ProviderStore

PORT = int(os.getenv("HOST_PORT", "8000"))
PUBLIC_URL = os.getenv("HOST_PUBLIC_URL", f"http://localhost:{PORT}").rstrip("/")
ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:4173,http://127.0.0.1:4173"
)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
    if origin.strip()
]
PUBLIC_PRESET_FIELDS = ("label", "baseUrl", "needsKey", "suggestedModels")

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("agent-host")

app = FastAPI(title=f"{APP_NAME} Agent Host", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# --- Modelos de la API de gestión --------------------------------------------


class AgentConfig(BaseModel):
    role: Literal["writer", "critic"]
    name: str = Field(min_length=1, max_length=80)
    instructions: str = Field(default="", max_length=8000)
    providerId: str = MOCK_PROVIDER_ID
    model: str = "mock"
    temperature: float | None = Field(default=None, ge=0, le=2)


class ProviderInput(BaseModel):
    kind: str
    name: str = Field(min_length=1, max_length=80)
    apiKey: str | None = Field(default=None, max_length=512)
    baseUrl: str = Field(default="", max_length=2048)
    models: list[str] = Field(default_factory=list, max_length=500)


providers = ProviderStore()
agents: dict[str, AgentConfig] = {}
agents_lock = threading.Lock()

AgentId = Annotated[str, Path(pattern=ID_PATTERN)]


def get_agent(agent_id: str) -> AgentConfig:
    with agents_lock:
        config = agents.get(agent_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f"No existe el agente '{agent_id}'")
    return config


# --- A2A ---------------------------------------------------------------------


def agent_url(agent_id: str) -> str:
    return f"{PUBLIC_URL}/agents/{agent_id}/"


def agent_card(agent_id: str, config: AgentConfig) -> dict[str, Any]:
    return {
        "protocolVersion": A2A_PROTOCOL_VERSION,
        "name": config.name,
        "description": roles.SKILLS[config.role]["description"],
        "url": agent_url(agent_id),
        "preferredTransport": "JSONRPC",
        "version": APP_VERSION,
        "capabilities": {
            "streaming": False,
            "pushNotifications": False,
            "stateTransitionHistory": False,
        },
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": roles.OUTPUT_MODES[config.role],
        "skills": [roles.SKILLS[config.role]],
    }


def run_agent(agent_id: str, config: AgentConfig, message: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    task_id = str(uuid.uuid4())
    context_id = message.get("contextId") or str(uuid.uuid4())
    user_text = text_from_message(message)

    # Las instrucciones se configuran por la API de gestión, nunca desde un
    # mensaje A2A: cualquier cliente podría mandar metadata arbitraria.
    if (message.get("metadata") or {}).get("systemPrompt"):
        logger.warning("agente %s: metadata.systemPrompt ignorado", agent_id)

    system_prompt = roles.system_prompt(config.role, config.instructions)

    try:
        provider = providers.get(config.providerId)
        if provider is None:
            raise LLMError(f"El proveedor '{config.providerId}' no está configurado en Ajustes.")

        if provider["kind"] == "mock":
            if config.role == "writer":
                raw = roles.mock_write(config.instructions, user_text)
            else:
                raw = json.dumps(roles.mock_review(user_text), ensure_ascii=False)
            mode, estimated = "mock", True
            tokens_input = estimate_tokens(f"{system_prompt}\n{user_text}")
            tokens_output = estimate_tokens(raw)
            uncached_input = tokens_input
            cache_read = 0
            cache_write = 0
            reasoning_tokens = 0
            reported_cost = None
        else:
            if not config.model or config.model == MOCK_PROVIDER_ID:
                raise LLMError("El nodo no tiene un modelo real elegido.")
            completion = chat_completion(
                provider,
                config.model,
                system_prompt,
                user_text,
                config.temperature,
                session_id=context_id,
            )
            raw = completion["text"]
            mode, estimated = "llm", False
            tokens_input = completion["tokensInput"]
            tokens_output = completion["tokensOutput"]
            uncached_input = completion.get("uncachedInputTokens", tokens_input)
            cache_read = completion.get("cacheReadTokens", 0)
            cache_write = completion.get("cacheWriteTokens", 0)
            reasoning_tokens = completion.get("reasoningTokens", 0)
            reported_cost = completion.get("reportedCostUsd")

        cost_usd = None
        cost_source = None
        if mode == "llm":
            if reported_cost is not None:
                cost_usd = reported_cost
                cost_source = "provider"
            elif provider["kind"] == "ollama":
                cost_usd = 0.0
                cost_source = "local"
            else:
                cost_usd = pricing.estimate_cost(
                    config.model,
                    uncached_input=uncached_input,
                    cache_read=cache_read,
                    cache_write=cache_write,
                    output=tokens_output,
                )
                cost_source = "catalog" if cost_usd is not None else None

        if config.role == "critic":
            review = roles.parse_review(raw)
            parts = [text_part(review["summary"]), data_part(review)]
        else:
            if not raw.strip():
                raise LLMError("El modelo devolvió un texto vacío.")
            parts = [text_part(raw)]
    except Exception as exc:
        logger.exception("agente %s falló", agent_id)
        return build_task(task_id, context_id, "failed", [], status_text=str(exc))

    latency_ms = round((time.perf_counter() - started) * 1000, 1)
    artifact = build_artifact(
        "review" if config.role == "critic" else "draft",
        parts,
        {
            "mode": mode,
            "estimated": estimated,
            "provider": config.providerId,
            "model": config.model if mode == "llm" else "mock",
            "tokensInput": tokens_input,
            "tokensOutput": tokens_output,
            "cacheReadTokens": cache_read,
            "cacheWriteTokens": cache_write,
            "reasoningTokens": reasoning_tokens,
            "costUsd": cost_usd,
            "costSource": cost_source,
            "reportedCostUsd": reported_cost,
            "latencyMs": latency_ms,
            "systemPrompt": system_prompt,
        },
    )
    return build_task(task_id, context_id, "completed", [artifact])


@app.get("/agents/{agent_id}/.well-known/agent-card.json")
def get_agent_card(agent_id: AgentId) -> dict[str, Any]:
    return agent_card(agent_id, get_agent(agent_id))


@app.post("/agents/{agent_id}/")
@app.post("/agents/{agent_id}", include_in_schema=False)
async def json_rpc(request: Request, agent_id: AgentId):
    config = get_agent(agent_id)
    try:
        payload = await request.json()
    except Exception:
        return jsonrpc_error(None, PARSE_ERROR, "Parse error")

    request_id, message, error = parse_send_request(payload)
    if error is not None:
        return error

    task = await run_in_threadpool(run_agent, agent_id, config, message)
    return jsonrpc_ok(request_id, task)


# --- API de gestión (no es A2A) ----------------------------------------------


@app.get("/health")
def health() -> dict[str, Any]:
    with agents_lock:
        count = len(agents)
    return {"ok": True, "agents": count, "version": APP_VERSION}


@app.get("/agents")
def list_agents() -> list[dict[str, Any]]:
    with agents_lock:
        items = list(agents.items())
    return [{"id": agent_id, **config.model_dump(), "url": agent_url(agent_id)} for agent_id, config in items]


@app.put("/agents/{agent_id}")
def upsert_agent(config: AgentConfig, agent_id: AgentId) -> dict[str, Any]:
    # Upsert idempotente: el playground es dueño del grafo y re-sincroniza los
    # agentes cuando cambian o cuando el host se reinicia.
    with agents_lock:
        agents[agent_id] = config
    return {"id": agent_id, **config.model_dump(), "url": agent_url(agent_id)}


@app.delete("/agents/{agent_id}")
def delete_agent(agent_id: AgentId) -> dict[str, bool]:
    with agents_lock:
        removed = agents.pop(agent_id, None) is not None
    return {"deleted": removed}


@app.get("/presets")
def get_presets() -> dict[str, Any]:
    return {
        kind: {
            field: preset[field]
            for field in PUBLIC_PRESET_FIELDS
            if field in preset
        }
        for kind, preset in PROVIDER_PRESETS.items()
    }


@app.get("/providers")
def get_providers() -> list[dict[str, Any]]:
    return providers.list_public()


@app.put("/providers/{provider_id}")
def put_provider(data: ProviderInput, provider_id: AgentId) -> dict[str, Any]:
    if provider_id == MOCK_PROVIDER_ID:
        raise HTTPException(status_code=400, detail="El proveedor mock no se puede editar")
    try:
        return providers.upsert(provider_id, data.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/providers/{provider_id}")
def remove_provider(provider_id: AgentId) -> dict[str, bool]:
    return {"deleted": providers.delete(provider_id)}


@app.post("/providers/{provider_id}/models")
async def fetch_provider_models(provider_id: AgentId) -> dict[str, list[str]]:
    provider = providers.get(provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    if provider["kind"] == "mock":
        return {"models": ["mock"]}
    try:
        models = await run_in_threadpool(list_models, provider)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"models": models}
