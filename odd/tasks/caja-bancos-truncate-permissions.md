Objetivo: retirar `TRUNCATE` de `anon` y `authenticated` en las tablas financieras del proyecto Supabase.
Rama: `fix/caja-bancos-truncate-permissions` · Entrega: `ask-on-risk` · Forecast: ~34 líneas · Runner: Supabase MCP SQL de solo lectura para verificar permisos.

## Specs

### S1 — Cerrar TRUNCATE para roles API
- Solicitud del usuario: «dale hagamos el primer punto» y «pero quiero hacerlo usando el flujo ODD»; alcance remoto confirmado con «Aplicar en Supabase».
- Afectar únicamente las tablas actuales de `public`: `app_setting`, `cash_account`, `cash_close`, `cash_receipt_category`, `comprobante`, `entidad`, `payment`, `payment_allocation`, `payment_method` y `receipt_sequence`.
- Criterios: `anon` y `authenticated` ya no tienen privilegio efectivo `TRUNCATE`; sus privilegios `SELECT`, `INSERT`, `UPDATE` y `DELETE` quedan sin cambios; no se modifica ninguna fila.
- Comprobación: consulta de catálogo antes/después con `has_table_privilege`; comprobar también el ACL predeterminado de `postgres` para nuevas tablas de `public`.

## Tasks
- T1 | S1 | inline | verified; ready to commit | remote migration `20261012204444`; commit identity will be recorded after creation.

## Log
- L1: «dale hagamos el primer punto»
- L2: «pero quiero hacerlo usando el flujo ODD»
- L3: el usuario eligió «Aplicar en Supabase» para el proyecto `hurattoyvarlfdydvugd`, mediante la sesión MCP de Supabase actualmente conectada.
- L4: baseline remoto read-only: las diez tablas de `public` permiten `TRUNCATE` a ambos roles; los privilegios DML verificados están habilitados. El ACL predeterminado de `postgres/public` y `supabase_admin/public` también concede `TRUNCATE`; el rol de la sesión es `postgres`, no superusuario, y no tiene membresía en `supabase_admin`. La corrección se limitará a ACL actuales y defaults de `postgres`; no tocará defaults del rol administrado `supabase_admin`.
- L5: la rama de trabajo es `fix/caja-bancos-truncate-permissions`. El árbol ya tenía cambios del usuario en `opencode.json`, `.gentle-ai-default-agent.json` y `specs/27-cajas-bancos-remediacion.md`; se preservan sin alterarlos.
- L6: `apply_migration` confirmó éxito y registró `revoke_public_truncate_for_api_roles` con versión `20261012204444`. El SQL quedó espejado en `supabase/migrations/20261012204444_revoke_public_truncate_for_api_roles.sql`.
- L7: verificación remota posterior: 10 tablas públicas; ninguna conserva `TRUNCATE` efectivo para `anon` ni `authenticated`; cero cambios en sus permisos DML; defaults `postgres/public` sin `TRUNCATE`; los dos grants por defecto de `supabase_admin/public` permanecen intactos.
- L8: el Security Advisor mantiene avisos sobre `receipt_sequence` sin políticas, tres funciones `SECURITY DEFINER` ejecutables por `authenticated` y protección contra contraseñas filtradas desactivada; no se amplió el alcance para corregirlos.
- L9: el verificador independiente informó que el ACL predeterminado de `postgres` aún concedía `TRUNCATE`. El padre reejecutó la consulta equivalente dos veces y confirmó la URL del proyecto; ambas consultas devolvieron cero grants para `postgres` en el alcance global/de esquema público. No se reprodujo el blocker y no se aplicó otra DDL.
- L10: el repositorio prohíbe commits sin petición explícita; por ello el resultado queda pendiente de autorización del usuario para hacer el commit de ODD.
- L11: el usuario eligió «Autorizar commit» para registrar únicamente la migración y este documento ODD en `fix/caja-bancos-truncate-permissions`; los demás cambios locales quedan fuera.
- L12: prueba funcional enfocada mediante `execute_sql` de Supabase MCP: el inventario reportó 10 tablas base, cero grants efectivos `TRUNCATE` para ambos roles, 80/80 privilegios DML preservados y cero ACL predeterminados de `postgres` que otorguen `TRUNCATE` en el alcance comprobado.

Risk: item 2 (security permissions; removes only `TRUNCATE` from the API roles while preserving their DML grants).

Rollback boundary: forward-only; no `GRANT TRUNCATE` se aplica automáticamente. Restaurar ese permiso requeriría una migración separada y autorización explícita; no se modificaron datos.
