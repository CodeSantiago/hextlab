# HextLab · A2A Agent Studio

[![CI](https://github.com/CodeSantiago/hextlab/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeSantiago/hextlab/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.2.0-67b899)](https://github.com/CodeSantiago/hextlab/releases)
[![License](https://img.shields.io/badge/license-MIT-67b899)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-e5c07b)](#estado-actual)

HextLab es un **playground local y open source** para construir flujos de agentes **A2A (Agent2Agent) v0.3.0**: creás nodos en un canvas, les asignás instrucciones y un modelo LLM, disparás el loop y ves cada mensaje JSON-RPC, tokens, latencia y costo.

El objetivo es aprender y experimentar con A2A sin caja negra. No es una suite de conformidad ni una plataforma de producción.

**Repositorio:** <https://github.com/CodeSantiago/hextlab>

```
Trigger manual → Writer Agent ↔ Critic Agent
                        rehacer
```

## Estado actual

| | |
| --- | --- |
| Repositorio | [CodeSantiago/hextlab](https://github.com/CodeSantiago/hextlab) |
| Versión | **0.2.0** (alpha, local-first) |
| Protocolo | **A2A v0.3.0** (legacy; v1.0 está en el roadmap) |
| Backend | Python 3.11+ · FastAPI · httpx |
| Frontend | React 19 · TypeScript 5.9 · Vite 7 · `@xyflow/react` |
| Tests | 33 backend (`pytest`) + 5 frontend (`vitest`) |
| Licencia | MIT |

## Qué incluye

- **Proyectos**: sidebar con múltiples flujos independientes. El **+** crea un proyecto nuevo, doble clic (o el lápiz) lo renombra y la **×** lo elimina; cada proyecto conserva su canvas y su rúbrica.
- **Rúbricas**: biblioteca con 4 plantillas listas para copiar y rúbricas personalizadas con criterios y pesos. La rúbrica activa del proyecto se inyecta en el system prompt de los agentes críticos al correr.
- **Canvas interactivo** con nodos **Trigger**, **Agente Escritor**, **Agente Crítico** y **nodos vacíos**. Podés crear, conectar, reconectar cables (arrastrando un extremo), borrarlos y restaurar la plantilla base.
- **Agent Host dinámico A2A v0.3.0** (`agents/host/server.py`, puerto 8000): cada nodo agente se registra como un agente A2A independiente con su Agent Card y su endpoint JSON-RPC.
- **Configuración por nodo**: nombre, instrucciones (system prompt), proveedor, modelo y temperatura. El selector de modelo agrupa los modelos de todos los proveedores configurados.
- **Proveedores y API keys** desde **Settings → Providers**: OpenCode Go, OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, Ollama y cualquier endpoint compatible con OpenAI. El proveedor **Mock (sin red)** viene integrado y es el default.
- **OpenCode Go**: alta con `oc_sk_...`; al guardar se consulta el catálogo real y se cargan los modelos soportados. Se rutean las APIs `chat/completions`, `/responses` y `/messages` según el modelo.
- **Panel Activity**: trazas por paso con request/response JSON-RPC, prompt, output, puntajes del crítico, tokens, latencia y costo; pestaña **Compare** entre corridas; tarjeta de **Resultado final** con botón de copiar.
- **Costos**: OpenRouter devuelve el costo facturado por request; Gemini, GPT, Claude y Llama usan tarifas oficiales por modelo; el resto usa la tarifa manual de Settings. Los tokens reales los informa cada proveedor y en Mock se estiman.
- **Cancelación de runs**: mientras corre, el botón **Run** se convierte en **Cancelar**.
- **Modo Mock determinístico** para probar el loop completo sin API key.

## Cómo funciona A2A acá

A2A es el protocolo Agent2Agent creado por Google y hoy gobernado por la Agentic AI Foundation (Linux Foundation). En HextLab:

- El **cliente** (el navegador) actúa como orquestador y llama a cada agente con `message/send`.
- Los agentes **no se hablan directamente entre sí**; son independientes y opacos.
- Cada agente publica su **Agent Card** en `/.well-known/agent-card.json` y acepta **JSON-RPC 2.0**.
- El loop reutiliza el `contextId` y sigue la arista `rehacer` hasta aprobación o agotar el nivel de procesamiento configurado (Low, Default, High, Max, Extra max).

Las llamadas a OpenCode Go/OpenAI/etc. son **internas de cada agente**; no forman parte de A2A.

## Limitaciones conocidas

- **A2A v0.3.0**, no v1.0. v1.0 renombró métodos y eliminó el discriminador `kind`.
- No implementa **streaming**, `tasks/get`, `tasks/cancel`, push notifications ni autenticación.
- No testea **agentes externos**: solo aloja y llama a los agentes creados en el canvas.
- El host es **local-only** y los agentes viven en memoria (se re-sincronizan desde el grafo).
- Las API keys se guardan en **texto plano** en `.data/providers.json` (ignorado por git).
- No hay autenticación en la API de gestión; **no exponer el host a Internet**.

## Requisitos

- Python 3.11+
- Node.js 20.19+ (probado con Node 24)
- Opcional: [uv](https://docs.astral.sh/uv/) para instalar dependencias Python.

## Puesta en marcha

### 1. Clonar y entrar al proyecto

```bash
git clone https://github.com/CodeSantiago/hextlab.git
cd hextlab
```

### 2. Dependencias

Con `uv`:

```bash
uv venv
uv pip install -r requirements.txt
cd playground && npm install && cd ..
```

Con `venv` estándar:

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cd playground && npm install && cd ..
```

### 3. Levantar todo

```bash
bash run-all.sh
```

En Windows PowerShell:

```powershell
./run-all.ps1
```

O en dos terminales:

```bash
.venv\Scripts\python.exe -m uvicorn agents.host.server:app --reload --reload-dir agents --port 8000
cd playground && npm run dev
```

Abrí **http://localhost:5173**. El Agent Host escucha en **http://localhost:8000**.

## Uso

1. **Probar el loop en Mock**: hacé clic en **▶ Run**. En la iteración 1 el escritor mock redacta un borrador largo y el crítico pide rehacerlo; en la iteración 2 el escritor incorpora las observaciones y el crítico lo aprueba.
2. **Editar nodos**: hacé clic en un nodo para abrir el drawer. Ahí cambiás nombre, instrucciones, proveedor, modelo y temperatura. El link **Agent Card ↗** abre el JSON publicado.
3. **Configurar una API key**:
   - Abrí **Settings → Providers**.
   - Para OpenCode Go, usá la tarjeta **OpenCode Go → Conectar**, pegá la key `oc_sk_...` y guardá. El host carga los modelos automáticamente.
   - Para otros proveedores, elegí el tipo, completá la key y la base URL si corresponde, y guardá. **Sincronizar** consulta `/models`.
4. **Elegir modelo por nodo**: en el drawer, **Modelo** lista los modelos agrupados por proveedor. Al elegir uno se actualiza también el proveedor del nodo.
5. **Inspeccionar**: **Activity** abre el panel de trazas. La tarjeta **Resultado final** muestra el borrador aprobado (o el parcial si falló) con botón **Copiar**.

## Configuración

El backend lee estas variables de entorno (podés copiar `.env.example`):

| Variable | Default | Uso |
| --- | --- | --- |
| `HOST_PORT` | `8000` | Puerto del Agent Host. |
| `HOST_PUBLIC_URL` | `http://localhost:$HOST_PORT` | URL con la que se publican las Agent Cards. |
| `ALLOWED_ORIGINS` | `localhost/127.0.0.1:5173` y `:4173` | Orígenes CORS separados por coma. |
| `PLAYGROUND_DATA_DIR` | `<repo>/.data` | Carpeta de `providers.json`. |
| `LLM_TIMEOUT_SECONDS` | `60` | Timeout de cada llamada a un proveedor. |
| `LLM_MAX_OUTPUT_TOKENS` | `1024` | Límite de salida para Anthropic y Responses. |

El frontend lee `VITE_HOST_URL` al iniciar Vite (podés copiar `playground/.env.example`):

```bash
VITE_HOST_URL=http://localhost:8000
```

Si cambiás el puerto del host, actualizá `HOST_PORT`, `HOST_PUBLIC_URL` y `VITE_HOST_URL` juntos.

## Endpoints

**A2A por agente**

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/agents/{id}/.well-known/agent-card.json` | Agent Card. |
| `POST` | `/agents/{id}/` | JSON-RPC 2.0 `message/send`. |

**API de gestión (no A2A)**

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/health` | Estado y versión del host. |
| `GET/PUT/DELETE` | `/agents[/{id}]` | Alta, listado y baja de agentes. |
| `GET` | `/presets` | Presets de proveedores. |
| `GET/PUT/DELETE` | `/providers[/{id}]` | Alta, edición y baja de proveedores. |
| `POST` | `/providers/{id}/models` | Consulta `/models` del proveedor. |

## Estructura

```
playground/            React + TypeScript + Vite + @xyflow/react
agents/
  common/              JSON-RPC, Task/Artifact/Part, cliente LLM
  host/                FastAPI: Agent Cards, message/send, providers, roles mock
docs/                  Guía conceptual de A2A
.github/workflows/     CI (pytest, lint, vitest, build)
```

## Tests y calidad

```bash
pytest -q

cd playground
npm run lint
npm test
npm run build
npm run format:check
```

El CI de GitHub Actions corre esos comandos en cada push y PR.

## Seguridad

- **No expongas el Agent Host a Internet**: la API de gestión no tiene autenticación y permite configurar proveedores y `baseUrl` arbitrarios.
- Las API keys quedan en texto plano en `.data/providers.json`. Está ignorado por git, pero si compartís la carpeta o la sincronizás a la nube, rotá las keys.
- El host bindea `127.0.0.1` por defecto. Si lo cambiás, revisá `ALLOWED_ORIGINS` y `HOST_PUBLIC_URL`.
- No commitees `.env` ni `playground/.env`; usá los `.env.example`.

## Roadmap

- [ ] Migrar a **A2A v1.0**.
- [ ] Nodo de **agente externo por URL** para probar interoperabilidad.
- [ ] **Keychain del SO** para las API keys.
- [ ] Dividir `SettingsModal`, `styles.css` y `App.tsx`.
- [ ] Tests **E2E** del flujo completo.
- [ ] Autenticación, solo si el host se expone.
- [ ] Capturas/GIF de demo en el README.

## Changelog

El historial completo está en [`CHANGELOG.md`](CHANGELOG.md). Resumen:

- **0.2.0** (2026-10-29): proyectos múltiples, rúbricas con plantillas y personalizadas, nodos vacíos, reconexión de cables, niveles de procesamiento del loop y costos reales por modelo/proveedor.
- **0.1.0** (2026-10-25): primera versión pública. Canvas A2A, Agent Host dinámico, Mock, OpenCode Go y proveedores, panel Activity, cancelación de runs, tests, lint y CI.

## Contribuir

1. Abrí un [issue](https://github.com/CodeSantiago/hextlab/issues) describiendo el cambio o bug.
2. Hacé un fork y una rama corta.
3. Corré `pytest`, `npm run lint`, `npm test` y `npm run build`.
4. Abrí el PR con el contexto y los comandos de verificación.

Las decisiones de protocolo y UI están documentadas en [`PROJECT.md`](PROJECT.md). La guía conceptual está en [`docs/a2a-basics.md`](docs/a2a-basics.md).

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
