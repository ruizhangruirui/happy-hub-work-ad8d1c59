import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const VIEWER = "33333333-3333-3333-3333-333333333333";
const MANAGER_A = "44444444-4444-4444-4444-444444444444";
const MANAGER_B = "77777777-7777-7777-7777-777777777777";
const TEAM_A = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TEAM_B = "cccccccc-cccc-cccc-cccc-cccccccccccc";

let db: PGlite;

async function bootstrapSupabaseSchemas() {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema storage;
    create extension if not exists pgcrypto;

    create table auth.users (
      id uuid primary key,
      instance_id uuid,
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      aud text,
      role text,
      raw_app_meta_data jsonb default '{}',
      raw_user_meta_data jsonb default '{}',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table auth.identities (
      user_id uuid references auth.users(id),
      provider_id text,
      identity_data jsonb,
      provider text,
      last_sign_in_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text,
      name text,
      owner uuid,
      metadata jsonb
    );
    alter table storage.objects enable row level security;
  `);
}

async function applyMigrations() {
  const directory = resolve(process.cwd(), "supabase/migrations");
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(resolve(directory, file), "utf8"));
  }
}

async function asUser<T extends Record<string, unknown>>(
  userId: string,
  sql: string,
  params: unknown[] = [],
) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

async function seedManagerB() {
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data)
     values($1,'manager.b@example.test','{"name":"Manager B"}')`,
    [MANAGER_B],
  );
  await db.query("update public.profiles set status='Active' where id=$1", [MANAGER_B]);
  await db.query("delete from public.user_roles where user_id=$1", [MANAGER_B]);
  await db.query("insert into public.user_roles(user_id,role) values($1,'manager')", [MANAGER_B]);
  await db.query(
    "insert into public.user_scopes(user_id,scope_type,team_id) values($1,'team',$2)",
    [MANAGER_B, TEAM_B],
  );
}

async function createOnboarding(
  userId: string,
  teamId: string,
  suffix: string,
  existingPersonId: string | null = null,
  employeeId: string | null = `EMP-${suffix}`,
) {
  return asUser<{ result: { caseId: string; personId: string; employmentId: string } }>(
    userId,
    `select public.create_onboarding_case_v2(
      $1,$2,$3,null,$4,$5,'Employee',$6,'Engineer','Zurich','Supervisor',null,
      '2026-08-01',100,'Medium',null,false
    ) result`,
    [
      existingPersonId,
      `Given${suffix}`,
      `Family${suffix}`,
      `${suffix}@example.test`,
      employeeId,
      teamId,
    ],
  );
}

beforeAll(async () => {
  db = await PGlite.create(undefined, { extensions: { pgcrypto } });
  await bootstrapSupabaseSchemas();
  await applyMigrations();
  await seedManagerB();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("Phase 1 final closure — real PostgreSQL integration", () => {
  it("applies the complete migration history to a clean database", async () => {
    const result = await db.query<{ migration: string | null }>(
      "select to_regclass('public.employments')::text migration",
    );
    expect(result.rows[0]?.migration).toBe("employments");
  });

  it("lets a manager create/read/offboard within their team and rejects another team", async () => {
    const created = await createOnboarding(MANAGER_A, TEAM_A, "AUTH-A");
    const ids = created.rows[0]!.result;

    const linked = await db.query<{ person_id: string; employment_id: string }>(
      "select person_id,employment_id from public.cases where id=$1",
      [ids.caseId],
    );
    expect(linked.rows[0]).toEqual({ person_id: ids.personId, employment_id: ids.employmentId });

    await asUser(MANAGER_A, "select public.transition_lifecycle_case($1,true)", [ids.caseId]);

    const ownRead = await asUser<{ id: string }>(
      MANAGER_A,
      "select id from public.persons where id=$1",
      [ids.personId],
    );
    expect(ownRead.rows).toHaveLength(1);

    await expect(createOnboarding(MANAGER_A, TEAM_B, "AUTH-B")).rejects.toThrow();
    const otherRead = await asUser<{ id: string }>(
      MANAGER_B,
      "select id from public.persons where id=$1",
      [ids.personId],
    );
    expect(otherRead.rows).toHaveLength(0);
    const otherUpdate = await asUser(
      MANAGER_B,
      "update public.persons set phone='forbidden' where id=$1",
      [ids.personId],
    );
    expect(otherUpdate.affectedRows).toBe(0);

    const offboarding = await asUser<{ result: { personId: string; employmentId: string } }>(
      MANAGER_A,
      "select public.create_offboarding_case_v2($1,$2,'2026-08-20','Resignation',null,'Medium',null) result",
      [ids.personId, ids.employmentId],
    );
    expect(offboarding.rows[0]!.result).toMatchObject({
      personId: ids.personId,
      employmentId: ids.employmentId,
    });

    await expect(
      asUser(
        MANAGER_B,
        "select public.create_offboarding_case_v2($1,$2,'2026-08-20',null,null,'Medium',null)",
        [ids.personId, ids.employmentId],
      ),
    ).rejects.toThrow();
  });

  it("denies Viewer mutation and preserves Admin organization-wide access", async () => {
    await expect(createOnboarding(VIEWER, TEAM_A, "VIEWER")).rejects.toThrow();
    const seededEmployment = await db.query<{ id: string }>(
      "select id from public.employments where person_id='dddddddd-dddd-dddd-dddd-dddddddddddd' limit 1",
    );
    await expect(
      asUser(
        VIEWER,
        "select public.create_offboarding_case_v2($1,$2,'2026-09-01',null,null,'Medium',null)",
        ["dddddddd-dddd-dddd-dddd-dddddddddddd", seededEmployment.rows[0]!.id],
      ),
    ).rejects.toThrow();
    const personUpdate = await asUser(
      VIEWER,
      "update public.persons set phone='x' where id='dddddddd-dddd-dddd-dddd-dddddddddddd'",
    );
    const employmentUpdate = await asUser(VIEWER, "update public.employments set role_title='x'");
    expect(personUpdate.affectedRows).toBe(0);
    expect(employmentUpdate.affectedRows).toBe(0);

    const adminCreated = await createOnboarding(ADMIN, TEAM_B, "ADMIN");
    expect(adminCreated.rows[0]!.result.personId).toBeTruthy();
    const adminRead = await asUser<{ id: string }>(
      ADMIN,
      "select id from public.persons where id=$1",
      [adminCreated.rows[0]!.result.personId],
    );
    expect(adminRead.rows).toHaveLength(1);
  });

  it("bases operational Person access on current Employments, not ended team history", async () => {
    const personId = "17171717-1717-1717-1717-171717171717";
    await db.query(
      `insert into public.persons(id,first_name,last_name,full_name,display_name,email)
       values($1,'Multi','Employment','Multi Employment','Multi Employment','multi@example.test')`,
      [personId],
    );
    const employments = await db.query<{ id: string; team_id: string }>(
      `insert into public.employments(person_id,employment_type,team_id,start_date,end_date,status)
       values($1,'Intern',$2,'2024-01-01','2024-12-31','ended'),
             ($1,'Employee',$3,'2026-01-01',null,'active')
       returning id,team_id`,
      [personId, TEAM_A, TEAM_B],
    );
    const historicalEmployment = employments.rows.find((row) => row.team_id === TEAM_A)!;
    await db.query(
      `insert into public.cases(person_id,employment_id,case_type,employment_type,start_date,end_date,
        effective_date,owner_id,status,priority)
       values($1,$2,'Offboarding','Intern','2024-01-01','2024-12-31','2024-12-31',$3,'Confirmed','Medium')`,
      [personId, historicalEmployment.id, ADMIN],
    );

    const formerTeam = await asUser<{ id: string }>(
      MANAGER_A,
      "select id from public.persons where id=$1",
      [personId],
    );
    const currentTeam = await asUser<{ id: string }>(
      MANAGER_B,
      "select id from public.persons where id=$1",
      [personId],
    );
    expect(formerTeam.rows).toHaveLength(0);
    expect(currentTeam.rows).toHaveLength(1);
  });

  it("enforces one canonical Employee ID per Person and allows historical Employments", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "IDENTITY");
    const ids = created.rows[0]!.result;

    await expect(
      db.query(
        `insert into public.persons(first_name,last_name,full_name,employee_id)
         values('Other','Person','Other Person',' emp-identity ')`,
      ),
    ).rejects.toThrow();

    await db.query(
      `insert into public.employments(person_id,employment_type,employee_id,team_id,start_date,status)
       values($1,'Intern','emp-identity',$2,'2025-01-01','ended')`,
      [ids.personId, TEAM_A],
    );
    const employments = await db.query<{ count: number }>(
      "select count(*)::int count from public.employments where person_id=$1",
      [ids.personId],
    );
    expect(employments.rows[0]!.count).toBe(2);
  });

  it("reuses one Person for rehire and leaves historical Employment intact", async () => {
    const personId = "12121212-1212-1212-1212-121212121212";
    await db.query(
      `insert into public.persons(id,first_name,last_name,full_name,display_name,email,employee_id,team_id)
       values($1,'Re','Hire','Re Hire','Re Hire','rehire@example.test','REHIRE-1',$2)`,
      [personId, TEAM_A],
    );
    await db.query(
      `insert into public.employments(person_id,employment_type,employee_id,team_id,start_date,end_date,status)
       values($1,'Intern','REHIRE-1',$2,'2024-01-01','2024-12-31','ended')`,
      [personId, TEAM_A],
    );

    const rehire = await createOnboarding(ADMIN, TEAM_B, "REHIRE-NEW", personId, "REHIRE-1");
    expect(rehire.rows[0]!.result.personId).toBe(personId);
    const rows = await db.query<{ count: number }>(
      "select count(*)::int count from public.employments where person_id=$1",
      [personId],
    );
    expect(rows.rows[0]!.count).toBe(2);
  });

  it("redacts inaccessible strong matches and keeps name-only matches as warnings", async () => {
    const restrictedPerson = "13131313-1313-1313-1313-131313131313";
    await db.query(
      `insert into public.persons(id,first_name,last_name,full_name,display_name,email,employee_id,team_id)
       values($1,'Secret','Person','Secret Person','Secret Person','secret@example.test','SECRET-1',$2)`,
      [restrictedPerson, TEAM_B],
    );
    await db.query(
      `insert into public.employments(person_id,employment_type,employee_id,team_id,start_date,status)
       values($1,'Employee','SECRET-1',$2,'2026-01-01','active')`,
      [restrictedPerson, TEAM_B],
    );

    const match = await asUser<Record<string, unknown>>(
      MANAGER_A,
      "select * from public.find_onboarding_person_candidates(' secret-1 ',null,'Different Name',$1)",
      [TEAM_A],
    );
    expect(match.rows).toEqual([
      expect.objectContaining({
        person_id: null,
        display_name: "Existing employee record",
        accessible: false,
      }),
    ]);
    expect(JSON.stringify(match.rows)).not.toContain("Secret Person");
    expect(JSON.stringify(match.rows)).not.toContain(TEAM_B);

    await expect(
      asUser(
        MANAGER_A,
        `select public.create_onboarding_case_v2(
          null,'Other','Name',null,'secret@example.test',null,'Employee',$1,
          null,null,'Supervisor',null,'2026-09-01',null,'Medium',null,false
        )`,
        [TEAM_A],
      ),
    ).rejects.toThrow(/Contact HR\/Admin/);

    const weak = await asUser<Record<string, unknown>>(
      MANAGER_A,
      "select * from public.find_onboarding_person_candidates(null,null,'Peter Wang',$1)",
      [TEAM_A],
    );
    expect(weak.rows[0]).toMatchObject({
      match_strength: "warning",
      match_reason: "name",
      accessible: true,
    });
  });

  it("derives effective status from a fixed business date", async () => {
    const personId = "14141414-1414-1414-1414-141414141414";
    await db.query(
      "insert into public.persons(id,first_name,last_name,full_name,display_name) values($1,'Status','Test','Status Test','Status Test')",
      [personId],
    );
    const scenarios = [
      ["15151515-1515-1515-1515-151515151511", "2026-09-01", null, "active", "planned"],
      ["15151515-1515-1515-1515-151515151512", "2026-08-01", null, "active", "active"],
      ["15151515-1515-1515-1515-151515151513", "2026-01-01", "2026-09-01", "ending", "ending"],
      ["15151515-1515-1515-1515-151515151514", "2026-01-01", "2026-07-01", "ended", "ended"],
      ["15151515-1515-1515-1515-151515151515", "2026-01-01", null, "cancelled", "cancelled"],
    ] as const;
    for (const [id, start, end, stored, expected] of scenarios) {
      await db.query(
        `insert into public.employments(id,person_id,employment_type,start_date,end_date,status)
         values($1,$2,'Employee',$3,$4,$5)`,
        [id, personId, start, end, stored],
      );
      const status = await db.query<{ value: string }>(
        "select public.get_effective_employment_status($1,'2026-08-15') value",
        [id],
      );
      expect(status.rows[0]!.value).toBe(expected);
    }
  });

  it("keeps Former lifecycle ended when offboarding workflow is reopened", async () => {
    for (const [suffix, originalEnd] of [
      ["NULL", null],
      ["FIXED", "2026-08-31"],
    ] as const) {
      const created = await createOnboarding(ADMIN, TEAM_A, `REOPEN-${suffix}`);
      const ids = created.rows[0]!.result;
      await db.query("update public.cases set status='Confirmed' where id=$1", [ids.caseId]);
      await db.query("update public.employments set status='active',end_date=$2 where id=$1", [
        ids.employmentId,
        originalEnd,
      ]);
      const beforeOffboarding = await db.query<{ status: string }>(
        "select public.get_effective_employment_status($1,public.business_date()) status",
        [ids.employmentId],
      );
      expect(beforeOffboarding.rows[0]!.status).toMatch(/active|ending/);
      const visibleEmployment = await asUser<{ id: string; effective_status: string }>(
        ADMIN,
        "select id,effective_status from public.employment_effective where id=$1",
        [ids.employmentId],
      );
      expect(visibleEmployment.rows).toHaveLength(1);
      const offboarding = await asUser<{ result: { caseId: string } }>(
        ADMIN,
        "select public.create_offboarding_case_v2($1,$2,'2026-08-15','Resignation',null,'Medium',null) result",
        [ids.personId, ids.employmentId],
      );
      const offboardingId = offboarding.rows[0]!.result.caseId;

      await asUser(ADMIN, "select public.transition_lifecycle_case($1,true)", [offboardingId]);
      await asUser(ADMIN, "select public.transition_lifecycle_case($1,false)", [offboardingId]);
      const state = await db.query<{
        employment_status: string;
        case_status: string;
        left_at: string | null;
      }>(
        `select e.status employment_status,c.status case_status,c.left_at::text left_at from public.employments e join public.cases c on c.employment_id=e.id where c.id=$1`,
        [offboardingId],
      );
      expect(state.rows[0]!.employment_status).toBe("ended");
      expect(state.rows[0]!.case_status).toBe("Follow-up");
      expect(state.rows[0]!.left_at).not.toBeNull();
    }
  });

  it("reopens onboarding workflow without reversing Active lifecycle", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "ONBOARD-REOPEN");
    const ids = created.rows[0]!.result;
    await asUser(ADMIN, "select public.transition_lifecycle_case($1,true)", [ids.caseId]);
    await asUser(ADMIN, "select public.transition_lifecycle_case($1,false)", [ids.caseId]);
    const state = await db.query<{ case_status: string; employment_status: string }>(
      `select c.status case_status,e.status employment_status
       from public.cases c join public.employments e on e.id=c.employment_id where c.id=$1`,
      [ids.caseId],
    );
    expect(state.rows[0]).toEqual({ case_status: "Follow-up", employment_status: "active" });
  });

  it("enriches an onboarding Person with Employee ID without creating a duplicate", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "NO-ID", null, null);
    const ids = created.rows[0]!.result;
    await asUser(ADMIN, "select public.update_person_identity($1,' EMP-900 ',null,null)", [
      ids.personId,
    ]);
    const rows = await db.query<{ id: string; employee_id: string }>(
      "select id,employee_id from public.persons where id=$1",
      [ids.personId],
    );
    expect(rows.rows).toEqual([{ id: ids.personId, employee_id: "EMP-900" }]);
    const count = await db.query<{ count: number }>(
      "select count(*)::int count from public.persons where id=$1",
      [ids.personId],
    );
    expect(count.rows[0]!.count).toBe(1);
  });

  it("implements joined/left lifecycle immediately while retaining both historical cases", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "V1-LIFECYCLE");
    const ids = created.rows[0]!.result;
    let roster = await asUser<{ person_id: string }>(
      ADMIN,
      "select person_id from public.active_employee_roster where person_id=$1",
      [ids.personId],
    );
    expect(roster.rows).toHaveLength(0);
    await asUser(ADMIN, "select public.transition_lifecycle_case($1,true)", [ids.caseId]);
    roster = await asUser(
      ADMIN,
      "select person_id from public.active_employee_roster where person_id=$1",
      [ids.personId],
    );
    expect(roster.rows).toHaveLength(1);
    const off = await asUser<{ result: { caseId: string } }>(
      ADMIN,
      "select public.create_offboarding_case_v3($1,$2,'2026-12-31','2026-12-15','Voluntary Resignation',null,'Medium',null) result",
      [ids.personId, ids.employmentId],
    );
    roster = await asUser(
      ADMIN,
      "select person_id from public.active_employee_roster where person_id=$1",
      [ids.personId],
    );
    expect(roster.rows[0]).toMatchObject({ person_id: ids.personId });
    await asUser(ADMIN, "select public.transition_lifecycle_case($1,true)", [
      off.rows[0]!.result.caseId,
    ]);
    roster = await asUser(
      ADMIN,
      "select person_id from public.active_employee_roster where person_id=$1",
      [ids.personId],
    );
    expect(roster.rows).toHaveLength(0);
    const cases = await asUser<{ case_type: string }>(
      ADMIN,
      "select case_type from public.cases where person_id=$1",
      [ids.personId],
    );
    expect(cases.rows.map((x) => x.case_type).sort()).toEqual(["Offboarding", "Onboarding"]);
  });

  it("generates employment/leaving-specific team-owned tasks", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "V1-RULES");
    const ids = created.rows[0]!.result;
    await asUser(ADMIN, "select public.transition_lifecycle_case($1,true)", [ids.caseId]);
    const off = await asUser<{ result: { caseId: string } }>(
      ADMIN,
      "select public.create_offboarding_case_v3($1,$2,null,null,'Voluntary Resignation',null,'Medium',null) result",
      [ids.personId, ids.employmentId],
    );
    const tasks = await asUser<{ title: string; owner_team: string }>(
      ADMIN,
      "select title,owner_team from public.tasks where case_id=$1",
      [off.rows[0]!.result.caseId],
    );
    expect(tasks.rows.some((x) => x.title === "Leaving Agreement")).toBe(true);
    expect(tasks.rows.some((x) => x.title === "Termination Letter")).toBe(false);
    expect(tasks.rows.some((x) => x.title === "Garden Leave Letter")).toBe(false);
    expect(new Set(tasks.rows.map((x) => x.owner_team))).toEqual(new Set(["HR", "IT", "Admin"]));
  });
});
