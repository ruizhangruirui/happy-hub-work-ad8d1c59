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
