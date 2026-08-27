# Team Workbench V1 Architecture

## Domain flow

Team Workbench uses one continuous model: `Person → Employment → Case → Task → Communication`.

- A Person is canonical and is not recreated merely because they join, leave or return.
- An Employment represents one working relationship. Employee ID may be empty during pre-boarding and is enriched on the same Person later.
- Onboarding and Offboarding Cases are permanent workflow/history records.
- Tasks are generated from reusable checklist rules and belong to HR, IT or Admin.
- Communications resolve reusable template variables from the selected Person and Case.

## Lifecycle

Onboarding uses `Preparing → Ready to Join → Joined → Follow-up → Completed`. **Confirm Joined** activates the Employment immediately, records actor/date/timestamp, keeps the Case visible and leaves unfinished tasks open.

Offboarding uses `Preparing → Ready for Exit → Left → Follow-up → Completed`. Creating Offboarding does not remove the Person from Active People. **Confirm Left** ends the Employment and removes the Person from Active People immediately, regardless of the planned date. The Person, Employment, Case and post-leaving tasks remain. Contract End Date and Last Working Day are separate nullable fields.

## Checklist engine

`checklist_template_items` stores case type, employment/leaving applicability, owner team, mandatory flag, due-date rule, offset and order. `generate_case_tasks` runs after Case creation. `calculate_case_task_due_date` is the single date-calculation boundary.

- Employee voluntary resignation generates Leaving Agreement, not Termination/Garden Leave letters.
- Employee employer termination generates Leaving Agreement and Termination Letter, with optional Garden Leave.
- Intern and Leased Labour do not receive Employee termination-document tasks by default.
- IT/Admin last-day tasks are generated from templates.

## Collaboration and security

RLS remains the security boundary. HR editors manage HR work and lifecycle actions. `user_operational_teams` scopes IT/Admin task access without blanket HR Case edit rights. Status changes record actor/time and audit before/after values. Task comments and attachment metadata use task-scoped RLS.

## Email Center

The global variable library has canonical unique keys and source metadata. Templates define content, variables, recipient source and attachment metadata. Compose shows recipient and attachments before confirmation.

`outlookDraftService` tries the optional localhost-only Windows Outlook helper when attachments are present. If unavailable it falls back to `mailto:` and warns that attachments cannot be added automatically. The browser never silently sends email.

## Lists, export and analytics

Onboarding and Offboarding retain historical Cases. Active People includes pending leavers until Confirm Left. All three views use one export service for filtered CSV/XLSX and full XLSX. Work shows people metrics, distributions, upcoming joiners/leavers and rule-based attention cases.

## Current limitation

The Windows Outlook Desktop helper is an integration boundary, not a bundled executable. Without it, Outlook opens through `mailto:` without automatic attachments. Final Send always remains a visible user action.
