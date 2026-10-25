from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from agents.host import server
from agents.host.roles import CRITIC_OUTPUT_CONTRACT, DEFAULT_INSTRUCTIONS

client = TestClient(server.app)


@pytest.fixture(autouse=True)
def clean_state(monkeypatch, tmp_path):
    monkeypatch.setenv("PLAYGROUND_DATA_DIR", str(tmp_path))
    server.agents.clear()
    yield
    server.agents.clear()


def create_agent(agent_id: str, role: str, **extra) -> dict:
    body = {"role": role, "name": f"{role} test", **extra}
    response = client.put(f"/agents/{agent_id}", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def send_message(agent_id: str, text: str, metadata: dict | None = None):
    message = {
        "kind": "message",
        "role": "user",
        "messageId": "msg-1",
        "parts": [{"kind": "text", "text": text}],
    }
    if metadata:
        message["metadata"] = metadata
    payload = {"jsonrpc": "2.0", "id": 1, "method": "message/send", "params": {"message": message}}
    return client.post(f"/agents/{agent_id}/", json=payload)


def review_from(response) -> dict:
    artifact = response.json()["result"]["artifacts"][0]
    return next(part["data"] for part in artifact["parts"] if part["kind"] == "data")


# --- A2A ---------------------------------------------------------------------


def test_agent_card_responde_con_url_propia():
    create_agent("w1", "writer", name="Mi escritor")

    response = client.get("/agents/w1/.well-known/agent-card.json")

    assert response.status_code == 200
    card = response.json()
    assert card["name"] == "Mi escritor"
    assert card["protocolVersion"] == "0.3.0"
    assert card["url"] == "http://localhost:8000/agents/w1/"
    assert card["skills"][0]["id"] == "write"


def test_agente_inexistente_devuelve_404():
    assert client.get("/agents/nope/.well-known/agent-card.json").status_code == 404
    assert send_message("nope", "hola").status_code == 404


def test_message_send_devuelve_task_completed():
    create_agent("w1", "writer")

    response = send_message("w1", "Escribí sobre pruebas automatizadas")
    body = response.json()

    assert response.status_code == 200
    assert body["jsonrpc"] == "2.0"
    assert body["id"] == 1
    task = body["result"]
    assert task["kind"] == "task"
    assert task["status"]["state"] == "completed"

    artifact = task["artifacts"][0]
    assert artifact["parts"][0]["kind"] == "text"
    assert artifact["parts"][0]["text"]
    metadata = artifact["metadata"]
    assert metadata["mode"] == "mock"
    assert metadata["estimated"] is True
    assert metadata["tokensInput"] > 0
    assert metadata["tokensOutput"] > 0
    assert metadata["latencyMs"] >= 0


def test_metodo_desconocido_devuelve_error_32601():
    create_agent("w1", "writer")
    payload = {"jsonrpc": "2.0", "id": 7, "method": "tasks/get", "params": {"id": "t"}}

    body = client.post("/agents/w1/", json=payload).json()

    assert body["id"] == 7
    assert body["error"]["code"] == -32601
    assert "tasks/get" in body["error"]["message"]


def test_system_prompt_por_mensaje_se_ignora():
    create_agent("w1", "writer")
    override = "Sé muy breve y usá la palabra listo."

    baseline = send_message("w1", "Tema X").json()["result"]["artifacts"][0]
    with_override = send_message("w1", "Tema X", {"systemPrompt": override}).json()["result"]["artifacts"][0]

    assert with_override["metadata"]["systemPrompt"] == DEFAULT_INSTRUCTIONS["writer"]
    assert with_override["parts"][0]["text"] == baseline["parts"][0]["text"]


def test_instrucciones_del_nodo_cambian_la_salida():
    create_agent("w1", "writer")
    create_agent("w2", "writer", instructions="Sé muy breve.")

    default = send_message("w1", "Tema X").json()["result"]["artifacts"][0]
    brief = send_message("w2", "Tema X").json()["result"]["artifacts"][0]

    assert brief["metadata"]["systemPrompt"] == "Sé muy breve."
    assert len(brief["parts"][0]["text"]) < len(default["parts"][0]["text"])


def test_critico_devuelve_puntajes_y_contrato_json():
    create_agent("c1", "critic")

    response = send_message("c1", "palabra " * 50)
    review = review_from(response)

    assert review["approved"] is False
    assert set(review["scores"]) == {"claridad", "precision", "tono"}
    assert review["observations"]
    system_prompt = response.json()["result"]["artifacts"][0]["metadata"]["systemPrompt"]
    assert system_prompt.endswith(CRITIC_OUTPUT_CONTRACT)


def test_critico_aprueba_texto_corto():
    create_agent("c1", "critic")

    assert review_from(send_message("c1", "Listo: texto corto."))["approved"] is True


def test_proveedor_no_configurado_devuelve_task_failed():
    create_agent("w1", "writer", providerId="openai-x", model="gpt-4o-mini")

    task = send_message("w1", "hola").json()["result"]

    assert task["status"]["state"] == "failed"
    assert "openai-x" in task["status"]["message"]["parts"][0]["text"]


# --- Proveedores -------------------------------------------------------------


def test_proveedores_enmascaran_la_key_y_la_conservan():
    body = {"kind": "openai", "name": "OpenAI", "apiKey": "sk-test-1234567890", "models": ["gpt-4o-mini"]}
    saved = client.put("/providers/openai-1", json=body).json()

    assert saved["hasKey"] is True
    assert "1234567890" not in saved["keyPreview"]
    assert saved["baseUrl"] == "https://api.openai.com/v1"

    # Guardar sin key conserva la anterior.
    client.put("/providers/openai-1", json={**body, "apiKey": ""})
    assert server.providers.get("openai-1")["apiKey"] == "sk-test-1234567890"

    listed = client.get("/providers").json()
    assert [p["id"] for p in listed] == ["mock", "openai-1"]
    assert all("apiKey" not in p for p in listed)


def test_proveedor_de_tipo_desconocido_da_400():
    response = client.put("/providers/x", json={"kind": "nope", "name": "X"})
    assert response.status_code == 400


def test_proveedor_custom_exige_base_url_http():
    response = client.put(
        "/providers/x",
        json={"kind": "custom", "name": "X", "baseUrl": "file:///etc/passwd"},
    )
    assert response.status_code == 400


def test_health_incluye_la_version_del_proyecto():
    body = client.get("/health").json()
    assert body["ok"] is True
    assert body["version"] == "0.1.0"


def test_agent_card_usa_la_version_del_proyecto():
    create_agent("w1", "writer")
    card = client.get("/agents/w1/.well-known/agent-card.json").json()
    assert card["version"] == "0.1.0"
    assert card["protocolVersion"] == "0.3.0"


def test_agente_con_proveedor_real_y_modelo_mock_falla():
    client.put(
        "/providers/openai-1",
        json={
            "kind": "openai",
            "name": "OpenAI",
            "apiKey": "sk-test-1234567890",
            "models": ["gpt-4o-mini"],
        },
    )
    create_agent("w1", "writer", providerId="openai-1", model="mock")

    task = send_message("w1", "hola").json()["result"]

    assert task["status"]["state"] == "failed"
    assert "modelo real" in task["status"]["message"]["parts"][0]["text"]


def test_proveedor_opencode_go_toma_la_base_url_del_preset():
    saved = client.put(
        "/providers/go-1",
        json={
            "kind": "opencode-go",
            "name": "OpenCode Go",
            "apiKey": "oc_sk_test_1234",
            "models": ["deepseek-v4.1-flash"],
        },
    ).json()

    assert saved["baseUrl"] == "https://opencode.ai/inference/go/openai/v1"
    assert saved["kind"] == "opencode-go"
    assert saved["keyPreview"] != "oc_sk_test_1234"


def test_preset_opencode_go_esta_disponible():
    presets = client.get("/presets").json()

    preset = presets["opencode-go"]
    assert preset["label"] == "OpenCode Go"
    assert preset["baseUrl"] == "https://opencode.ai/inference/go/openai/v1"
    assert preset["needsKey"] is True
    assert "deepseek-v4.1-flash" in preset["suggestedModels"]
    assert "api" not in preset


def test_list_models_de_opencode_go_usa_su_endpoint_y_excluye_google(monkeypatch):
    from agents.common import llm

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "data": [
                    {"id": "deepseek-v4.1-flash"},
                    {"id": "glm-5.3-flash"},
                    {"id": "gpt-6-luna"},
                    {"id": "gemini-4-argon"},
                    {"id": "new-model"},
                ]
            }

    called = {}

    def fake_get(url, headers=None, timeout=None):
        called["url"] = url
        return FakeResponse()

    monkeypatch.setattr(llm.httpx, "get", fake_get)
    provider = {
        "kind": "opencode-go",
        "name": "OpenCode Go",
        "baseUrl": llm.OPENCODE_GO_BASE_URL,
        "apiKey": "oc_sk_test",
    }

    models = llm.list_models(provider)

    assert called["url"] == llm.OPENCODE_GO_MODELS_URL
    assert models == [
        "deepseek-v4.1-flash",
        "glm-5.3-flash",
        "gpt-6-luna",
        "new-model",
    ]


def test_headers_de_opencode_go_anthropic_incluyen_user_agent_y_sesion():
    from agents.common import llm

    provider = {
        "kind": "opencode-go",
        "name": "OpenCode Go",
        "baseUrl": llm.OPENCODE_GO_BASE_URL,
        "apiKey": "oc_sk_test",
    }

    headers = llm._headers(provider, "ctx-1", "anthropic")

    assert headers["x-api-key"] == "oc_sk_test"
    assert headers["User-Agent"] == llm.OPENCODE_GO_USER_AGENT
    assert headers["x-opencode-session"] == "ctx-1"
    assert "Authorization" not in headers


def test_chat_completion_de_opencode_go_manda_user_agent_y_sesion(monkeypatch):
    from agents.common import llm

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 2},
            }

    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured.update(url=url, headers=headers, body=json)
        return FakeResponse()

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    provider = {
        "kind": "opencode-go",
        "name": "OpenCode Go",
        "baseUrl": llm.OPENCODE_GO_BASE_URL,
        "apiKey": "oc_sk_test",
    }

    result = llm.chat_completion(
        provider, "deepseek-v4.1-flash", "system", "hola", session_id="ctx-1"
    )

    assert result["text"] == "ok"
    assert captured["url"] == f"{llm.OPENCODE_GO_BASE_URL}/chat/completions"
    assert captured["headers"]["User-Agent"] == llm.OPENCODE_GO_USER_AGENT
    assert captured["headers"]["x-opencode-session"] == "ctx-1"
    assert captured["headers"]["Authorization"] == "Bearer oc_sk_test"


def test_chat_completion_de_opencode_go_rutea_modelos_de_responses(monkeypatch):
    from agents.common import llm

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": "ok"}],
                    }
                ],
                "usage": {"input_tokens": 4, "output_tokens": 2},
            }

    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured.update(url=url, headers=headers, body=json)
        return FakeResponse()

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    provider = {
        "kind": "opencode-go",
        "name": "OpenCode Go",
        "baseUrl": llm.OPENCODE_GO_BASE_URL,
        "apiKey": "oc_sk_test",
    }

    result = llm.chat_completion(provider, "gpt-6-luna", "system", "hola")

    assert result["text"] == "ok"
    assert captured["url"] == llm.OPENCODE_GO_RESPONSES_URL
    assert captured["body"]["instructions"] == "system"
    assert captured["body"]["input"] == "hola"
    assert captured["headers"]["Authorization"] == "Bearer oc_sk_test"


def test_chat_completion_de_opencode_go_rutea_modelos_anthropic(monkeypatch):
    from agents.common import llm

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "content": [{"type": "text", "text": "ok"}],
                "usage": {"input_tokens": 4, "output_tokens": 2},
            }

    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured.update(url=url, headers=headers, body=json)
        return FakeResponse()

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    provider = {
        "kind": "opencode-go",
        "name": "OpenCode Go",
        "baseUrl": llm.OPENCODE_GO_BASE_URL,
        "apiKey": "oc_sk_test",
    }

    result = llm.chat_completion(provider, "claude-haiku-5-5", "system", "hola")

    assert result["text"] == "ok"
    assert captured["url"] == llm.OPENCODE_GO_ANTHROPIC_URL
    assert captured["headers"]["x-api-key"] == "oc_sk_test"
    assert "Authorization" not in captured["headers"]
