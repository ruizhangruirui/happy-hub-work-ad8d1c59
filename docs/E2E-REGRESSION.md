# E2E and Authorization Regression Matrix

## Critical lifecycle scenarios

1. `Create Onboarding → generated HR/IT/Administration Tasks → IT/Admin updates → Welcome Email draft → Mark Sent → Confirm Joined → Active People → follow-up → Completed`.
2. `Active Person → Create Offboarding → remains Active/Leaving → HR/IT/Administration Tasks → Confirm Left → removed from Active People → post-work → Completed`.
3. `Template → variables → template/additional attachment → Classic Outlook display draft → manual Send → Mark Sent → linked Email Task Completed`.

For each step verify UI state, refreshed related queries, audit event and direct database authorization.

## Authorization actors

Run each applicable read/mutation as:

- System Admin + HR
- Operator + HR
- Manager + HR in scope
- IT functional user
- Administration functional user
- Viewer
- generic Case Collaborator
- unrelated scoped Manager

Expected negative cases include Viewer lifecycle mutation, Collaborator HR mutation, IT/Administration cross-team Task mutation, unrelated Manager Person/Case access and any bound attachment deletion.

## Direct API matrix

- Query/update every business table directly; RLS result must match the Permission Matrix.
- Invoke every exposed RPC with wrong actor, wrong Case/Task/Employment ID and cross-Team IDs.
- Attempt direct Storage read/upload/delete with unauthorized path and forged path prefix.
- Confirm profile directory omits email/System Role/Data Scope.
- Confirm export rows/columns are exactly the authorized server DTO currently displayed.

Automated PostgreSQL tests cover the core matrix. Browser and Windows steps remain release acceptance activities.

## Validation status

| Scenario                                                         | Automated                   | Manual browser                     | Manual Windows                        |
| ---------------------------------------------------------------- | --------------------------- | ---------------------------------- | ------------------------------------- |
| Fresh migration replay and Phase 1–5 regression                  | PASS                        | N/A                                | N/A                                   |
| Existing Phase 1–4 data upgraded and preserved                   | PASS                        | N/A                                | N/A                                   |
| HR lifecycle and roster transitions                              | PASS                        | Pending environment smoke          | N/A                                   |
| HR/IT/Administration/Viewer authorization                        | PASS, direct PostgreSQL/RPC | Pending test-user smoke            | N/A                                   |
| Reporting Team/Lab/All Organization isolation                    | PASS                        | Pending environment smoke          | N/A                                   |
| People pagination/search/cross-scope count isolation             | PASS                        | Pending 1440/1024/768 smoke        | N/A                                   |
| Private Storage forged/cross-scope/bound deletion attacks        | PASS                        | Pending signed-download smoke      | N/A                                   |
| Case/temporary file request → Storage → finalize recovery states | PASS at database boundary   | Pending induced network failure    | N/A                                   |
| Application error boundary and People/Operations/Roster Retry    | Source/build verified       | Pending induced browser failure    | N/A                                   |
| Modal focus trap and keyboard People rows                        | Source/build verified       | Pending keyboard smoke             | N/A                                   |
| CSV/XLSX authorization, Unicode, dates, empty and formula safety | Unit/service tests PASS     | Pending downloaded-file inspection | N/A                                   |
| Outlook helper localhost/no-Send/allowlists/limits/logging       | Static/unit PASS            | Fallback pending                   | Pending Classic/New Outlook checklist |

“Automated PASS” does not replace the Manual browser or Manual Windows column. A scenario is not fully release-validated until every applicable column is complete.
