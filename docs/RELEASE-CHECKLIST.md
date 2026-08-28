# Team Workbench V1 Release Checklist

Release model: **Phase 5 — CODE COMPLETE / Team Workbench V1 — PILOT CANDIDATE**.

## Automated repository gates

- [x] Complete — TypeScript validation, 28 August 2026.
- [x] Complete — Repository-wide ESLint: all Git-tracked TS/TSX, 0 errors; 8 accepted Fast Refresh structure warnings.
- [x] Complete — Formatting: prettier --check .; format:check added; all matched files pass. Three pre-existing compact/generated files are explicitly ignored: generated Supabase types, the bilingual translation catalog and legacy Workbench CSS.
- [x] Complete — Unit + PostgreSQL integration suite, including Phase 1–5 regression.
- [x] Complete — Production Vite/Nitro/Cloudflare build.
- [x] Complete — Empty PostgreSQL applies every repository migration in filename order without manual SQL.
- [x] Complete — Populated Phase 1–4 fixture upgrades through Phase 5 with Person, Employment, Cases, Task status/completion, Checklist, Communication, template version, bound attachment and Audit evidence preserved.
- [x] Complete — Actual public-table inventory has RLS; no intentionally excluded public helper table.
- [x] Complete — Every public SECURITY DEFINER pins search_path; no unintended PUBLIC execute.
- [x] Complete — Direct authorization regression covers HR scope, functional IT/Administration, Viewer, Collaborator and user-administration bypass attempts.
- [x] Complete — Private Storage inventory, MIME/25 MB limits, forged/cross-scope read/delete and bound-retention tests.
- [x] Complete — Case and temporary attachment staged deletion preserves metadata across Storage/finalize failure boundaries.
- [x] Complete — People page 1/page 2/max 100/search/status/total/totalPages/stable sort/cross-scope search-count isolation.
- [x] Complete — 500 Person / 500 Employment / 200 Case / 1000+ Task synthetic smoke.
- [x] Complete — Phase 4 Team/Lab/All Organization/Viewer/Collaborator/IT/Administration reporting regression.
- [x] Complete — CSV/XLSX empty result and formula-injection safety tests.
- [x] Complete — Outlook helper static/unit audit proves localhost, allowlists, no redirects, limits, safe logging and no Send endpoint/operation.
- [x] Complete — Git/build secret-name and private-key-pattern audit; no tracked production credential value found. Client bundle contains no service-role environment variable/value.
- [x] Complete — Dependency audit executed 28 August 2026: Critical 0; High findings explicitly reviewed in [Security Review](SECURITY-REVIEW.md).
- [x] Complete — No automated P0/P1 defect is known.

## Controlled-pilot decisions and limitations

- [x] Complete — External feedback edge/IP rate limit: accepted for controlled pilot only; narrow distribution, high-entropy hashed recipient-bound expiring links. Unrestricted rollout remains prohibited.
- [x] Complete — Communication History initially loads the newest 100 records; older-history pagination is an accepted V1 pilot limitation.
- [x] Complete — Browser-generated exports may be limited by browser memory; monitor pilot use and avoid unbounded bulk exports.
- [x] Complete — Full attachment integration requires Classic Outlook; New Outlook uses attachment-free mailto fallback with a manual-attachment warning.
- [x] Complete — Abandoned attachment cleanup is an external daily service-role operation; no scheduler is claimed.
- [x] Complete — Dependency High findings are accepted only under the applicability and controlled-pilot constraints documented in Security Review.

## Environment and manual gates

- [ ] Pending — Production/Staging login and logout smoke; owner: release tester.
- [ ] Pending — Work, People, Case Detail, Email Center and Settings at 1440/1024/768; owner: release tester.
- [ ] Pending — Synthetic Onboarding and exactly-once generated Tasks; owner: HR pilot owner.
- [ ] Pending — HR, IT, Administration and Viewer test-user permission smoke; owner: System Admin.
- [ ] Pending — Email draft, no auto-send, signed attachment and export smoke; owner: HR pilot owner.
- [ ] Pending — Induced People/Operations/Active People network failure and Retry smoke; owner: release tester.
- [ ] Pending — Production variable presence/scope review without recording values; owner: deployment owner.
- [ ] Pending — Database backup enabled/retention/PITR evidence; owner: environment owner.
- [ ] Pending — case-files and email-attachments recovery plan/retention evidence; owner: environment owner.
- [ ] Pending — Isolated database + representative Storage restore drill; owner: environment owner.
- [ ] Pending — Maintenance Owner assigned for daily abandoned-attachment cleanup.
- [ ] Pending — Classic and New Outlook evidence in [Windows Acceptance](WINDOWS-ACCEPTANCE.md); owner: Windows pilot tester.
- [ ] Pending — Manual defect triage confirms P0 = 0 and P1 = 0; owner: release approver.

## Defect status

| Severity                                |                                         Automated count | Manual count | Status                                                 |
| --------------------------------------- | ------------------------------------------------------: | -----------: | ------------------------------------------------------ |
| P0 — security/data loss/system unusable |                                                       0 |          TBD | Manual gate pending                                    |
| P1 — critical workflow broken           |                                                       0 |          TBD | Manual gate pending                                    |
| P2 — significant/workaround exists      |                                                 0 known |          TBD | Monitor pilot                                          |
| P3 — cosmetic/minor                     | 8 Fast Refresh warnings + 3 ignored legacy-format files |          TBD | Accepted structural/generated debt; no runtime failure |

## Release Evidence

    Application commit: TBD — final closure commit not yet created
    Migration head: 20260829090000_phase5_production_hardening.sql
    Automated test date: 2026-08-28
    Staging smoke date: TBD
    Windows test date: TBD
    Restore drill date: TBD
    Dependency audit date: 2026-08-28
    Approved by: TBD

## Final status

Automated repository validation supports **PILOT CANDIDATE**. It does not support **PILOT READY** until every pending environment/manual gate above has actual evidence.
