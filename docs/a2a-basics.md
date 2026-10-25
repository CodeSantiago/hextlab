# A2A en 10 minutos

Esta guía explica los cuatro conceptos que usa HextLab: **Agent Card**, **Task**, **estados** y **`message/send`**. Todo está verificado contra **A2A v0.3.0**.

Referencias:

- Especificación: <https://a2a-protocol.org/v0.3.0/specification/>
- SDK oficial: <https://github.com/a2aproject/a2a-python>
- Ejemplos: <https://github.com/a2aproject/a2a-samples>

## 1. Agent Card

La Agent Card describe al agente: quién es, en qué URL escucha, qué transporte habla y qué skills ofrece. Es el punto de entrada para el descubrimiento.

En v0.3.0 se publica en:

```
GET /agents/{id}/.well-known/agent-card.json
```

Ejemplo real del escritor (`writer-1`):

```json
{
  "protocolVersion": "0.3.0",
  "name": "Writer Agent",
  "description": "Genera un borrador a partir de un pedido o reescribe uno con observaciones.",
  "url": "http://localhost:8000/agents/writer-1/",
  "preferredTransport": "JSONRPC",
  "version": "0.1.0",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false,
    "stateTransitionHistory": false
  },
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain"],
  "skills": [
    {
      "id": "write",
      "name": "Redactar",
      "description": "Genera un borrador a partir de un pedido o reescribe uno con observaciones.",
      "tags": ["escritura", "borrador"],
      "examples": ["Escribí un texto sobre observabilidad de agentes."]
    }
  ]
}
```

Campos importantes:

- `url`: endpoint JSON-RPC del agente. En este proyecto es `POST /agents/{id}/`.
- `preferredTransport`: `JSONRPC` en ambos roles.
- `capabilities.streaming`: `false`; no hay SSE.
- `version`: versión del producto (`0.1.0`), no del protocolo.
- `protocolVersion`: `0.3.0`.
- `skills`: lo que el agente sabe hacer. El playground muestra `name` e `id`.

## 2. Task

Una **Task** es la unidad de trabajo con estado. El cliente manda un mensaje y el agente responde con una Task.

Ejemplo de respuesta `completed` (modo mock):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "kind": "task",
    "id": "93211392-4b89-432e-bc4b-230253f8c631",
    "contextId": "408986d0-7a39-4223-ae1e-d08df56bd19c",
    "status": {
      "state": "completed",
      "timestamp": "2026-10-24T21:47:52.340Z"
    },
    "artifacts": [
      {
        "artifactId": "75ee109e-a9a2-418a-b2f5-b082defab072",
        "name": "draft",
        "parts": [{ "kind": "text", "text": "[mock e1a6e945] ..." }],
        "metadata": {
          "mode": "mock",
          "estimated": true,
          "provider": "mock",
          "model": "mock",
          "tokensInput": 35,
          "tokensOutput": 107,
          "latencyMs": 0.1,
          "systemPrompt": "Sos un escritor técnico..."
        }
      }
    ]
  }
}
```

- `id`: identificador de la Task; lo genera el servidor.
- `contextId`: agrupa Tasks relacionadas. El loop reutiliza el mismo en todas las iteraciones.
- `status.state`: estado actual.
- `artifacts`: salidas del agente. El texto va en un `text` part y las métricas en `metadata`.
- `kind`: discriminador de v0.3.0. También existe en `Message` (`"message"`) y en cada `Part` (`"text"`, `"data"`, `"file"`). En v1.0 se eliminó.

### Partes de un artifact

El escritor devuelve un `Part` de texto:

```json
{ "kind": "text", "text": "..." }
```

El crítico devuelve dos: un resumen en texto y la revisión estructurada en un `data` part:

```json
{ "kind": "data", "data": { "approved": false, "scores": { "claridad": 3 }, "observations": ["..."], "summary": "..." } }
```

## 3. Estados

Estos son los estados de una Task en v0.3.0:

| Estado | Significado | ¿Terminal? |
| --- | --- | --- |
| `submitted` | La Task fue aceptada. | No |
| `working` | El agente la está procesando. | No |
| `input-required` | El agente necesita más información. | No |
| `completed` | Terminó correctamente. | Sí |
| `failed` | Terminó con error. | Sí |
| `canceled` | Se canceló antes de terminar. | Sí |

La spec también define `rejected` y `auth-required`, pero el playground no los usa.

En este proyecto los servidores son **síncronos**: devuelven `completed` o `failed` en la misma respuesta. La UI pinta `working` mientras la llamada HTTP está en vuelo; ese `working` es una inferencia del cliente, no un estado reportado por el servidor. Para estados intermedios reales harían falta streaming (`message/stream`) o `tasks/get`.

Los colores del canvas salen de `toAgentStatus()` en `playground/src/lib/status.ts` y usan las variables CSS `--status-*`.

## 4. `message/send`

Es el método JSON-RPC para iniciar una interacción. El request tiene esta forma:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "messageId": "msg-1",
      "parts": [{ "kind": "text", "text": "Escribí sobre observabilidad de agentes." }],
      "contextId": "opcional-para-agrupar-tasks"
    }
  }
}
```

Campos del `Message`:

- `role`: `"user"` o `"agent"`.
- `messageId`: lo genera el cliente.
- `parts`: contenido. Acá mandamos texto.
- `contextId` (opcional): reutilizalo para agrupar Tasks.
- `metadata` (opcional): datos extra. El host **ignora** `metadata.systemPrompt`; las instrucciones solo se configuran por la API de gestión.

### Ejemplo con curl

El agente `writer-1` existe después de sincronizar el canvas con el host:

```bash
curl -s http://localhost:8000/agents/writer-1/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "messageId": "msg-1",
        "parts": [
          { "kind": "text", "text": "Escribí sobre observabilidad de agentes." }
        ]
      }
    }
  }'
```

La respuesta es un JSON-RPC con `result` (la Task) o `error`.

> **Windows / PowerShell 5.1**: si el JSON tiene acentos, `-Body` puede enviarlo en una codificación que el server no decodifica como UTF-8 y vas a recibir `-32700 Parse error`. Guardá el body en un archivo UTF-8 y usá `curl.exe -d @body.json`.

### Errores JSON-RPC

Si el método no existe, el server responde:

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "error": { "code": -32601, "message": "Method not found: tasks/get" }
}
```

Códigos que usa el playground:

| Código | Significado |
| --- | --- |
| `-32700` | Parse error (JSON inválido) |
| `-32600` | Invalid Request (sobre JSON-RPC mal formado) |
| `-32601` | Method not found |
| `-32602` | Invalid params (falta `params.message`) |

## 5. Cómo se orquesta el loop

A2A no define un orquestador: define cómo se hablan dos agentes. El loop lo hace el cliente, en `playground/src/lib/runner.ts`:

```
Trigger
  → POST writer  (tema)
  ← Task completed (borrador + tokens + latencia)
  → POST critic  (borrador)
  ← Task completed (review JSON con approved)
      approved = true  → fin
      approved = false → POST writer (borrador anterior + observaciones)
                         ... hasta MAX_ITERATIONS
```

Decisiones del loop:

- Se reutiliza el `contextId` de la primera Task para todas las llamadas del run.
- En cada reintento, el mensaje al escritor incluye el borrador anterior y las observaciones del crítico.
- Al llegar a `MAX_ITERATIONS` sin aprobación, el run termina en `failed`. Las Tasks individuales pueden seguir en `completed`: el estado del run es del orquestador, no de A2A.
- Los agentes no se conocen entre sí. Podrías reemplazar cualquiera por otro agente que cumpla el mismo contrato.
- El run se puede cancelar desde la UI; el cliente aborta las llamadas en curso.

## 6. La API de gestión no es A2A

`/health`, `/agents`, `/providers` y `/presets` existen para que el playground cree agentes y configure proveedores. No forman parte de la especificación A2A y no están pensados para exponerse a Internet: no tienen autenticación.

## 7. Versiones: 0.3.0 vs 1.0

El código está fijado a **v0.3.0** porque usa `message/send` y estados en minúscula. En **v1.0**:

- Los métodos JSON-RPC se renombraron (`SendMessage`, `SendStreamingMessage`, `GetTask`, ...).
- Se eliminó el discriminador `kind` de Task, Message y Part.
- Cambió la serialización de los enums.

Si actualizás a v1.0, hay que tocar `agents/common/a2a.py`, los servidores y `playground/src/lib/a2a.ts`. La lógica de negocio (mock, crítico, loop) queda igual.
