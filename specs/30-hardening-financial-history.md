# SPEC 30 — Hardening financial history in Cash and Banking

> **Status:** Approved
> **Depends on:** SPEC 19, SPEC 26
> **Date:** 2026-10-12
> **Objective:** Protect cash closes, payments, and allocations from unauthorized historical mutation while preserving payment assignment and first-time voiding.

## Why this spec exists

The read-only audit found owner-scoped `UPDATE` and `DELETE` policies that allow authenticated users to change financial history. The current payment flows still need a one-time entity assignment and a first void, so removing every `UPDATE` path without replacement would break existing behavior.

The user selected «No permitir UPDATE» for `cash_close`, «Aplicar invariantes H3» for `payment`, and «Aplicar en Supabase» for the currently connected MCP session and project `hurattoyvarlfdydvugd`. The related H2/H3 text in SPEC 27 remains a draft; this spec captures only the scope confirmed here.

## Scope

**In:**

- Inspect the deployed policies, grants, constraints, and triggers for `public.cash_close`, `public.payment`, and `public.payment_allocation` before changing them.
- Make `cash_close` immutable after insertion for API roles: no `UPDATE` (including `notes`) and no `DELETE`; preserve `SELECT` and `INSERT`.
- Prevent `UPDATE` and `DELETE` of `payment_allocation` by API roles; preserve the current `SELECT` and `INSERT` flow.
- Prevent `DELETE` of `payment` and limit authenticated updates to entity assignment and first-time voiding. Keep the owner-scoped row policy.
- Make `payment.amount` immutable after insertion.
- Allow `payment.entity_id` to be assigned only from `NULL` to a value, preserving the current advance-assignment flow.
- Allow one transition to `ANULADO`; require `void_reason` and `voided_at` for that transition and reject changes after voiding.
- Preserve the existing payment and allocation inserts, payment reads, and supported payment assignment and first-void operations.
- Apply the versioned migration to the explicitly selected Supabase project using the currently connected MCP session.

**Out of scope (for future specs):**

- Changes to the `payment_status` enum or the unrelated status-drift RPC findings.
- Transfers, reconciliation, multi-currency, audit-log tables, or policies on other tables.
- Editing or deleting existing business rows, backfilling historical records, or inspecting business-row contents.
- Changing payment-allocation insertion semantics or making `addAllocations` transactional.
- Changing the existing project-wide migration baseline or repairing unrelated migration drift.

## Data model

This spec adds no tables or columns. It changes grants and RLS policies on the three existing public tables and adds database-side payment guards where needed.

`public.payment` keeps the existing owner-scoped `payment_update` policy. Authenticated updates are limited to `entity_id`, `status`, `void_reason`, and `voided_at`. Database guards enforce immutable `amount`, one-time assignment, and terminal voiding. Existing `payment_void_check` is inspected and reused or adjusted only as needed to enforce the selected H3 invariant; it must remain compatible with the SPEC 26 statuses.

## Implementation plan

1. Capture a read-only baseline of the deployed ACLs, RLS policies, constraints, and triggers for the three tables. Record the remote migration identity and any difference from versioned local migrations. Do not read business rows.
2. Observe RED using catalog probes that demonstrate the currently effective unauthorized `UPDATE`/`DELETE` privileges and policies; add the focused unit regression for repeat voiding before changing application behavior.
3. Add one forward migration that revokes the broad table-level privileges and unwanted policies, restores only the required payment-column updates for `authenticated`, and installs or adjusts the payment guards. Do not change stored rows.
4. Update `voidPayment` and its unit tests so a second void is reported as a failed operation rather than silently replacing the original reason or timestamp. Preserve the `addAllocations` call shape and verify its entity assignment remains limited to unassigned payments.
5. Apply the migration through Supabase MCP `apply_migration`; record its confirmed version in the local migration filename and verify the remote ACL, policies, constraints, and triggers with read-only catalog queries.
6. Run `npm test`, `npm run lint`, and `npm run build`; review Security Advisor findings without expanding this spec's scope.

## Acceptance criteria

- [ ] `anon` and `authenticated` have no effective `UPDATE` or `DELETE` on `cash_close`; its `SELECT` and `INSERT` behavior is unchanged.
- [ ] `anon` and `authenticated` have no effective `UPDATE` or `DELETE` on `payment_allocation`; its `SELECT` and `INSERT` behavior is unchanged.
- [ ] `payment` has no `DELETE` access for API roles; `anon` has no `UPDATE`; authenticated updates are limited to the approved assignment and void columns and remain owner-scoped.
- [ ] A payment amount cannot be changed after insertion.
- [ ] An unassigned payment can still be assigned once; a payment cannot be reassigned after its entity is set.
- [ ] The first valid void succeeds; void state and its reason/timestamp remain consistent; a second void or a change after voiding is rejected.
- [ ] Existing `addAllocations` and first-time `voidPayment` unit tests pass, and a regression test covers rejected re-voiding.
- [ ] Read-only remote catalog probes confirm the intended grants, policies, constraints, and triggers; no business rows were read or modified.
- [ ] `npm test`, `npm run lint`, and `npm run build` pass.

## Decisions

- **Yes:** `cash_close` receives no `UPDATE` policy, including for `notes`; this follows the user's «No permitir UPDATE» selection and the app has no close-edit flow.
- **Yes:** apply the amount-immutability and one-time-void invariants from SPEC 27 H3, as selected by the user.
- **Yes:** preserve the existing null-only payment entity assignment and the first void operation.
- **No:** do not allow direct update/delete of allocation history; the current app has no such mutation flow.
- **No:** do not apply the rest of draft SPEC 27 (enum drift, transfers, multi-currency, auditing, or unrelated table policies).
- **No:** do not change or backfill existing business rows as part of this migration.

## Risks

| Risk | Mitigation |
| --- | --- |
| The local migrations do not fully reproduce the deployed payment schema and policies. | Inspect the deployed catalog first, use guarded policy/constraint operations, and report local replay limitations instead of assuming the local migrations are authoritative. |
| Restricting payment updates could break assignment or voiding. | Keep the existing permitted columns and add focused unit regressions before applying the migration. |
| Existing payment constraints may differ from SPEC 26/H3. | Read the deployed constraint definitions first; do not duplicate constraints or inspect business rows. |

## What is **not** in this spec

- Fixing payment-status drift in other RPCs.
- Transfers, reconciliation, multi-currency, or an audit log.
- Updating or deleting stored financial records.
- Changing policies or grants on tables outside `cash_close`, `payment`, and `payment_allocation`.
