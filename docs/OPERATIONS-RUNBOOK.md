# Operations Runbook

## Environments

| Environment  | Data                              | Purpose                   |
| ------------ | --------------------------------- | ------------------------- |
| Development  | synthetic only                    | local implementation      |
| Test/Staging | synthetic or approved masked data | migrations and acceptance |
| Production   | real authorized HR data           | pilot operation           |

Required application variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY  # server only
```

Outlook helper workstation variables:

```text
TEAM_WORKBENCH_ALLOWED_ORIGINS
TEAM_WORKBENCH_ALLOWED_ATTACHMENT_HOSTS
```

Never record values in Git or support tickets.

## Bootstrap

1. Apply the full forward migration history to an empty Supabase project.
2. Create the first Auth user through the Supabase console.
3. Confirm the profile trigger created `profiles`, then assign System Admin in `user_roles` using an approved SQL console action.
4. Sign in and configure Labs, Teams, user Data Scopes and Functional Teams.
5. Review seeded Checklist rules and Email Variable Library; create/publish approved templates.
6. Do not seed fake employees into Production.

## Deployment

1. Run typecheck, lint, unit/PostgreSQL integration tests and production build.
2. Apply only new forward migrations; never rewrite an applied migration.
3. Deploy the same Git commit connected to Lovable/hosting.
4. Run the smoke checklist in [Release Checklist](RELEASE-CHECKLIST.md).
5. Record commit, migration and environment in the release evidence.

## Abandoned email attachment cleanup

No automatic scheduler is claimed. Run this maintenance flow with service-role credentials in an approved job:

1. Call `cleanup_abandoned_email_attachments()`; it marks expired unbound rows and returns Storage paths.
2. Delete only the returned objects from private bucket `email-attachments`.
3. Call `finalize_abandoned_email_attachment_cleanup(successful_paths)` with only paths confirmed deleted.
4. Investigate failed paths and retry. Never pass a bound attachment path.

The RPC cannot be called by an ordinary authenticated HR user. Bound rows (`communication_id IS NOT NULL`) are excluded from mark and finalize.

## Backup and restore

Before Production pilot:

1. Enable the Supabase plan's database backup/PITR capability and document retention owned by IT.
2. Inventory private Storage buckets separately; database backup alone does not prove object recovery.
3. Restore to an isolated Test project, apply pending forward migrations, and run smoke tests.
4. Verify Case/Employment/Task counts and sample authorized attachment retrieval without copying restored HR data elsewhere.
5. Record recovery time and evidence. Do not claim restore readiness from configuration alone.

## Diagnostics

- Web: root/page error boundary, retry UI, server error category and Lovable error capture.
- Supabase: failed RPC category, RLS denial (`42501`), constraint violations and Storage failures.
- Helper: `GET http://127.0.0.1:17873/v1/health`; logs include status/failure category and attachment count only.
- Do not log HR payloads, signed URLs, mail body, tokens or file content.

## Rollback

- Prefer a corrective forward migration and redeploy a known-good application commit.
- Do not force push, rewrite Lovable-connected history or reverse a migration without data analysis.
- Storage deletion incidents require immediate containment and backup/retention review.
