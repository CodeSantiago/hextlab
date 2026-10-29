from __future__ import annotations

from agents.common.pricing import estimate_cost, resolve_model


def test_resuelve_variantes_de_modelo():
    assert resolve_model("models/gemini-2.5-flash") is not None
    assert resolve_model("gemini-2.5-flash-001") is not None
    assert resolve_model("google/gemini-2.5-flash") is not None
    assert resolve_model("gemini-2.5-flash-lite") is not None
    assert resolve_model("claude-sonnet-4-20250514") is not None
    assert resolve_model("gpt-4o-mini-2024-07-18") is not None


def test_modelo_desconocido_no_tiene_tarifa():
    assert resolve_model("modelo-inventado") is None
    assert (
        estimate_cost(
            "modelo-inventado",
            uncached_input=1000,
            cache_read=0,
            cache_write=0,
            output=1000,
        )
        is None
    )


def test_costo_gemini_flash_usa_tarifa_oficial():
    cost = estimate_cost(
        "gemini-2.5-flash",
        uncached_input=1_000_000,
        cache_read=0,
        cache_write=0,
        output=1_000_000,
    )

    assert cost == 2.80


def test_costo_anthropic_separa_cache_de_input():
    cost = estimate_cost(
        "claude-3-5-haiku",
        uncached_input=1_000_000,
        cache_read=1_000_000,
        cache_write=0,
        output=0,
    )

    assert cost == 0.88


def test_gpt_4o_mini_no_se_confunde_con_gpt_4o():
    mini = estimate_cost(
        "gpt-4o-mini",
        uncached_input=1_000_000,
        cache_read=0,
        cache_write=0,
        output=0,
    )
    full = estimate_cost(
        "gpt-4o",
        uncached_input=1_000_000,
        cache_read=0,
        cache_write=0,
        output=0,
    )

    assert mini == 0.15
    assert full == 2.50
