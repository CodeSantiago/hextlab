"""Tarifas oficiales por modelo para estimar el costo de cada Task.

Los precios se expresan en USD por 1M de tokens y son una referencia oficial
del proveedor. Si el proveedor informa el costo real por request (OpenRouter),
ese valor tiene prioridad y este catálogo no se usa.

Para agregar o actualizar un modelo, editá `MODEL_PRICES`. El cliente aplica
la tarifa manual de Settings solo cuando el modelo no aparece acá.
"""

from __future__ import annotations

MODEL_PRICES: dict[str, dict[str, float]] = {
    "gemini-2.5-flash": {"input": 0.30, "output": 2.50, "cacheRead": 0.03},
    "gemini-2.5-flash-lite": {"input": 0.10, "output": 0.40, "cacheRead": 0.01},
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00, "cacheRead": 0.125},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40, "cacheRead": 0.025},
    "gpt-4o": {"input": 2.50, "output": 10.00, "cacheRead": 1.25},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60, "cacheRead": 0.075},
    "gpt-4.1": {"input": 2.00, "output": 8.00, "cacheRead": 0.50},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60, "cacheRead": 0.10},
    "claude-3-5-haiku": {
        "input": 0.80,
        "output": 4.00,
        "cacheRead": 0.08,
        "cacheWrite": 1.00,
    },
    "claude-sonnet-4": {
        "input": 3.00,
        "output": 15.00,
        "cacheRead": 0.30,
        "cacheWrite": 3.75,
    },
    "llama-3.3-70b-versatile": {"input": 0.59, "output": 0.79},
}


def _normalize(model: str) -> str:
    return (model or "").strip().lower().removeprefix("models/")


def resolve_model(model: str) -> dict[str, float] | None:
    key = _normalize(model)
    if not key:
        return None
    if key in MODEL_PRICES:
        return MODEL_PRICES[key]
    if "/" in key:
        key = key.rsplit("/", 1)[-1]
        if key in MODEL_PRICES:
            return MODEL_PRICES[key]
    candidates = [
        name
        for name in MODEL_PRICES
        if key.startswith(name + "-") or key.startswith(name + ":")
    ]
    if candidates:
        return MODEL_PRICES[max(candidates, key=len)]
    return None


def estimate_cost(
    model: str,
    *,
    uncached_input: int,
    cache_read: int,
    cache_write: int,
    output: int,
) -> float | None:
    rates = resolve_model(model)
    if rates is None:
        return None

    total = (
        max(0, uncached_input) / 1_000_000 * rates["input"]
        + max(0, cache_read) / 1_000_000 * rates.get("cacheRead", rates["input"])
        + max(0, cache_write)
        / 1_000_000
        * rates.get("cacheWrite", rates["input"])
        + max(0, output) / 1_000_000 * rates["output"]
    )
    return round(total, 8)
