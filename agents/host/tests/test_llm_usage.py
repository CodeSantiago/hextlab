from __future__ import annotations

from agents.common import llm


class FakeResponse:
    status_code = 200
    text = ""

    def json(self):
        return {
            "choices": [{"message": {"content": "hola"}}],
            "usage": {
                "prompt_tokens": 120,
                "completion_tokens": 30,
                "prompt_tokens_details": {
                    "cached_tokens": 20,
                    "cache_write_tokens": 10,
                },
                "completion_tokens_details": {"reasoning_tokens": 5},
                "cost": 0.00042,
                "cost_details": {"upstream_inference_cost": 0.00008},
            },
        }


def test_openrouter_usa_costo_facturado_y_desglosa_tokens(monkeypatch):
    monkeypatch.setattr(llm.httpx, "post", lambda *args, **kwargs: FakeResponse())

    result = llm.chat_completion(
        {
            "kind": "openrouter",
            "name": "OpenRouter",
            "baseUrl": "https://openrouter.ai/api/v1",
            "apiKey": "test",
        },
        "openai/gpt-4o-mini",
        "sistema",
        "usuario",
    )

    assert result["tokensInput"] == 120
    assert result["tokensOutput"] == 30
    assert result["uncachedInputTokens"] == 90
    assert result["cacheReadTokens"] == 20
    assert result["cacheWriteTokens"] == 10
    assert result["reasoningTokens"] == 5
    assert result["reportedCostUsd"] == 0.0005
