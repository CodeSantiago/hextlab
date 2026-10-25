"""Roles de agente disponibles en el playground: escritor y crítico.

Cada rol define su skill (para la Agent Card), sus instrucciones por defecto y
un comportamiento mock determinístico para correr sin API key.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

ROLES = ("writer", "critic")

DEFAULT_INSTRUCTIONS = {
    "writer": (
        "Sos un escritor técnico. Redactá un borrador claro y completo, "
        "con una idea por oración y sin relleno."
    ),
    "critic": (
        "Sos un crítico exigente. Evaluá claridad, precisión y tono del texto, "
        "y señalá observaciones concretas y accionables."
    ),
}

# El crítico siempre agrega este contrato al final de sus instrucciones: el
# cliente necesita un JSON estable para decidir si el loop sigue o corta.
CRITIC_OUTPUT_CONTRACT = (
    "Respondé SOLO con JSON válido con esta forma: "
    '{"approved": bool, "scores": {"claridad": 1-5, "precision": 1-5, "tono": 1-5}, '
    '"observations": ["..."], "summary": "..."}'
)

SKILLS = {
    "writer": {
        "id": "write",
        "name": "Redactar",
        "description": "Genera un borrador a partir de un pedido o reescribe uno con observaciones.",
        "tags": ["escritura", "borrador"],
        "examples": ["Escribí un texto sobre observabilidad de agentes."],
    },
    "critic": {
        "id": "review",
        "name": "Revisar",
        "description": "Evalúa claridad, precisión y tono; devuelve puntajes y observaciones.",
        "tags": ["revisión", "crítica"],
        "examples": ["Revisá este borrador y decime qué mejorar."],
    },
}

OUTPUT_MODES = {
    "writer": ["text/plain"],
    "critic": ["text/plain", "application/json"],
}

# Marcadores que usa el cliente al pedir una reescritura (ver runner.ts).
ORIGINAL_REQUEST_MARKER = "Pedido original:"
FEEDBACK_MARKER = "Observaciones del crítico:"


def system_prompt(role: str, instructions: str) -> str:
    base = instructions.strip() or DEFAULT_INSTRUCTIONS[role]
    if role == "critic":
        return f"{base}\n\n{CRITIC_OUTPUT_CONTRACT}"
    return base


# --- Mock del escritor -------------------------------------------------------

MOCK_OPENINGS = (
    "Para abordar {topic}, conviene empezar por una definición simple y un ejemplo concreto.",
    "La clave de {topic} está en separar el problema en partes que se puedan revisar por separado.",
    "Antes de optimizar {topic}, vale la pena entender qué pasa paso a paso.",
)
MOCK_BODY = (
    "Una primera versión no necesita ser perfecta: necesita ser observable. "
    "Registrar qué entra, qué sale y cuánto tarda permite comparar alternativas con evidencia "
    "en lugar de intuición."
)
MOCK_CLOSING = (
    "Con esa base, cada iteración corrige una cosa a la vez y deja una traza clara "
    "de por qué cambió el resultado."
)
SHORT_MARKERS = ("breve", "corto", "short")


def _original_request(user_text: str) -> str:
    if ORIGINAL_REQUEST_MARKER not in user_text:
        return user_text
    after = user_text.split(ORIGINAL_REQUEST_MARKER, 1)[1]
    return after.strip().split("\n\n", 1)[0]


def mock_write(instructions: str, user_text: str) -> str:
    seed = hashlib.sha256(f"{instructions}\n{user_text}".encode("utf-8")).hexdigest()[:8]
    topic = " ".join(_original_request(user_text).split())[:60] or "el tema"

    # El mock reacciona a las instrucciones y a las observaciones para que el
    # loop sea visible: primero un borrador largo (el crítico lo rechaza) y, al
    # recibir observaciones o instrucciones de brevedad, una versión corta.
    if FEEDBACK_MARKER in user_text or any(m in instructions.lower() for m in SHORT_MARKERS):
        return f"[mock {seed}] Listo: {topic}, en pocas palabras, simple y revisable."

    opening = MOCK_OPENINGS[int(seed, 16) % len(MOCK_OPENINGS)].format(topic=topic)
    return f"[mock {seed}] {opening} {MOCK_BODY} {MOCK_CLOSING}"


# --- Mock del crítico --------------------------------------------------------

MAX_WORDS_FOR_APPROVAL = 40
APPROVAL_KEYWORDS = ("listo", "aprobado", "excelente")


def mock_review(text: str) -> dict[str, Any]:
    word_count = len(text.split())
    lowered = text.lower()
    has_keyword = any(keyword in lowered for keyword in APPROVAL_KEYWORDS)

    # Regla del mock: aprueba textos cortos o con una palabra clave de cierre.
    approved = word_count < MAX_WORDS_FOR_APPROVAL or has_keyword
    scores = {
        "claridad": 5 if word_count < MAX_WORDS_FOR_APPROVAL else 3,
        "precision": 5 if word_count >= 10 else 2,
        "tono": 5 if "!" not in text else 4,
    }

    observations = []
    if word_count >= MAX_WORDS_FOR_APPROVAL:
        observations.append(
            f"El texto tiene {word_count} palabras; probá con menos de {MAX_WORDS_FOR_APPROVAL}."
        )
    if not has_keyword:
        observations.append("Falta una señal explícita de cierre, por ejemplo la palabra 'listo'.")
    if "!" in text:
        observations.append("Cuidado con las exclamaciones: pueden sonar impulsivas.")
    if not observations:
        observations.append("Sin observaciones: el texto cumple las reglas del mock.")

    return {
        "approved": approved,
        "scores": scores,
        "observations": observations,
        "summary": "Aprobado por el mock." if approved else "El mock pide otra iteración.",
    }


# --- Revisión devuelta por un LLM real ---------------------------------------


def parse_review(raw: str) -> dict[str, Any]:
    """Extrae y normaliza el JSON del crítico.

    Los modelos a veces envuelven el JSON en ```json o agregan texto; además
    `approved` puede venir como string. Normalizamos para que el loop no
    interprete mal una respuesta ambigua.
    """
    cleaned = raw.strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("El modelo no devolvió un objeto JSON")

    data = json.loads(cleaned[start : end + 1])
    if not isinstance(data, dict) or "approved" not in data:
        raise ValueError("El JSON del crítico no trae el campo 'approved'")

    approved = data["approved"]
    if isinstance(approved, str):
        approved = approved.strip().lower() in ("true", "sí", "si", "yes")

    scores: dict[str, int] = {}
    for key, value in (data.get("scores") or {}).items():
        try:
            scores[str(key)] = max(1, min(5, int(value)))
        except (TypeError, ValueError):
            continue

    observations = data.get("observations") or []
    if not isinstance(observations, list):
        observations = [str(observations)]

    return {
        "approved": bool(approved),
        "scores": scores,
        "observations": [str(item) for item in observations],
        "summary": str(data.get("summary") or ""),
    }
