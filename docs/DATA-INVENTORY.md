# Technical Data Inventory

This is a technical inventory for later privacy/security review. It is not a legal compliance statement.

| Category                | Examples                                                                               | Primary storage                              | Retention behavior                                                         |
| ----------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| User identity/access    | name, work email, title, activation, System Role, Functional Team, Data Scope          | Supabase Auth, profiles and access tables    | Admin-managed account lifecycle                                            |
| Person identity/contact | legal/preferred name, personal/company email, phone, employee ID                       | persons, employments                         | Person retained for employment history unless separately archived          |
| Employment              | type, Team/Lab, title, location, supervisor, dates, workload, contract type            | employments                                  | Historical Employments retained                                            |
| Lifecycle               | Onboarding/Offboarding Case, status, Start/Contract End/Last Working/Joined/Left dates | cases                                        | Historical Cases retained                                                  |
| Operational work        | checklist rules, Tasks, assignment, comments, due/status/completion                    | task/checklist/workflow tables               | Retained with Case history                                                 |
| Collaboration           | Case sharing, external recipient/request/response                                      | case members and external requests           | Token hash and request history retained until policy is defined            |
| Documents               | Case, Task and email attachment objects plus metadata                                  | private Supabase Storage and metadata tables | Temporary compose objects expire; bound communication evidence is retained |
| Communication metadata  | recipient, rendered subject, template/version, draft/opened/marked-sent timestamps     | email_communications                         | Retained as Communication History; full body is not stored there           |
| Audit metadata          | actor, action, entity, field transition, time                                          | audit_logs                                   | Minimal mutation history; no reads or file content logged                  |

Production HR data must not be copied into Development/Test casually. Use synthetic fixtures for automated tests and demos.
