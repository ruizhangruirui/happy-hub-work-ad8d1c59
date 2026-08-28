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

`get_operations_overview(...)` is the server-side aggregate contract. HR reporting requires `is_hr_user` plus `can_report_hr_case`. The latter follows the existing `case_access` Data Scope resolution (All Organization, Lab, Team, or assigned/specific Case) without requiring the HR user to be Case Owner or Collaborator. Generic Viewer/Collaborator membership alone still does not grant Operations reporting because HR authorization remains mandatory.

The response declares `reportingMode`. HR-authorized users receive people metrics, all Case Tasks, Mandatory KPIs, workload, Attention, and exports across their Data Scope. In HR mode the reporting RPC reads Tasks from reportable Cases directly; it does not use execution visibility as a reporting filter. IT and Administration users receive an `operational` response containing only Tasks for their own functional team and minimum Task context; all people arrays, HR attention, headcount distributions, and lifecycle trends are empty/zero. Viewer and generic Collaborator users without functional membership receive no operational Tasks.

Reporting visibility is deliberately independent from mutation. `list_operational_tasks`, `can_update_task`, and Task mutation RPCs remain the execution boundary. Seeing an in-scope Task in Operations reporting does not grant status, assignment, comment, completion, or Not Applicable permission; `task.canEdit` and backend authorization remain authoritative.

The report returns KPIs, upcoming joiners/leavers, deterministic attention reasons, HR/IT/Admin workload (including unassigned work), distributions, a 12-month lifecycle trend, active people, and authorized task export rows.

Onboarding operational date is Start Date. Offboarding operational date is Last Working Day, falling back to Contract End Date. Mixed reports evaluate that expression per Case. Upcoming Joiners and Leavers are limited to today through today + 30 days; a missing-LWD leaver remains visible when Contract End is in that horizon.

Open Mandatory Tasks includes applicable mandatory Tasks in `Not Started`, legacy `Open`, `In Progress`, `Waiting`, or `Blocked`. Overdue Mandatory Tasks adds `due_date < business_date()` and excludes null dates. Due Soon is inclusive from today through today + 14 and cannot overlap overdue.

Task-backed Attention rows link to the Case Tasks tab with `taskId`; Case Detail selects Tasks, scrolls to the Task, and highlights it. Non-Task Attention opens the Case overview.

## Export controls

Current View exports use the visible filtered/sorted rows; All exports refetch all rows within the caller's authorized scope. Empty product exports show `No records to export.` and do not start a download. CSV and XLSX use UTF-8 data and neutralize cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return to prevent spreadsheet formula execution. Active People exports intentionally omit personal email.

## Performance

Phase 4 adds partial indexes for Case reporting dates/lifecycle and open Task due dates. If usage grows substantially, inspect production query plans before introducing a materialized reporting table; the RPC remains the canonical definition.

## Validation

Integration tests apply the full migration history to PostgreSQL-compatible PGlite and verify scoped report isolation. Export tests cover formula-injection safety, UTF-8/quoting, stable XLSX columns, and empty datasets. Existing Phase 1–3 integration tests remain mandatory.
