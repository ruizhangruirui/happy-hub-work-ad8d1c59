# Phase 4 — Operations Overview and Reporting

Phase 4 adds a permission-safe operations reporting layer without changing the Phase 1–3 lifecycle rules. `/work` is the operational overview; `/onboarding`, `/offboarding`, and `/roster` remain the drill-down lists.

## Canonical definitions

- Business date: `public.business_date()` (`Europe/Zurich`).
- Active People: employments whose `employment_effective.effective_status` is `active` or `ending`. Pending leavers remain active until **Confirm Left**.
- Preboarding: accessible, non-cancelled Onboarding cases not yet confirmed joined and whose employment is still planned.
- Leaving: active people with a pending, accessible Offboarding case.
- Joined/Left YTD: confirmed lifecycle dates in the current Zurich business year.
- Outstanding task: `Not Started`, `Open`, `In Progress`, `Waiting`, or `Blocked`. `Completed` and `Not Applicable` are excluded from overdue, due-soon, and workload totals.
- Due soon: due between today and today + 14 days; overdue: due before today.

## Security and data flow

`get_operations_overview(...)` is the server-side aggregate contract. It is `security definer`, but every Case passes `case_access(auth.uid(), case_id)` and operational Tasks come from the existing permission-safe `list_operational_tasks`. The scoped `active_employee_roster` applies the same Case access boundary. Frontend filters cannot broaden access.

The report returns KPIs, upcoming joiners/leavers, deterministic attention reasons, HR/IT/Admin workload (including unassigned work), distributions, a 12-month lifecycle trend, active people, and authorized task export rows.

## Export controls

Current View exports use the visible filtered/sorted rows; All exports refetch all rows within the caller's authorized scope. CSV and XLSX use UTF-8 data and neutralize cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return to prevent spreadsheet formula execution. Active People exports intentionally omit personal email.

## Performance

Phase 4 adds partial indexes for Case reporting dates/lifecycle and open Task due dates. If usage grows substantially, inspect production query plans before introducing a materialized reporting table; the RPC remains the canonical definition.

## Validation

Integration tests apply the full migration history to PostgreSQL-compatible PGlite and verify scoped report isolation. Export tests cover formula-injection safety, UTF-8/quoting, stable XLSX columns, and empty datasets. Existing Phase 1–3 integration tests remain mandatory.
