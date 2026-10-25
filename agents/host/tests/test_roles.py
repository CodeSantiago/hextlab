from __future__ import annotations

import pytest

from agents.host.roles import mock_write, parse_review


def test_parse_review_normaliza_json_envuelto():
    raw = '```json\n{"approved": "false", "scores": {"claridad": 9}, "observations": "corto"}\n```'

    review = parse_review(raw)

    assert review["approved"] is False
    assert review["scores"] == {"claridad": 5}
    assert review["observations"] == ["corto"]


def test_parse_review_sin_approved_falla():
    with pytest.raises(ValueError):
        parse_review('{"scores": {}}')


def test_mock_writer_acorta_al_recibir_observaciones():
    first = mock_write("", "Tema X")
    rewrite = mock_write(
        "",
        "Pedido original:\nTema X\n\nBorrador anterior:\n...\n\nObservaciones del crítico:\n- más corto",
    )

    assert "Listo" in rewrite
    assert "Tema X" in rewrite
    assert len(rewrite) < len(first)
