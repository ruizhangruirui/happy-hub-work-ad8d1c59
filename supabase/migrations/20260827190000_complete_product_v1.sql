-- Team Workbench V1: lifecycle, rule-driven checklists and team-owned work.
-- This migration extends the existing Person -> Employment -> Case model and
-- deliberately preserves every existing Person, Case, task and audit row.

alter table public.cases
  add column if not exists contract_end_date date,
  add column if not exists last_working_day date,
  add column if not exists joined_date date,
  add column if not exists joined_at timestamptz,
  add column if not exists joined_by uuid references auth.users(id),
  add column if not exists left_date date,
  add column if not exists left_at timestamptz,
  add column if not exists left_by uuid references auth.users(id);

update public.cases
set last_working_day = coalesce(last_working_day, effective_date, end_date)
where case_type = 'Offboarding';

alter table public.tasks
  add column if not exists description text,
  add column if not exists owner_team text not null default 'HR',
  add column if not exists mandatory boolean not null default true,
  add column if not exists completed_by uuid references auth.users(id),
  add column if not exists notes text;

update public.tasks
set owner_team = case lower(coalesce(assignee_role, 'hr'))
  when 'it_support' then 'IT'
  when 'it' then 'IT'
  when 'admin' then 'Admin'
  else 'HR'
end;

create table if not exists public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  case_type text not null check (case_type in ('Onboarding','Offboarding')),
  title text not null,
  description text,
  applicable_employment_types text[] not null default '{}',
  applicable_leaving_types text[] not null default '{}',
  applicable_leaving_reasons text[] not null default '{}',
  owner_team text not null check (owner_team in ('HR','IT','Admin')),
  assigned_user_id uuid references auth.users(id),
  mandatory boolean not null default true,
  due_rule text not null default 'Manual' check (due_rule in (
    'On Start Date','Before Start Date','After Start Date',
    'On Last Working Day','Before Last Working Day','After Leaving','Manual'
  )),
  due_offset_days integer not null default 0,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.checklist_template_items to authenticated;
grant insert, update, delete on public.checklist_template_items to authenticated;
grant all on public.checklist_template_items to service_role;
alter table public.checklist_template_items enable row level security;
drop policy if exists "Active users read checklist templates" on public.checklist_template_items;
create policy "Active users read checklist templates" on public.checklist_template_items
  for select to authenticated using (public.is_active_user(auth.uid()));
drop policy if exists "HR manages checklist templates" on public.checklist_template_items;
create policy "HR manages checklist templates" on public.checklist_template_items
  for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator'));

create table if not exists public.user_operational_teams (
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_team text not null check (owner_team in ('HR','IT','Admin')),
  created_at timestamptz not null default now(),
  primary key(user_id, owner_team)
);
grant select on public.user_operational_teams to authenticated;
grant all on public.user_operational_teams to service_role;
alter table public.user_operational_teams enable row level security;
drop policy if exists "Users view operational teams" on public.user_operational_teams;
create policy "Users view operational teams" on public.user_operational_teams
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

insert into public.user_operational_teams(user_id,owner_team)
select p.id,'HR' from public.profiles p
where p.status='Active' and exists (
  select 1 from public.user_roles r where r.user_id=p.id and r.role in ('admin','operator','manager')
)
on conflict do nothing;

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments(task_id,created_at);
grant select,insert on public.task_comments to authenticated;
grant all on public.task_comments to service_role;
alter table public.task_comments enable row level security;

create table if not exists public.task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  content_type text,
  size integer not null default 0,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists task_files_task_idx on public.task_files(task_id,created_at);
grant select,insert on public.task_files to authenticated;
grant all on public.task_files to service_role;
alter table public.task_files enable row level security;

create or replace function public.is_operational_team_member(_user_id uuid,_owner_team text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user(_user_id) and (
    public.has_role(_user_id,'admin')
    or exists(select 1 from public.user_operational_teams u where u.user_id=_user_id and u.owner_team=_owner_team)
  )
$$;
grant execute on function public.case_access(uuid,uuid) to authenticated;
grant execute on function public.is_operational_team_member(uuid,text) to authenticated;

create or replace function public.can_update_task(_user_id uuid,_task_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.tasks t
    where t.id=_task_id and (
      (t.owner_team='HR' and public.case_access(_user_id,t.case_id) in ('owner','collaborator'))
      or (t.owner_team<>'HR' and public.is_operational_team_member(_user_id,t.owner_team))
      or t.owner_id=_user_id
    )
  )
$$;

drop policy if exists "Tasks visible with case access or ownership" on public.tasks;
drop policy if exists "Assignees and case editors update tasks" on public.tasks;
create policy "Scoped users view tasks" on public.tasks for select to authenticated using (
  public.case_access(auth.uid(),case_id)<>'none' or owner_id=auth.uid()
  or public.is_operational_team_member(auth.uid(),owner_team)
);
create policy "Scoped users update owned tasks" on public.tasks for update to authenticated
  using(public.can_update_task(auth.uid(),id)) with check(public.can_update_task(auth.uid(),id));

drop policy if exists "Task collaborators read comments" on public.task_comments;
create policy "Task collaborators read comments" on public.task_comments for select to authenticated
  using(exists(select 1 from public.tasks t where t.id=task_id and (
    public.case_access(auth.uid(),t.case_id)<>'none' or t.owner_id=auth.uid()
    or public.is_operational_team_member(auth.uid(),t.owner_team))));
drop policy if exists "Task collaborators add comments" on public.task_comments;
create policy "Task collaborators add comments" on public.task_comments for insert to authenticated
  with check(author_id=auth.uid() and public.can_update_task(auth.uid(),task_id));
drop policy if exists "Task collaborators read files" on public.task_files;
create policy "Task collaborators read files" on public.task_files for select to authenticated
  using(exists(select 1 from public.tasks t where t.id=task_id and (
    public.case_access(auth.uid(),t.case_id)<>'none' or t.owner_id=auth.uid()
    or public.is_operational_team_member(auth.uid(),t.owner_team))));
drop policy if exists "Task collaborators add files" on public.task_files;
create policy "Task collaborators add files" on public.task_files for insert to authenticated
  with check(uploaded_by=auth.uid() and public.can_update_task(auth.uid(),task_id));

create or replace function public.calculate_case_task_due_date(
  _case_id uuid,_rule text,_offset integer default 0
)
returns date language sql stable security definer set search_path=public as $$
  select case _rule
    when 'On Start Date' then c.start_date
    when 'Before Start Date' then c.start_date - abs(coalesce(_offset,0))
    when 'After Start Date' then c.start_date + abs(coalesce(_offset,0))
    when 'On Last Working Day' then c.last_working_day
    when 'Before Last Working Day' then c.last_working_day - abs(coalesce(_offset,0))
    when 'After Leaving' then c.last_working_day + abs(coalesce(_offset,0))
    else null
  end from public.cases c where c.id=_case_id
$$;

insert into public.checklist_template_items(template_key,case_type,title,description,applicable_employment_types,applicable_leaving_types,owner_team,mandatory,due_rule,due_offset_days,sort_order)
values
 ('onb_hr_system','Onboarding','Complete system onboarding','Create the worker in the HR system','{}','{}','HR',true,'Before Start Date',28,10),
 ('onb_hr_contract','Onboarding','Sign contract','Complete the required employment agreement','{Employee,Intern}','{}','HR',true,'Before Start Date',28,20),
 ('onb_hr_preboard','Onboarding','Move to pre-boarding','Confirm the worker is ready for pre-boarding','{}','{}','HR',true,'Before Start Date',21,30),
 ('onb_hr_payroll','Onboarding','Send payroll email','Send payroll information to the worker','{Employee,Intern}','{}','HR',true,'Before Start Date',28,40),
 ('onb_hr_welcome','Onboarding','Send Welcome Email','Send the configured welcome email','{}','{}','HR',true,'Before Start Date',14,50),
 ('onb_it_equipment','Onboarding','Prepare IT equipment','Prepare the device and required accessories','{}','{}','IT',true,'Before Start Date',14,60),
 ('onb_it_account','Onboarding','Create employee account','Create account and credentials','{}','{}','IT',true,'Before Start Date',14,70),
 ('onb_admin_access','Onboarding','Prepare badge and workplace','Prepare physical access and workplace','{}','{}','Admin',true,'Before Start Date',7,80),
 ('onb_manager_meeting','Onboarding','Schedule onboarding meeting','Arrange the first onboarding meeting','{}','{}','HR',true,'Before Start Date',7,90),
 ('off_hr_system','Offboarding','Complete system offboarding','Process the departure in the HR system','{}','{}','HR',true,'On Last Working Day',0,10),
 ('off_hr_lwd','Offboarding','Confirm Last Working Day','Confirm the actual last working day','{}','{}','HR',true,'Manual',0,20),
 ('off_hr_agreement','Offboarding','Leaving Agreement','Prepare the leaving agreement','{Employee}','{Voluntary Resignation,Employer Termination}','HR',true,'Before Last Working Day',14,30),
 ('off_hr_termination','Offboarding','Termination Letter','Prepare the employer termination letter','{Employee}','{Employer Termination}','HR',true,'Before Last Working Day',14,40),
 ('off_hr_garden','Offboarding','Garden Leave Letter','Optional garden leave documentation','{Employee}','{Employer Termination}','HR',false,'Before Last Working Day',14,50),
 ('off_hr_email','Offboarding','Send offboarding email','Send the configured offboarding email','{}','{}','HR',true,'Before Last Working Day',7,60),
 ('off_it_account','Offboarding','Close accounts and access','Disable company accounts and access','{}','{}','IT',true,'On Last Working Day',0,70),
 ('off_admin_return','Offboarding','Confirm badge and asset return','Confirm workplace property return','{}','{}','Admin',true,'On Last Working Day',0,80),
 ('off_hr_reference','Offboarding','Prepare reference letter','Complete the reference letter','{}','{}','HR',false,'After Leaving',7,90),
 ('off_hr_leave','Offboarding','Settle annual leave','Complete annual leave settlement','{}','{}','HR',true,'After Leaving',7,100),
 ('off_hr_overtime','Offboarding','Settle overtime','Complete overtime settlement','{}','{}','HR',false,'After Leaving',7,110)
on conflict(template_key) do update set
 title=excluded.title,description=excluded.description,applicable_employment_types=excluded.applicable_employment_types,
 applicable_leaving_types=excluded.applicable_leaving_types,owner_team=excluded.owner_team,mandatory=excluded.mandatory,
 due_rule=excluded.due_rule,due_offset_days=excluded.due_offset_days,sort_order=excluded.sort_order;

create or replace function public.generate_case_tasks(_case_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype; item public.checklist_template_items%rowtype; generated_task_id uuid; created_count integer:=0;
begin
  select * into c from public.cases where id=_case_id;
  if c.id is null then raise exception 'Case not found'; end if;
  for item in
    select * from public.checklist_template_items x
    where x.enabled and x.case_type=c.case_type
      and (cardinality(x.applicable_employment_types)=0 or c.employment_type=any(x.applicable_employment_types))
      and (c.case_type<>'Offboarding' or cardinality(x.applicable_leaving_types)=0 or c.leaving_type=any(x.applicable_leaving_types))
      and (c.case_type<>'Offboarding' or cardinality(x.applicable_leaving_reasons)=0 or c.leaving_reason=any(x.applicable_leaving_reasons))
    order by x.sort_order,x.title
  loop
    insert into public.tasks(case_id,title,description,task_type,owner_id,assignee_role,owner_team,status,due_date,priority,default_task_key,mandatory)
    values(c.id,item.title,item.description,case when lower(item.title) like '%email%' then 'Email' else 'Task' end,
      coalesce(item.assigned_user_id,c.owner_id),lower(replace(item.owner_team,' ','_')),item.owner_team,'Not Started',
      public.calculate_case_task_due_date(c.id,item.due_rule,item.due_offset_days),
      case when item.mandatory then 'High' else 'Medium' end,item.template_key,item.mandatory)
    on conflict(case_id,default_task_key) where default_task_key is not null do nothing returning id into generated_task_id;
    if generated_task_id is not null then
      insert into public.checklist_items(case_id,section,title,status,owner_id,due_date,sort_order,task_id)
      values(c.id,item.owner_team,item.title,'Open',coalesce(item.assigned_user_id,c.owner_id),
        public.calculate_case_task_due_date(c.id,item.due_rule,item.due_offset_days),item.sort_order,generated_task_id);
      update public.tasks target
      set checklist_item_id=(select ci.id from public.checklist_items ci where ci.task_id=generated_task_id limit 1)
      where target.id=generated_task_id;
      created_count:=created_count+1;
    end if;
    generated_task_id:=null;
  end loop;
  return created_count;
end
$$;

create or replace function public.create_default_onboarding_tasks()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.generate_case_tasks(new.id); return new; end
$$;

-- Existing trigger name is retained so inserts through every code path use the rule engine.

create or replace function public.refresh_case_workflow_status(_case_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype; open_required boolean;
begin
  select * into c from public.cases where id=_case_id for update;
  if c.id is null or c.status in ('Cancelled','Preparing','Ready to Join','Ready for Exit') then return; end if;
  select exists(select 1 from public.tasks t where t.case_id=c.id and t.mandatory and t.status not in ('Completed','Not Applicable')) into open_required;
  if c.case_type='Onboarding' and c.joined_at is not null then
    update public.cases set status=case when open_required then 'Follow-up' else 'Completed' end,updated_at=now() where id=c.id;
  elsif c.case_type='Offboarding' and c.left_at is not null then
    update public.cases set status=case when open_required then 'Follow-up' else 'Completed' end,updated_at=now() where id=c.id;
  end if;
end
$$;

create or replace function public.transition_lifecycle_case(_case_id uuid,_confirm boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype; e public.employments%rowtype; old_status text; next_status text; today date:=public.business_date();
begin
  select * into c from public.cases where id=_case_id for update;
  if c.id is null then raise exception 'Case not found'; end if;
  if c.employment_id is null then raise exception 'Lifecycle case requires reconciled employment'; end if;
  if public.case_access(auth.uid(),c.id) not in ('owner','collaborator')
    or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator') or public.has_role(auth.uid(),'manager'))
  then raise insufficient_privilege; end if;
  select * into e from public.employments where id=c.employment_id for update;
  old_status:=c.status;

  if _confirm then
    if c.case_type='Onboarding' then
      if c.joined_at is not null then raise exception 'Joining already confirmed'; end if;
      next_status:='Joined';
      update public.cases set status=next_status,joined_date=today,joined_at=now(),joined_by=auth.uid(),updated_at=now() where id=c.id;
      update public.employments set status='active',start_date=coalesce(start_date,today),updated_at=now() where id=e.id;
    else
      if c.left_at is not null then raise exception 'Leaving already confirmed'; end if;
      next_status:='Left';
      update public.cases set status=next_status,left_date=coalesce(c.last_working_day,c.effective_date,today),left_at=now(),left_by=auth.uid(),
        pre_offboarding_end_date=e.end_date,offboarding_snapshot_captured=true,updated_at=now() where id=c.id;
      -- Explicit confirmation immediately removes the Person from Active People.
      update public.employments set status='ended',end_date=coalesce(c.last_working_day,c.effective_date,today),updated_at=now() where id=e.id;
    end if;
  else
    if c.case_type='Onboarding' and c.joined_at is not null then
      next_status:='Preparing';
      update public.cases set status=next_status,joined_date=null,joined_at=null,joined_by=null,updated_at=now() where id=c.id;
      update public.employments set status='planned',updated_at=now() where id=e.id;
    elsif c.case_type='Offboarding' and c.left_at is not null then
      next_status:='Preparing';
      update public.cases set status=next_status,left_date=null,left_at=null,left_by=null,updated_at=now() where id=c.id;
      update public.employments set status='active',end_date=case when c.offboarding_snapshot_captured then c.pre_offboarding_end_date else c.contract_end_date end,updated_at=now() where id=e.id;
    else raise exception 'Lifecycle confirmation not found'; end if;
  end if;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'case',c.id::text,
    case when _confirm and c.case_type='Onboarding' then 'Confirmed joined'
         when _confirm then 'Confirmed left' else 'Reopened lifecycle confirmation' end,
    'status',old_status,next_status,c.id,jsonb_build_object('personId',c.person_id,'employmentId',c.employment_id,'businessDate',today));
  return jsonb_build_object('caseId',c.id,'status',next_status);
end
$$;

create or replace function public.get_effective_employment_status(_employment_id uuid,_as_of date default current_date)
returns text language sql stable security definer set search_path=public as $$
  select case
    when e.status='cancelled' then 'cancelled'
    when exists(select 1 from public.cases c where c.employment_id=e.id and c.case_type='Offboarding' and c.left_at is not null) then 'ended'
    when exists(select 1 from public.cases c where c.employment_id=e.id and c.case_type='Offboarding' and c.left_at is null and c.status<>'Cancelled') then 'ending'
    when e.source_onboarding_case_id is not null and not exists(select 1 from public.cases c where c.id=e.source_onboarding_case_id and (c.joined_at is not null or c.status in ('Confirmed','Joined','Follow-up','Completed'))) then 'planned'
    when e.start_date is not null and e.start_date>_as_of then 'planned'
    when e.status='ended' or (e.end_date is not null and e.end_date<_as_of) then 'ended'
    when e.end_date is not null and e.end_date>=_as_of then 'ending'
    else 'active'
  end from public.employments e where e.id=_employment_id
$$;

create or replace view public.active_employee_roster with (security_invoker=true) as
select p.id person_id,e.source_onboarding_case_id case_id,p.display_name full_name,p.email,p.employee_id,p.phone,
 e.employment_type,e.role_title role,e.location,t.name team_name,e.start_date,e.supervisor_name,
 exists(select 1 from public.cases oc where oc.employment_id=e.id and oc.case_type='Offboarding' and oc.left_at is null and oc.status<>'Cancelled') leaving,
 (select oc.last_working_day from public.cases oc where oc.employment_id=e.id and oc.case_type='Offboarding' and oc.left_at is null and oc.status<>'Cancelled' order by oc.created_at desc limit 1) last_working_day
from public.employment_effective e join public.persons p on p.id=e.person_id left join public.teams t on t.id=e.team_id
where e.effective_status in ('active','ending') and p.archived_at is null;

create or replace function public.set_task_status(_task_id uuid,_status text,_comment text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; normalized text;
begin
  normalized:=case lower(_status) when 'pending' then 'Not Started' when 'in_progress' then 'In Progress'
    when 'completed' then 'Completed' when 'not_applicable' then 'Not Applicable' else _status end;
  if normalized not in ('Not Started','Open','In Progress','Waiting','Blocked','Completed','Not Applicable') then raise exception 'Invalid task status'; end if;
  select * into t from public.tasks where id=_task_id for update;
  if t.id is null then raise exception 'Task not found'; end if;
  if not public.can_update_task(auth.uid(),t.id) then raise insufficient_privilege; end if;
  update public.tasks set status=normalized,completed_at=case when normalized='Completed' then now() else null end,
    completed_by=case when normalized='Completed' then auth.uid() else null end,updated_at=now() where id=t.id;
  if t.checklist_item_id is not null then update public.checklist_items set status=case when normalized='Completed' then 'Completed' when normalized='Not Applicable' then 'Not Required' else 'Open' end,
    completed_date=case when normalized='Completed' then now() else null end,completed_by=case when normalized='Completed' then auth.uid() else null end,updated_at=now() where id=t.checklist_item_id; end if;
  if nullif(trim(_comment),'') is not null then insert into public.task_comments(task_id,author_id,body) values(t.id,auth.uid(),trim(_comment)); end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'task',t.id::text,'Task status changed','status',t.status,normalized,t.case_id,jsonb_build_object('ownerTeam',t.owner_team));
  perform public.refresh_case_workflow_status(t.case_id);
  return true;
end
$$;
revoke all on function public.set_task_status(uuid,text,text) from public,anon;
grant execute on function public.set_task_status(uuid,text,text) to authenticated;

create or replace function public.create_offboarding_case_v3(
  _person_id uuid,_employment_id uuid,_contract_end_date date,_last_working_day date,
  _leaving_type text,_leaving_reason text,_priority text,_notes text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.employments%rowtype; case_id uuid; existing_case uuid;
begin
  if not public.can_access_employment(auth.uid(),_employment_id)
    or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator') or public.has_role(auth.uid(),'manager'))
  then raise insufficient_privilege; end if;
  select * into e from public.employments where id=_employment_id and person_id=_person_id;
  if e.id is null or public.get_effective_employment_status(e.id,public.business_date()) not in ('active','ending') then raise exception 'Active employment not found'; end if;
  select id into existing_case from public.cases where employment_id=e.id and case_type='Offboarding' and status<>'Cancelled' limit 1;
  if existing_case is not null then return jsonb_build_object('error','offboarding_exists','caseId',existing_case); end if;
  insert into public.cases(person_id,employment_id,case_type,employment_type,start_date,end_date,effective_date,
    contract_end_date,last_working_day,role,location,supervisor_name,supervisor_email,priority,status,owner_id,notes,leaving_type,leaving_reason)
  values(_person_id,e.id,'Offboarding',e.employment_type,e.start_date,_contract_end_date,_last_working_day,
    _contract_end_date,_last_working_day,e.role_title,e.location,e.supervisor_name,e.supervisor_email,_priority,'Preparing',auth.uid(),
    nullif(_notes,''),nullif(_leaving_type,''),nullif(_leaving_reason,'')) returning id into case_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(auth.uid(),'case',case_id::text,'Created offboarding for existing employment',case_id,
    jsonb_build_object('personId',_person_id,'employmentId',e.id,'contractEndDate',_contract_end_date,'lastWorkingDay',_last_working_day));
  return jsonb_build_object('caseId',case_id,'personId',_person_id,'employmentId',e.id);
end
$$;
revoke all on function public.create_offboarding_case_v3(uuid,uuid,date,date,text,text,text,text) from public,anon;
grant execute on function public.create_offboarding_case_v3(uuid,uuid,date,date,text,text,text,text) to authenticated;

-- Structured email variables and attachment metadata.
create table if not exists public.email_variable_library (
  id uuid primary key default gen_random_uuid(),variable_key text not null unique,
  display_name text not null,data_type text not null default 'text',source_type text not null,
  source_field text,required boolean not null default false,default_value text,description text,
  created_at timestamptz not null default now()
);
grant select on public.email_variable_library to authenticated;
grant all on public.email_variable_library to service_role;
alter table public.email_variable_library enable row level security;
drop policy if exists "Active users read email variables" on public.email_variable_library;
create policy "Active users read email variables" on public.email_variable_library for select to authenticated using(public.is_active_user(auth.uid()));

alter table public.email_templates
  add column if not exists recipient_source text not null default 'personal_email',
  add column if not exists description text,
  add column if not exists archived_at timestamptz;

create table if not exists public.email_template_attachments (
 id uuid primary key default gen_random_uuid(),template_id uuid not null references public.email_templates(id) on delete cascade,
 filename text not null,storage_path text not null,content_type text,size integer not null default 0,
 uploaded_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
grant select,insert,delete on public.email_template_attachments to authenticated;
grant all on public.email_template_attachments to service_role;
alter table public.email_template_attachments enable row level security;
drop policy if exists "Active users read template attachments" on public.email_template_attachments;
create policy "Active users read template attachments" on public.email_template_attachments for select to authenticated using(public.is_active_user(auth.uid()));
drop policy if exists "HR manages template attachments" on public.email_template_attachments;
create policy "HR manages template attachments" on public.email_template_attachments for all to authenticated
 using(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator'))
 with check(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator'));

insert into public.email_variable_library(variable_key,display_name,source_type,source_field,required)
values
 ('employee_name','Employee Name','person','display_name',true),('employee_id','Employee ID','person','employee_id',false),
 ('personal_email','Personal Email','person','email',false),('company_email','Company Email','employment','company_email',false),
 ('start_date','Start Date','onboarding_case','start_date',false),('contract_end_date','Contract End Date','offboarding_case','contract_end_date',false),
 ('last_working_day','Last Working Day','offboarding_case','last_working_day',false),('supervisor_name','Supervisor','employment','supervisor_name',false),
 ('team','Team','employment','team',false),('employment_type','Employment Type','employment','employment_type',false),
 ('workplace','Workplace','employment','location',false)
on conflict(variable_key) do update set display_name=excluded.display_name,source_type=excluded.source_type,source_field=excluded.source_field;

-- Generate missing rule-based tasks for historical open cases without deleting legacy work.
select public.generate_case_tasks(c.id) from public.cases c where c.status<>'Cancelled';
