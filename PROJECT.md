# HextLab · Orquestación visual de agentes A2A (v0.2.0)

Repositorio: <https://github.com/CodeSantiago/hextlab>

Un playground local para crear nodos de agentes que se comunican con **A2A v0.3.0**, asignarles instrucciones y un modelo LLM por nodo, dispararlos desde un trigger y observar cada paso: prompts, respuestas, JSON-RPC, tokens, latencia, costo y estados.

## Objetivos

- Entender A2A en la práctica: Agent Card, Task, `message/send`, artifacts y estados.
- Armar y editar el flujo visualmente: crear nodos (**Trigger**, **Escritor**, **Crítico**), conectarlos y configurar cada uno.
- Administrar proveedores y API keys desde **Settings** (`General`, `Servers`, `Providers`, `Models`), con **Mock (sin red)** como default.
- Observar cada paso sin caja negra en el panel **Activity**.

---

## Arquitectura vigente (no revertir)

### 1. Backend: Agent Host dinámico (`agents/`)

- **`agents/host/server.py`** (puerto `8000`): un único FastAPI que aloja dinámicamente los agentes creados desde el canvas.
  - `GET /agents/{id}/.well-known/agent-card.json` → Agent Card A2A v0.3.0 con `url: http://localhost:8000/agents/{id}/`.
  - `POST /agents/{id}/` → JSON-RPC 2.0 para `message/send`; devuelve una `Task`.
  - API de gestión local (no A2A): `GET /health`, `GET/PUT/DELETE /agents`, `GET /presets`, `GET/PUT/DELETE /providers`, `POST /providers/{id}/models`.
  - CORS configurable con `ALLOWED_ORIGINS`.
- **`agents/common/app_info.py`**: versión del producto (`0.2.0`) y del protocolo (`0.3.0`). Es la fuente única para la Agent Card, el healthcheck y el `User-Agent` de OpenCode Go.
- **`agents/host/roles.py`**: roles `writer` y `critic`, skills para la Agent Card, contrato JSON del crítico (`approved`, `scores`, `observations`, `summary`), generadores mock y parser de revisiones.
- **`agents/host/providers.py`**: almacén local en `.data/providers.json` (ignorado por git). Las keys nunca se devuelven completas: solo `hasKey` y `keyPreview`. Escritura atómica y validación de base URL.
- **`agents/common/llm.py`**: adaptador multi-proveedor. Dialectos: OpenAI-compatible (`/chat/completions`), Anthropic (`/messages`) y OpenAI Responses (`/responses`, usado por OpenCode Go).
- **`agents/common/a2a.py`**: constructores y validadores de JSON-RPC 2.0, `Task`, `Artifact`, `Part` y estados A2A v0.3.0.

### 2. Frontend: canvas y UI (`playground/`)

Stack: Vite + React + TypeScript + `@xyflow/react`. Tipografías locales Manrope y JetBrains Mono.

#### Reglas de diseño e interfaz (obligatorias)

1. **Estética OpenCode Desktop**:
   - Paleta oscura cálida y mate (`--bg-base: #11100f`, `--bg-surface: #181715`, `--bg-elevated: #201f1d`).
   - **Sin bordes tipo "card" ni contenedores encajonados** alrededor del canvas. Usar superficies planas y divisores sutiles.
2. **Acceso directo al canvas**:
   - No hay landing, onboarding ni pantalla de registro: la app abre directamente en el workspace funcional.
   - No agregar gates de perfil ni estados de sesión simulados.
3. **Canvas principal (ocupa el resto del ancho tras la sidebar de proyectos)**:
   - Barra superior de `46px` con la marca HextLab, el proyecto activo y accesos a `Settings`, `Activity` y `▶ Run` (o `■ Cancelar` mientras corre).
   - Barra flotante superior izquierda: **`+ Crear nodo`**, **`Plantilla base`** y **`Vaciar`**.
4. **Drawer flotante de nodo (`NodeInspector.tsx`)**:
   - Se abre al hacer clic en un nodo y se cierra con `✕`, `Esc` o clic en el fondo.
   - **Trigger**: nombre e input inicial.
   - **Agente**: nombre, proveedor, modelo, temperatura, instrucciones y link a la Agent Card.
   - El selector de **Modelo** agrupa los modelos de todos los proveedores reales; elegir uno cambia también el proveedor del nodo.
5. **Settings (`SettingsModal.tsx`)**:
   - `General`: nivel de procesamiento del loop (Low, Default, High, Max, Extra max) con explicación cualitativa, switches (auto-expandir última traza, comparación) y precios por 1K tokens (referencia Google Gemini 2.5 Flash; en Mock los tokens se estiman).
   - `Servers`: estado del Agent Host y Agent Cards publicadas.
   - `Providers`: alta, edición, sincronización y baja de proveedores; tarjeta de acceso rápido a OpenCode Go; Mock integrado.
   - `Models`: modelos habilitados por proveedor y consulta de `/models`.
6. **Panel `Activity` (`TracePanel.tsx`)**:
   - Ancho fijo de `360px`, plegable desde el topbar o con `✕`.
   - Pestaña **Trace** con cada paso (tokens, latencia, costo, modelo, puntajes, output, request/response JSON-RPC).
   - Pestaña **Compare** entre la corrida anterior y la actual.
   - Tarjeta **Resultado final** arriba del trace, con estado, iteraciones, tokens, costo y botón **Copiar**.
7. **Proyectos y rúbricas (`ProjectsSidebar.tsx`, `RubricsModal.tsx`)**:
   - Sidebar izquierda con proyectos independientes: el **+** crea uno vacío, doble clic o lápiz renombra, **×** elimina (con confirmación).
   - Cada proyecto guarda su propio grafo y su `rubricId`; cambiar de proyecto resetea trazas y estados.
   - El modal de rúbricas ofrece plantillas integradas y rúbricas personalizadas con criterios y pesos editables.
   - La rúbrica activa se agrega al system prompt de los nodos `critic` al correr (`applyRubricToNodes`) y el contrato del crítico usa sus criterios como claves de `scores`.

### 3. OpenCode Go

- Preset con base URL `https://opencode.ai/inference/go/openai/v1`.
- Al guardar, el host consulta `https://opencode.ai/inference/go/v1/models` y carga el catálogo.
- Ruteo por modelo:
  - `chat/completions`: DeepSeek, GLM, Kimi, MiMo, MiniMax Flash, Hy, LongCat, etc.
  - `/responses`: GPT Luna, Grok, Muse Spark.
  - `/messages`: Claude Haiku, Qwen, MiniMax M3/M2.x.
  - Gemini queda fuera porque usa la API de Google.
- Los modelos nuevos desconocidos se asumen `chat/completions`.
- Cada request envía `User-Agent: hextlab-playground/0.2.0` y `x-opencode-session` con el `contextId` de la Task.

### 4. Persistencia

- `localStorage`: workspace (`hextlab:workspace:v1`) con proyectos, proyecto activo y rúbricas personalizadas; pricing (`hextlab:pricing:v1`). Las claves viejas `hextlab:flow:v1` y `a2a-pg:*` se migran al leer como "Mi primer proyecto".
- `.data/providers.json`: proveedores y keys. Ignorado por git.
- Los agentes viven en memoria del host y se re-sincronizan desde el grafo al iniciar o editar.

### 5. Costos y tokens

- Los tokens reales salen del `usage` de cada proveedor: OpenAI/Gemini `prompt_tokens`/`completion_tokens`, Anthropic `input_tokens`/`output_tokens`, Responses `input_tokens`/`output_tokens`. Además se capturan cache read/write y reasoning cuando existen.
- OpenRouter devuelve `usage.cost` (más `upstream_inference_cost` en BYOK): se usa como costo **facturado**.
- `agents/common/pricing.py` mantiene tarifas oficiales por modelo: Gemini 2.5 Flash/Lite/Pro, Gemini 2.0 Flash, GPT-4o/4o-mini, GPT-4.1/4.1-mini, Claude 3.5 Haiku, Claude Sonnet 4 y Llama 3.3 70B.
- Los modelos desconocidos y Mock caen a la tarifa manual de Settings.
- Activity muestra la fuente por paso: `facturado`, `oficial`, `local` o `estimado`.

---

## Decisiones técnicas de A2A

- **A2A v0.3.0 fijado**: `message/send`, estados en minúscula y discriminador `kind` (`task`, `message`, `text`, `data`, `file`). Fuente: <https://a2a-protocol.org/v0.3.0/specification/>.
- **El cliente orquesta el loop**: los agentes no se conocen entre sí. `playground/src/lib/runner.ts` recorre las conexiones desde el Trigger, reutiliza el `contextId` y sigue la arista `rehacer` (`loop-out` → `loop-in`) hasta aprobación o agotar el nivel de procesamiento configurado.
- **Las instrucciones viven en el host**, no en el mensaje: `metadata.systemPrompt` se ignora siempre por seguridad. No existe override por mensaje.
- **El cliente puede cancelar un run**: se aborta el `AbortController` y se cortan las llamadas en curso.
- **La Agent Card usa `version: 0.2.0`** (versión del producto) y `protocolVersion: 0.3.0`.

## Configuración

| Variable | Default | Uso |
| --- | --- | --- |
| `HOST_PORT` | `8000` | Puerto del host. |
| `HOST_PUBLIC_URL` | `http://localhost:$HOST_PORT` | URL publicada en las Agent Cards. |
| `ALLOWED_ORIGINS` | `localhost/127.0.0.1:5173` y `:4173` | CORS. |
| `PLAYGROUND_DATA_DIR` | `<repo>/.data` | Datos locales. |
| `LLM_TIMEOUT_SECONDS` | `60` | Timeout de proveedores. |
| `LLM_MAX_OUTPUT_TOKENS` | `1024` | Límite de salida. |
| `VITE_HOST_URL` | `http://localhost:8000` | URL del host para el frontend (build-time). |

## Pendientes

- [ ] **Dividir componentes grandes**: `SettingsModal.tsx` (≈935 líneas), `styles.css` (≈1384) y `App.tsx` (≈478) funcionan, pero conviene separarlos en hooks y subcomponentes.
- [ ] **Keychain del SO** para las API keys en lugar de texto plano en `.data/providers.json`.
- [ ] **Autenticación** solo si el host se va a exponer fuera de localhost.
- [ ] **Tests E2E** del flujo completo (hoy hay tests unitarios de backend y de helpers del frontend).

## Verificación

- Backend: `pytest -q` (25 tests).
- Frontend: `npm run lint`, `npm test`, `npm run build`.
- CI: `.github/workflows/ci.yml`.
