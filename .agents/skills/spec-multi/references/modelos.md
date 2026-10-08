# Tabla de modelos recomendados — spec-multi

Catálogo snapshot de la suscripción **OpenCode Go** (2026-10-08; 22 modelos
activos del provider `opencode-go`). Costos en USD por millón de tokens
(`entrada/salida`). `#variante` = esfuerzo de razonamiento; sin variante el
agente usa el valor base del provider.

> **Solo provider `opencode-go`.** Los modelos que no están en este catálogo
> (p. ej. `opencode/claude-sonnet-5-5`, `opencode/nemotron-3.5-lightning-free`)
> **no son accesibles con esta suscripción** y no deben asignarse.

> **Refrescar el catálogo:** ejecutar la herramienta de modelos de OpenCode
> (`tools.opencode.models`) filtrada por `provider: opencode-go` y reescribir
> esta tabla. Los modelos "probado" quedaron verificados en la implementación
> de SPEC 26 de gestion-app; los marcados ⚠️ son heurística de costo/capacidad
> todavía sin probar en este repo.

## Regla por defecto

Si la tarea no encaja en ninguna fila → `opencode-go/gpt-6-luna`
(equilibrado, 0.1/0.5, contexto 272k).

## Los tres niveles

| Nivel | Rango de costo (entrada/salida) | Uso |
| --- | --- | --- |
| **Premium** | ≥ 2 USD | Tareas de riesgo alto (BD/dinero), juicio crítico o cuando el ahorro ya costó más en reintentos |
| **Intermedio** | ~0.3–1.4 USD | Lógica no trivial, BD, UI y refactors; el punto medio entre calidad y gasto |
| **Económico** | ≤ 0.2 USD o gratis | Mecánico, repetitivo, exploración y wiring sencillo |

## Tabla completa

| Tipo de tarea | Premium | Intermedio | Económico | Cuándo elegir cada nivel |
| --- | --- | --- | --- | --- |
| **Orquestador / coordinación** (fase A, delegación, integración) | `opencode-go/glm-5.3` (1.4/4.4) | `opencode-go/glm-5.3-flash` (0.15/0.5) | `opencode-go/gpt-6-luna` (0.1/0.5, probado) | Default: flash o luna. Premium solo si el orquestador además implementará piezas de lógica compleja |
| **BD, migraciones, RPC, seguridad** (riesgo alto) | `opencode-go/qwen3.8-max` (2/6) ⚠️ | `opencode-go/glm-5.3` (1.4/4.4, probado) | `opencode-go/deepseek-v4-pro` #high (0.66/1.98) ⚠️ | Default: glm-5.3 (probado). Premium si hay plpgsql intríncado o fallos repetidos |
| **Exploración / mapeo del códigobase** (leer, resumir, no editar) | `opencode-go/gpt-6-luna` (0.1/0.5) | `opencode-go/step-5-preview-free` (gratis) | `opencode-go/longcat-2.5-preview-free` (gratis) | Exploración rara vez necesita pago; subir a premium solo si exige sintetizar muchas specs/planes largos |
| **Feature general / wiring** (filtros, columnas, rutas) | `opencode-go/qwen3.8-max` (2/6) ⚠️ | `opencode-go/gpt-6-luna` (0.1/0.5, probado) | `opencode-go/claude-haiku-5-5` (0.1/0.5) | Default: luna (probado). Económico si la unidad cruza muchos archivos legacy y conviene consistencia de estilo |
| **UI creativa / interactiva** (formularios reactivos, wizard, estados en vivo) | `opencode-go/kimi-k3` #max (3/15) ⚠️ | `opencode-go/glm-5.3` (1.4/4.4, probado) | `opencode-go/minimax-m3` (0.3/1.2) ⚠️ | Default: glm-5.3 (probado). Premium solo si la creatividad UX se le pide explícitamente al agente |
| **Algoritmos puros / tests unitarios** (helpers sin UI) | `opencode-go/deepseek-v4-pro` #high (0.66/1.98) ⚠️ | `opencode-go/deepseek-v4.1-flash` #high (0.15/0.6) | `opencode-go/qwen3.8-flash` #medium (0.15/0.47) | Default: deepseek-v4.1-flash #high. Premium si los edge cases matemáticos dominan y el flash se atasca |
| **Refactors de mediana envergadura** (renombres cruzados, tipos) | `opencode-go/glm-5.3` (1.4/4.4) ⚠️ | `opencode-go/deepseek-v4-pro` #high (0.66/1.98) ⚠️ | `opencode-go/qwen3.7-plus` #high (0.4/1.6) | Premium solo si el refactor toca ≥ 10 archivos con riesgo de perder esquemas |
| **Fixes mecánicos** (lint, imports, snapshots, tipos triviales) | *(no requiere premium —)* | `opencode-go/qwen3.8-flash` #medium (0.15/0.47) | `opencode-go/muse-spark-1.3-contributor` (0.1/0.2) ⚠️ | Default: qwen3.8-flash #medium. Económico/muse-spark si el fix es trivial; subir si qwen se atasca con el mismo error dos veces |
| **Verificación de criterios con navegador** (spec-verifier, QA visual) | `opencode-go/qwen3.8-max` (2/6) ⚠️ | `opencode-go/gpt-6-luna` (0.1/0.5, probado) | `opencode-go/claude-haiku-5-5` (0.1/0.5) | Default: luna (probado). Premium si la verificación exige juicios matizados de UX |
| **Revisión crítica / juez de criterios duros** | `opencode-go/grok-4.7` #high (2/6) | `opencode-go/glm-5.3` (1.4/4.4) | `opencode-go/gpt-6-luna` (0.1/0.5) | Grok (adversarial) cuando el juez debe atacar; glm-5.3 si debe ser equilibrado; luna para revisiones ligeras |

## Notas de uso

- En la spec generada, anunciar los modelos elegidos con su costo y dejar
  constancia en `## Decisiones` (la tabla completa queda aquí, en la spec solo
  el modelo por fase).
- El mismo modelo no debería cubrir dos fases distintas sin motivo; la
  diversidad reduce el error de auto-corrección (el mismo sesgo revisando lo
  que escribió).
- Los agentes paralelos comparten el build del repo; por eso el límite de
  2–3 simultáneos (los fixes de conflicto cuestan más que ahorrar un modelo).
- **Nunca asignar modelos del provider `opencode`**: no están en la
  suscripción. El equivalente premium más alto disponible es
  `opencode-go/kimi-k3` (3/15).
