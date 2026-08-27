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
