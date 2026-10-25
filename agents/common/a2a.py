"""Utilidades compartidas para hablar A2A v0.3.0 sobre JSON-RPC 2.0.

Decisiones verificadas contra la especificación:
- Agent Card en /.well-known/agent-card.json (v0.3.0, sección 5.3).
- message/send devuelve una Task (v0.3.0, sección 3.1.1).
- Los objetos JSON llevan el discriminador `kind` (Task, Message, Part) y los
  estados se serializan en minúscula: "submitted", "working", "input-required",
  "completed", "failed", "canceled".
  Fuente: https://a2a-protocol.org/v0.3.0/specification/ y a2a-python v0.3.0.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

JSONRPC_VERSION = "2.0"

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603

TASK_STATES = {
    "submitted",
    "working",
    "input-required",
    "completed",
    "failed",
    "canceled",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def estimate_tokens(text: str) -> int:
    """Estimación gruesa para el modo mock (~4 caracteres por token)."""
    return max(1, len(text) // 4)


def text_from_message(message: dict[str, Any]) -> str:
    parts = message.get("parts") or []
    return "\n".join(
        str(part["text"]) for part in parts if isinstance(part, dict) and "text" in part
    )


def text_part(text: str) -> dict[str, Any]:
    return {"kind": "text", "text": text}


def data_part(data: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "data", "data": data}


def build_artifact(
    name: str, parts: list[dict[str, Any]], metadata: dict[str, Any]
) -> dict[str, Any]:
    return {
        "artifactId": str(uuid.uuid4()),
        "name": name,
        "parts": parts,
        "metadata": metadata,
    }


def build_task(
    task_id: str,
    context_id: str,
    state: str,
    artifacts: list[dict[str, Any]],
    *,
    metadata: dict[str, Any] | None = None,
    status_text: str | None = None,
) -> dict[str, Any]:
    if state not in TASK_STATES:
        raise ValueError(f"Estado A2A inválido: {state}")

    status: dict[str, Any] = {"state": state, "timestamp": now_iso()}
    if status_text:
        status["message"] = {
            "kind": "message",
            "role": "agent",
            "messageId": str(uuid.uuid4()),
            "parts": [text_part(status_text)],
        }

    task: dict[str, Any] = {
        "kind": "task",
        "id": task_id,
        "contextId": context_id,
        "status": status,
        "artifacts": artifacts,
    }
    if metadata:
        task["metadata"] = metadata
    return task


def jsonrpc_ok(request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": JSONRPC_VERSION, "id": request_id, "result": result}


def jsonrpc_error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": JSONRPC_VERSION,
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def parse_send_request(
    payload: Any,
) -> tuple[Any, dict[str, Any] | None, dict[str, Any] | None]:
    """Valida el sobre JSON-RPC y devuelve (id, message, error)."""
    if not isinstance(payload, dict) or payload.get("jsonrpc") != JSONRPC_VERSION:
        return None, None, jsonrpc_error(None, INVALID_REQUEST, "Invalid Request")

    request_id = payload.get("id")
    method = payload.get("method")
    if method != "message/send":
        return request_id, None, jsonrpc_error(
            request_id, METHOD_NOT_FOUND, f"Method not found: {method}"
        )

    params = payload.get("params")
    message = params.get("message") if isinstance(params, dict) else None
    if not isinstance(message, dict):
        return request_id, None, jsonrpc_error(
            request_id, INVALID_PARAMS, "params.message is required"
        )

    return request_id, message, None
