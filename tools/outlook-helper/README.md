# Team Workbench Outlook Helper

Windows-only .NET 8 localhost service for Classic Outlook. It exposes only `GET /v1/health`, `OPTIONS`, and `POST /v1/drafts`. It creates a visible Outlook draft and never sends mail.

## Build and install

1. Install .NET 8 SDK for `build.ps1`; `publish.ps1` produces a self-contained `win-x64` executable for HR workstations.
2. Run `powershell -ExecutionPolicy Bypass -File .\build.ps1`.
3. Run `powershell -ExecutionPolicy Bypass -File .\publish.ps1`.
4. Run `install-startup.ps1` to create a per-user Startup shortcut and start the helper.
5. Open `http://127.0.0.1:17873/v1/health` from an allowed Team Workbench origin. Direct address-bar requests have no Origin and are intentionally rejected; use the Email Center indicator for the real check.

Configure semicolon-separated `TEAM_WORKBENCH_ALLOWED_ORIGINS` and `TEAM_WORKBENCH_ALLOWED_ATTACHMENT_HOSTS` environment variables before startup. The listener binds only to `127.0.0.1`. Attachment downloads require HTTPS, an allowed DNS host, a public resolved address, an approved MIME type, at most 10 files, 25 MB per file and 50 MB total. Redirects are disabled. Signed URLs, body content and personal data are not logged.

Classic Outlook COM is required for attachment automation. New Outlook normally reports unsupported; the web app then uses the attachment-free `mailto:` fallback. Windows Classic Outlook manual acceptance is still required on the target corporate workstation.

## Configuration

Set semicolon-separated values before startup when production differs from the defaults:

```powershell
$env:TEAM_WORKBENCH_ALLOWED_ORIGINS="https://your-approved-app.example"
$env:TEAM_WORKBENCH_ALLOWED_ATTACHMENT_HOSTS="your-project.supabase.co"
```

Do not place credentials, signed URLs or Supabase secrets in these settings. Re-run `install-startup.ps1` after publishing a new version.

## Health and troubleshooting

Open `http://127.0.0.1:17873/v1/health` on the workstation. Expected fields include helper `version`, `status`, detected Outlook mode and attachment support.

- Connection refused: start the helper and verify the per-user Startup shortcut.
- `origin_not_allowed`: add only the exact approved HTTPS app origin, then restart.
- `unsupported_outlook`: Classic Outlook COM is unavailable; use the web app fallback and add attachments manually.
- `attachment_host_not_allowed`: verify the signed URL host against the allowlist; do not allow arbitrary hosts.
- `attachment_too_large` or `attachment_type_not_allowed`: use one of the documented types/limits.

The helper logs operation categories and counts only. It must not log recipient, subject, body or signed attachment URLs.
