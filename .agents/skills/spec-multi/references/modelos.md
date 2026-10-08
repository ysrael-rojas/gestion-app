# Tabla de modelos recomendados — spec-multi

Catálogo snapshot de la suscripción OpenCode (2026-10-08; 60 modelos en los
providers `opencode-go` y `opencode`). Costos en USD por millón de tokens
(`entrada/salida`). `#variante` = esfuerzo de razonamiento; sin variante el
agente usa el valor base del provider.

> **Refrescar el catálogo:** ejecutar la herramienta de modelos de OpenCode
> (`tools.opencode.models`) y reescribir esta tabla. Los modelos "probado"
> quedaron verificados en la implementación de SPEC 26 de gestion-app.

## Regla por defecto

Si la tarea no encaja en ninguna fila → `opencode-go/gpt-6-luna`
(equilibrado, 0.1/0.5, contexto 272k).

## Tabla completa

| Tipo de tarea | Mejor | Alternativa | Cuándo elegir la alternativa |
| --- | --- | --- | --- |
| **Orquestador / coordinación** (fase A, delegación, integración) | `opencode-go/glm-5.3-flash` (0.15/0.5) | `opencode-go/gpt-6-luna` (0.1/0.5) | Si el orquestador además implementará piezas de lógica compleja |
| **BD, migraciones, RPC, seguridad** (riesgo alto) | `opencode/claude-sonnet-5-5` (2/10) | `opencode-go/glm-5.3` (1.4/4.4) | Por defecto es glm-5.3 (probado); sonnet solo si hay plpgsql intrincado o fallos repetidos |
| **Exploración / mapeo del códigobase** (leer, resumir, no editar) | `opencode/longcat-2.5-preview-free` (gratis) | `opencode/nemotron-3.5-lightning-free` (gratis) | Si la exploración exige sintetizar muchas specs/planes largos: `gpt-6-luna` |
| **Feature general / wiring** (filtros, columnas, rutas) | `opencode-go/gpt-6-luna` (0.1/0.5, probado) | `opencode-go/claude-haiku-5-5` (0.1/0.5) | Si la unidad cruza muchos archivos legacy y conviene consistencia de estilo |
| **UI creativa / interactiva** (formularios reactivos, wizard, estados en vivo) | `opencode/claude-sonnet-5-5` (2/10) | `opencode-go/glm-5.3` (1.4/4.4, probado) | Por defecto glm-5.3; sonnet cuando la creatividad UX se le pide explícitamente al agente |
| **Algoritmos puros / tests unitarios** (helpers sin UI) | `opencode-go/deepseek-v4.1-flash` #high (0.15/0.6) | `opencode-go/qwen3.8-flash` #medium (0.15/0.47) | Edge cases matemáticos dominan: elegir deepseek #high; si se atasca, escalar a `glm-5.3` |
| **Refactors de mediana envergadura** (renombres cruzados, tipos) | `opencode-go/deepseek-v4-pro` #high (1.74/3.84) | `opencode-go/qwen3.7-plus` #high (0.4/1.6) | Refactor toca ≥ 10 archivos con riesgo de perder esquemas: sonnet-5-5 |
| **Fixes mecánicos** (lint, imports, snapshots, tipos triviales) | `opencode-go/qwen3.8-flash` #medium (0.15/0.47) | `opencode/claude-haiku-5-5` (0.1/0.5) | Por defecto; haiku si qwen se atasca con el mismo error dos veces |
| **Verificación de criterios con navegador** (spec-verifier, QA visual) | `opencode-go/gpt-6-luna` (0.1/0.5, probado) | `opencode/claude-haiku-5-5` (0.1/0.5) | Si la verificación exige juicios matizados de UX: sonnet-5-5 |
| **Revisión crítica / juez de criterios duros** | `opencode/claude-sonnet-5-5` (2/10) | `opencode-go/grok-4.7` #high (2/6) | Grok si el juez debe ser adversarial; sonnet si debe ser equilibrado |

## Notas de uso

- En la spec generada, anunciar los modelos elegidos con su costo y dejar
  constancia en `## Decisiones` (la tabla completa queda aquí, en la spec solo
  el modelo por fase).
- El mismo modelo no debería cubrir dos fases distintas sin motivo; la
  diversidad reduce el error de auto-corrección (el mismo sesgo revisando lo
  que escribió).
- Los agentes paralelos comparten el build del repo; por eso el límite de
  2–3 simultáneos (los fixes de conflicto cuestan más que ahorrar un modelo).
