# Security Review

## Scope and architecture

Reviewed path: browser UI → authenticated TanStack server functions → domain/service layer → Supabase RPC/PostgreSQL → RLS → private Storage → localhost Outlook helper.

The browser receives only the Supabase URL and publishable key. Those public values have a checked-in production fallback so Git-connected hosts cannot lose them during deployment; environment values override the fallback. `SUPABASE_SERVICE_ROLE_KEY` remains runtime-only and is imported only by server-only user administration code. `.env`, build output, helper publish output and local platform state are ignored by Git.

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
- Phase 5 redacts historical email recipient/subject/body keys from audit metadata while retaining the audit event and access-controlled Communication evidence; see the migration data-minimization note below.

## Known residual risks

- Classic Outlook requires manual Windows acceptance on a corporate workstation before “full integration” can be claimed.
- Edge/IP rate limiting for anonymous feedback links is deployment-dependent.
- Production backup/restore must be executed and evidenced by the environment owner.
- Case/Task report exports intentionally use the already-authorized server response; very large exports should be monitored for memory/time limits.
- No legal-compliance claims are made by this technical review.

## Final validation status

```text
Automated security validation: PASS
Environment validation: PENDING
Residual risks accepted: controlled-pilot external-link rate-limit risk; browser-generated large exports; 100-record initial Communication History; reviewed High dependency advisories described below
Blocking risks for PILOT READY: Windows Outlook evidence, environment variable review, backup/Storage recovery evidence, restore drill, maintenance owner and manual browser smoke
```

### Dependency audit — 28 August 2026

Command: `bun audit --json` with Bun 1.3.14 against the repository's `bun.lock`.

- Critical: **0**.
- High: **7 advisories**; the audit reported no Critical finding.
- Direct runtime: `xlsx@0.18.5` reports prototype-pollution and ReDoS advisories. Team Workbench only creates workbooks from already-authorized DTOs and never parses uploaded/untrusted workbooks, so the vulnerable parser path is not exposed in V1. Replacement or an officially patched compatible distribution remains a post-pilot dependency action.
- Development/build transitive: three `brace-expansion` advisories resolve through ESLint/minimatch; `js-yaml` resolves through ESLint and TanStack build tooling; `nanoid` resolves through PostCSS/Vite. None receives untrusted HR input in the deployed application runtime. Keep build tooling non-public and upgrade through compatible toolchain releases.

No applicable Critical issue is unresolved. High findings are explicitly accepted only for the controlled pilot with the constraints above; they are not approval for unrestricted public rollout.

### External feedback rate-limit decision

Status: **Accepted for controlled pilot**. Links are high entropy, hash-stored, recipient-bound, expiring and disclose only one request. Distribution must remain narrow and monitored. Edge/IP rate limiting is required before unrestricted external rollout.

### Migration data minimization

The Phase 5 migration intentionally removes recipient, subject, body and legacy email-change payload keys from historical `audit_logs.metadata`. Audit row ID, actor, action, entity, Case and timestamp remain. Full Communication evidence stays in the access-controlled communication tables. This is the only intentional historical UPDATE in Phase 5 and is treated as privacy data minimization, not a lifecycle/status rewrite.
