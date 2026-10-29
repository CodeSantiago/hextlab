# Changelog

Todos los cambios notables de HextLab. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado es [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Planned

- Migración a **A2A v1.0**.
- Nodo de **agente externo por URL** para probar interoperabilidad.
- **Keychain del SO** para las API keys.
- Dividir `SettingsModal`, `styles.css` y `App.tsx`.
- Tests **E2E** del flujo completo.
- Autenticación, solo si el host se expone.

## [0.2.0] - 2026-10-29

Release con proyectos múltiples, rúbricas, nodos vacíos, reconexión de cables, niveles de procesamiento y costos reales.

### Added

- Sidebar de **Proyectos**: crear con `+`, cambiar, renombrar y eliminar; cada proyecto guarda su canvas y su rúbrica.
- **Rúbricas**: 4 plantillas integradas y editor de rúbricas personalizadas con criterios y pesos; la rúbrica activa se inyecta en los críticos.
- **Nodos vacíos** como marcadores o puentes sin ejecución.
- **Reconexión de cables** arrastrando extremos; borrado con doble clic o `Supr`, con feedback visual.
- **Niveles de procesamiento del loop**: Low, Default, High, Max y Extra max, con explicación cualitativa.
- **Costos**: tarifas oficiales por modelo y costo facturado por OpenRouter; desglose de cache/reasoning en Activity.

### Changed

- Persistencia del workspace en `hextlab:workspace:v1`, con migración desde `hextlab:flow:v1`.
- El crítico usa los criterios de la rúbrica como claves de `scores`.
- Costos con 6 decimales y fuente visible: `facturado`, `oficial`, `local` o `estimado`.
- La versión del producto pasa a `0.2.0` en Agent Card, healthcheck y `User-Agent`.

### Fixed

- El loop aprobado ya no sigue la arista `rehacer` cuando no hay salida normal.
- Textos con mojibake en los mensajes del runner.
- Creación de nodos sin efectos colaterales dentro de updaters de React.

## [0.1.0] - 2026-10-25

Primera versión pública. Playground local para construir y observar flujos A2A v0.3.0.

### Added

- Canvas interactivo con nodos **Trigger**, **Agente Escritor** y **Agente Crítico**, drawer de configuración, plantilla base y vaciado.
- **Agent Host dinámico A2A v0.3.0** con Agent Cards por agente y endpoint JSON-RPC `message/send`.
- Loop de escritura/revisión orquestado por el cliente, con `contextId` compartido y arista `rehacer`.
- Modo **Mock determinístico** para correr el flujo completo sin API key.
- Proveedores **OpenCode Go, OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, Ollama y Custom**, con selector de modelo por nodo.
- **OpenCode Go** con carga automática del catálogo y ruteo a `chat/completions`, `/responses` y `/messages`.
- Panel **Activity** con trazas por paso, request/response JSON-RPC, puntajes del crítico, tokens, latencia, costo y pestaña **Compare**.
- Tarjeta de **Resultado final** con estado, métricas y botón de copiar.
- **Cancelación de runs** con `AbortController`.
- Persistencia local del grafo y pricing en `localStorage`.
- Tests de backend y frontend, ESLint, Prettier y CI de GitHub Actions.
- Scripts `run-all.sh` y `run-all.ps1`.
- Documentación: `README.md`, `PROJECT.md` y `docs/a2a-basics.md`.

### Changed

- La app abre directamente en el canvas: se eliminó la landing y el gate de perfil demo.
- Las versiones del producto y del protocolo se centralizaron en `agents/common/app_info.py`.
- CORS, timeout de LLM y límite de salida son configurables por entorno.
- Las claves de storage pasaron a `hextlab:flow:v1` y `hextlab:pricing:v1`, con migración desde `a2a-pg:*`.
- La Agent Card declara `version: 0.1.0` y `protocolVersion: 0.3.0`.
- El panel Activity pasó a 360 px y usa variables CSS para los estados.

### Fixed

- Los requests de OpenCode Go a `/messages` ahora incluyen `User-Agent` y `x-opencode-session`.
- La escritura de `providers.json` es atómica y valida base URLs `http(s)`.
- Un nodo con proveedor real y modelo `mock` falla con un mensaje claro.
- El guard de pasos ya no falla en flujos lineales largos.
- Los fetches tienen timeout y los runs se pueden cancelar.
- Las acciones de agregar/quitar modelos manejan errores del host.

### Security

- Las API keys nunca se devuelven completas; solo `hasKey` y `keyPreview`.
- `.data/`, `.env`, `node_modules` y `dist` están ignorados por git.
- CORS usa orígenes explícitos, no `*`.
- El host bindea `127.0.0.1` por defecto.

### Removed

- Landing/onboarding y perfil demo.
- Dependencia y subsets de la fuente Inter sin uso.
- Documentación obsoleta sobre `ALLOW_PROMPT_OVERRIDE`.
