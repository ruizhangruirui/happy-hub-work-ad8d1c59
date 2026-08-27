# Team Workbench Phase 3 Closure — Email Center V2

## Architecture and Email Tasks

All entry points use the single `/email` Compose route (`/email-center` is a compatibility redirect):

`Case / Email Task → Template → Variable + Recipient Resolution → Attachments → Preview → Outlook Draft → Manual Send → Mark as Sent`

Checklist rules explicitly declare `task_type = Email` and may select a compatible Published preferred template. Generated Tasks snapshot both `task_type` and `preferred_email_template_id`. Completed historical Tasks never change when a rule is edited; explicit rule synchronization updates only open Tasks. The frontend uses these fields for every Email Task, including custom Tasks, and contains no title-based Welcome Email detection.

## Templates and variables

`email_templates` stores subject/body, recipient source, applicable Case types, version and publish/archive metadata. `email_template_variables` holds template-only manual definitions. `email_variable_library` is the active Global Library.

The resolver extracts tokens actually used by Subject and Body. It resolves Global and template-specific definitions, renders only referenced manual inputs, applies deterministic Person/Employment/Case/default data and reports missing required fields. Text, email, number, date, boolean and choice/dropdown controls are supported. A template-specific key cannot duplicate an active Global key.

The parser first finds every broad `{{ ... }}` expression and then requires lowercase snake_case (`^[a-z][a-z0-9_]*$`). TypeScript and PostgreSQL publication validation reject dotted legacy keys, uppercase keys, hyphenated keys, empty expressions, unknown definitions and malformed delimiters. `email_templates.variables` is synchronized from Subject and Body; users do not maintain a competing token list.

## Recipients

Templates select Personal Email, Company Email or Manual. Compose displays the resolved address and permits a session-only override. It never silently falls back from company to personal email and never writes the override to the Person profile.

## Attachments and Compose sessions

Reusable metadata lives in `email_template_attachments`. One-off files live in `email_additional_attachments` and carry a client-generated `compose_session_id`. A file can be uploaded before required variables are complete with `communication_id = null`. After Draft Prepared, `bind_email_compose_attachments` securely links only files from the same session, Case and user.

Linked files remain immutable historical evidence. They are not removable in Compose, Case/template changes ignore them, ordinary metadata deletion is revoked, and the private Storage delete policy cannot delete their objects. Temporary removal uses a two-step governed flow: an RPC first marks an authorized unbound row for deletion, the Storage policy permits only that matching object, and a final RPC removes its metadata. Binding refuses rows already marked for deletion. Template attachment metadata is snapshotted into `email_communication_attachment_snapshots` at preparation, so later template edits cannot rewrite history. Unlinked files expire after 24 hours, are explicitly removed on Case/template change, and `cleanup_abandoned_email_attachments()` supports service-role orphan cleanup. A scheduled service must also remove the returned private Storage paths.

All binary objects remain private in the `email-attachments` bucket. PDF, DOCX, XLSX, PNG and JPEG are allowed up to 25 MB each. Short-lived signed URLs are regenerated immediately before Outlook preparation. Any Template or Additional Attachment signing failure blocks the action and names the failed file; nothing is silently omitted.

## Communication history

`email_communications` is the authoritative Case Communication source. Preparing creates `Draft Prepared`. A successful helper response records `Opened in Outlook`; an attempted mailto launch records the mode as `mailto`. Errors before opening leave the record at Draft Prepared. Explicit **Mark as Sent** records `Marked Sent`—never “Delivered.”

For a linked Email Task, Mark as Sent completes it through the existing secure Task status path. A general Case email without a Task updates only its communication. History exposes template/version, recipient, rendered subject, actor, timestamps and attachment metadata, but never the full body or expired signed URLs.

## Outlook helper

The real helper is in `tools/outlook-helper/`. It is a .NET 8 Windows localhost service bound only to `127.0.0.1:17873`, exposes only health/preflight/draft endpoints and uses Classic Outlook COM to create and visibly `Display` a MailItem. It never calls `Send` and has no send endpoint.

Build with `build.ps1`, produce a self-contained `win-x64` package with `publish.ps1`, then run `install-startup.ps1` for a per-user Startup shortcut. Configure semicolon-separated `TEAM_WORKBENCH_ALLOWED_ORIGINS` and `TEAM_WORKBENCH_ALLOWED_ATTACHMENT_HOSTS`.

The helper enforces configured origins, Private Network preflight, HTTPS and allowlisted public attachment hosts, no redirects, approved MIME types, 10-file maximum, 25 MB per file and 50 MB total. It does not accept local paths and does not log body content, signed URLs or recipient data. Classic Outlook supports COM draft attachments; New Outlook generally does not and safely falls back.

Email Center shows Full Draft Integration or Fallback Mode before the final action. Fallback opens a `mailto:` draft with To/Subject/Body and warns before opening when attachments must be added manually.

## Security

- Compose requires an active HR user with Case access and `canComposeEmail`.
- The global Case selector is server-filtered to eligible Cases.
- Linked Tasks must be HR-owned explicit Email Tasks and pass Phase 2 Task authorization.
- IT/Admin operational Task access does not grant template, attachment or communication access.
- RLS protects templates, variables, communications, attachment metadata and Storage objects.
- Audit records attachment upload/link/removal metadata, never file content or email body.

## Validation status and limitations

The TypeScript build, lint, unit tests, clean PostgreSQL migration/integration suite and production web build are automated in this repository. The helper includes a validation self-test in `build.ps1`, but this development machine is macOS without the .NET SDK. The Windows-target build and mandatory Classic Outlook manual scenario have therefore **not** been executed here.

**Helper implemented; Windows Classic Outlook validation pending.**

On the target HR workstation: start the helper, confirm Full Integration, prepare an email with Template and Additional Attachments, open the visible draft, verify To/Subject/Body/files and that it was not sent, manually send, return to Team Workbench, Mark as Sent and confirm the linked Task completes. New Outlook must fall back without crashing. “Marked Sent” remains a user confirmation, not an Outlook delivery/read receipt.
