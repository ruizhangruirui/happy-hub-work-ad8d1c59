# Permission Matrix

Team Workbench authorization has three independent dimensions. Never infer one from another.

| Dimension       | Values                                      | Purpose                                          |
| --------------- | ------------------------------------------- | ------------------------------------------------ |
| System Role     | Admin, Operator, Manager, Viewer            | Administrative and HR mutation authority         |
| Functional Team | HR, IT, Administration (`Admin` DB code)    | Operational Task ownership                       |
| Data Scope      | All Organization, Lab, Team, Assigned Cases | Which Person/Employment/Case records are visible |

## Business operations

`In scope` below means the caller's Data Scope or explicit assignment covers the record. A shared Case never grants lifecycle or HR-data authority by itself.

| Action                                   | System Role                         | Functional Team | Data Scope                         |
| ---------------------------------------- | ----------------------------------- | --------------- | ---------------------------------- |
| View Person HR data                      | Admin/Operator/Manager              | HR              | In scope                           |
| Create Onboarding                        | Admin/Operator/Manager              | HR              | Target Team manageable             |
| Create Offboarding                       | Admin/Operator/Manager              | HR              | Employment manageable              |
| Edit Person identity                     | Admin/Operator/Manager              | HR              | Person manageable                  |
| Confirm Joined / Left                    | Admin/Operator/Manager              | HR              | Case manageable                    |
| Create/delete HR Task                    | Admin/Operator/Manager              | HR              | Case manageable                    |
| Update HR Task                           | Authorized HR or assigned owner     | HR              | Task/Case authorized               |
| Update IT Task                           | Assigned owner or functional member | IT              | Task owner team is IT              |
| Update Administration Task               | Assigned owner or functional member | Administration  | Task owner team is `Admin`         |
| Manage Checklist rules                   | Admin, or authorized HR manager     | HR              | Organization configuration         |
| Compose Case email                       | Admin/Operator/Manager              | HR              | Case manageable                    |
| Manage Email Templates                   | Admin/Operator/Manager              | HR              | Organization configuration         |
| Share Case                               | Authorized HR Case manager          | HR              | Case manageable                    |
| Confirm lifecycle as Viewer/Collaborator | **Never**                           | Any             | Sharing does not elevate authority |
| Export                                   | Same as source UI/RPC               | Same as source  | Same filtered server response      |

## Settings

- **System Role** controls system administration and HR-level mutation.
- **Functional Team** controls operational Task access. UI displays `Administration`; the stable DB code remains `Admin`.
- **Data Scope** controls record visibility and remains independent of Task ownership.
- Only System Admin may change another user's role, functional-team membership, scope or activation status.
