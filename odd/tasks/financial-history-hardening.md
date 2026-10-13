Objective: Implement the approved SPEC 30 safeguards for cash-close, payment, and allocation history.
Branch: `spec-30-hardening-financial-history` · Delivery: `ask-on-risk` · Forecast: ~150 authored lines · Test runner: `npm test`, `npm run lint`, `npm run build`, and Supabase MCP catalog probes.

## Specs

### S1 — Approved SPEC 30 contract
- User request: “dale aprobe spec 30”. The approved scope is `specs/30-hardening-financial-history.md`.
- “Make `cash_close` immutable after insertion for API roles: no `UPDATE` (including `notes`) and no `DELETE`; preserve `SELECT` and `INSERT.”
- “Prevent `UPDATE` and `DELETE` of `payment_allocation` by API roles; preserve the current `SELECT` and `INSERT` flow.”
- “Prevent `DELETE` of `payment` and limit authenticated updates to entity assignment and first-time voiding. Keep the owner-scoped row policy.”
- “Make `payment.amount` immutable after insertion.”
- “Allow `payment.entity_id` to be assigned only from `NULL` to a value, preserving the current advance-assignment flow.”
- “Allow one transition to `ANULADO`; require `void_reason` and `voided_at` for that transition and reject changes after voiding.”
- “Apply the versioned migration to the explicitly selected Supabase project using the currently connected MCP session.”
- Acceptance also requires preserving the existing assignment/void flows, changing no business rows, and passing the SPEC 30 test/build checks.

## Tasks
- T1 | S1 | inline | partial: dynamic database proof deferred by user; commit `b8753bd` created; push to `origin` confirmed up-to-date.

## Log
- L1: “dale con odd de ahora en adelante”
- L2: “dale aprobe spec 30”
- L3: User selections: “No permitir UPDATE”, “Aplicar invariantes H3”, and “Aplicar en Supabase”.
- L4: Read-only remote baseline: all three target tables (`cash_close`, `payment`, `payment_allocation`) grant effective `UPDATE` and `DELETE` to `anon` and `authenticated`; each has owner-scoped UPDATE/DELETE policies for `authenticated`. No column-level ACLs were found. Remote migration history currently ends at `20261012204444_revoke_public_truncate_for_api_roles`.
- L5: Existing remote checks include positive amount checks and `payment_void_check`; the latter currently allows `ANULADO` with non-null void fields or `EN_REVISION` with null fields. Payment and allocation triggers already validate account-open state, owner IDs, receipt assignment, and status refresh. No business rows were read.
- L6: Local migrations diverge from remote: local `payment` and `payment_allocation` migrations do not contain the remote DELETE policies. Guarded/idempotent migration steps and remote catalog verification are required.
- L7: The prior point's task log `odd/tasks/caja-bancos-truncate-permissions.md` was already modified before this feature; preserve it. Current branch started at user commit `84b2261` and is `spec-30-hardening-financial-history`.
- L8: SPEC 30 Step 2 RED observed. `.\node_modules\.bin\vitest.cmd run tests/unit/lib/pagos/pagos.test.ts` produced 15 passing tests and the new repeat-void regression failed as expected (`promise resolved undefined instead of rejecting`). Vite emitted a pre-existing config-loader warning; no production code or DDL changed.
- L9: Step 3 cannot create the local migration yet: `supabase` is not on PATH and `node_modules/.bin/supabase.cmd` is absent. Supabase migration guidance requires `supabase migration new`; no CLI was installed, no timestamped filename was invented, and no remote DDL was applied.
- L10: The user authorized manual filename generation using the existing timestamped migration convention for the local draft `supabase/migrations/20261012220451_harden_financial_history_v1.sql`. This authorizes creating the local proposal only; it does not authorize remote DDL before review.
- L11: Created the local migration draft `supabase/migrations/20261012220451_harden_financial_history_v1.sql`: it removes UPDATE/DELETE access and policies from closes/allocations, restricts payment column updates, allows PROCESADO under the void consistency check, and adds immutable-amount/one-way-void guards. No remote DDL was executed.
- L12: SPEC 30 Step 4 updates `voidPayment` to look up current status, reject already-ANULADO payments with “El pago ya está anulado o no se encuentra disponible.”, and compare-and-swap the current status before updating. Focused tests pass 16/16; focused lint passes. No remote DDL was executed.
- L13: SPEC 30 Step 5 has not run. The migration draft still awaits user review before applying remote DDL to `hurattoyvarlfdydvugd`; specifically, it replaces `payment_void_check` to allow the SPEC 26 `PROCESADO` status while retaining void-field consistency.
- L14: After the user approved the exact migration, `apply_migration` returned success and recorded `harden_financial_history_v1` as version `20261012221550`. The local file was renamed to `supabase/migrations/20261012221550_harden_financial_history_v1.sql` to match the confirmed remote version.
- L15: Post-migration catalog verification: anon/authenticated have no effective UPDATE/DELETE on cash_close or payment_allocation; payment DELETE and anon UPDATE are absent; authenticated table-level UPDATE is absent and only `entity_id`, `status`, `void_reason`, `voided_at` retain column UPDATE. SELECT/INSERT privileges and owner-scoped read/insert/update policies remain. The payment void check accepts ANULADO with void fields and EN_REVISION/PROCESADO without them. Both payment guards are present. No business rows were queried or changed.
- L16: Security Advisor still reports the pre-existing `receipt_sequence` no-policy notice, three authenticated-callable SECURITY DEFINER functions, and disabled leaked-password protection; these remain out of scope.
- L17: `npm test` passed all 194 tests across 25 files. `npm run lint` passed with 0 errors and 1 pre-existing warning in generated `coverage/block-navigation.js`; Vitest also emitted the pre-existing Vite config-loader warning. Verification made no edits. `npm run build` remains pending because it may load app environment credentials.
- L18: The independent verifier confirmed the remote ACLs, policies, constraint, trigger definitions, migration identity, and no business-row access. It returned S1 unmet only because amount immutability, null-only assignment, terminal voiding, and `npm run build` were not exercised dynamically; no implementation defect was reproduced.
- L19: One bounded correction batch added tests that assert null-only entity assignment and reject a void whose status changed concurrently. Focused `pagos.test.ts` recheck passed 18/18 and focused lint passed. The full suite result above predates these test-only additions; it was not rerun under the one-recheck bound.
- L20: Remaining proof choices: a remote Supabase test branch would allow database guard behavior tests without touching main-project rows; the application build may load `.env` and contact Supabase. Neither operation has been authorized yet.
- L21: The user authorized both a temporary test branch and `npm run build` using the current app configuration; no environment values may be inspected or disclosed.
- L22: `create_branch` was attempted once for a temporary validation branch but the MCP tool rejected the request because its required cost confirmation ID was unavailable/mismatched. `list_branches` returned empty; no test branch was created and no blind retry was made.
- L23: `npm run build` passed: Next.js 16.3.6 compiled, TypeScript completed, and all 14 static pages generated with no errors/warnings. The build loaded `.env` as authorized, but the runner observed no remote requests; no values were inspected or disclosed.
- L24: Independent verification originally marked S1 unmet because dynamic database behavior probes were unavailable and build had not run. The build blocker is now closed; dynamic UPDATE/void guard behavior remains unverified, with no implementation defect reproduced by static/catalog checks.
- L25: The user said “la verificacion dinamica queda pendiente, has el commit y el push”; dynamic database guard proof is deferred, and the implementation commit is explicitly authorized. Remote push still requires confirming the exact destination and Git session.
- L26: Dynamic database proof remains pending by the user's explicit direction; this is a partial ODD result, not a verification pass. The user authorized committing the SPEC30 work unit; push awaits exact remote/session confirmation.

- L27: The commit scope is limited to the SPEC30 spec/task log, migration, `lib/pagos/pagos.ts`, and its unit tests; the prior point1 task log remains excluded. Push has not been performed and no remote destination was inspected.
- L28: Risk: item 2 (security permissions and financial-history integrity).
- L29: Rollback boundary: remote DDL is forward-only. Restoring broad UPDATE/DELETE access requires a separately authorized GRANT migration; reverting local code alone does not reverse remote ACLs.
- L30: Work-unit commit `b8753bd` (`fix(db): blinda historial financiero de caja`) is on `spec-30-hardening-financial-history`. Native assessment against base `84b2261` returned risk `medium`, `review_due=false`, reason `under_budget`; no reviewer START was required.
- L31: The user requested push of this feature branch. Remote name, destination, and Git session have not been confirmed; no remote inspection or push has occurred.
- L32: With the user's authorization, `git push origin spec-30-hardening-financial-history` returned “Everything up-to-date”; no force-push was used and the remote already contained the branch commits. Dynamic database proof remains deferred by the user.
