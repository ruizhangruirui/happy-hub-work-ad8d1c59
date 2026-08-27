# Phase 1 Final Closure

## Canonical identity

`persons.employee_id` is the authoritative durable employee identifier. Values are trimmed, empty values become `NULL`, and alphanumeric IDs are normalized to uppercase. A normalized partial unique index prevents one employee ID from belonging to two Persons.

`employments.employee_id` remains only as a compatibility projection. Database triggers derive it from the related Person, reject conflicting direct writes, and synchronize it when the Person identifier changes.

## Person authorization

Person access is derived in PostgreSQL, not from client-side filtering:

- **Admin / Operator:** organization-wide Person access and management while active.
- **Manager:** operational read/manage access through a planned, active, or ending Employment in the Manager's assigned organization scope.
- **Viewer:** read access through assigned organization scope or a directly shared Case; no Person or Employment mutation.
- **Direct Case sharing:** grants read access to the linked Person and that Case's Employment only. It does not expose unrelated Employment or lifecycle history.

Ended historical Employments do not permanently grant operational Person access. If a Person has an ended Team A Employment and a current Team B Employment, Team B scope controls current operational visibility. Historical Case access remains independently governed by Case permissions.

Managers create Persons through the scoped onboarding RPC. Direct Person insertion is limited to active Admins and Operators, and all Person updates are checked by `can_manage_person` at the RLS boundary.

## Cross-team rehire

Employee ID and canonical email are strong identity matches. An authorized caller can explicitly reuse the existing Person. An unauthorized caller receives only a redacted message that a matching record exists and must contact HR/Admin. No prior team, title, dates, manager, or history is returned, and the onboarding RPC blocks creating a duplicate.

Name-only matches are warnings. They are never merged automatically and an authorized caller may create a separate Person.

## Reversible lifecycle transitions

When an Offboarding Case is confirmed, the Case stores both the Employment's previous `end_date` and a snapshot-captured flag. Reopen restores the exact prior value, including `NULL`. Each new confirm refreshes the snapshot, so repeated confirm/reopen cycles remain reversible without parsing audit text.

Effective status is derived using the Zurich business date and a fixed `_as_of` date can be supplied in tests.

## Integration tests

`src/lib/phase1-final.integration.test.ts` boots an isolated in-memory PostgreSQL database with PGlite, applies the complete migration history, creates authenticated roles/scopes, and calls RLS/RPC paths directly. It never connects to production.

Run it with:

```sh
pnpm test:integration
```

