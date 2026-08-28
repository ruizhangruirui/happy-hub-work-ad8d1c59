# V1 Production Release Checklist

## Automated release gate

- [x] Full migration history applies to a fresh PostgreSQL database
- [x] RLS enabled on all business tables
- [x] SECURITY DEFINER search paths and execution grants audited
- [x] Phase 1–5 unit/PostgreSQL regression suite passes
- [x] TypeScript and production build pass
- [x] Phase 5 changed-file ESLint check has zero errors
- [x] Private Storage, MIME/size and governed deletion implemented
- [x] Bound Additional Attachment retention tested
- [x] Server-side People pagination implemented
- [x] Export formula-injection protection tested
- [x] No automatic Outlook Send capability

## Per-environment smoke

- [ ] Login and logout
- [ ] Open Work and People
- [ ] Create synthetic Onboarding; generated Tasks appear once
- [ ] Verify HR/IT/Administration permissions with test users
- [ ] Prepare Email template/draft without sending automatically
- [ ] Export current authorized view and inspect columns
- [ ] Confirm error/retry behavior by simulating a network failure
- [ ] Verify private signed attachment download

## Operational evidence

- [ ] Repository-wide legacy ESLint/Prettier backlog cleared or formally accepted
- [ ] Dependency vulnerability audit captured in an environment with Bun/npm tooling
- [ ] Production environment variables reviewed without copying values
- [ ] Production backup configured
- [ ] Isolated restore drill completed
- [ ] Abandoned attachment maintenance job/runbook assigned to an owner
- [ ] External-link edge rate limit decision recorded
- [ ] Classic/New Outlook checklist completed ([Windows Acceptance](WINDOWS-ACCEPTANCE.md))
- [ ] No open P0/P1 defect

Until all unchecked Production/Windows evidence is complete, label the build **V1 pilot candidate**, not “full Outlook validated” or “PILOT READY”.
