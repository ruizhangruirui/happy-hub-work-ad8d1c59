# Team Workbench Phase 3 — Email Center V2

## Architecture

All entry points use the single `/email` Compose route (`/email-center` remains a compatibility redirect). UI state is assembled into one Compose model and passed through deterministic modules:

`Compose UI → email-compose variable/recipient service → attachment storage → outlookDraftService → audit RPC`

The Case Detail and Email Task routes preselect Case and Task. Templates remain configuration rather than React business rules. Phase 1 lifecycle and Phase 2 checklist behavior are unchanged.

## Templates and variables

`email_templates` stores category, status, subject/body, recipient source, applicable Case types, version and archive/publish metadata. Published templates are normally offered in Compose; Draft and Archived records remain visible to template managers. `email_template_variables` holds template-only manual definitions. `email_variable_library` is the active global library with stable lowercase snake_case keys and deterministic source metadata.

The shared resolver scans Subject and Body, resolves Person/Employment/Onboarding/Offboarding values, formats dates by UI locale, applies manual/default values, reports missing required fields and removes empty optional tokens. Publishing validates every token against the global or template-specific definitions. Editing increments the template version; communication history stores the version and rendered subject.

## Recipients

Templates explicitly select Personal Email, Company Email or Manual. Compose displays the selected address and permits a session-only override. It never silently falls back from company to personal email and never writes an override back to the Person profile.

## Attachments

Template attachment metadata is stored in `email_template_attachments`. One-off Case communication files use `email_additional_attachments`. Binary data is stored privately in the dedicated `email-attachments` Supabase Storage bucket with a 25 MB limit and an allowlist for PDF, DOCX, XLSX, PNG and JPEG. Storage paths use generated IDs and sanitized filenames. Short-lived signed URLs are produced only when preparing the local Outlook payload.

Template managers may add/remove reusable files. Authorized HR composers may add/remove Case-scoped one-off files. IT/Admin operational Task access alone does not grant HR attachment access. Files are never public.

## Outlook integration and fallback

`outlookDraftService.openDraft` first calls the optional localhost-only helper at `127.0.0.1:17873`. Its constrained payload contains To, Subject, Body and short-lived attachment URLs. The helper is expected to create and display a draft in Windows Outlook; it must never send automatically or expose arbitrary command execution.

If the helper is unavailable, the service opens a `mailto:` draft containing To, Subject and plain-text Body. Attachments cannot be reliably added through `mailto:`, so the UI warns the user before/after fallback and never reports them as included. Classic Outlook and New Outlook automation differ; full attachment integration therefore remains dependent on a compatible local helper installation.

## Task and communication history

Preparing a draft creates `Draft Prepared`. Opening Outlook records `Opened in Outlook` but does not complete the Task. Only the explicit **Mark as Sent** confirmation records `Marked Sent` and calls the existing authoritative Task status path. History stores Case/Task/template ID, template version, recipient, rendered subject, actor and timestamps—not the potentially sensitive email body. “Marked as sent” is not a delivery or read receipt.

## Security

- Compose requires an active HR user with Case access.
- Template/variable management requires an authorized HR Admin/Operator.
- HR email Tasks still use Task-level authorization; IT/Admin cannot bypass it through Email Center.
- RLS protects templates, variables, communication history, metadata and private storage objects.
- File type/size/path validation blocks executable and uncontrolled filenames.
- No service-role secret is exposed to the browser or localhost helper.
- Team Workbench never automatically sends email in Phase 3.

## Known limitations

The browser cannot attach files through `mailto:`. Full attachment automation requires the separately installed compatible localhost Outlook helper. The app records user-confirmed “Marked as sent,” not Outlook delivery/read confirmation. Additional attachment cleanup occurs when the user removes a file; future scheduled orphan cleanup can be added without changing the Compose model.
