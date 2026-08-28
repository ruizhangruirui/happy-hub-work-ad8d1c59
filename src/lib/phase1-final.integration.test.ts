import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const VIEWER = "33333333-3333-3333-3333-333333333333";
const MANAGER_A = "44444444-4444-4444-4444-444444444444";
const MANAGER_B = "77777777-7777-7777-7777-777777777777";
const IT_USER = "88888888-8888-8888-8888-888888888888";
const IT_USER_B = "12121212-1212-1212-1212-121212121212";
const ADMIN_TEAM_USER = "99999999-9999-9999-9999-999999999999";
const HR_LAB_USER = "abababab-abab-abab-abab-abababababab";
const TEAM_A = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TEAM_B = "cccccccc-cccc-cccc-cccc-cccccccccccc";

let db: PGlite;

async function bootstrapSupabaseSchemas(target = db) {
  await target.exec(`
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
    create table storage.buckets (
      id text primary key,name text not null,public boolean default false,file_size_limit bigint,
      allowed_mime_types text[]
    );
    create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
      select string_to_array(name,'/')
    $$;
    alter table storage.objects enable row level security;
  `);
}

async function applyMigrations(target = db, include: (filename: string) => boolean = () => true) {
  const directory = resolve(process.cwd(), "supabase/migrations");
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql") && include(name))
    .sort()) {
    await target.exec(readFileSync(resolve(directory, file), "utf8"));
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
  await db.query("insert into public.user_operational_teams(user_id,owner_team) values($1,'HR')", [
    MANAGER_B,
  ]);
}

async function seedFunctionalUser(id: string, email: string, ownerTeam: "IT" | "Admin") {
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data)
     values($1,$2::text,jsonb_build_object('name',$2::text))`,
    [id, email],
  );
  await db.query("update public.profiles set status='Active' where id=$1", [id]);
  await db.query("delete from public.user_roles where user_id=$1", [id]);
  await db.query("insert into public.user_roles(user_id,role) values($1,'viewer')", [id]);
  await db.query("insert into public.user_operational_teams(user_id,owner_team) values($1,$2)", [
    id,
    ownerTeam,
  ]);
}

async function createOnboarding(
  userId: string,
  teamId: string,
  suffix: string,
  existingPersonId: string | null = null,
  employeeId: string | null = `EMP-${suffix}`,
  employmentType = "Employee",
) {
  return asUser<{ result: { caseId: string; personId: string; employmentId: string } }>(
    userId,
    `select public.create_onboarding_case_v2(
      $1,$2,$3,null,$4,$5,$6,$7,'Engineer','Zurich','Supervisor',null,
      '2026-08-01',100,'Medium',null,false
    ) result`,
    [
      existingPersonId,
      `Given${suffix}`,
      `Family${suffix}`,
      `${suffix}@example.test`,
      employeeId,
      employmentType,
      teamId,
    ],
  );
}

type OperationsReport = {
  reportingMode: "hr" | "operational";
  metrics: {
    activePeople: number;
    preboarding: number;
    leaving: number;
    joinedYtd: number;
    leftYtd: number;
    openMandatoryTasks: number;
    overdueMandatoryTasks: number;
  };
  activePeople: Array<{ caseId: string; team: string }>;
  upcomingJoiners: Array<{ caseId: string }>;
  upcomingLeavers: Array<{
    caseId: string;
    lastWorkingDay: string | null;
    contractEndDate: string | null;
  }>;
  attentionCases: Array<{
    caseId: string;
    taskId: string | null;
    severity: string;
    reason: string;
  }>;
  taskWorkload: Array<{
    ownerTeam: string;
    open: number;
    overdue: number;
    dueSoon: number;
    unassigned: number;
  }>;
  activeByTeam: Array<{ name: string; value: number }>;
  monthlyLifecycleTrend: Array<{ joined: number; left: number }>;
  tasks: Array<{ id: string; caseId: string; ownerTeam: string; status: string }>;
};

async function operationsReport(userId: string, args: unknown[] = []) {
  const placeholders = args.length ? "$1,$2,$3,$4,$5,$6" : "";
  return (
    await asUser<{ report: OperationsReport }>(
      userId,
      `select public.get_operations_overview(${placeholders}) report`,
      args,
    )
  ).rows[0]!.report;
}

beforeAll(async () => {
  db = await PGlite.create(undefined, { extensions: { pgcrypto } });
  await bootstrapSupabaseSchemas();
  await applyMigrations();
  await seedManagerB();
  await seedFunctionalUser(IT_USER, "it@example.test", "IT");
  await seedFunctionalUser(IT_USER_B, "it.b@example.test", "IT");
  await seedFunctionalUser(ADMIN_TEAM_USER, "admin.team@example.test", "Admin");
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
      "select public.create_offboarding_case_v3($1,$2,'2026-09-30',null,'Voluntary Resignation',null,'Medium',null) result",
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

  it("requires Contract End Date while keeping Last Working Day independently nullable", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "DATE-MODEL");
    const ids = created.rows[0]!.result;
    await asUser(ADMIN, "select public.confirm_joined($1,null)", [ids.caseId]);
    await expect(
      asUser(
        ADMIN,
        "select public.create_offboarding_case_v3($1,$2,null,null,'Voluntary Resignation',null,'Medium',null)",
        [ids.personId, ids.employmentId],
      ),
    ).rejects.toThrow(/Contract End Date is required/);
    const off = await asUser<{ result: { caseId: string } }>(
      ADMIN,
      "select public.create_offboarding_case_v3($1,$2,'2026-09-30',null,'Voluntary Resignation',null,'Medium',null) result",
      [ids.personId, ids.employmentId],
    );
    let dates = await db.query<{
      contract_end_date: string;
      last_working_day: string | null;
      effective_date: string;
    }>(
      "select contract_end_date::text,last_working_day::text,effective_date::text from public.cases where id=$1",
      [off.rows[0]!.result.caseId],
    );
    expect(dates.rows[0]).toEqual({
      contract_end_date: "2026-09-30",
      last_working_day: null,
      effective_date: "2026-09-30",
    });
    await asUser(ADMIN, "select public.update_offboarding_dates($1,'2026-09-30','2026-09-15')", [
      off.rows[0]!.result.caseId,
    ]);
    dates = await db.query(
      "select contract_end_date::text,last_working_day::text,effective_date::text from public.cases where id=$1",
      [off.rows[0]!.result.caseId],
    );
    expect(dates.rows[0]).toEqual({
      contract_end_date: "2026-09-30",
      last_working_day: "2026-09-15",
      effective_date: "2026-09-30",
    });
  });
});

describe("Phase 2 checklist collaboration — real PostgreSQL integration", () => {
  it("generates HR, IT and Admin onboarding rules idempotently", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P2-ONB");
    const caseId = created.rows[0]!.result.caseId;
    const first = await db.query<{ owner_team: string; count: number }>(
      `select owner_team,count(*)::int count from public.tasks
       where case_id=$1 and source='template' group by owner_team order by owner_team`,
      [caseId],
    );
    expect(new Set(first.rows.map((row) => row.owner_team))).toEqual(
      new Set(["HR", "IT", "Admin"]),
    );
    const before = first.rows.reduce((total, row) => total + row.count, 0);
    await asUser(ADMIN, "select public.sync_case_tasks($1,'test')", [caseId]);
    await asUser(ADMIN, "select public.sync_case_tasks($1,'test again')", [caseId]);
    const after = await db.query<{ count: number }>(
      "select count(*)::int count from public.tasks where case_id=$1 and source='template'",
      [caseId],
    );
    expect(after.rows[0]!.count).toBe(before);
  });

  it.each([
    ["Employee", "Voluntary Resignation", true, false, false],
    ["Employee", "Employer Termination", true, true, true],
    ["Intern", "Voluntary Resignation", false, false, false],
    ["Leased Labour", "Employer Termination", false, false, false],
  ])(
    "applies the offboarding document matrix for %s / %s",
    async (employmentType, leavingType, agreement, termination, garden) => {
      const suffix = `${employmentType}-${leavingType}`.replaceAll(" ", "-");
      const created = await createOnboarding(
        ADMIN,
        TEAM_A,
        suffix,
        null,
        `EMP-${suffix}`,
        employmentType,
      );
      const ids = created.rows[0]!.result;
      await asUser(ADMIN, "select public.confirm_joined($1,null)", [ids.caseId]);
      const off = await asUser<{ result: { caseId: string } }>(
        ADMIN,
        "select public.create_offboarding_case_v3($1,$2,'2026-11-30',null,$3,null,'Medium',null) result",
        [ids.personId, ids.employmentId, leavingType],
      );
      const titles = await db.query<{ title: string }>(
        "select title from public.tasks where case_id=$1",
        [off.rows[0]!.result.caseId],
      );
      const has = (title: string) => titles.rows.some((row) => row.title === title);
      expect(has("Leaving Agreement")).toBe(agreement);
      expect(has("Termination Letter")).toBe(termination);
      expect(has("Garden Leave Letter")).toBe(garden);
      expect(has("Account Closure")).toBe(true);
      expect(has("Badge Return")).toBe(true);
    },
  );

  it("creates LWD-dependent work unscheduled and recalculates only open due dates", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P2-LWD");
    const ids = created.rows[0]!.result;
    await asUser(ADMIN, "select public.confirm_joined($1,null)", [ids.caseId]);
    const off = await asUser<{ result: { caseId: string } }>(
      ADMIN,
      "select public.create_offboarding_case_v3($1,$2,'2026-12-31',null,'Voluntary Resignation',null,'Medium',null) result",
      [ids.personId, ids.employmentId],
    );
    const caseId = off.rows[0]!.result.caseId;
    let accessTask = await db.query<{ id: string; due_date: string | null }>(
      "select id,due_date::text from public.tasks where case_id=$1 and title='Access Closure / Revocation'",
      [caseId],
    );
    expect(accessTask.rows[0]!.due_date).toBeNull();
    await asUser(ADMIN, "select public.update_offboarding_dates($1,'2026-12-31','2026-09-15')", [
      caseId,
    ]);
    accessTask = await db.query(
      "select id,due_date::text from public.tasks where case_id=$1 and title='Access Closure / Revocation'",
      [caseId],
    );
    expect(accessTask.rows[0]!.due_date).toBe("2026-09-15");
    await asUser(IT_USER, "select public.set_task_status($1,'Completed',null)", [
      accessTask.rows[0]!.id,
    ]);
    await asUser(ADMIN, "select public.update_offboarding_dates($1,'2026-12-31','2026-09-20')", [
      caseId,
    ]);
    const completed = await db.query<{ due_date: string; completed_by: string }>(
      "select due_date::text,completed_by::text from public.tasks where id=$1",
      [accessTask.rows[0]!.id],
    );
    expect(completed.rows[0]).toEqual({ due_date: "2026-09-15", completed_by: IT_USER });
  });

  it("enforces IT and Admin task scope and denies lifecycle confirmation", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P2-RLS");
    const caseId = created.rows[0]!.result.caseId;
    const tasks = await db.query<{ id: string; owner_team: string }>(
      "select id,owner_team from public.tasks where case_id=$1",
      [caseId],
    );
    const task = (team: string) => tasks.rows.find((row) => row.owner_team === team)!.id;
    const itVisible = await asUser<{ owner_team: string }>(
      IT_USER,
      "select owner_team from public.list_operational_tasks($1)",
      [caseId],
    );
    expect(new Set(itVisible.rows.map((row) => row.owner_team))).toEqual(new Set(["IT"]));
    await expect(
      asUser(IT_USER, "update public.tasks set title='bypass' where id=$1", [task("IT")]),
    ).rejects.toThrow();
    await asUser(IT_USER, "select public.set_task_status($1,'In Progress',null)", [task("IT")]);
    await expect(
      asUser(IT_USER, "select public.set_task_status($1,'Completed',null)", [task("HR")]),
    ).rejects.toThrow();
    await expect(
      asUser(IT_USER, "select public.set_task_status($1,'Completed',null)", [task("Admin")]),
    ).rejects.toThrow();
    await expect(
      asUser(IT_USER, "select public.confirm_joined($1,null)", [caseId]),
    ).rejects.toThrow();

    await asUser(ADMIN_TEAM_USER, "select public.set_task_status($1,'In Progress',null)", [
      task("Admin"),
    ]);
    await expect(
      asUser(ADMIN_TEAM_USER, "select public.set_task_status($1,'Completed',null)", [task("IT")]),
    ).rejects.toThrow();
    await expect(
      asUser(ADMIN_TEAM_USER, "select public.confirm_joined($1,null)", [caseId]),
    ).rejects.toThrow();
  });

  it("keeps lifecycle independent while mandatory tasks gate Case completion", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P2-MANDATORY");
    const ids = created.rows[0]!.result;
    await asUser(ADMIN, "select public.confirm_joined($1,null)", [ids.caseId]);
    const state = await db.query<{ status: string }>(
      "select status from public.employments where id=$1",
      [ids.employmentId],
    );
    expect(state.rows[0]!.status).toBe("active");
    await expect(
      asUser(ADMIN, "update public.cases set status='Completed' where id=$1", [ids.caseId]),
    ).rejects.toThrow(/Mandatory tasks/);
    const mandatory = await db.query<{ id: string }>(
      "select id from public.tasks where case_id=$1 and mandatory and status not in ('Completed','Not Applicable')",
      [ids.caseId],
    );
    for (const row of mandatory.rows) {
      await asUser(ADMIN, "select public.set_task_status($1,'Completed',null)", [row.id]);
    }
    const finalCase = await db.query<{ status: string }>(
      "select status from public.cases where id=$1",
      [ids.caseId],
    );
    expect(finalCase.rows[0]!.status).toBe("Completed");
  });
});

describe("Phase 2 closure — capability and Checklist consistency", () => {
  it("does not let Case sharing grant HR or cross-team mutation rights", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P2-CLOSE-SHARE");
    const ids = created.rows[0]!.result;
    await asUser(ADMIN, "select public.confirm_joined($1,null)", [ids.caseId]);
    const offboarding = await asUser<{ result: { caseId: string } }>(
      ADMIN,
      "select public.create_offboarding_case_v3($1,$2,'2026-12-31',null,'Voluntary Resignation',null,'Medium',null) result",
      [ids.personId, ids.employmentId],
    );
    const caseId = offboarding.rows[0]!.result.caseId;
    for (const [userId, level] of [
      [IT_USER, "collaborator"],
      [ADMIN_TEAM_USER, "collaborator"],
      [VIEWER, "viewer"],
    ] as const) {
      await asUser(
        ADMIN,
        "insert into public.case_members(case_id,user_id,access_level,created_by) values($1,$2,$3,$4)",
        [caseId, userId, level, ADMIN],
      );
      const capabilities = await asUser<{ capabilities: Record<string, boolean> }>(
        userId,
        "select public.get_case_capabilities($1) capabilities",
        [caseId],
      );
      expect(capabilities.rows[0]!.capabilities["canManageCase"]).toBe(false);
      expect(capabilities.rows[0]!.capabilities["canConfirmLifecycle"]).toBe(false);
      expect(capabilities.rows[0]!.capabilities["canManageTaskStructure"]).toBe(false);
    }

    const tasks = await db.query<{ id: string; owner_team: string }>(
      "select id,owner_team from public.tasks where case_id=$1",
      [caseId],
    );
    const task = (team: string) => tasks.rows.find((row) => row.owner_team === team)!.id;
    await asUser(IT_USER, "select public.set_task_status($1,'In Progress',null)", [task("IT")]);
    await expect(
      asUser(IT_USER, "select public.set_task_status($1,'Completed',null)", [task("HR")]),
    ).rejects.toThrow();
    await expect(
      asUser(IT_USER, "select public.set_task_status($1,'Completed',null)", [task("Admin")]),
    ).rejects.toThrow();
    await asUser(ADMIN_TEAM_USER, "select public.set_task_status($1,'In Progress',null)", [
      task("Admin"),
    ]);
    await expect(
      asUser(ADMIN_TEAM_USER, "select public.set_task_status($1,'Completed',null)", [task("IT")]),
    ).rejects.toThrow();
    await expect(
      asUser(IT_USER, "select public.confirm_left($1,null)", [caseId]),
    ).rejects.toThrow();
    await expect(
      asUser(IT_USER, "select public.update_offboarding_dates($1,'2027-01-31',null)", [caseId]),
    ).rejects.toThrow();
    await expect(
      asUser(IT_USER, "select public.sync_case_tasks($1,'collaborator bypass')", [caseId]),
    ).rejects.toThrow();
    const workflowItem = await db.query<{ id: string }>(
      "select id from public.case_workflow_items where case_id=$1 limit 1",
      [ids.caseId],
    );
    const workflowBypass = await asUser(
      IT_USER,
      "update public.case_workflow_items set status='Completed' where id=$1",
      [workflowItem.rows[0]!.id],
    );
    expect(workflowBypass.rowCount).toBe(0);
    await expect(
      asUser(
        IT_USER,
        "select public.create_manual_task($1,'Bypass',null,'IT',null,true,null,'Medium')",
        [caseId],
      ),
    ).rejects.toThrow();
    await expect(
      asUser(VIEWER, "select public.set_task_status($1,'Completed',null)", [task("HR")]),
    ).rejects.toThrow();
    await expect(
      asUser(VIEWER, "select public.assign_task($1,$2)", [task("IT"), VIEWER]),
    ).rejects.toThrow();
  });

  it("keeps linked Checklist assignment and completion projected from Task", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P2-CLOSE-CHECKLIST");
    const caseId = created.rows[0]!.result.caseId;
    const linked = await db.query<{ task_id: string; checklist_item_id: string }>(
      `select id task_id,checklist_item_id from public.tasks
       where case_id=$1 and owner_team='IT' and checklist_item_id is not null limit 1`,
      [caseId],
    );
    const { task_id: taskId, checklist_item_id: itemId } = linked.rows[0]!;
    await asUser(ADMIN, "select public.assign_task($1,$2)", [taskId, IT_USER]);
    let owners = await db.query<{ task_owner: string; checklist_owner: string }>(
      `select t.owner_id::text task_owner,ci.owner_id::text checklist_owner
       from public.tasks t join public.checklist_items ci on ci.id=t.checklist_item_id where t.id=$1`,
      [taskId],
    );
    expect(owners.rows[0]).toEqual({ task_owner: IT_USER, checklist_owner: IT_USER });

    await asUser(IT_USER, "select public.assign_checklist_owner($1,$2)", [itemId, IT_USER_B]);
    owners = await db.query(
      `select t.owner_id::text task_owner,ci.owner_id::text checklist_owner
       from public.tasks t join public.checklist_items ci on ci.id=t.checklist_item_id where t.id=$1`,
      [taskId],
    );
    expect(owners.rows[0]).toEqual({ task_owner: IT_USER_B, checklist_owner: IT_USER_B });

    await expect(
      asUser(IT_USER_B, "select public.assign_task($1,$2)", [taskId, ADMIN_TEAM_USER]),
    ).rejects.toThrow(/owner team/);
    await expect(
      asUser(IT_USER_B, "select public.assign_checklist_owner($1,$2)", [itemId, ADMIN_TEAM_USER]),
    ).rejects.toThrow(/owner team/);

    await asUser(IT_USER_B, "select public.set_checklist_completion($1,true)", [itemId]);
    let state = await db.query<{
      task_status: string;
      checklist_status: string;
      completed_by: string;
    }>(
      `select t.status task_status,ci.status checklist_status,t.completed_by::text completed_by
       from public.tasks t join public.checklist_items ci on ci.id=t.checklist_item_id where t.id=$1`,
      [taskId],
    );
    expect(state.rows[0]).toEqual({
      task_status: "Completed",
      checklist_status: "Completed",
      completed_by: IT_USER_B,
    });
    await asUser(IT_USER_B, "select public.set_checklist_completion($1,false)", [itemId]);
    state = await db.query(
      `select t.status task_status,ci.status checklist_status,t.completed_by::text completed_by
       from public.tasks t join public.checklist_items ci on ci.id=t.checklist_item_id where t.id=$1`,
      [taskId],
    );
    expect(state.rows[0]).toEqual({
      task_status: "Not Started",
      checklist_status: "Open",
      completed_by: null,
    });
    await expect(
      asUser(IT_USER_B, "update public.checklist_items set owner_id=$2 where id=$1", [
        itemId,
        ADMIN_TEAM_USER,
      ]),
    ).rejects.toThrow();
  });
});

describe("Phase 3 Email Center — PostgreSQL security and history", () => {
  it("keeps HR templates and private attachment objects away from IT users", async () => {
    const template = await db.query<{ id: string }>(
      "select id from public.email_templates limit 1",
    );
    const templateId = template.rows[0]!.id;
    await db.query(
      `insert into storage.objects(id,bucket_id,name,owner,metadata)
       values(gen_random_uuid(),'email-attachments',$1,$2,'{}')`,
      [`email-templates/${templateId}/guide.pdf`, ADMIN],
    );
    const itTemplates = await asUser(IT_USER, "select id from public.email_templates");
    const itFiles = await asUser(
      IT_USER,
      "select name from storage.objects where bucket_id='email-attachments'",
    );
    expect(itTemplates.rowCount).toBe(0);
    expect(itFiles.rowCount).toBe(0);
    expect((await asUser(ADMIN, "select id from public.email_templates")).rowCount).toBeGreaterThan(
      0,
    );
  });

  it("rejects an unknown variable when validating publication", async () => {
    const inserted = await asUser<{ id: string }>(
      ADMIN,
      `insert into public.email_templates(name,category,owner_id,created_by,status,subject,body_html,variables)
       values('Broken','General',$1,$1,'Draft','Hello','{{unknown_xyz}}','[]') returning id`,
      [ADMIN],
    );
    const result = await asUser<{ errors: string[] }>(
      ADMIN,
      "select public.validate_email_template_for_publish($1) errors",
      [inserted.rows[0]!.id],
    );
    expect(result.rows[0]!.errors).toContain("Unknown variable: {{unknown_xyz}}");
  });

  it.each(["{{person.first_name}}", "{{EmployeeName}}", "{{employee-name}}", "{{ }}"])(
    "rejects malformed or legacy publication token %s in PostgreSQL",
    async (token) => {
      const inserted = await asUser<{ id: string }>(
        ADMIN,
        `insert into public.email_templates(name,category,owner_id,created_by,status,subject,body_html,variables)
         values('Malformed','General',$1,$1,'Draft','Hello',$2,'[]') returning id`,
        [ADMIN, token],
      );
      const result = await asUser<{ errors: string[] }>(
        ADMIN,
        "select public.validate_email_template_for_publish($1) errors",
        [inserted.rows[0]!.id],
      );
      expect(result.rows[0]!.errors.some((error) => error.startsWith("Invalid variable:"))).toBe(
        true,
      );
      await expect(
        asUser(ADMIN, "update public.email_templates set status='Published' where id=$1", [
          inserted.rows[0]!.id,
        ]),
      ).rejects.toThrow();
    },
  );

  it("snapshots a Checklist Email Task preferred template on Case generation", async () => {
    const template = await db.query<{ id: string }>(
      "select id from public.email_templates where status='Published' limit 1",
    );
    await db.query(
      `update public.checklist_template_items
       set task_type='Email',preferred_email_template_id=$1
       where template_key='onb_hr_welcome'`,
      [template.rows[0]!.id],
    );
    const created = await createOnboarding(ADMIN, TEAM_A, "P3-MAPPING");
    const task = await db.query<{
      task_type: string;
      preferred_email_template_id: string;
      snapshot_template_id: string;
    }>(
      `select task_type,preferred_email_template_id::text,
        source_snapshot->>'preferredEmailTemplateId' snapshot_template_id
       from public.tasks where case_id=$1 and default_task_key='onb_hr_welcome'`,
      [created.rows[0]!.result.caseId],
    );
    expect(task.rows[0]).toEqual({
      task_type: "Email",
      preferred_email_template_id: template.rows[0]!.id,
      snapshot_template_id: template.rows[0]!.id,
    });
  });

  it("isolates and binds additional attachments by compose session", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P3-ATTACH");
    const caseId = created.rows[0]!.result.caseId;
    const template = await db.query<{ id: string; version: number }>(
      "select id,version from public.email_templates where status='Published' limit 1",
    );
    const sessionA = "aaaaaaaa-0000-4000-8000-000000000001";
    const sessionB = "bbbbbbbb-0000-4000-8000-000000000002";
    await asUser(
      ADMIN,
      `insert into public.email_additional_attachments(case_id,compose_session_id,filename,storage_path,content_type,size,uploaded_by)
       values($1,$2,'A.pdf','additional/a.pdf','application/pdf',10,$4),
             ($1,$3,'B.pdf','additional/b.pdf','application/pdf',10,$4)`,
      [caseId, sessionA, sessionB, ADMIN],
    );
    const communication = await asUser<{ id: string }>(
      ADMIN,
      "select public.record_email_event($1,null,$2,$3,'peter@example.com','General','Draft Prepared',null) id",
      [caseId, template.rows[0]!.id, template.rows[0]!.version],
    );
    await asUser(ADMIN, "select public.bind_email_compose_attachments($1,$2)", [
      sessionA,
      communication.rows[0]!.id,
    ]);
    const rows = await db.query<{ filename: string; linked: boolean }>(
      "select filename,communication_id is not null linked from public.email_additional_attachments where case_id=$1 order by filename",
      [caseId],
    );
    expect(rows.rows).toEqual([
      { filename: "A.pdf", linked: true },
      { filename: "B.pdf", linked: false },
    ]);
    await db.query(
      "insert into storage.objects(bucket_id,name,owner,metadata) values('email-attachments','additional/a.pdf',$1,'{}')",
      [ADMIN],
    );
    const boundStorageDelete = await asUser(
      ADMIN,
      "delete from storage.objects where bucket_id='email-attachments' and name='additional/a.pdf' returning name",
    );
    expect(boundStorageDelete.rowCount).toBe(0);
    await expect(
      asUser(
        ADMIN,
        "select public.request_temporary_email_attachment_deletion(id) from public.email_additional_attachments where filename='A.pdf' and case_id=$1",
        [caseId],
      ),
    ).rejects.toThrow();
    await expect(
      asUser(
        ADMIN,
        "delete from public.email_additional_attachments where filename='A.pdf' and case_id=$1",
        [caseId],
      ),
    ).rejects.toThrow();
    const history = await asUser<{ filename: string }>(
      ADMIN,
      `select a.filename from public.email_communications c
       join public.email_additional_attachments a on a.communication_id=c.id
       where c.id=$1`,
      [communication.rows[0]!.id],
    );
    expect(history.rows).toEqual([{ filename: "A.pdf" }]);
  });

  it("allows the owner to remove only an unbound Additional Attachment", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P3-TEMP-DELETE");
    const attachmentId = "aaaaaaaa-1000-4000-8000-000000000001";
    await asUser(
      ADMIN,
      `insert into public.email_additional_attachments(id,case_id,compose_session_id,filename,storage_path,content_type,size,uploaded_by)
       values($1,$2,gen_random_uuid(),'Temporary.pdf','additional/temporary.pdf','application/pdf',10,$3)`,
      [attachmentId, created.rows[0]!.result.caseId, ADMIN],
    );
    const requested = await asUser<{ path: string }>(
      ADMIN,
      "select public.request_temporary_email_attachment_deletion($1) path",
      [attachmentId],
    );
    expect(requested.rows[0]!.path).toBe("additional/temporary.pdf");
    expect(
      (
        await db.query(
          "select id from public.email_additional_attachments where id=$1 and deletion_requested_at is not null",
          [attachmentId],
        )
      ).rowCount,
    ).toBe(1);
    await db.query(
      "insert into storage.objects(bucket_id,name,owner,metadata) values('email-attachments','additional/temporary.pdf',$1,'{}')",
      [ADMIN],
    );
    const removedObject = await asUser<{ name: string }>(
      ADMIN,
      "delete from storage.objects where bucket_id='email-attachments' and name='additional/temporary.pdf' returning name",
    );
    expect(removedObject.rows).toEqual([{ name: "additional/temporary.pdf" }]);
    expect(
      (
        await db.query("select id from public.email_additional_attachments where id=$1", [
          attachmentId,
        ])
      ).rowCount,
    ).toBe(1);
    const finalized = await asUser<{ removed: boolean }>(
      ADMIN,
      "select public.finalize_temporary_email_attachment_deletion($1) removed",
      [attachmentId],
    );
    expect(finalized.rows[0]!.removed).toBe(true);
    expect(
      (
        await db.query("select id from public.email_additional_attachments where id=$1", [
          attachmentId,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("abandoned cleanup stages only unbound metadata and retains linked history", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P3-ORPHAN");
    const caseId = created.rows[0]!.result.caseId;
    const template = await db.query<{ id: string; version: number }>(
      "select id,version from public.email_templates where status='Published' limit 1",
    );
    const communication = await asUser<{ id: string }>(
      ADMIN,
      "select public.record_email_event($1,null,$2,$3,'peter@example.com','Retention','Draft Prepared',null) id",
      [caseId, template.rows[0]!.id, template.rows[0]!.version],
    );
    await db.query(
      `insert into public.email_additional_attachments(case_id,compose_session_id,communication_id,filename,storage_path,content_type,size,uploaded_by,expires_at)
       values($1,gen_random_uuid(),null,'Orphan.pdf','additional/orphan.pdf','application/pdf',10,$3,now()-interval '1 hour'),
             ($1,gen_random_uuid(),$2,'Evidence.pdf','additional/evidence.pdf','application/pdf',10,$3,null)`,
      [caseId, communication.rows[0]!.id, ADMIN],
    );
    const cleanup = await db.query<{ paths: string[] }>(
      "select public.cleanup_abandoned_email_attachments() paths",
    );
    expect(cleanup.rows[0]!.paths).toContain("additional/orphan.pdf");
    expect(cleanup.rows[0]!.paths).not.toContain("additional/evidence.pdf");
    const retained = await db.query<{ filename: string }>(
      "select filename from public.email_additional_attachments where communication_id=$1",
      [communication.rows[0]!.id],
    );
    expect(retained.rows).toContainEqual({ filename: "Evidence.pdf" });
  });

  it("does not complete an email Task until HR explicitly marks it sent", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P3-EMAIL");
    const caseId = created.rows[0]!.result.caseId;
    const task = await db.query<{ id: string }>(
      "select id from public.tasks where case_id=$1 and owner_team='HR' and (lower(task_type)='email' or lower(title) like '%email%') limit 1",
      [caseId],
    );
    const template = await db.query<{ id: string; version: number }>(
      "select id,version from public.email_templates where status='Published' limit 1",
    );
    const args = [
      caseId,
      task.rows[0]!.id,
      template.rows[0]!.id,
      template.rows[0]!.version,
      "peter@example.com",
      "Welcome",
    ];
    const prepared = await asUser<{ id: string }>(
      ADMIN,
      "select public.record_email_event($1,$2,$3,$4,$5,$6,'Draft Prepared',null) id",
      args,
    );
    expect(
      (
        await db.query<{ status: string }>("select status from public.tasks where id=$1", [
          task.rows[0]!.id,
        ])
      ).rows[0]!.status,
    ).not.toBe("Completed");
    await asUser(
      ADMIN,
      "select public.record_email_event($1,$2,$3,$4,$5,$6,'Opened in Outlook',$7)",
      [...args, prepared.rows[0]!.id],
    );
    expect(
      (
        await db.query<{ status: string }>("select status from public.tasks where id=$1", [
          task.rows[0]!.id,
        ])
      ).rows[0]!.status,
    ).not.toBe("Completed");
    await asUser(ADMIN, "select public.record_email_event($1,$2,$3,$4,$5,$6,'Marked Sent',$7)", [
      ...args,
      prepared.rows[0]!.id,
    ]);
    const state = await db.query<{ status: string; completed_by: string }>(
      "select status,completed_by::text completed_by from public.tasks where id=$1",
      [task.rows[0]!.id],
    );
    expect(state.rows[0]).toEqual({ status: "Completed", completed_by: ADMIN });
  });
});

describe("Phase 4 Closure — permission-safe Operations reporting", () => {
  it("builds the Phase 4 operations report and keeps scoped managers isolated", async () => {
    const teamA = await createOnboarding(MANAGER_A, TEAM_A, "P4-SCOPE-A");
    const teamB = await createOnboarding(MANAGER_B, TEAM_B, "P4-SCOPE-B");
    const reportA = await operationsReport(MANAGER_A);
    const reportB = await operationsReport(MANAGER_B);
    const caseA = teamA.rows[0]!.result.caseId;
    const caseB = teamB.rows[0]!.result.caseId;
    const visibleA = reportA.tasks.map((row) => row.caseId);
    const visibleB = reportB.tasks.map((row) => row.caseId);
    expect(visibleA).toContain(caseA);
    expect(visibleA).not.toContain(caseB);
    expect(visibleB).toContain(caseB);
    expect(visibleB).not.toContain(caseA);
    expect(reportA.taskWorkload).toHaveLength(3);
    expect(reportA.activeByTeam.every((row) => row.name !== "Team B")).toBe(true);
    const forbidden = await operationsReport(MANAGER_A, ["Team B", null, null, null, null, null]);
    expect(forbidden.metrics.activePeople).toBe(0);
    expect(forbidden.metrics.preboarding).toBe(0);
    expect(forbidden.tasks).toHaveLength(0);
    expect(forbidden.activeByTeam).toHaveLength(0);
    expect(forbidden.monthlyLifecycleTrend.every((row) => row.joined === 0 && row.left === 0)).toBe(
      true,
    );
  });

  it("does not turn Viewer or generic Collaborator Case sharing into Operations access", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P4-SHARED");
    const caseId = created.rows[0]!.result.caseId;
    await db.query(
      "insert into public.case_members(case_id,user_id,access_level,created_by) values($1,$2,'viewer',$3)",
      [caseId, VIEWER, ADMIN],
    );
    for (const access of ["viewer", "collaborator"]) {
      await db.query(
        "update public.case_members set access_level=$1 where case_id=$2 and user_id=$3",
        [access, caseId, VIEWER],
      );
      const report = await operationsReport(VIEWER);
      expect(report.reportingMode).toBe("operational");
      expect(report.metrics.activePeople).toBe(0);
      expect(report.metrics.preboarding).toBe(0);
      expect(report.activePeople).toHaveLength(0);
      expect(report.activeByTeam).toHaveLength(0);
      expect(report.attentionCases).toHaveLength(0);
      expect(report.tasks).toHaveLength(0);
      expect(report.monthlyLifecycleTrend.every((row) => row.joined === 0 && row.left === 0)).toBe(
        true,
      );
      expect(
        (await asUser(VIEWER, "select person_id from public.active_employee_roster")).rows,
      ).toHaveLength(0);
    }
  });

  it("returns only functional-team operational reporting to IT and Administration", async () => {
    const it = await operationsReport(IT_USER);
    const administration = await operationsReport(ADMIN_TEAM_USER);
    for (const [report, team] of [
      [it, "IT"],
      [administration, "Admin"],
    ] as const) {
      expect(report.reportingMode).toBe("operational");
      expect(report.metrics.activePeople).toBe(0);
      expect(report.activePeople).toHaveLength(0);
      expect(report.activeByTeam).toHaveLength(0);
      expect(report.attentionCases).toHaveLength(0);
      expect(report.tasks.length).toBeGreaterThan(0);
      expect(report.tasks.every((task) => task.ownerTeam === team)).toBe(true);
      expect(report.taskWorkload.map((row) => row.ownerTeam)).toEqual([team]);
      expect(
        (
          await asUser(
            team === "IT" ? IT_USER : ADMIN_TEAM_USER,
            "select person_id from public.active_employee_roster",
          )
        ).rows,
      ).toHaveLength(0);
    }
  });

  it("uses the operational Case date and a 30-day Upcoming horizon", async () => {
    const onboarding = await createOnboarding(ADMIN, TEAM_A, "P4-DATE-ON");
    await db.query("update public.cases set start_date='2026-09-15' where id=$1", [
      onboarding.rows[0]!.result.caseId,
    ]);
    const employment = await createOnboarding(ADMIN, TEAM_A, "P4-DATE-OFF");
    await asUser(ADMIN, "select public.confirm_joined($1,'2026-08-01')", [
      employment.rows[0]!.result.caseId,
    ]);
    const offboarding = await asUser<{ result: { caseId: string } }>(
      ADMIN,
      "select public.create_offboarding_case_v2($1,$2,'2026-09-30','Voluntary Resignation',null,'Medium',null) result",
      [employment.rows[0]!.result.personId, employment.rows[0]!.result.employmentId],
    );
    await db.query(
      "update public.cases set start_date='2024-01-01',last_working_day='2026-09-20' where id=$1",
      [offboarding.rows[0]!.result.caseId],
    );
    const september = await operationsReport(ADMIN, [
      null,
      null,
      null,
      null,
      "2026-09-01",
      "2026-09-30",
    ]);
    const septemberCases = new Set(september.tasks.map((task) => task.caseId));
    expect(septemberCases.has(onboarding.rows[0]!.result.caseId)).toBe(true);
    expect(septemberCases.has(offboarding.rows[0]!.result.caseId)).toBe(true);

    const today = (await db.query<{ today: string }>("select public.business_date()::text today"))
      .rows[0]!.today;
    const horizonCases = [] as string[];
    for (const [suffix, offset] of [
      ["IN15", 15],
      ["OUT31", 31],
    ] as const) {
      const row = await createOnboarding(ADMIN, TEAM_A, `P4-${suffix}`);
      await db.query("update public.cases set start_date=$2::date+$3::integer where id=$1", [
        row.rows[0]!.result.caseId,
        today,
        offset,
      ]);
      horizonCases.push(row.rows[0]!.result.caseId);
    }
    const upcoming = await operationsReport(ADMIN);
    const upcomingIds = upcoming.upcomingJoiners.map((row) => row.caseId);
    expect(upcomingIds).toContain(horizonCases[0]);
    expect(upcomingIds).not.toContain(horizonCases[1]);

    const leaverCases: string[] = [];
    for (const [suffix, offset, hasLwd] of [
      ["LWD10", 7, true],
      ["LWD40", 40, true],
      ["END20", 20, false],
      ["END45", 45, false],
    ] as const) {
      const joined = await createOnboarding(ADMIN, TEAM_A, `P4-${suffix}`);
      await asUser(ADMIN, "select public.confirm_joined($1,null)", [joined.rows[0]!.result.caseId]);
      const leaving = await asUser<{ result: { caseId: string } }>(
        ADMIN,
        "select public.create_offboarding_case_v2($1,$2,'2026-12-31','Voluntary Resignation',null,'Medium',null) result",
        [joined.rows[0]!.result.personId, joined.rows[0]!.result.employmentId],
      );
      await db.query(
        "update public.cases set contract_end_date=$2::date+$3::integer,last_working_day=case when $4::boolean then $2::date+$3::integer else null end where id=$1",
        [leaving.rows[0]!.result.caseId, today, offset, hasLwd],
      );
      if (suffix === "LWD10") {
        await db.query("update public.tasks set status='Completed' where case_id=$1", [
          leaving.rows[0]!.result.caseId,
        ]);
        await db.query(
          "update public.tasks set status='Not Started',due_date=$2::date+1 where id=(select id from public.tasks where case_id=$1 and owner_team='IT' limit 1)",
          [leaving.rows[0]!.result.caseId, today],
        );
      }
      leaverCases.push(leaving.rows[0]!.result.caseId);
    }
    const leavers = (await operationsReport(ADMIN)).upcomingLeavers;
    const leaverIds = leavers.map((row) => row.caseId);
    expect(leaverIds).toContain(leaverCases[0]);
    expect(leaverIds).not.toContain(leaverCases[1]);
    expect(leaverIds).toContain(leaverCases[2]);
    expect(leaverIds).not.toContain(leaverCases[3]);
    expect(leavers.find((row) => row.caseId === leaverCases[2])).toMatchObject({
      lastWorkingDay: null,
    });
    const horizonAttention = (await operationsReport(ADMIN)).attentionCases;
    expect(horizonAttention).toContainEqual(
      expect.objectContaining({
        caseId: leaverCases[2],
        severity: "Warning",
        reason: "Last Working Day not confirmed",
      }),
    );
    expect(horizonAttention).toContainEqual(
      expect.objectContaining({
        caseId: leaverCases[0],
        severity: "Critical",
        reason: "LWD approaching with IT/Admin work unresolved",
      }),
    );
    expect(horizonAttention.some((item) => item.caseId === horizonCases[1])).toBe(false);
  });

  it("counts only applicable outstanding mandatory Tasks and keeps due-soon disjoint", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P4-KPI");
    const caseId = created.rows[0]!.result.caseId;
    await db.query("delete from public.tasks where case_id=$1", [caseId]);
    const baseline = await operationsReport(ADMIN);
    await db.query(
      `insert into public.tasks(case_id,title,status,mandatory,due_date,owner_team,owner_id) values
       ($1,'Completed old','Completed',true,public.business_date()-1,'HR',$2),
       ($1,'N/A old','Not Applicable',true,public.business_date()-1,'HR',$2),
       ($1,'Mandatory overdue','Not Started',true,public.business_date()-1,'HR',null),
       ($1,'Mandatory due soon','In Progress',true,public.business_date()+14,'IT',null),
       ($1,'Optional overdue','Not Started',false,public.business_date()-1,'Admin',null),
       ($1,'Waiting for LWD','Waiting',true,null,'Admin',null)`,
      [caseId, ADMIN],
    );
    const report = await operationsReport(ADMIN, [null, null, null, null, null, null]);
    const caseTasks = report.tasks.filter((task) => task.caseId === caseId);
    expect(caseTasks).toHaveLength(6);
    const expectedOpenMandatory =
      caseTasks.filter((task) =>
        ["Not Started", "Open", "In Progress", "Waiting", "Blocked"].includes(task.status),
      ).length - 1;
    expect(expectedOpenMandatory).toBe(3);
    expect(report.metrics.openMandatoryTasks - baseline.metrics.openMandatoryTasks).toBe(3);
    expect(report.metrics.overdueMandatoryTasks - baseline.metrics.overdueMandatoryTasks).toBe(1);
    const workloadDelta = (team: string, field: "open" | "overdue" | "dueSoon" | "unassigned") =>
      (report.taskWorkload.find((row) => row.ownerTeam === team)?.[field] ?? 0) -
      (baseline.taskWorkload.find((row) => row.ownerTeam === team)?.[field] ?? 0);
    expect(workloadDelta("HR", "open")).toBe(1);
    expect(workloadDelta("HR", "overdue")).toBe(1);
    expect(workloadDelta("HR", "unassigned")).toBe(1);
    expect(workloadDelta("IT", "dueSoon")).toBe(1);
    expect(workloadDelta("Admin", "open")).toBe(2);
    expect(workloadDelta("Admin", "overdue")).toBe(1);
    expect(workloadDelta("Admin", "dueSoon")).toBe(0);
    const attention = report.attentionCases.filter((item) => item.caseId === caseId);
    expect(attention).toContainEqual(
      expect.objectContaining({ severity: "Critical", reason: "Mandatory task overdue" }),
    );
    expect(attention.some((item) => item.reason.includes("Not Applicable"))).toBe(false);
  });

  it("moves lifecycle reporting only on Confirm Joined and Confirm Left", async () => {
    const before = await operationsReport(ADMIN);
    const created = await createOnboarding(ADMIN, TEAM_A, "P4-LIFECYCLE");
    const preboarding = await operationsReport(ADMIN);
    expect(preboarding.metrics.preboarding - before.metrics.preboarding).toBe(1);
    expect(preboarding.metrics.activePeople - before.metrics.activePeople).toBe(0);

    await asUser(ADMIN, "select public.confirm_joined($1,null)", [created.rows[0]!.result.caseId]);
    const joined = await operationsReport(ADMIN);
    expect(joined.metrics.preboarding - before.metrics.preboarding).toBe(0);
    expect(joined.metrics.activePeople - before.metrics.activePeople).toBe(1);
    expect(joined.metrics.joinedYtd - before.metrics.joinedYtd).toBe(1);

    const leaving = await asUser<{ result: { caseId: string } }>(
      ADMIN,
      "select public.create_offboarding_case_v2($1,$2,'2026-12-31','Voluntary Resignation',null,'Medium',null) result",
      [created.rows[0]!.result.personId, created.rows[0]!.result.employmentId],
    );
    const pendingLeft = await operationsReport(ADMIN);
    expect(pendingLeft.metrics.activePeople - before.metrics.activePeople).toBe(1);
    expect(pendingLeft.metrics.leaving - joined.metrics.leaving).toBe(1);

    await asUser(ADMIN, "select public.confirm_left($1,null)", [leaving.rows[0]!.result.caseId]);
    const left = await operationsReport(ADMIN);
    expect(left.metrics.activePeople - before.metrics.activePeople).toBe(0);
    expect(left.metrics.leaving - joined.metrics.leaving).toBe(0);
    expect(left.metrics.leftYtd - before.metrics.leftYtd).toBe(1);
  });

  it("uses explicit business-year boundaries for Joined and Left YTD", async () => {
    const baseline = await operationsReport(ADMIN);
    for (const [suffix, date] of [
      ["JOIN-LAST", "2025-12-31"],
      ["JOIN-THIS", "2026-01-01"],
    ] as const) {
      const row = await createOnboarding(ADMIN, TEAM_A, `P4-${suffix}`);
      await asUser(ADMIN, "select public.confirm_joined($1,$2::date)", [
        row.rows[0]!.result.caseId,
        date,
      ]);
    }
    const joined = await operationsReport(ADMIN);
    expect(joined.metrics.joinedYtd - baseline.metrics.joinedYtd).toBe(1);

    for (const [suffix, date] of [
      ["LEFT-LAST", "2025-12-31"],
      ["LEFT-THIS", "2026-01-01"],
    ] as const) {
      const row = await createOnboarding(ADMIN, TEAM_A, `P4-${suffix}`);
      await asUser(ADMIN, "select public.confirm_joined($1,'2025-01-01')", [
        row.rows[0]!.result.caseId,
      ]);
      const offboarding = await asUser<{ result: { caseId: string } }>(
        ADMIN,
        "select public.create_offboarding_case_v2($1,$2,'2026-12-31','Voluntary Resignation',null,'Medium',null) result",
        [row.rows[0]!.result.personId, row.rows[0]!.result.employmentId],
      );
      await asUser(ADMIN, "select public.confirm_left($1,$2::date)", [
        offboarding.rows[0]!.result.caseId,
        date,
      ]);
    }
    const left = await operationsReport(ADMIN);
    expect(left.metrics.leftYtd - baseline.metrics.leftYtd).toBe(1);
  });
});

describe("Phase 4 Final Patch — HR reporting scope is independent from mutation", () => {
  it("reports every Team-scoped Case without granting Task edit rights", async () => {
    const baseline = await operationsReport(MANAGER_A);
    const a1 = await createOnboarding(MANAGER_A, TEAM_A, "P4-FINAL-A1");
    const a2 = await createOnboarding(ADMIN, TEAM_A, "P4-FINAL-A2");
    const b1 = await createOnboarding(ADMIN, TEAM_B, "P4-FINAL-B1");
    const caseA1 = a1.rows[0]!.result.caseId;
    const caseA2 = a2.rows[0]!.result.caseId;
    const caseB1 = b1.rows[0]!.result.caseId;

    expect(
      (
        await asUser<{ access: string }>(MANAGER_A, "select public.case_access($1,$2) access", [
          MANAGER_A,
          caseA2,
        ])
      ).rows[0]!.access,
    ).toBe("scoped");
    expect(
      (
        await db.query("select id from public.case_members where case_id=$1 and user_id=$2", [
          caseA2,
          MANAGER_A,
        ])
      ).rows,
    ).toHaveLength(0);

    await db.query("update public.tasks set status='Completed' where case_id=any($1::uuid[])", [
      [caseA1, caseA2, caseB1],
    ]);
    const taskRows = await db.query<{ id: string; case_id: string }>(
      `with picked as (
         select id,case_id,row_number() over(partition by case_id order by created_at) position
         from public.tasks where case_id=any($1::uuid[]) and owner_team='IT'
       )
       update public.tasks t set status='Not Started',mandatory=true,due_date=public.business_date()-1
       from picked p where t.id=p.id and p.position=1 returning t.id,t.case_id`,
      [[caseA1, caseA2, caseB1]],
    );
    const taskByCase = new Map(taskRows.rows.map((row) => [row.case_id, row.id]));

    const report = await operationsReport(MANAGER_A);
    const exportedCaseIds = new Set(report.tasks.map((task) => task.caseId));
    expect(exportedCaseIds.has(caseA1)).toBe(true);
    expect(exportedCaseIds.has(caseA2)).toBe(true);
    expect(exportedCaseIds.has(caseB1)).toBe(false);
    expect(report.metrics.openMandatoryTasks - baseline.metrics.openMandatoryTasks).toBe(2);
    expect(report.metrics.overdueMandatoryTasks - baseline.metrics.overdueMandatoryTasks).toBe(2);

    const baselineIt = baseline.taskWorkload.find((row) => row.ownerTeam === "IT");
    const reportIt = report.taskWorkload.find((row) => row.ownerTeam === "IT");
    expect((reportIt?.open ?? 0) - (baselineIt?.open ?? 0)).toBe(2);
    expect((reportIt?.overdue ?? 0) - (baselineIt?.overdue ?? 0)).toBe(2);
    expect(report.attentionCases.map((item) => item.caseId)).toEqual(
      expect.arrayContaining([caseA1, caseA2]),
    );
    expect(report.attentionCases.some((item) => item.caseId === caseB1)).toBe(false);

    const executionTasks = await asUser<{ case_id: string }>(
      MANAGER_A,
      "select case_id from public.list_operational_tasks(null)",
    );
    expect(executionTasks.rows.some((task) => task.case_id === caseA2)).toBe(false);

    await expect(
      asUser(MANAGER_A, "select public.set_task_status($1,'Completed',null)", [
        taskByCase.get(caseA2),
      ]),
    ).rejects.toThrow();
    const allOrganization = await operationsReport(ADMIN);
    expect(allOrganization.tasks.map((task) => task.caseId)).toEqual(
      expect.arrayContaining([caseA1, caseA2, caseB1]),
    );
  });

  it("uses the existing Lab Data Scope across multiple teams", async () => {
    const labB = "dededede-dede-dede-dede-dededededede";
    const teamC = "cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd";
    await db.query("insert into public.labs(id,name) values($1,'Basel Lab')", [labB]);
    await db.query("insert into public.teams(id,lab_id,name) values($1,$2,'Storage')", [
      teamC,
      labB,
    ]);
    await db.query(
      `insert into auth.users(id,email,raw_user_meta_data)
       values($1,'hr.lab@example.test','{"name":"HR Lab"}')`,
      [HR_LAB_USER],
    );
    await db.query("update public.profiles set status='Active' where id=$1", [HR_LAB_USER]);
    await db.query("delete from public.user_roles where user_id=$1", [HR_LAB_USER]);
    await db.query("insert into public.user_roles(user_id,role) values($1,'manager')", [
      HR_LAB_USER,
    ]);
    await db.query(
      "insert into public.user_operational_teams(user_id,owner_team) values($1,'HR')",
      [HR_LAB_USER],
    );
    await db.query(
      "insert into public.user_scopes(user_id,scope_type,lab_id) values($1,'lab','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')",
      [HR_LAB_USER],
    );
    const network = await createOnboarding(ADMIN, TEAM_A, "P4-LAB-NET");
    const ai = await createOnboarding(ADMIN, TEAM_B, "P4-LAB-AI");
    const storage = await createOnboarding(ADMIN, teamC, "P4-LAB-STORAGE");
    const report = await operationsReport(HR_LAB_USER);
    const caseIds = report.tasks.map((task) => task.caseId);
    expect(caseIds).toContain(network.rows[0]!.result.caseId);
    expect(caseIds).toContain(ai.rows[0]!.result.caseId);
    expect(caseIds).not.toContain(storage.rows[0]!.result.caseId);
  });
});

describe("Phase 5 production security audit", () => {
  it("enables RLS on every business table", async () => {
    const intentionallyNonBusinessTables: string[] = [];
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname,relrowsecurity
       from pg_class join pg_namespace on pg_namespace.oid=pg_class.relnamespace
       where nspname='public' and relkind='r' order by relname`,
    );
    const missing = result.rows
      .filter((row) => !intentionallyNonBusinessTables.includes(row.relname) && !row.relrowsecurity)
      .map((row) => row.relname);
    expect(result.rows.length).toBeGreaterThanOrEqual(28);
    expect(missing).toEqual([]);
  });

  it("pins every public SECURITY DEFINER function search_path", async () => {
    const result = await db.query<{ proname: string; proconfig: string[] | null }>(
      `select proname,proconfig
       from pg_proc join pg_namespace on pg_namespace.oid=pg_proc.pronamespace
       where nspname='public' and prosecdef`,
    );
    const unpinned = result.rows
      .filter((row) => !row.proconfig?.some((item) => item.startsWith("search_path=")))
      .map((row) => row.proname);
    expect(unpinned).toEqual([]);
  });

  it("does not grant PUBLIC execution on SECURITY DEFINER functions", async () => {
    const result = await db.query<{ signature: string }>(
      `select p.oid::regprocedure::text signature
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prosecdef and has_function_privilege('public',p.oid,'EXECUTE')`,
    );
    expect(result.rows.map((row) => row.signature)).toEqual([]);
  });

  it("governs Case file deletion through request, Storage and finalize stages", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P5-FILE");
    const caseId = created.rows[0]!.result.caseId;
    const fileId = "56565656-5656-5656-5656-565656565656";
    const path = `${caseId}/${fileId}-contract.pdf`;
    await db.query(
      `insert into public.case_files(id,case_id,filename,storage_path,content_type,size,uploaded_by)
       values($1,$2,'contract.pdf',$3,'application/pdf',128,$4)`,
      [fileId, caseId, path, ADMIN],
    );
    await db.query("insert into storage.objects(bucket_id,name,owner) values('case-files',$1,$2)", [
      path,
      ADMIN,
    ]);

    await expect(
      asUser(VIEWER, "select public.request_case_file_deletion($1)", [fileId]),
    ).rejects.toThrow();
    await expect(
      asUser(VIEWER, "delete from public.case_files where id=$1", [fileId]),
    ).rejects.toThrow();

    const requested = await asUser<{ path: string }>(
      ADMIN,
      "select public.request_case_file_deletion($1) path",
      [fileId],
    );
    expect(requested.rows[0]!.path).toBe(path);
    const recoverableRequest = await db.query<{ requested: boolean }>(
      "select deletion_requested_at is not null requested from public.case_files where id=$1",
      [fileId],
    );
    expect(recoverableRequest.rows).toEqual([{ requested: true }]);
    expect(
      (
        await asUser(
          ADMIN,
          "delete from storage.objects where bucket_id='case-files' and name=$1",
          [path],
        )
      ).affectedRows,
    ).toBe(1);
    expect(
      (await db.query("select id from public.case_files where id=$1", [fileId])).rowCount,
    ).toBe(1);
    expect(
      (
        await asUser<{ ok: boolean }>(ADMIN, "select public.finalize_case_file_deletion($1) ok", [
          fileId,
        ])
      ).rows[0]!.ok,
    ).toBe(true);
  });

  it("denies forged and cross-scope Storage object reads and deletes", async () => {
    const created = await createOnboarding(ADMIN, TEAM_B, "P5-STORAGE-SCOPE");
    const caseId = created.rows[0]!.result.caseId;
    const fileId = "57575757-5757-5757-5757-575757575757";
    const path = `${caseId}/${fileId}-private.pdf`;
    await db.query(
      `insert into public.case_files(id,case_id,filename,storage_path,content_type,size,uploaded_by)
       values($1,$2,'private.pdf',$3,'application/pdf',128,$4)`,
      [fileId, caseId, path, ADMIN],
    );
    await db.query(
      `insert into storage.objects(bucket_id,name,owner,metadata) values
       ('case-files',$1,$2,'{}'),('case-files','forged/not-a-case.pdf',$2,'{}')`,
      [path, ADMIN],
    );

    for (const attacker of [MANAGER_A, VIEWER, IT_USER]) {
      const read = await asUser<{ name: string }>(
        attacker,
        "select name from storage.objects where bucket_id='case-files' and name=$1",
        [path],
      );
      const removed = await asUser<{ name: string }>(
        attacker,
        "delete from storage.objects where bucket_id='case-files' and name=$1 returning name",
        [path],
      );
      expect(read.rows).toEqual([]);
      expect(removed.rows).toEqual([]);
    }
    const forgedDelete = await asUser<{ name: string }>(
      ADMIN,
      "delete from storage.objects where bucket_id='case-files' and name='forged/not-a-case.pdf' returning name",
    );
    expect(forgedDelete.rows).toEqual([]);
  });

  it("stages orphan cleanup and never touches bound historical attachments", async () => {
    const created = await createOnboarding(ADMIN, TEAM_A, "P5-CLEAN");
    const caseId = created.rows[0]!.result.caseId;
    const template = await db.query<{ id: string }>(
      "select id from public.email_templates limit 1",
    );
    const communication = await asUser<{ id: string }>(
      ADMIN,
      "select public.record_email_event($1,null,$2,1,'test@example.test','Subject','Draft Prepared',null) id",
      [caseId, template.rows[0]!.id],
    );
    const temporaryId = "67676767-6767-6767-6767-676767676767";
    const boundId = "68686868-6868-6868-6868-686868686868";
    await db.query(
      `insert into public.email_additional_attachments(
        id,case_id,compose_session_id,communication_id,filename,storage_path,content_type,size,uploaded_by,expires_at
       ) values
       ($1,$3,gen_random_uuid(),null,'temporary.pdf','additional/temporary.pdf','application/pdf',1,$4,now()-interval '1 day'),
       ($2,$3,gen_random_uuid(),$5,'bound.pdf','additional/bound.pdf','application/pdf',1,$4,now()-interval '1 day')`,
      [temporaryId, boundId, caseId, ADMIN, communication.rows[0]!.id],
    );

    await expect(
      asUser(ADMIN, "select public.cleanup_abandoned_email_attachments()"),
    ).rejects.toThrow();
    const staged = await db.query<{ paths: string[] }>(
      "select public.cleanup_abandoned_email_attachments() paths",
    );
    expect(staged.rows[0]!.paths).toContain("additional/temporary.pdf");
    expect(staged.rows[0]!.paths).not.toContain("additional/bound.pdf");
    const state = await db.query<{ id: string; requested: boolean }>(
      `select id,deletion_requested_at is not null requested
       from public.email_additional_attachments where id in($1,$2) order by id`,
      [temporaryId, boundId],
    );
    expect(state.rows).toEqual([
      { id: temporaryId, requested: true },
      { id: boundId, requested: false },
    ]);
    await db.query("select public.finalize_abandoned_email_attachment_cleanup($1::text[])", [
      ["additional/temporary.pdf"],
    ]);
    const retained = await db.query<{ id: string }>(
      "select id from public.email_additional_attachments where id in($1,$2)",
      [temporaryId, boundId],
    );
    expect(retained.rows).toEqual([{ id: boundId }]);
  });

  it("paginates and searches People without cross-scope count or match leakage", async () => {
    const inScope = await Promise.all([
      createOnboarding(ADMIN, TEAM_A, "P5-PAGE-A"),
      createOnboarding(ADMIN, TEAM_A, "P5-PAGE-B"),
      createOnboarding(ADMIN, TEAM_A, "P5-PAGE-C"),
    ]);
    const outOfScope = await createOnboarding(ADMIN, TEAM_B, "P5-PAGE-SECRET");
    type PeoplePage = {
      items: Array<{ personId: string; displayName: string; status: string }>;
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    const page1 = (
      await asUser<{ value: PeoplePage }>(
        MANAGER_A,
        "select public.list_people_page('P5-PAGE',null,1,2) value",
      )
    ).rows[0]!.value;
    const page2 = (
      await asUser<{ value: PeoplePage }>(
        MANAGER_A,
        "select public.list_people_page('P5-PAGE',null,2,2) value",
      )
    ).rows[0]!.value;
    expect(page1).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect([...page1.items, ...page2.items].map((item) => item.personId)).toEqual(
      inScope.map((result) => result.rows[0]!.result.personId),
    );
    expect(page1.items.map((item) => item.displayName)).toEqual(
      [...page1.items].map((item) => item.displayName).sort(),
    );

    const statusPage = (
      await asUser<{ value: PeoplePage }>(
        MANAGER_A,
        "select public.list_people_page('P5-PAGE',$1,1,999) value",
        [page1.items[0]!.status],
      )
    ).rows[0]!.value;
    expect(statusPage.pageSize).toBe(100);
    expect(statusPage.items.every((item) => item.status === page1.items[0]!.status)).toBe(true);

    for (const secretSearch of ["P5-PAGE-SECRET", "EMP-P5-PAGE-SECRET", "SECRET@example.test"]) {
      const hidden = (
        await asUser<{ value: PeoplePage }>(
          MANAGER_A,
          "select public.list_people_page($1,null,1,50) value",
          [secretSearch],
        )
      ).rows[0]!.value;
      expect(hidden).toMatchObject({ total: 0, totalPages: 1, items: [] });
    }
    expect(outOfScope.rows[0]!.result.personId).toBeTruthy();
  });

  it("handles a 500-Person / 200-Case / 1000-Task pilot-scale smoke dataset", async () => {
    await db.query(
      `insert into public.persons(
        first_name,last_name,full_name,given_name,family_name,display_name,email,employee_id,team_id
      ) select 'P5Large',lpad(n::text,4,'0'),'P5Large '||lpad(n::text,4,'0'),
        'P5Large',lpad(n::text,4,'0'),'P5Large '||lpad(n::text,4,'0'),
        'p5-large-'||n||'@example.test','P5-LARGE-'||n,$1
      from generate_series(1,500) n`,
      [TEAM_A],
    );
    await db.query(
      `insert into public.employments(
        person_id,employment_type,employee_id,team_id,role_title,location,start_date,status
      ) select id,'Employee',employee_id,$1,'Synthetic tester','Zurich','2026-01-01','active'
        from public.persons where employee_id like 'P5-LARGE-%'`,
      [TEAM_A],
    );
    await db.query(
      `insert into public.cases(
        person_id,employment_id,case_type,employment_type,start_date,effective_date,
        role,location,owner_id,status,priority,notes
      ) select p.id,e.id,'Onboarding','Employee','2026-01-01','2026-01-01',
        'Synthetic tester','Zurich',$1,'Preparing','Medium','Phase 5 scale smoke'
      from public.persons p join public.employments e on e.person_id=p.id
      where p.employee_id like 'P5-LARGE-%' order by p.employee_id limit 200`,
      [ADMIN],
    );

    type ScalePage = { items: unknown[]; total: number; totalPages: number; pageSize: number };
    const people = (
      await asUser<{ value: ScalePage }>(
        ADMIN,
        "select public.list_people_page('P5-LARGE',null,1,100) value",
      )
    ).rows[0]!.value;
    expect(people).toMatchObject({ total: 500, totalPages: 5, pageSize: 100 });
    expect(people.items).toHaveLength(100);
    const counts = await db.query<{ cases: number; tasks: number }>(
      `select count(distinct c.id)::integer cases,count(t.id)::integer tasks
       from public.cases c join public.persons p on p.id=c.person_id
       left join public.tasks t on t.case_id=c.id where p.employee_id like 'P5-LARGE-%'`,
    );
    expect(counts.rows[0]!.cases).toBe(200);
    expect(counts.rows[0]!.tasks).toBeGreaterThanOrEqual(1000);
    const report = await operationsReport(ADMIN);
    expect(report.tasks.filter((task) => task.caseId).length).toBeGreaterThanOrEqual(1000);
  }, 120_000);

  it("removes the obsolete email completion RPC from authenticated callers", async () => {
    const privilege = await db.query<{ allowed: boolean }>(
      `select has_function_privilege(
        'authenticated','public.complete_email_task(uuid,uuid,uuid,text,text,text)','EXECUTE'
      ) allowed`,
    );
    expect(privilege.rows[0]!.allowed).toBe(false);
  });

  it("keeps profile email, System Role and Data Scope out of the general directory", async () => {
    const directProfiles = await asUser<{ id: string; email: string }>(
      VIEWER,
      "select id,email from public.profiles where id<>$1",
      [VIEWER],
    );
    const directRoles = await asUser<{ user_id: string }>(
      VIEWER,
      "select user_id from public.user_roles where user_id<>$1",
      [VIEWER],
    );
    const directScopes = await asUser<{ user_id: string }>(
      VIEWER,
      "select user_id from public.user_scopes where user_id<>$1",
      [VIEWER],
    );
    expect(directProfiles.rows).toEqual([]);
    expect(directRoles.rows).toEqual([]);
    expect(directScopes.rows).toEqual([]);

    const directory = await asUser<{ id: string; name: string }>(
      VIEWER,
      "select id,name from public.list_profile_directory()",
    );
    expect(directory.rows.length).toBeGreaterThan(1);
  });

  it("rejects non-admin direct user-administration bypass attempts", async () => {
    for (const attacker of [VIEWER, MANAGER_A, IT_USER, ADMIN_TEAM_USER]) {
      await expect(
        asUser(attacker, "update public.profiles set status='Inactive' where id=$1", [MANAGER_B]),
      ).rejects.toThrow();
      await expect(
        asUser(attacker, "insert into public.user_roles(user_id,role) values($1,'admin')", [
          MANAGER_B,
        ]),
      ).rejects.toThrow();
      await expect(
        asUser(
          attacker,
          "insert into public.user_scopes(user_id,scope_type) values($1,'all_organization')",
          [MANAGER_B],
        ),
      ).rejects.toThrow();
      await expect(
        asUser(
          attacker,
          "insert into public.user_operational_teams(user_id,owner_team) values($1,'HR')",
          [MANAGER_B],
        ),
      ).rejects.toThrow();
    }
  });

  it("upgrades a populated Phase 1-4 database without losing historical business evidence", async () => {
    const upgradeDb = await PGlite.create(undefined, { extensions: { pgcrypto } });
    const phase5Head = "20260829090000_phase5_production_hardening.sql";
    const asUpgradeUser = async <T extends Record<string, unknown>>(
      userId: string,
      sql: string,
      params: unknown[] = [],
    ) => {
      await upgradeDb.exec("set role authenticated");
      await upgradeDb.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
      try {
        return await upgradeDb.query<T>(sql, params);
      } catch (error) {
        throw new Error(`Upgrade fixture query failed: ${sql.replace(/\s+/g, " ").trim()}`, {
          cause: error,
        });
      } finally {
        await upgradeDb.exec("reset role");
      }
    };

    try {
      await bootstrapSupabaseSchemas(upgradeDb);
      await applyMigrations(upgradeDb, (filename) => filename < phase5Head);

      const onboarding = await asUpgradeUser<{
        result: { caseId: string; personId: string; employmentId: string };
      }>(
        ADMIN,
        `select public.create_onboarding_case_v2(
          null,'Upgrade','Fixture',null,'upgrade.fixture@example.test','EMP-UPGRADE',
          'Employee',$1,'Engineer','Zurich','Supervisor',null,'2026-07-01',100,
          'Medium','Historical fixture',false
        ) result`,
        [TEAM_A],
      );
      const ids = onboarding.rows[0]!.result;
      const tasks = await upgradeDb.query<{ id: string }>(
        "select id from public.tasks where case_id=$1 order by created_at,id limit 2",
        [ids.caseId],
      );
      const completedTaskId = tasks.rows[0]!.id;
      const openTaskId = tasks.rows[1]!.id;
      const completedAt = "2026-07-02T08:30:00.000Z";
      await upgradeDb.query(
        `update public.tasks set status='Completed',completed_by=$2,completed_at=$3
         where id=$1`,
        [completedTaskId, ADMIN, completedAt],
      );
      await upgradeDb.query("update public.tasks set status='In Progress' where id=$1", [
        openTaskId,
      ]);
      await asUpgradeUser(ADMIN, "select public.confirm_joined($1,'2026-07-01')", [ids.caseId]);
      const offboarding = await asUpgradeUser<{ result: { caseId: string } }>(
        ADMIN,
        `select public.create_offboarding_case_v2(
          $1,$2,'2026-12-31','Voluntary Resignation','Historical reason','Medium','Preserve me'
        ) result`,
        [ids.personId, ids.employmentId],
      );
      const offboardingCaseId = offboarding.rows[0]!.result.caseId;

      const template = await upgradeDb.query<{ id: string; version: number }>(
        "select id,version from public.email_templates where status='Published' order by created_at limit 1",
      );
      const communication = await upgradeDb.query<{ id: string }>(
        `insert into public.email_communications(
          case_id,task_id,template_id,template_version,recipient,rendered_subject,state,prepared_by
        ) values($1,$2,$3,$4,'upgrade.fixture@example.test','Historical subject','Draft Prepared',$5)
        returning id`,
        [ids.caseId, openTaskId, template.rows[0]!.id, template.rows[0]!.version, ADMIN],
      );
      const communicationId = communication.rows[0]!.id;
      const attachment = await upgradeDb.query<{ id: string }>(
        `insert into public.email_additional_attachments(
          communication_id,case_id,compose_session_id,filename,storage_path,content_type,size,uploaded_by,expires_at
        ) values($1,$2,gen_random_uuid(),'Historical.pdf','additional/upgrade-history.pdf',
          'application/pdf',42,$3,null) returning id`,
        [communicationId, ids.caseId, ADMIN],
      );
      const attachmentId = attachment.rows[0]!.id;
      const audit = await upgradeDb.query<{ id: string }>(
        `insert into public.audit_logs(
          actor_id,entity_type,entity_id,action,case_id,metadata
        ) values($1,'case',$2,'Upgrade fixture evidence',$3,'{"stable":"preserve"}') returning id`,
        [ADMIN, ids.caseId, ids.caseId],
      );
      const auditId = audit.rows[0]!.id;
      const checklist = await upgradeDb.query<{ id: string; status: string }>(
        "select id,status from public.checklist_items where task_id=$1",
        [completedTaskId],
      );

      await applyMigrations(upgradeDb, (filename) => filename >= phase5Head);

      const person = await upgradeDb.query<{ display_name: string; employee_id: string }>(
        "select display_name,employee_id from public.persons where id=$1",
        [ids.personId],
      );
      expect(person.rows[0]).toMatchObject({
        display_name: "Upgrade Fixture",
        employee_id: "EMP-UPGRADE",
      });
      expect(
        (
          await upgradeDb.query("select id from public.employments where id=$1 and person_id=$2", [
            ids.employmentId,
            ids.personId,
          ])
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await upgradeDb.query<{ id: string }>(
            "select id from public.cases where id=any($1::uuid[])",
            [[ids.caseId, offboardingCaseId]],
          )
        ).rows.map((row) => row.id),
      ).toEqual(expect.arrayContaining([ids.caseId, offboardingCaseId]));
      const preservedTasks = await upgradeDb.query<{
        id: string;
        status: string;
        completed_by: string | null;
        completed_at: string | null;
      }>("select id,status,completed_by,completed_at from public.tasks where id=any($1::uuid[])", [
        [completedTaskId, openTaskId],
      ]);
      expect(preservedTasks.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: completedTaskId,
            status: "Completed",
            completed_by: ADMIN,
          }),
          expect.objectContaining({ id: openTaskId, status: "In Progress" }),
        ]),
      );
      expect(
        new Date(preservedTasks.rows.find((row) => row.id === completedTaskId)!.completed_at!),
      ).toEqual(new Date(completedAt));
      expect(
        (
          await upgradeDb.query("select id,status from public.checklist_items where id=$1", [
            checklist.rows[0]!.id,
          ])
        ).rows[0],
      ).toEqual(checklist.rows[0]);
      expect(
        (
          await upgradeDb.query(
            "select template_id,template_version,rendered_subject from public.email_communications where id=$1",
            [communicationId],
          )
        ).rows[0],
      ).toMatchObject({
        template_id: template.rows[0]!.id,
        template_version: template.rows[0]!.version,
        rendered_subject: "Historical subject",
      });
      expect(
        (
          await upgradeDb.query(
            "select communication_id,filename,storage_path from public.email_additional_attachments where id=$1",
            [attachmentId],
          )
        ).rows[0],
      ).toEqual({
        communication_id: communicationId,
        filename: "Historical.pdf",
        storage_path: "additional/upgrade-history.pdf",
      });
      expect(
        (
          await upgradeDb.query("select action,metadata from public.audit_logs where id=$1", [
            auditId,
          ])
        ).rows[0],
      ).toEqual({ action: "Upgrade fixture evidence", metadata: { stable: "preserve" } });
      await expect(
        asUpgradeUser(ADMIN, "select public.request_temporary_email_attachment_deletion($1)", [
          attachmentId,
        ]),
      ).rejects.toThrow("Upgrade fixture query failed");
    } finally {
      await upgradeDb.close();
    }
  }, 120_000);
});
