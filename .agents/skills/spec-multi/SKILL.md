---
name: spec-multi
description: "Trigger: /spec-multi, spec multiagente, spec paralelizable. Diseña specs ejecutables por varios agentes en paralelo: fases A/B..N/Z, matriz de traslape cero de archivos y asignación de modelo mejor + alternativa por tarea."
license: UNLICENSED
metadata:
  author: gestion-app
  version: "1.0.0"
---

# Skill: spec-multi — specs orquestables por múltiples agentes

Capa sobre el `/spec` oficial del repo (`.agents/skills/spec/`): nada de lo
que este skill no redefina explícitamente es de mi autoría — se ejecuta la
versión vigente del `/spec` base.

## Activation Contract

Cargar cuando el usuario pida una spec "multiagente" / "paralelizable" o use
`/spec-multi`. NO usar para specs pequeñas o de un solo hilo: ese es el caso
de `/spec` (este skill se autocancela y le cede el trabajo).

## Hard Rules

1. **Antes de todo:** cargar el skill base con la herramienta `skill`
   (`id: spec`). Lo que este skill no redefina, lo rige el `/spec` base.
2. Español en comunicación, spec y prompts de subagentes; inglés en código,
   según AGENTS.md.
3. **Traslape cero:** un archivo solo puede aparecer en una unidad; si dos
   unidades necesitan el mismo archivo → fusionarlas o mover ese archivo a la
   fase prerrequisito.
4. Cada unidad con criterio de salida verificable **por sí misma** (lint,
   test puntual); ninguna unidad hace commit; ninguna toca macros del
   framework (`next dev` agent-rules de AGENTS.md, etc.).
5. Máximo 2–3 unidades paralelas; prompts de subagentes autocontenidos
   (contexto resuelto + archivos prohibidos + criterios de salida).
6. Este skill solo diseña: implementar es `/spec-impl`.

## Decision Gates

| Situación | Decisión |
| --- | --- |
| La feature no cabe en una frase | Partir en varias specs (criterio de `/spec`) |
| Trabajo con BD/dinero/datos irreversibles | Modelo premium y agente orquestador en sesión principal |
| Presupuesto "calidad absoluta" | Columna "Mejor" en todas las filas de `references/modelos.md` |
| Presupuesto "costo" (default) | Columna "Mejor" solo donde la fila lo indique como crítico; resto "Alternativa" |
| Tarea no encaja en ninguna fila | `opencode-go/gpt-6-luna` (default balanceado) |

## Execution Steps

1. Cargar el skill base `spec` (Hard Rule 1).
2. **Fase 1 Contexto:** ejecutar la Fase 1 del `/spec` base, sin añadidos.
3. **Fase 2 Aclaración:** ejecutar la Fase 2 del `/spec` base + estas 4
   preguntas de orquestación: acoplamiento (¿qué partes son naturalmente
   independientes?), prerrequisitos (¿qué pieza bloquea a las demás?),
   riesgo (¿qué toca BD/seguridad/dinero?), presupuesto (¿calidad absoluta o
   costo?).
4. **Fase 3 Descomposición:** presentar al usuario, antes de escribir nada:
   (a) esqueleto de fases `A` (prerrequisito único, un solo agente) → `B..N`
   (unidades paralelas independientes) → `Z` (integración: validación global
   lint+test+build, verificación con navegador, fixes); (b) matriz por unidad
   de archivos permitidos vs. prohibidos; (c) asignación de modelo por unidad
   según `references/modelos.md` y el presupuesto de la Fase 2.
5. **Fase 4 Escritura:** escribir la spec con la Fase 3/4 del `/spec` base,
   insertando la sección `## Orquestación multiagente` (ver Output Contract)
   ANTES del `## Implementation plan`; los pasos del plan van agrupados por
   fase marcando explícitamente cuáles corren en paralelo.
6. Guardar y anunciar exactamente como la Fase 4 del `/spec` define
   (`specs/NN-slug.md`, estado `Borrador`, `specs/.spec-config.yml` si falta).

## Output Contract

- `specs/NN-slug.md` con las secciones del template de `/spec` MÁS una
  sección antes del plan:

```markdown
## Orquestación multiagente

| Fase | Depende de | Agente | Modelo | Archivos permitidos | Archivos prohibidos | Salida |
| --- | --- | --- | --- | --- | --- | --- |

### Reglas de convivencia
- (reglas duras del reparto, commits, prompts autocontenidos)
```

- Mensaje final al usuario: path de la spec, estado `Borrador`, modelos
  elegidos por fase con su costo y la siguiente acción (`/spec-impl`).

## References

- `references/modelos.md` — tabla completa de modelos (costos, variantes,
  notas de uso) y cómo refrescar el catálogo.
- `../spec/SKILL.md` + `../spec/template.md` — flujo y estructura base que
  este skill reutiliza (Hard Rule 1).
