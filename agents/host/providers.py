"""Almacén local de proveedores LLM configurados desde Ajustes.

Se guarda en un JSON local (por defecto `.data/providers.json`, ignorado por
git) para no perder las keys al reiniciar el host. No hay base de datos.
Las keys nunca salen completas por la API: solo una versión enmascarada.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from agents.common.llm import PROVIDER_PRESETS

logger = logging.getLogger(__name__)

MOCK_PROVIDER_ID = "mock"
MOCK_PROVIDER = {
    "id": MOCK_PROVIDER_ID,
    "kind": "mock",
    "name": "Mock (sin red)",
    "baseUrl": "",
    "models": ["mock"],
    "hasKey": False,
    "keyPreview": "",
    "builtin": True,
}

REPO_ROOT = Path(__file__).resolve().parents[2]


def data_dir() -> Path:
    return Path(os.getenv("PLAYGROUND_DATA_DIR") or REPO_ROOT / ".data")


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "••••"
    return f"{key[:4]}…{key[-4:]}"


class ProviderStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        return data_dir() / "providers.json"

    def _read(self) -> dict[str, dict[str, Any]]:
        if not self.path.exists():
            return {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("el archivo no contiene un objeto JSON")
            return data
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            logger.warning("No pude leer %s: %s", self.path, exc)
            return {}

    def _write(self, providers: dict[str, dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.path.with_suffix(".json.tmp")
        temp_path.write_text(
            json.dumps(providers, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        os.replace(temp_path, self.path)

    @staticmethod
    def _public(provider: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": provider.get("id", ""),
            "kind": provider.get("kind", ""),
            "name": provider.get("name", ""),
            "baseUrl": provider.get("baseUrl", ""),
            "models": provider.get("models", []),
            "hasKey": bool(provider.get("apiKey")),
            "keyPreview": mask_key(provider.get("apiKey", "")),
            "builtin": False,
        }

    def list_public(self) -> list[dict[str, Any]]:
        with self._lock:
            stored = self._read()
        public: list[dict[str, Any]] = []
        for provider_id, provider in stored.items():
            if not isinstance(provider, dict):
                continue
            provider.setdefault("id", provider_id)
            if not provider.get("kind") or not provider.get("name"):
                continue
            public.append(self._public(provider))
        return [MOCK_PROVIDER, *public]

    def get(self, provider_id: str) -> dict[str, Any] | None:
        """Devuelve el proveedor completo (con key) para uso interno."""
        if provider_id == MOCK_PROVIDER_ID:
            return dict(MOCK_PROVIDER)
        with self._lock:
            return self._read().get(provider_id)

    def upsert(self, provider_id: str, data: dict[str, Any]) -> dict[str, Any]:
        kind = data["kind"]
        if kind not in PROVIDER_PRESETS:
            raise ValueError(f"Tipo de proveedor desconocido: {kind}")

        base_url = (data.get("baseUrl") or PROVIDER_PRESETS[kind]["baseUrl"]).strip()
        if not base_url and kind == "custom":
            raise ValueError("El proveedor compatible requiere una base URL.")
        if base_url:
            parsed = urlparse(base_url)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise ValueError("La base URL debe ser una URL http(s) válida.")

        with self._lock:
            providers = self._read()
            current = providers.get(provider_id, {})
            if not isinstance(current, dict):
                current = {}
            # Una key vacía significa "no cambiar": la UI nunca recibe la key
            # real, así que no puede reenviarla.
            api_key = data.get("apiKey") or current.get("apiKey", "")
            provider = {
                "id": provider_id,
                "kind": kind,
                "name": data["name"],
                "apiKey": api_key,
                "baseUrl": base_url,
                "models": list(
                    dict.fromkeys(
                        model.strip()
                        for model in data.get("models", [])
                        if model.strip()
                    )
                ),
            }
            providers[provider_id] = provider
            self._write(providers)
        return self._public(provider)

    def delete(self, provider_id: str) -> bool:
        with self._lock:
            providers = self._read()
            if provider_id not in providers:
                return False
            del providers[provider_id]
            self._write(providers)
        return True
