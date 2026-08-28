# Security Review

## Scope and architecture

Reviewed path: browser UI → authenticated TanStack server functions → domain/service layer → Supabase RPC/PostgreSQL → RLS → private Storage → localhost Outlook helper.

The browser receives only the Supabase publishable key. `SUPABASE_SERVICE_ROLE_KEY` is imported only by server-only user administration code. `.env`, build output, helper publish output and local platform state are ignored by Git.

## Authentication and authorization

- Supabase Auth provides identity; server functions validate the bearer token and claims.
- Profiles must be Active. Disabled profiles cannot use business RPCs.
- System Role, Functional Team and Data Scope are distinct. See [Permission Matrix](PERMISSION-MATRIX.md).
- PostgreSQL RLS/RPC checks are the security boundary. UI hiding is only presentation.
- General profile directory access returns id/name/title only. Profile email, System Role and Data Scope are direct-readable only by self or System Admin.

## RLS inventory

Every business table has RLS enabled and an intentional policy. Integration tests inspect this invariant on a fresh database.

| Group            | Tables                                                       | Policy intent                                                 |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Identity         | profiles, user_roles, user_scopes, user_operational_teams    | self/Admin; safe directory RPC for names                      |
| Organization     | labs, teams                                                  | Active authenticated users; Admin-only mutations              |
| Person lifecycle | persons, employments, cases                                  | current Employment/Data Scope and HR capabilities             |
| Collaboration    | case_members, external_collaboration_requests                | Case access; sharing never grants HR mutation                 |
| Work             | tasks, task_comments, checklist items/templates, workflow    | HR or matching Functional Team/assignment                     |
| Files            | case_files, task_files                                       | authorized record access; governed Case deletion              |
| Email            | templates, variables, communications, attachments, snapshots | authorized HR; bound additional files retained                |
| Audit            | audit_logs                                                   | authorized Case/entity readers; append through business paths |

## SECURITY DEFINER functions

- Every public `SECURITY DEFINER` function pins `search_path`.
- PUBLIC/anon execution is revoked; only required authenticated/service-role functions are granted.
- Trigger/internal helpers have no caller grant.
- No dynamic SQL is used in business RPCs.
- The obsolete `complete_email_task` compatibility RPC is not executable by authenticated users.

Automated PostgreSQL tests verify search-path pinning and PUBLIC execution revocation.

## Storage

- `case-files` and `email-attachments` are private.
- Buckets enforce 25 MB and PDF/DOCX/XLSX/PNG/JPEG allowlists.
- Browser filenames are sanitized and object paths contain UUID identity.
- Download URLs are signed for 60 seconds (Case files) or 10 minutes (Outlook preparation).
- Case file and temporary Additional Attachment deletion use server-side request → Storage delete → metadata finalize flows.
- Bound Additional Attachments cannot enter ordinary deletion or abandoned cleanup.
- Communication history retains attachment metadata snapshots.

## External feedback links

- Tokens use 32 random bytes, are returned once and stored only as SHA-256 hashes.
- Recipient email and token are both required; links expire and reveal only one workflow request DTO.
- The endpoint does not expose the Case.
- No IP-aware rate limiter exists in the current database-only architecture. High-entropy tokens, email binding and expiry are compensating controls; edge rate limiting is recommended before broad external rollout.

## Outlook helper

- Listens only on `127.0.0.1:17873`.
- Allows configured origins and attachment hosts only; rejects HTTP, private-address resolution, unsupported MIME, count and size limits.
- Redirects are disabled. Signed URLs, mail content and personal data are not logged.
- Exposes health and display-draft operations only; there is no Send operation.
- New Outlook safely falls back to attachment-free `mailto:` behavior.

## Audit and observability

- Lifecycle, Person identity, Task, template, sharing and email state mutations are auditable.
- New email audit events store Task/template/version/helper mode, not body, recipient or subject.
- Application boundaries report failure categories without HR payloads.
- Historical earlier audit rows may contain subject/recipient metadata created before Phase 5. A separate approved retention decision is required before modifying historical audit evidence.

## Known residual risks

- Classic Outlook requires manual Windows acceptance on a corporate workstation before “full integration” can be claimed.
- Edge/IP rate limiting for anonymous feedback links is deployment-dependent.
- Production backup/restore must be executed and evidenced by the environment owner.
- Case/Task report exports intentionally use the already-authorized server response; very large exports should be monitored for memory/time limits.
- No legal-compliance claims are made by this technical review.
