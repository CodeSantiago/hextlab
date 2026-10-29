"""Llamadas a proveedores reales de LLM.

A2A no define un proveedor: el agente decide internamente qué modelo usar.
Hay solo dos dialectos de API:
- "openai": /chat/completions y /models. Lo hablan OpenAI, Gemini (endpoint
  compatible), Groq, OpenRouter, Ollama y cualquier servidor compatible.
- "anthropic": /messages y /models con headers propios.

Este módulo es el único punto a tocar para sumar un proveedor nuevo.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from agents.common.app_info import APP_VERSION

TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
ANTHROPIC_VERSION = "2023-06-01"
MAX_OUTPUT_TOKENS = int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "1024"))

OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go/openai/v1"
OPENCODE_GO_MODELS_URL = "https://opencode.ai/inference/go/v1/models"
OPENCODE_GO_ANTHROPIC_URL = "https://opencode.ai/inference/go/anthropic/v1/messages"
OPENCODE_GO_RESPONSES_URL = "https://opencode.ai/inference/go/openai/v1/responses"
OPENCODE_GO_USER_AGENT = f"hextlab-playground/{APP_VERSION}"
# Go sirve cada modelo por una de tres APIs. El catálogo no lo dice, así que la
# asignación sale de la documentación oficial (y de models.dev como respaldo).
OPENCODE_GO_CHAT_MODELS = frozenset(
    {
        "beam-free",
        "deepseek-v4-pro",
        "deepseek-v4.1-flash",
        "glm-5.1",
        "glm-5.2",
        "glm-5.3",
        "glm-5.3-flash",
        "hy3",
        "hy4-preview",
        "iceman-contributor-free",
        "kimi-k2.6",
        "kimi-k2.7-code",
        "kimi-k3",
        "kimi-k3.1-pro",
        "longcat-2.0",
        "longcat-2.5-preview-free",
        "mimo-v2.5",
        "mimo-v2.5-pro",
        "mimo-v2.6-flash",
        "mimo-v2.6-pro",
        "minimax-m3.1-flash",
        "omen-alpha",
        "step-5-preview",
    }
)
OPENCODE_GO_ANTHROPIC_MODELS = frozenset(
    {
        "claude-haiku-5-5",
        "minimax-m2.5",
        "minimax-m2.7",
        "minimax-m3",
        "qwen3.6-plus",
        "qwen3.7-max",
        "qwen3.7-plus",
        "qwen3.8-flash",
        "qwen3.8-max",
    }
)
OPENCODE_GO_RESPONSES_MODELS = frozenset(
    {
        "gpt-5.6-luna",
        "gpt-6-luna",
        "grok-4.6",
        "grok-4.7",
        "muse-spark-1.2-contributor",
        "muse-spark-1.3-contributor",
    }
)
# El catálogo de Go también incluye modelos de la API de Google, que este
# cliente no habla. Los modelos nuevos desconocidos se asumen chat/completions.
OPENCODE_GO_UNSUPPORTED_MODELS = frozenset({"gemini-4-argon"})

# Presets que ve la UI en Ajustes. `suggestedModels` es solo un punto de
# partida: el botón "Cargar modelos" consulta la lista real del proveedor.
PROVIDER_PRESETS: dict[str, dict[str, Any]] = {
    "opencode-go": {
        "label": "OpenCode Go",
        "api": "openai",
        "baseUrl": OPENCODE_GO_BASE_URL,
        "needsKey": True,
        "suggestedModels": [
            "deepseek-v4.1-flash",
            "glm-5.3-flash",
            "kimi-k2.7-code",
            "minimax-m3.1-flash",
            "mimo-v2.6-flash",
        ],
    },
    "openai": {
        "label": "OpenAI",
        "api": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "needsKey": True,
        "suggestedModels": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    },
    "anthropic": {
        "label": "Anthropic",
        "api": "anthropic",
        "baseUrl": "https://api.anthropic.com/v1",
        "needsKey": True,
        "suggestedModels": ["claude-3-5-haiku-latest", "claude-sonnet-4-0"],
    },
    "gemini": {
        "label": "Google Gemini",
        "api": "openai",
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
        "needsKey": True,
        "suggestedModels": ["gemini-2.0-flash", "gemini-2.5-flash"],
    },
    "groq": {
        "label": "Groq",
        "api": "openai",
        "baseUrl": "https://api.groq.com/openai/v1",
        "needsKey": True,
        "suggestedModels": ["llama-3.3-70b-versatile"],
    },
    "openrouter": {
        "label": "OpenRouter",
        "api": "openai",
        "baseUrl": "https://openrouter.ai/api/v1",
        "needsKey": True,
        "suggestedModels": ["openai/gpt-4o-mini"],
    },
    "ollama": {
        "label": "Ollama (local)",
        "api": "openai",
        "baseUrl": "http://localhost:11434/v1",
        "needsKey": False,
        "suggestedModels": ["llama3.2"],
    },
    "custom": {
        "label": "Compatible con OpenAI",
        "api": "openai",
        "baseUrl": "",
        "needsKey": False,
        "suggestedModels": [],
    },
}


class LLMError(RuntimeError):
    """Error legible para mostrar en la Task fallida (nunca incluye la key)."""


def _api_of(provider: dict[str, Any]) -> str:
    return PROVIDER_PRESETS[provider["kind"]]["api"]


def _dialect(provider: dict[str, Any], model: str) -> str:
    if provider.get("kind") == "opencode-go":
        if model in OPENCODE_GO_ANTHROPIC_MODELS:
            return "anthropic"
        if model in OPENCODE_GO_RESPONSES_MODELS:
            return "responses"
    return _api_of(provider)


def _base_url(provider: dict[str, Any]) -> str:
    base = (provider.get("baseUrl") or PROVIDER_PRESETS[provider["kind"]]["baseUrl"]).rstrip("/")
    if not base:
        raise LLMError(f"El proveedor '{provider.get('name')}' no tiene base URL.")
    return base


def _headers(
    provider: dict[str, Any],
    session_id: str | None = None,
    dialect: str | None = None,
) -> dict[str, str]:
    key = provider.get("apiKey") or ""
    headers: dict[str, str] = {}
    if (dialect or _api_of(provider)) == "anthropic":
        headers["x-api-key"] = key
        headers["anthropic-version"] = ANTHROPIC_VERSION
    elif key:
        headers["Authorization"] = f"Bearer {key}"
    if provider.get("kind") == "opencode-go":
        # Go pide identificar el cliente y mandar una sesión estable.
        headers["User-Agent"] = OPENCODE_GO_USER_AGENT
        if session_id:
            headers["x-opencode-session"] = session_id
    return headers


def _raise_for_status(provider: dict[str, Any], response: httpx.Response) -> None:
    if response.status_code < 400:
        return
    detail = response.text[:300]
    try:
        error = response.json().get("error")
        if isinstance(error, dict) and error.get("message"):
            detail = str(error["message"])[:300]
        elif isinstance(error, str):
            detail = error[:300]
    except Exception:
        pass
    raise LLMError(f"{provider.get('name')} respondió HTTP {response.status_code}: {detail}")


def chat_completion(
    provider: dict[str, Any],
    model: str,
    system_prompt: str,
    user_text: str,
    temperature: float | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    base = _base_url(provider)
    dialect = _dialect(provider, model)
    headers = _headers(provider, session_id, dialect)

    try:
        if dialect == "anthropic":
            body: dict[str, Any] = {
                "model": model,
                "max_tokens": MAX_OUTPUT_TOKENS,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_text}],
            }
            if temperature is not None:
                body["temperature"] = temperature
            url = (
                OPENCODE_GO_ANTHROPIC_URL
                if provider.get("kind") == "opencode-go"
                else f"{base}/messages"
            )
            response = httpx.post(url, headers=headers, json=body, timeout=TIMEOUT_SECONDS)
            _raise_for_status(provider, response)
            data = response.json()
            usage = data.get("usage") or {}
            text = "".join(
                block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
            )
            uncached_input = int(usage.get("input_tokens", 0) or 0)
            cache_read = int(usage.get("cache_read_input_tokens", 0) or 0)
            cache_write = int(usage.get("cache_creation_input_tokens", 0) or 0)
            return {
                "text": text,
                "tokensInput": uncached_input + cache_read + cache_write,
                "tokensOutput": int(usage.get("output_tokens", 0) or 0),
                "uncachedInputTokens": uncached_input,
                "cacheReadTokens": cache_read,
                "cacheWriteTokens": cache_write,
                "reasoningTokens": 0,
                "reportedCostUsd": None,
            }

        if dialect == "responses":
            body = {
                "model": model,
                "instructions": system_prompt,
                "input": user_text,
                "max_output_tokens": MAX_OUTPUT_TOKENS,
            }
            if temperature is not None:
                body["temperature"] = temperature
            url = (
                OPENCODE_GO_RESPONSES_URL
                if provider.get("kind") == "opencode-go"
                else f"{base}/responses"
            )
            response = httpx.post(url, headers=headers, json=body, timeout=TIMEOUT_SECONDS)
            _raise_for_status(provider, response)
            data = response.json()
            usage = data.get("usage") or {}
            text = data.get("output_text") or "".join(
                part.get("text", "")
                for item in data.get("output", [])
                if item.get("type") == "message"
                for part in item.get("content", [])
                if part.get("type") == "output_text"
            )
            input_details = usage.get("input_tokens_details") or {}
            output_details = usage.get("output_tokens_details") or {}
            input_total = int(usage.get("input_tokens", 0) or 0)
            cached = int(input_details.get("cached_tokens", 0) or 0)
            return {
                "text": text,
                "tokensInput": input_total,
                "tokensOutput": int(usage.get("output_tokens", 0) or 0),
                "uncachedInputTokens": max(0, input_total - cached),
                "cacheReadTokens": cached,
                "cacheWriteTokens": 0,
                "reasoningTokens": int(
                    output_details.get("reasoning_tokens", 0) or 0
                ),
                "reportedCostUsd": None,
            }

        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text},
            ],
        }
        # Algunos modelos (por ejemplo los de razonamiento) rechazan `temperature`:
        # solo se manda si el nodo la configuró.
        if temperature is not None:
            body["temperature"] = temperature
        response = httpx.post(f"{base}/chat/completions", headers=headers, json=body, timeout=TIMEOUT_SECONDS)
        _raise_for_status(provider, response)
        data = response.json()
        usage = data.get("usage") or {}
        try:
            text = data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(
                f"{provider.get('name')} devolvió una respuesta inesperada."
            ) from exc

        prompt_details = usage.get("prompt_tokens_details") or {}
        completion_details = usage.get("completion_tokens_details") or {}
        input_total = int(usage.get("prompt_tokens", 0) or 0)
        cached = int(prompt_details.get("cached_tokens", 0) or 0)
        cache_write = int(prompt_details.get("cache_write_tokens", 0) or 0)
        reported_cost = None
        if "cost" in usage:
            reported_cost = float(usage.get("cost") or 0.0)
            upstream = float(
                (usage.get("cost_details") or {}).get(
                    "upstream_inference_cost", 0.0
                )
                or 0.0
            )
            reported_cost += upstream

        return {
            "text": text,
            "tokensInput": input_total,
            "tokensOutput": int(usage.get("completion_tokens", 0) or 0),
            "uncachedInputTokens": max(0, input_total - cached - cache_write),
            "cacheReadTokens": cached,
            "cacheWriteTokens": cache_write,
            "reasoningTokens": int(
                completion_details.get("reasoning_tokens", 0) or 0
            ),
            "reportedCostUsd": reported_cost,
        }
    except httpx.HTTPError as exc:
        raise LLMError(f"No pude conectar con {provider.get('name')}: {exc.__class__.__name__}") from exc


def list_models(provider: dict[str, Any]) -> list[str]:
    base = _base_url(provider)
    models_url = (
        OPENCODE_GO_MODELS_URL
        if provider.get("kind") == "opencode-go"
        else f"{base}/models"
    )
    try:
        response = httpx.get(models_url, headers=_headers(provider), timeout=20.0)
    except httpx.HTTPError as exc:
        raise LLMError(f"No pude conectar con {provider.get('name')}: {exc.__class__.__name__}") from exc
    _raise_for_status(provider, response)
    items = response.json().get("data") or []
    ids = {str(item["id"]) for item in items if isinstance(item, dict) and item.get("id")}
    if provider["kind"] == "opencode-go":
        ids -= OPENCODE_GO_UNSUPPORTED_MODELS
    if provider["kind"] == "gemini":
        # El endpoint compatible de Gemini lista "models/gemini-..." pero el chat
        # acepta el nombre corto.
        ids = {model_id.removeprefix("models/") for model_id in ids}
    return sorted(ids)
