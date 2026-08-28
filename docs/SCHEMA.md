# Team Workbench — Schema & Security Notes

Migrated from a Cloudflare Workers / D1 / header-auth prototype to Lovable Cloud
(database + auth + storage + server functions). This document records the schema
and the authorization decisions.

## Tables

| Table             | Purpose                                                    | Key fields                                                                                    |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `profiles`        | App-facing user record (1:1 with auth user)                | `name`, `email`, `title`, `status`                                                            |
| `user_roles`      | Role assignment — roles live here, never on profiles       | `role` = admin / operator / manager / viewer                                                  |
| `labs` / `teams`  | Organization structure                                     | `teams.lab_id` → lab                                                                          |
| `user_scopes`     | Data visibility scopes per user                            | `scope_type` = all_organization / lab / team / assigned_cases                                 |
| `persons`         | Employee records (subject of a case)                       | `full_name`, `email`, `employee_id`, `team_id`, `manager_id`                                  |
| `cases`           | Onboarding / offboarding cases                             | `case_type`, `status`, `priority`, `owner_id`, `notes`, `supervisor_name`, `supervisor_email` |
| `case_members`    | Direct sharing per case                                    | `access_level` = viewer / collaborator, `revoked_at`                                          |
| `checklist_items` | Case checklist                                             | `section`, `status`, `owner_id`, `completed_by`                                               |
| `tasks`           | User-assigned tasks, optionally linked to a checklist item | `case_id`, `checklist_item_id`, `owner_id`, `status`                                          |
| `audit_logs`      | Immutable event log                                        | `case_id` (denormalized for visibility checks), `metadata`                                    |
| `email_templates` | Template library                                           | `subject`, `body`, `variables[]`                                                              |
| `case_files`      | File metadata; binaries in private bucket `case-files`     | `storage_path` = `<case_id>/<file>`                                                           |

## Authorization model

Single source of truth: `public.case_access(user, case)` (security definer,
`EXECUTE` revoked from `anon`/`public`) returns
`owner | collaborator | viewer | scoped | none`:

1. `admin` role or `cases.owner_id` → **owner**
2. active `case_members` row → **collaborator / viewer**
3. `user_scopes` match (all-organization, or lab/team of the case's person) → **scoped**
4. otherwise → **none**

RLS policies call `case_access` everywhere, so SQL-side and UI-side visibility
cannot drift apart. `has_role()` is the role check; both functions do their own
verification, which is why signed-in users may execute them (linter 0029 warnings
are expected and recorded in security memory).

### Field-level restriction for Viewer

`cases.notes` is returned only to `owner` / `collaborator`; the server function
`getCaseDetail` masks it for `viewer` / `scoped`. Non-admins also receive
`email: null` for other users in user lists (PII minimization).

### Immutability of audit logs

`audit_logs` grants are insert-only for authenticated users; there are no
update/delete policies. Every share / assignment / completion / admin change
writes a row with actor, action, old/new value and timestamp.

### Atomic task ↔ checklist sync

`set_task_completion(task, complete)` and `set_checklist_completion(item, complete)`
are Postgres functions: flipping one side updates the linked row and writes the
audit entry in the same transaction.

## Server functions (`src/lib/workbench.functions.ts`)

All go through `requireSupabaseAuth` (bearer attached by `attachSupabaseAuth`
middleware in `src/start.ts`). RLS applies as the caller. Only `saveUser`
(user management) uses the service-role client, after an explicit
`has_role(user, 'admin')` check; duplicate emails are caught and returned as a
typed `email_exists` error. Input validation is zod on every mutating function.

## Storage

Private bucket `case-files` (50 MB limit). Path convention `<case_id>/<name>`;
policies map the first path segment to `case_access`:
read for any access level, write for owner/collaborator.

## Access lifecycle

Sign-up creates an auth user only. Without an `Active` profile row the app shows
an access-denied page; admins create users from Settings (a temporary password is
generated once), which also writes an audit entry.

## Seed data

Demo users (emails `@workbench.demo`, password `Workbench2026!`): Rui Zhang (Admin), Anna Meier (Operator),
John Smith (Manager, team scope: Network), Todor Petrov (Viewer, assigned cases).
Two onboarding cases (Michael Smith — shared with Todor as viewer; Sofia Rossi),
checklist items with linked tasks, and history entries.
