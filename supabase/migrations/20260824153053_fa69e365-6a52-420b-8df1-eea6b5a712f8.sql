create type public.app_role as enum ('admin', 'operator', 'manager', 'viewer');
create type public.scope_type as enum ('all_organization', 'lab', 'team', 'assigned_cases');
create type public.member_access as enum ('viewer', 'collaborator');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  title text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Active users read profiles"
  on public.profiles for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'Active'));

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users read own role, admins read all"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create table public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.labs to authenticated;
grant all on public.labs to service_role;
alter table public.labs enable row level security;
create policy "Active users read labs" on public.labs for select to authenticated using (true);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs (id) on delete cascade,
  name text not null,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index teams_lab_idx on public.teams (lab_id);
grant select on public.teams to authenticated;
grant all on public.teams to service_role;
alter table public.teams enable row level security;
create policy "Active users read teams" on public.teams for select to authenticated using (true);

create table public.user_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope_type scope_type not null,
  lab_id uuid references public.labs (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index user_scopes_user_idx on public.user_scopes (user_id);
grant select on public.user_scopes to authenticated;
grant all on public.user_scopes to service_role;
alter table public.user_scopes enable row level security;
create policy "Users read own scopes, admins read all"
  on public.user_scopes for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  full_name text not null,
  email text,
  employee_id text,
  phone text,
  lab_id uuid references public.labs (id),
  team_id uuid references public.teams (id),
  manager_id uuid references public.persons (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index persons_team_idx on public.persons (team_id);
grant select, insert, update on public.persons to authenticated;
grant all on public.persons to service_role;
alter table public.persons enable row level security;
create policy "Active users read persons"
  on public.persons for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'Active'));
create policy "Operators and up manage persons"
  on public.persons for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'operator') or public.has_role(auth.uid(), 'manager'));
create policy "Operators and up update persons"
  on public.persons for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'operator') or public.has_role(auth.uid(), 'manager'));

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons (id),
  case_type text not null check (case_type in ('Onboarding', 'Offboarding')),
  employment_type text,
  start_date date,
  end_date date,
  workload integer,
  contract_type text,
  role text,
  location text,
  owner_id uuid not null references auth.users (id),
  status text not null default 'Draft',
  priority text not null default 'Medium',
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cases_person_idx on public.cases (person_id);
create index cases_owner_status_idx on public.cases (owner_id, status);
grant select, insert, update, delete on public.cases to authenticated;
grant all on public.cases to service_role;
alter table public.cases enable row level security;

create table public.case_members (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  access_level member_access not null,
  created_by uuid not null references auth.users (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, user_id)
);
create index case_members_case_idx on public.case_members (case_id);
create index case_members_user_idx on public.case_members (user_id);
grant select, insert, delete on public.case_members to authenticated;
grant all on public.case_members to service_role;
alter table public.case_members enable row level security;

create or replace function public.case_access(_user_id uuid, _case_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when not exists (select 1 from public.profiles p where p.id = _user_id and p.status = 'Active') then 'none'
    when public.has_role(_user_id, 'admin') then 'owner'
    when c.owner_id = _user_id then 'owner'
    when m.access_level = 'collaborator' then 'collaborator'
    when m.access_level = 'viewer' then 'viewer'
    when exists (select 1 from public.user_scopes s where s.user_id = _user_id and s.scope_type = 'all_organization') then 'scoped'
    when exists (select 1 from public.user_scopes s where s.user_id = _user_id and s.scope_type = 'lab' and s.lab_id = p.lab_id) then 'scoped'
    when exists (select 1 from public.user_scopes s where s.user_id = _user_id and s.scope_type = 'team' and s.team_id = p.team_id) then 'scoped'
    else 'none'
  end
  from public.cases c
  join public.persons p on p.id = c.person_id
  left join public.case_members m
    on m.case_id = c.id and m.user_id = _user_id and m.revoked_at is null
  where c.id = _case_id
$$;

create policy "Cases visible by ownership, membership or scope"
  on public.cases for select to authenticated
  using (public.case_access(auth.uid(), id) <> 'none');
create policy "Operators and up create cases"
  on public.cases for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'operator') or public.has_role(auth.uid(), 'manager'));
create policy "Owners and collaborators update cases"
  on public.cases for update to authenticated
  using (public.case_access(auth.uid(), id) in ('owner', 'collaborator'));
create policy "Only case owners delete cases"
  on public.cases for delete to authenticated
  using (public.case_access(auth.uid(), id) = 'owner');

create policy "Members readable with case access"
  on public.case_members for select to authenticated
  using (public.case_access(auth.uid(), case_id) <> 'none');
create policy "Only case owners share"
  on public.case_members for insert to authenticated
  with check (public.case_access(auth.uid(), case_id) = 'owner');
create policy "Only case owners revoke"
  on public.case_members for delete to authenticated
  using (public.case_access(auth.uid(), case_id) = 'owner');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  checklist_item_id uuid,
  title text not null,
  task_type text not null default 'General',
  owner_id uuid not null references auth.users (id),
  due_date date,
  priority text not null default 'Medium',
  status text not null default 'Open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_owner_status_idx on public.tasks (owner_id, status);
create index tasks_case_idx on public.tasks (case_id);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  section text not null,
  title text not null,
  status text not null default 'Open',
  owner_id uuid references auth.users (id),
  due_date date,
  completed_date timestamptz,
  completed_by uuid references auth.users (id),
  sort_order integer not null default 0,
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checklist_case_idx on public.checklist_items (case_id);
alter table public.tasks
  add constraint tasks_checklist_item_fk
  foreign key (checklist_item_id) references public.checklist_items (id) on delete set null;
grant select, insert, update, delete on public.checklist_items to authenticated;
grant all on public.checklist_items to service_role;
alter table public.checklist_items enable row level security;

create policy "Tasks visible with case access or ownership"
  on public.tasks for select to authenticated
  using (public.case_access(auth.uid(), case_id) <> 'none' or owner_id = auth.uid());
create policy "Owners and collaborators manage tasks"
  on public.tasks for insert to authenticated
  with check (public.case_access(auth.uid(), case_id) in ('owner', 'collaborator'));
create policy "Assignees and case editors update tasks"
  on public.tasks for update to authenticated
  using (public.case_access(auth.uid(), case_id) in ('owner', 'collaborator') or owner_id = auth.uid());
create policy "Owners and collaborators delete tasks"
  on public.tasks for delete to authenticated
  using (public.case_access(auth.uid(), case_id) in ('owner', 'collaborator'));

create policy "Checklist visible with case access"
  on public.checklist_items for select to authenticated
  using (public.case_access(auth.uid(), case_id) <> 'none');
create policy "Owners and collaborators manage checklist"
  on public.checklist_items for insert to authenticated
  with check (public.case_access(auth.uid(), case_id) in ('owner', 'collaborator'));
create policy "Case editors and item owners update checklist"
  on public.checklist_items for update to authenticated
  using (public.case_access(auth.uid(), case_id) in ('owner', 'collaborator') or owner_id = auth.uid());
create policy "Owners and collaborators delete checklist items"
  on public.checklist_items for delete to authenticated
  using (public.case_access(auth.uid(), case_id) in ('owner', 'collaborator'));

create or replace function public.set_checklist_completion(_item_id uuid, _complete boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  _task uuid;
  _case uuid;
  _access text;
begin
  select ci.task_id, ci.case_id into _task, _case
  from public.checklist_items ci where ci.id = _item_id;
  if _case is null then raise exception 'checklist item not found'; end if;

  _access := public.case_access(auth.uid(), _case);
  if not (
    _access in ('owner', 'collaborator')
    or exists (select 1 from public.checklist_items ci where ci.id = _item_id and ci.owner_id = auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  update public.checklist_items set
    status = case when _complete then 'Completed' else 'Open' end,
    completed_date = case when _complete then now() else null end,
    completed_by = case when _complete then auth.uid() else null end,
    updated_at = now()
  where id = _item_id;

  if _task is not null then
    update public.tasks set
      status = case when _complete then 'Completed' else 'Open' end,
      completed_at = case when _complete then now() else null end,
      updated_at = now()
    where id = _task;
  end if;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, case_id)
  values (auth.uid(), 'checklist_item', _item_id::text,
          case when _complete then 'Checklist item completed' else 'Checklist item reopened' end, _case);
end
$$;

create or replace function public.set_task_completion(_task_id uuid, _complete boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  _item uuid;
  _case uuid;
  _access text;
begin
  select t.checklist_item_id, t.case_id into _item, _case
  from public.tasks t where t.id = _task_id;
  if _case is null then raise exception 'task not found'; end if;

  _access := public.case_access(auth.uid(), _case);
  if not (
    _access in ('owner', 'collaborator')
    or exists (select 1 from public.tasks t where t.id = _task_id and t.owner_id = auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  update public.tasks set
    status = case when _complete then 'Completed' else 'Open' end,
    completed_at = case when _complete then now() else null end,
    updated_at = now()
  where id = _task_id;

  if _item is not null then
    update public.checklist_items set
      status = case when _complete then 'Completed' else 'Open' end,
      completed_date = case when _complete then now() else null end,
      completed_by = case when _complete then auth.uid() else null end,
      updated_at = now()
    where id = _item;
  end if;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, case_id)
  values (auth.uid(), 'task', _task_id::text,
          case when _complete then 'Task completed' else 'Task reopened' end, _case);
end
$$;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  field text,
  previous_value text,
  new_value text,
  case_id uuid references public.cases (id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index audit_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_case_idx on public.audit_logs (case_id, created_at);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "Audit visible with case access or to admins"
  on public.audit_logs for select to authenticated
  using ((case_id is null and public.has_role(auth.uid(), 'admin'))
         or (case_id is not null and public.case_access(auth.uid(), case_id) <> 'none')
         or actor_id = auth.uid());
create policy "Signed-in users append audit rows as themselves"
  on public.audit_logs for insert to authenticated
  with check (actor_id = auth.uid());

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'General',
  description text,
  owner_id uuid not null references auth.users (id),
  language text not null default 'en',
  status text not null default 'Draft' check (status in ('Draft', 'Published')),
  version integer not null default 1,
  subject text not null,
  body_html text not null,
  variables jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.email_templates to authenticated;
grant all on public.email_templates to service_role;
alter table public.email_templates enable row level security;
create policy "Active users read published templates"
  on public.email_templates for select to authenticated
  using (status = 'Published' or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'operator'));

create table public.case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  filename text not null,
  storage_path text not null,
  content_type text,
  size integer not null default 0,
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index case_files_case_idx on public.case_files (case_id);
grant select, insert on public.case_files to authenticated;
grant all on public.case_files to service_role;
alter table public.case_files enable row level security;
create policy "Files visible with case access"
  on public.case_files for select to authenticated
  using (public.case_access(auth.uid(), case_id) <> 'none');
create policy "Owners and collaborators upload files"
  on public.case_files for insert to authenticated
  with check (public.case_access(auth.uid(), case_id) in ('owner', 'collaborator') and uploaded_by = auth.uid());

insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'rui.zhang@workbench.demo', crypt('Workbench2026!', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{"name":"Rui Zhang"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'anna.meier@workbench.demo', crypt('Workbench2026!', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{"name":"Anna Meier"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'todor.petrov@workbench.demo', crypt('Workbench2026!', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{"name":"Todor Petrov"}', now(), now()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'john.smith@workbench.demo', crypt('Workbench2026!', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{"name":"John Smith"}', now(), now());

insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'rui.zhang@workbench.demo',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"rui.zhang@workbench.demo","email_verified":true}', 'email', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'anna.meier@workbench.demo',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"anna.meier@workbench.demo","email_verified":true}', 'email', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'todor.petrov@workbench.demo',
   '{"sub":"33333333-3333-3333-3333-333333333333","email":"todor.petrov@workbench.demo","email_verified":true}', 'email', now(), now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'john.smith@workbench.demo',
   '{"sub":"44444444-4444-4444-4444-444444444444","email":"john.smith@workbench.demo","email_verified":true}', 'email', now(), now(), now());

insert into public.profiles (id, email, name, title, status) values
  ('11111111-1111-1111-1111-111111111111', 'rui.zhang@workbench.demo', 'Rui Zhang', 'People Operations Lead', 'Active'),
  ('22222222-2222-2222-2222-222222222222', 'anna.meier@workbench.demo', 'Anna Meier', 'People Operations Specialist', 'Active'),
  ('33333333-3333-3333-3333-333333333333', 'todor.petrov@workbench.demo', 'Todor Petrov', 'Research Coordinator', 'Active'),
  ('44444444-4444-4444-4444-444444444444', 'john.smith@workbench.demo', 'John Smith', 'Network Team Manager', 'Active');

insert into public.user_roles (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'operator'),
  ('33333333-3333-3333-3333-333333333333', 'viewer'),
  ('44444444-4444-4444-4444-444444444444', 'manager');

insert into public.labs (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Zurich Research Center');
insert into public.teams (id, lab_id, name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Network'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'AI Systems');

insert into public.user_scopes (user_id, scope_type, lab_id, team_id) values
  ('22222222-2222-2222-2222-222222222222', 'all_organization', null, null),
  ('44444444-4444-4444-4444-444444444444', 'team', null, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('33333333-3333-3333-3333-333333333333', 'assigned_cases', null, null);

insert into public.persons (id, first_name, last_name, full_name, email, employee_id, phone, lab_id, team_id, manager_id) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Peter', 'Wang', 'Peter Wang', 'peter.wang@workbench.demo', 'E-1001', '+41 79 555 10 01',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Michael', 'Smith', 'Michael Smith', 'michael.smith@workbench.demo', null, '+41 79 555 14 08',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Sofia', 'Rossi', 'Sofia Rossi', 'sofia.rossi@workbench.demo', null, null,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null);

insert into public.cases (id, person_id, case_type, employment_type, start_date, workload, contract_type,
                          role, location, owner_id, status, priority, notes)
values
  ('99999999-9999-9999-9999-999999999999', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Onboarding', 'Employee',
   '2026-09-15', 100, 'Permanent', 'Senior Research Engineer', 'Zurich',
   '11111111-1111-1111-1111-111111111111', 'Preparing', 'High', 'Relocation support required'),
  ('88888888-8888-8888-8888-888888888888', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Onboarding', 'Intern',
   '2026-10-01', 80, 'Fixed-term', 'Research Intern', 'Zurich',
   '22222222-2222-2222-2222-222222222222', 'Waiting', 'Medium', null);

insert into public.case_members (case_id, user_id, access_level, created_by) values
  ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', 'viewer',
   '11111111-1111-1111-1111-111111111111');

insert into public.tasks (id, case_id, title, task_type, owner_id, due_date, priority, status, completed_at) values
  ('55555555-5555-5555-5555-555555555551', '99999999-9999-9999-9999-999999999999', 'Contract signed', 'General',
   '11111111-1111-1111-1111-111111111111', '2026-08-28', 'High', 'Completed', now()),
  ('55555555-5555-5555-5555-555555555552', '99999999-9999-9999-9999-999999999999', 'Confirm IT account', 'General',
   '22222222-2222-2222-2222-222222222222', '2026-09-10', 'High', 'Open', null),
  ('55555555-5555-5555-5555-555555555553', '99999999-9999-9999-9999-999999999999', 'Send welcome email', 'Email',
   '11111111-1111-1111-1111-111111111111', '2026-08-26', 'Medium', 'Open', null);

insert into public.checklist_items (case_id, section, title, status, owner_id, due_date, completed_date, completed_by, sort_order, task_id) values
  ('99999999-9999-9999-9999-999999999999', 'PRE-ONBOARDING', 'Contract signed', 'Completed',
   '11111111-1111-1111-1111-111111111111', '2026-08-22', now(), '11111111-1111-1111-1111-111111111111', 1, '55555555-5555-5555-5555-555555555551'),
  ('99999999-9999-9999-9999-999999999999', 'PRE-ONBOARDING', 'Work permit confirmed', 'Completed',
   '11111111-1111-1111-1111-111111111111', '2026-08-22', now(), '11111111-1111-1111-1111-111111111111', 2, null),
  ('99999999-9999-9999-9999-999999999999', 'PRE-ONBOARDING', 'IT account', 'Open',
   '22222222-2222-2222-2222-222222222222', '2026-09-10', null, null, 3, '55555555-5555-5555-5555-555555555552'),
  ('99999999-9999-9999-9999-999999999999', 'PRE-ONBOARDING', 'Laptop', 'Waiting',
   '22222222-2222-2222-2222-222222222222', '2026-09-10', null, null, 4, null),
  ('99999999-9999-9999-9999-999999999999', 'PRE-ONBOARDING', 'Badge', 'Open',
   '22222222-2222-2222-2222-222222222222', '2026-09-10', null, null, 5, null),
  ('99999999-9999-9999-9999-999999999999', 'COMMUNICATION', 'Welcome email', 'Open',
   '11111111-1111-1111-1111-111111111111', '2026-08-26', null, null, 6, '55555555-5555-5555-5555-555555555553'),
  ('99999999-9999-9999-9999-999999999999', 'COMMUNICATION', 'Manager reminder', 'Waiting',
   '11111111-1111-1111-1111-111111111111', '2026-08-27', null, null, 7, null),
  ('99999999-9999-9999-9999-999999999999', 'COMMUNICATION', 'IT notification', 'Waiting',
   '11111111-1111-1111-1111-111111111111', '2026-08-28', null, null, 8, null);

update public.tasks set checklist_item_id = (
  select id from public.checklist_items ci where ci.task_id = tasks.id
);

insert into public.audit_logs (actor_id, entity_type, entity_id, action, field, previous_value, new_value, case_id, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'case', '99999999-9999-9999-9999-999999999999', 'Case created', null, null, 'Draft',
   '99999999-9999-9999-9999-999999999999', now() - interval '3 days'),
  ('11111111-1111-1111-1111-111111111111', 'case', '99999999-9999-9999-9999-999999999999', 'Start Date changed', 'start_date', '01 Sep 2026', '15 Sep 2026',
   '99999999-9999-9999-9999-999999999999', now() - interval '1 day'),
  ('11111111-1111-1111-1111-111111111111', 'case_member', '33333333-3333-3333-3333-333333333333', 'Case shared with Todor Petrov', 'access_level', null, 'viewer',
   '99999999-9999-9999-9999-999999999999', now() - interval '1 day');

insert into public.email_templates (name, category, description, owner_id, status, version, subject, body_html, variables) values
  ('Welcome to the team', 'Onboarding', 'Standard welcome message for new employees',
   '11111111-1111-1111-1111-111111111111', 'Published', 6,
   'Welcome to the team – {{person.first_name}}',
   '<p>Dear {{person.first_name}},</p><p>We are pleased to welcome you to our Research Center.</p><p>Your first working day will be <b>{{case.start_date}}</b>. Your supervisor will be <b>{{manager.name}}</b>.</p><p>Please find our welcome guide attached. We look forward to meeting you.</p><p>Kind regards,</p>',
   '[{"key":"person.first_name","label":"First Name","required":true},{"key":"case.start_date","label":"Start Date","required":true},{"key":"manager.name","label":"Manager","required":true},{"key":"manual.additional_information","label":"Additional Information","required":false}]'),
  ('Documents required', 'Onboarding', 'Checklist of documents new hires must provide',
   '11111111-1111-1111-1111-111111111111', 'Published', 3,
   'Documents required before your first day',
   '<p>Dear {{person.first_name}},</p><p>Please provide the following documents before {{case.start_date}}: passport copy, work permit, bank details.</p><p>Kind regards,</p>',
   '[{"key":"person.first_name","label":"First Name","required":true},{"key":"case.start_date","label":"Start Date","required":true}]'),
  ('Manager reminder', 'General', 'Reminder for managers about upcoming starts',
   '22222222-2222-2222-2222-222222222222', 'Draft', 2,
   'Upcoming start: {{person.full_name}}',
   '<p>Hello {{manager.name}},</p><p>{{person.full_name}} starts on {{case.start_date}}. Please prepare the workspace and onboarding plan.</p>',
   '[{"key":"manager.name","label":"Manager","required":true},{"key":"person.full_name","label":"Full Name","required":true},{"key":"case.start_date","label":"Start Date","required":true}]'),
  ('Leaving confirmation', 'Offboarding', 'Confirmation of last working day and next steps',
   '11111111-1111-1111-1111-111111111111', 'Published', 4,
   'Confirmation of your last working day',
   '<p>Dear {{person.first_name}},</p><p>We confirm that your last working day will be {{case.end_date}}. Please return all equipment by then.</p><p>Kind regards,</p>',
   '[{"key":"person.first_name","label":"First Name","required":true},{"key":"case.end_date","label":"Last Working Day","required":true}]');