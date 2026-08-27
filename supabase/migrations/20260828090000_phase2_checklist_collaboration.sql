-- Phase 2: configurable checklist rules and team-scoped task collaboration.
-- Existing Case, Task and lifecycle history is preserved. Template changes are
-- snapshotted into Tasks and never rewrite completed historical work.

create or replace function public.employment_type_code(_value text)
returns text language sql immutable set search_path=public as $$
  select case regexp_replace(lower(coalesce(trim(_value),'')),'[^a-z0-9]+','_','g')
    when 'employee' then 'huawei_employee'
    when 'huawei_employee' then 'huawei_employee'
    when 'huawei_intern' then 'intern'
    when 'intern' then 'intern'
    when 'leased_labour' then 'leased'
    when 'leased_labor' then 'leased'
    when 'external_worker' then 'leased'
    when 'leased' then 'leased'
    else regexp_replace(lower(coalesce(trim(_value),'')),'[^a-z0-9]+','_','g')
  end
$$;

create or replace function public.leaving_type_code(_value text)
returns text language sql immutable set search_path=public as $$
  select case regexp_replace(lower(coalesce(trim(_value),'')),'[^a-z0-9]+','_','g')
    when 'voluntary' then 'voluntary_resignation'
    when 'voluntary_resignation' then 'voluntary_resignation'
    when 'employer_termination' then 'employer_termination'
    when 'termination' then 'employer_termination'
    else regexp_replace(lower(coalesce(trim(_value),'')),'[^a-z0-9]+','_','g')
  end
$$;

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  case_type text not null check (case_type in ('Onboarding','Offboarding')),
  description text,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select,insert,update,delete on public.checklist_templates to authenticated;
grant all on public.checklist_templates to service_role;
alter table public.checklist_templates enable row level security;

create or replace function public.is_hr_user(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user(_user_id) and (
    public.has_role(_user_id,'admin')
    or exists(
      select 1 from public.user_operational_teams u
      where u.user_id=_user_id and u.owner_team='HR'
    )
  )
$$;

revoke all on function public.is_hr_user(uuid) from public,anon;
grant execute on function public.is_hr_user(uuid) to authenticated;

drop policy if exists "Active users read checklist templates" on public.checklist_templates;
create policy "Active users read checklist templates" on public.checklist_templates
  for select to authenticated using(public.is_active_user(auth.uid()));
drop policy if exists "HR manages checklist templates" on public.checklist_templates;
create policy "HR manages checklist templates" on public.checklist_templates
  for all to authenticated using(public.is_hr_user(auth.uid())) with check(public.is_hr_user(auth.uid()));

insert into public.checklist_templates(template_key,name,case_type,description)
values
  ('standard_onboarding','Standard Onboarding Checklist','Onboarding','Standard HR, IT and Admin onboarding work.'),
  ('standard_offboarding','Standard Offboarding Checklist','Offboarding','Standard HR, IT and Admin offboarding work.')
on conflict(template_key) do update set
  name=excluded.name,case_type=excluded.case_type,description=excluded.description,updated_at=now();

alter table public.checklist_template_items
  add column if not exists template_id uuid references public.checklist_templates(id),
  add column if not exists active boolean not null default true,
  add column if not exists due_reference text,
  add column if not exists default_assignee_id uuid references auth.users(id);

update public.checklist_template_items i
set template_id=t.id
from public.checklist_templates t
where i.template_id is null and t.case_type=i.case_type;

update public.checklist_template_items
set active=enabled,
    due_reference=case due_rule
      when 'On Start Date' then 'start_date'
      when 'Before Start Date' then 'start_date'
      when 'After Start Date' then 'start_date'
      when 'On Last Working Day' then 'last_working_day'
      when 'Before Last Working Day' then 'last_working_day'
      when 'After Leaving' then 'last_working_day'
      else 'manual' end,
    due_offset_days=case due_rule
      when 'Before Start Date' then -abs(due_offset_days)
      when 'Before Last Working Day' then -abs(due_offset_days)
      when 'After Start Date' then abs(due_offset_days)
      when 'After Leaving' then abs(due_offset_days)
      else 0 end,
    default_assignee_id=coalesce(default_assignee_id,assigned_user_id)
where due_reference is null;

alter table public.checklist_template_items
  alter column template_id set not null,
  alter column due_reference set default 'manual',
  alter column due_reference set not null;

alter table public.checklist_template_items drop constraint if exists checklist_template_items_due_reference_check;
alter table public.checklist_template_items add constraint checklist_template_items_due_reference_check
  check (due_reference in ('start_date','contract_end_date','last_working_day','manual'));

drop policy if exists "Active users read checklist templates" on public.checklist_template_items;
drop policy if exists "Active users read checklist template items" on public.checklist_template_items;
create policy "Active users read checklist template items" on public.checklist_template_items
  for select to authenticated using(public.is_active_user(auth.uid()));
drop policy if exists "HR manages checklist templates" on public.checklist_template_items;
drop policy if exists "HR manages checklist template items" on public.checklist_template_items;
create policy "HR manages checklist template items" on public.checklist_template_items
  for all to authenticated using(public.is_hr_user(auth.uid())) with check(public.is_hr_user(auth.uid()));

grant insert,update,delete on public.user_operational_teams to authenticated;
create or replace function public.can_view_operational_membership(
  _user_id uuid,
  _owner_team text
)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user(auth.uid()) and (
    _user_id=auth.uid()
    or public.is_hr_user(auth.uid())
    or public.has_role(auth.uid(),'admin')
    or exists(
      select 1 from public.user_operational_teams mine
      where mine.user_id=auth.uid() and mine.owner_team=_owner_team
    )
  )
$$;
revoke all on function public.can_view_operational_membership(uuid,text) from public;
grant execute on function public.can_view_operational_membership(uuid,text) to authenticated;

drop policy if exists "Users view operational teams" on public.user_operational_teams;
drop policy if exists "HR reads operational teams" on public.user_operational_teams;
drop policy if exists "Active users view operational team directory" on public.user_operational_teams;
drop policy if exists "Team-scoped operational directory" on public.user_operational_teams;
create policy "Team-scoped operational directory" on public.user_operational_teams
  for select to authenticated
  using(public.can_view_operational_membership(user_id,owner_team));
drop policy if exists "Admins manage operational teams" on public.user_operational_teams;
create policy "Admins manage operational teams" on public.user_operational_teams
  for all to authenticated using(public.has_role(auth.uid(),'admin'))
  with check(public.has_role(auth.uid(),'admin'));

alter table public.tasks alter column owner_id drop not null;
alter table public.tasks
  add column if not exists template_item_id uuid references public.checklist_template_items(id),
  add column if not exists source text not null default 'manual',
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists due_reference text,
  add column if not exists due_offset_days integer not null default 0,
  add column if not exists not_applicable_reason text,
  add column if not exists not_applicable_by uuid references auth.users(id),
  add column if not exists not_applicable_at timestamptz;

alter table public.tasks drop constraint if exists tasks_source_check;
alter table public.tasks add constraint tasks_source_check check(source in ('template','manual'));
alter table public.tasks drop constraint if exists tasks_due_reference_check;
alter table public.tasks add constraint tasks_due_reference_check
  check(due_reference is null or due_reference in ('start_date','contract_end_date','last_working_day','manual'));

update public.tasks t
set template_item_id=i.id,
    source='template',
    source_snapshot=jsonb_build_object(
      'templateItemId',i.id,'templateKey',i.template_key,'title',t.title,
      'description',t.description,'ownerTeam',t.owner_team,'mandatory',t.mandatory,
      'dueReference',i.due_reference,'dueOffsetDays',i.due_offset_days
    ),
    due_reference=i.due_reference,
    due_offset_days=i.due_offset_days
from public.checklist_template_items i
where t.default_task_key=i.template_key and t.template_item_id is null;

create unique index if not exists tasks_case_template_item_unique
  on public.tasks(case_id,template_item_id) where template_item_id is not null;
create index if not exists tasks_team_status_due_idx on public.tasks(owner_team,status,due_date);

create or replace function public.resolve_case_task_due_date(
  _case_id uuid,_reference text,_offset integer default 0
)
returns date language sql stable security definer set search_path=public as $$
  select case _reference
    when 'start_date' then c.start_date+coalesce(_offset,0)
    when 'contract_end_date' then c.contract_end_date+coalesce(_offset,0)
    when 'last_working_day' then c.last_working_day+coalesce(_offset,0)
    else null
  end
  from public.cases c where c.id=_case_id
$$;

create or replace function public.checklist_item_applies(
  _item public.checklist_template_items,_case public.cases
)
returns boolean language sql immutable set search_path=public as $$
  select _item.active and _item.enabled
    and _item.case_type=_case.case_type
    and (
      cardinality(_item.applicable_employment_types)=0
      or public.employment_type_code(_case.employment_type)=any(_item.applicable_employment_types)
    )
    and (
      _case.case_type<>'Offboarding'
      or cardinality(_item.applicable_leaving_types)=0
      or public.leaving_type_code(_case.leaving_type)=any(_item.applicable_leaving_types)
    )
    and (
      _case.case_type<>'Offboarding'
      or cardinality(_item.applicable_leaving_reasons)=0
      or regexp_replace(lower(coalesce(_case.leaving_reason,'')),'[^a-z0-9]+','_','g')=any(_item.applicable_leaving_reasons)
    )
$$;

-- Replace the original seeds with stable-code, editable Phase 2 rules.
-- These early V1 rules have Phase 2 replacements with stable identities.
-- Keep their historical Task references, but never generate them again.
update public.checklist_template_items
set active=false,enabled=false,updated_at=now()
where template_key in (
  'onb_hr_preboard','onb_it_equipment','onb_admin_access','onb_manager_meeting','off_admin_return'
);

insert into public.checklist_template_items(
  template_id,template_key,case_type,title,description,applicable_employment_types,
  applicable_leaving_types,applicable_leaving_reasons,owner_team,mandatory,
  due_reference,due_offset_days,sort_order,active,enabled
)
select t.id,v.*
from public.checklist_templates t
join (values
  ('onb_hr_contract','Onboarding','Contract Signed','Confirm the employment contract is signed.',array['huawei_employee','intern']::text[],array[]::text[],array[]::text[],'HR',true,'start_date',-28,10,true,true),
  ('onb_hr_system','Onboarding','System Onboarding Process','Complete onboarding in the HR system.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'start_date',-28,20,true,true),
  ('onb_hr_pre_registration','Onboarding','Pre-onboarding System Registration','Move the worker to pre-onboarding.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'start_date',-21,30,true,true),
  ('onb_hr_employee_id','Onboarding','Employee ID Received','Record and distribute the employee ID.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'start_date',-21,40,true,true),
  ('onb_hr_payroll','Onboarding','Send Payroll Email','Send payroll information.',array['huawei_employee','intern']::text[],array[]::text[],array[]::text[],'HR',false,'start_date',-28,50,true,true),
  ('onb_hr_welcome','Onboarding','Send Welcome Email','Send the configured welcome email.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'start_date',-14,60,true,true),
  ('onb_it_laptop','Onboarding','Laptop Preparation','Prepare the device and required accessories.',array[]::text[],array[]::text[],array[]::text[],'IT',true,'start_date',-14,70,true,true),
  ('onb_it_account','Onboarding','Account Creation','Create the employee account and credentials.',array[]::text[],array[]::text[],array[]::text[],'IT',true,'start_date',-14,80,true,true),
  ('onb_it_access','Onboarding','Access Configuration','Configure required system access.',array[]::text[],array[]::text[],array[]::text[],'IT',true,'start_date',-7,90,true,true),
  ('onb_admin_desk','Onboarding','Desk Preparation','Prepare the assigned workplace.',array[]::text[],array[]::text[],array[]::text[],'Admin',true,'start_date',-7,100,true,true),
  ('onb_admin_badge','Onboarding','Badge Preparation','Prepare the access badge.',array[]::text[],array[]::text[],array[]::text[],'Admin',true,'start_date',-7,110,true,true),
  ('onb_admin_facility','Onboarding','Facility / Workplace Preparation','Complete facility and workplace preparation.',array[]::text[],array[]::text[],array[]::text[],'Admin',false,'start_date',-7,120,true,true),
  ('off_hr_agreement','Offboarding','Leaving Agreement','Prepare the leaving agreement.',array['huawei_employee']::text[],array['voluntary_resignation','employer_termination']::text[],array[]::text[],'HR',true,'last_working_day',-14,10,true,true),
  ('off_hr_termination','Offboarding','Termination Letter','Prepare the employer termination letter.',array['huawei_employee']::text[],array['employer_termination']::text[],array[]::text[],'HR',true,'last_working_day',-14,20,true,true),
  ('off_hr_garden','Offboarding','Garden Leave Letter','Prepare garden leave documentation.',array['huawei_employee']::text[],array['employer_termination']::text[],array[]::text[],'HR',true,'last_working_day',-14,30,true,true),
  ('off_hr_system','Offboarding','System Offboarding Process','Complete departure processing in the HR system.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'last_working_day',0,40,true,true),
  ('off_hr_email','Offboarding','Offboarding Email','Send offboarding information.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'last_working_day',-7,50,true,true),
  ('off_hr_reference','Offboarding','Reference Letter','Prepare the reference letter.',array[]::text[],array[]::text[],array[]::text[],'HR',false,'last_working_day',5,60,true,true),
  ('off_hr_lwd','Offboarding','Last Working Day Confirmation','Confirm the actual last working day.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'manual',0,70,true,true),
  ('off_hr_datalink','Offboarding','Datalink Offboarding','Complete Datalink departure steps.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'last_working_day',0,80,true,true),
  ('off_hr_leave','Offboarding','Annual Leave Settlement','Settle annual leave balance.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'last_working_day',0,90,true,true),
  ('off_hr_overtime','Offboarding','Overtime Settlement','Settle overtime balance.',array[]::text[],array[]::text[],array[]::text[],'HR',true,'last_working_day',0,100,true,true),
  ('off_it_account','Offboarding','Account Closure','Close employee accounts.',array[]::text[],array[]::text[],array[]::text[],'IT',true,'last_working_day',0,110,true,true),
  ('off_it_access','Offboarding','Access Closure / Revocation','Revoke system and application access.',array[]::text[],array[]::text[],array[]::text[],'IT',true,'last_working_day',0,120,true,true),
  ('off_admin_badge','Offboarding','Badge Return','Confirm badge return.',array[]::text[],array[]::text[],array[]::text[],'Admin',true,'last_working_day',0,130,true,true),
  ('off_admin_asset','Offboarding','Asset Return','Confirm asset return.',array[]::text[],array[]::text[],array[]::text[],'Admin',true,'last_working_day',0,140,true,true),
  ('off_admin_facility','Offboarding','Facility / Workplace Return','Complete facility and workplace return.',array[]::text[],array[]::text[],array[]::text[],'Admin',false,'last_working_day',0,150,true,true)
) as v(template_key,case_type,title,description,applicable_employment_types,applicable_leaving_types,applicable_leaving_reasons,owner_team,mandatory,due_reference,due_offset_days,sort_order,active,enabled)
  on v.case_type=t.case_type
on conflict(template_key) do update set
  template_id=excluded.template_id,case_type=excluded.case_type,title=excluded.title,
  description=excluded.description,applicable_employment_types=excluded.applicable_employment_types,
  applicable_leaving_types=excluded.applicable_leaving_types,
  applicable_leaving_reasons=excluded.applicable_leaving_reasons,
  owner_team=excluded.owner_team,mandatory=excluded.mandatory,due_reference=excluded.due_reference,
  due_offset_days=excluded.due_offset_days,sort_order=excluded.sort_order,
  active=excluded.active,enabled=excluded.enabled,updated_at=now();

create or replace function public._sync_case_tasks_internal(_case_id uuid,_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  c public.cases%rowtype;
  item public.checklist_template_items%rowtype;
  task_row public.tasks%rowtype;
  new_due date;
  created_count integer:=0;
  updated_count integer:=0;
  na_count integer:=0;
  generated_task_id uuid;
begin
  select * into c from public.cases where id=_case_id for update;
  if c.id is null then raise exception 'Case not found'; end if;

  for item in
    select i.* from public.checklist_template_items i
    join public.checklist_templates t on t.id=i.template_id
    where t.active and i.case_type=c.case_type and public.checklist_item_applies(i,c)
    order by i.sort_order,i.title
  loop
    new_due:=public.resolve_case_task_due_date(c.id,item.due_reference,item.due_offset_days);
    generated_task_id:=null;
    insert into public.tasks(
      case_id,title,description,task_type,owner_id,assignee_role,owner_team,status,due_date,
      priority,default_task_key,mandatory,template_item_id,source,source_snapshot,
      due_reference,due_offset_days
    ) values(
      c.id,item.title,item.description,
      case when lower(item.title) like '%email%' then 'Email' else 'Task' end,
      coalesce(item.default_assignee_id,item.assigned_user_id),lower(item.owner_team),item.owner_team,
      'Not Started',new_due,case when item.mandatory then 'High' else 'Medium' end,
      item.template_key,item.mandatory,item.id,'template',
      jsonb_build_object(
        'templateId',item.template_id,'templateItemId',item.id,'templateKey',item.template_key,
        'title',item.title,'description',item.description,'ownerTeam',item.owner_team,
        'mandatory',item.mandatory,'dueReference',item.due_reference,
        'dueOffsetDays',item.due_offset_days,'generatedAt',now()
      ),item.due_reference,item.due_offset_days
    ) on conflict(case_id,template_item_id) where template_item_id is not null do nothing
    returning id into generated_task_id;

    if generated_task_id is not null then
      insert into public.checklist_items(case_id,section,title,status,owner_id,due_date,sort_order,task_id)
      values(c.id,item.owner_team,item.title,'Open',coalesce(item.default_assignee_id,item.assigned_user_id),new_due,item.sort_order,generated_task_id);
      update public.tasks t set checklist_item_id=(select ci.id from public.checklist_items ci where ci.task_id=generated_task_id limit 1)
      where t.id=generated_task_id;
      insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
      values(coalesce(auth.uid(),c.owner_id),'task',generated_task_id::text,'Task generated',c.id,
        jsonb_build_object('templateItemId',item.id,'ownerTeam',item.owner_team,'reason',_reason));
      created_count:=created_count+1;
    else
      select * into task_row from public.tasks t where t.case_id=c.id and t.template_item_id=item.id;
      if task_row.status='Not Applicable' and task_row.not_applicable_reason='Rule no longer applies' then
        update public.tasks set status='Not Started',not_applicable_reason=null,not_applicable_by=null,
          not_applicable_at=null,due_date=new_due,updated_at=now() where id=task_row.id;
        insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
        values(coalesce(auth.uid(),c.owner_id),'task',task_row.id::text,'Task restored by rule synchronization','status','Not Applicable','Not Started',c.id,
          jsonb_build_object('templateItemId',item.id,'reason',_reason));
        updated_count:=updated_count+1;
      elsif task_row.status not in ('Completed','Not Applicable') and task_row.due_date is distinct from new_due then
        update public.tasks set due_date=new_due,updated_at=now() where id=task_row.id;
        update public.checklist_items set due_date=new_due,updated_at=now() where task_id=task_row.id;
        insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
        values(coalesce(auth.uid(),c.owner_id),'task',task_row.id::text,'Task due date recalculated','due_date',task_row.due_date::text,new_due::text,c.id,
          jsonb_build_object('dueReference',item.due_reference,'dueOffsetDays',item.due_offset_days,'reason',_reason));
        updated_count:=updated_count+1;
      end if;
    end if;
  end loop;

  for task_row in
    select t.* from public.tasks t
    join public.checklist_template_items i on i.id=t.template_item_id
    left join public.checklist_templates ct on ct.id=i.template_id
    where t.case_id=c.id and t.source='template' and t.status not in ('Completed','Not Applicable')
      and (not coalesce(ct.active,false) or not public.checklist_item_applies(i,c))
  loop
    update public.tasks set status='Not Applicable',not_applicable_reason='Rule no longer applies',
      not_applicable_by=auth.uid(),not_applicable_at=now(),updated_at=now() where id=task_row.id;
    update public.checklist_items set status='Not Required',updated_at=now() where task_id=task_row.id;
    insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
    values(coalesce(auth.uid(),c.owner_id),'task',task_row.id::text,'Task marked Not Applicable by rule synchronization',
      'status',task_row.status,'Not Applicable',c.id,jsonb_build_object('reason',_reason));
    na_count:=na_count+1;
  end loop;

  return jsonb_build_object('created',created_count,'updated',updated_count,'notApplicable',na_count);
end
$$;

create or replace function public.sync_case_tasks(_case_id uuid,_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.is_hr_user(auth.uid()) or public.case_access(auth.uid(),_case_id) not in ('owner','collaborator') then
    raise insufficient_privilege;
  end if;
  return public._sync_case_tasks_internal(_case_id,coalesce(_reason,'Manual synchronization'));
end
$$;

create or replace function public.generate_case_tasks(_case_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  result:=public._sync_case_tasks_internal(_case_id,'Case created');
  return coalesce((result->>'created')::integer,0);
end
$$;

create or replace function public.create_default_onboarding_tasks()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public._sync_case_tasks_internal(new.id,'Case created');
  return new;
end
$$;

create or replace function public.sync_case_tasks_after_case_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public._sync_case_tasks_internal(new.id,'Case rule or date changed');
  return new;
end
$$;

drop trigger if exists cases_sync_phase2_tasks on public.cases;
create trigger cases_sync_phase2_tasks
after update of employment_type,start_date,contract_end_date,last_working_day,leaving_type,leaving_reason on public.cases
for each row when (
  old.employment_type is distinct from new.employment_type
  or old.start_date is distinct from new.start_date
  or old.contract_end_date is distinct from new.contract_end_date
  or old.last_working_day is distinct from new.last_working_day
  or old.leaving_type is distinct from new.leaving_type
  or old.leaving_reason is distinct from new.leaving_reason
) execute function public.sync_case_tasks_after_case_change();

revoke all on function public._sync_case_tasks_internal(uuid,text) from public,anon,authenticated;
revoke all on function public.sync_case_tasks(uuid,text) from public,anon;
grant execute on function public.sync_case_tasks(uuid,text) to authenticated;

create or replace function public.is_operational_team_member(_user_id uuid,_owner_team text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user(_user_id) and (
    public.has_role(_user_id,'admin')
    or exists(select 1 from public.user_operational_teams u where u.user_id=_user_id and u.owner_team=_owner_team)
  )
$$;

create or replace function public.can_update_task(_user_id uuid,_task_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.tasks t
    where t.id=_task_id and (
      public.is_hr_user(_user_id)
      or public.is_operational_team_member(_user_id,t.owner_team)
    )
  )
$$;

drop policy if exists "Scoped users view tasks" on public.tasks;
create policy "Scoped users view tasks" on public.tasks for select to authenticated using(
  public.is_hr_user(auth.uid())
  or public.is_operational_team_member(auth.uid(),owner_team)
  or public.case_access(auth.uid(),case_id)<>'none'
);
drop policy if exists "Scoped users update owned tasks" on public.tasks;
drop policy if exists "Scoped team users update owned tasks" on public.tasks;
create policy "Scoped team users update owned tasks" on public.tasks for update to authenticated
  using(public.can_update_task(auth.uid(),id)) with check(public.can_update_task(auth.uid(),id));
drop policy if exists "Owners and collaborators manage tasks" on public.tasks;
drop policy if exists "Owners and collaborators delete tasks" on public.tasks;
drop policy if exists "HR creates manual tasks" on public.tasks;
create policy "HR creates manual tasks" on public.tasks for insert to authenticated
  with check(public.is_hr_user(auth.uid()) and source='manual');
drop policy if exists "HR deletes manual tasks" on public.tasks;
create policy "HR deletes manual tasks" on public.tasks for delete to authenticated
  using(public.is_hr_user(auth.uid()) and source='manual');

-- Prevent arbitrary column updates from the browser; status/assignment use audited RPCs.
revoke insert,update,delete on public.tasks from authenticated;
grant select on public.tasks to authenticated;

create or replace function public.set_task_status(_task_id uuid,_status text,_comment text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; normalized text; reason text:=nullif(trim(_comment),'');
begin
  normalized:=case lower(_status)
    when 'pending' then 'Not Started' when 'in_progress' then 'In Progress'
    when 'completed' then 'Completed' when 'not_applicable' then 'Not Applicable'
    else _status end;
  if normalized not in ('Not Started','Open','In Progress','Waiting','Blocked','Completed','Not Applicable') then
    raise exception 'Invalid task status';
  end if;
  if normalized='Not Applicable' and reason is null then raise exception 'A reason is required'; end if;
  select * into t from public.tasks where id=_task_id for update;
  if t.id is null then raise exception 'Task not found'; end if;
  if not public.can_update_task(auth.uid(),t.id) then raise insufficient_privilege; end if;
  update public.tasks set status=normalized,
    completed_at=case when normalized='Completed' then now() else null end,
    completed_by=case when normalized='Completed' then auth.uid() else null end,
    not_applicable_reason=case when normalized='Not Applicable' then reason else null end,
    not_applicable_by=case when normalized='Not Applicable' then auth.uid() else null end,
    not_applicable_at=case when normalized='Not Applicable' then now() else null end,
    updated_at=now() where id=t.id;
  if t.checklist_item_id is not null then
    update public.checklist_items set
      status=case when normalized='Completed' then 'Completed' when normalized='Not Applicable' then 'Not Required' else 'Open' end,
      completed_date=case when normalized='Completed' then now() else null end,
      completed_by=case when normalized='Completed' then auth.uid() else null end,updated_at=now()
    where id=t.checklist_item_id;
  end if;
  if reason is not null and normalized<>'Not Applicable' then
    insert into public.task_comments(task_id,author_id,body) values(t.id,auth.uid(),reason);
  end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'task',t.id::text,
    case when normalized='Completed' then 'Task completed'
         when normalized='Not Applicable' then 'Task marked Not Applicable'
         else 'Task status changed' end,
    'status',t.status,normalized,t.case_id,jsonb_build_object('ownerTeam',t.owner_team,'reason',reason));
  perform public.refresh_case_workflow_status(t.case_id);
  return true;
end
$$;

create or replace function public.assign_task(_task_id uuid,_assignee_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; old_name text; new_name text;
begin
  select * into t from public.tasks where id=_task_id for update;
  if t.id is null then raise exception 'Task not found'; end if;
  if not public.can_update_task(auth.uid(),t.id) then raise insufficient_privilege; end if;
  if _assignee_id is not null and not public.is_operational_team_member(_assignee_id,t.owner_team) then
    raise exception 'Assignee must belong to the task owner team';
  end if;
  select name into old_name from public.profiles where id=t.owner_id;
  select name into new_name from public.profiles where id=_assignee_id;
  update public.tasks set owner_id=_assignee_id,updated_at=now() where id=t.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'task',t.id::text,'Task assigned','assigned_user',old_name,new_name,t.case_id,
    jsonb_build_object('ownerTeam',t.owner_team,'assigneeId',_assignee_id));
  return true;
end
$$;

create or replace function public.create_manual_task(
  _case_id uuid,_title text,_description text,_owner_team text,_assignee_id uuid,
  _mandatory boolean,_due_date date,_priority text
)
returns uuid language plpgsql security definer set search_path=public as $$
declare task_id uuid;
begin
  if not public.is_hr_user(auth.uid()) or public.case_access(auth.uid(),_case_id) not in ('owner','collaborator') then
    raise insufficient_privilege;
  end if;
  if _owner_team not in ('HR','IT','Admin') then raise exception 'Invalid owner team'; end if;
  if nullif(trim(_title),'') is null then raise exception 'Task name is required'; end if;
  if _assignee_id is not null and not public.is_operational_team_member(_assignee_id,_owner_team) then
    raise exception 'Assignee must belong to the task owner team';
  end if;
  insert into public.tasks(case_id,title,description,task_type,owner_id,assignee_role,owner_team,
    status,due_date,priority,mandatory,source)
  values(_case_id,trim(_title),nullif(trim(_description),''),'Task',_assignee_id,lower(_owner_team),_owner_team,
    'Not Started',_due_date,coalesce(_priority,'Medium'),coalesce(_mandatory,true),'manual')
  returning id into task_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(auth.uid(),'task',task_id::text,'Manual task created',_case_id,
    jsonb_build_object('ownerTeam',_owner_team,'mandatory',_mandatory,'assigneeId',_assignee_id));
  return task_id;
end
$$;

revoke all on function public.assign_task(uuid,uuid) from public,anon;
revoke all on function public.create_manual_task(uuid,text,text,text,uuid,boolean,date,text) from public,anon;
grant execute on function public.assign_task(uuid,uuid) to authenticated;
grant execute on function public.create_manual_task(uuid,text,text,text,uuid,boolean,date,text) to authenticated;

create or replace function public.set_checklist_completion(_item_id uuid,_complete boolean)
returns void language plpgsql security definer set search_path=public as $$
declare task_id uuid;
begin
  select task_id into task_id from public.checklist_items where id=_item_id;
  if task_id is null then raise exception 'Checklist item not found'; end if;
  perform public.set_task_status(task_id,case when _complete then 'Completed' else 'Not Started' end,null);
end
$$;

create or replace function public.add_task_comment(_task_id uuid,_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; comment_id uuid;
begin
  select * into t from public.tasks where id=_task_id;
  if t.id is null then raise exception 'Task not found'; end if;
  if not public.can_update_task(auth.uid(),t.id) then raise insufficient_privilege; end if;
  if length(trim(coalesce(_body,''))) not between 1 and 2000 then raise exception 'Comment is required'; end if;
  insert into public.task_comments(task_id,author_id,body) values(t.id,auth.uid(),trim(_body)) returning id into comment_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(auth.uid(),'task',t.id::text,'Task comment added',t.case_id,jsonb_build_object('commentId',comment_id));
  return comment_id;
end
$$;

revoke all on function public.add_task_comment(uuid,text) from public,anon;
grant execute on function public.add_task_comment(uuid,text) to authenticated;

-- Close compatibility RPC paths so generic Case collaborators cannot bypass
-- the team-scoped Task authorization above.
create or replace function public.set_task_completion(_task_id uuid,_complete boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.set_task_status(_task_id,case when _complete then 'Completed' else 'Not Started' end,null);
end
$$;

create or replace function public.set_checklist_completion(_item_id uuid,_complete boolean)
returns void language plpgsql security definer set search_path=public as $$
declare task_id uuid; case_id uuid;
begin
  select ci.task_id,ci.case_id into task_id,case_id from public.checklist_items ci where ci.id=_item_id;
  if case_id is null then raise exception 'Checklist item not found'; end if;
  if task_id is not null then
    perform public.set_task_status(task_id,case when _complete then 'Completed' else 'Not Started' end,null);
  else
    if not public.is_hr_user(auth.uid()) then raise insufficient_privilege; end if;
    update public.checklist_items set status=case when _complete then 'Completed' else 'Open' end,
      completed_date=case when _complete then now() else null end,
      completed_by=case when _complete then auth.uid() else null end,updated_at=now()
    where id=_item_id;
  end if;
end
$$;

create or replace function public.complete_email_task(
  _task_id uuid,_case_id uuid,_template_id uuid,_subject text,_body text,_recipient text
)
returns boolean language plpgsql security definer set search_path=public as $$
declare task_row public.tasks%rowtype;
begin
  select * into task_row from public.tasks where id=_task_id and case_id=_case_id for update;
  if task_row.id is null or not public.can_update_task(auth.uid(),task_row.id) then return false; end if;
  if lower(task_row.task_type)<>'email' and lower(task_row.title) not like '%email%' then
    raise exception 'Task is not an email task';
  end if;
  perform public.set_task_status(task_row.id,'Completed',null);
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'task',task_row.id::text,'Email marked as sent','communication',null,'Sent',_case_id,
    jsonb_build_object('templateId',_template_id,'subject',_subject,'recipient',_recipient));
  return true;
end
$$;

drop policy if exists "Owners and collaborators update cases" on public.cases;
drop policy if exists "HR case owners and collaborators update cases" on public.cases;
create policy "HR case owners and collaborators update cases" on public.cases for update to authenticated
  using(public.is_hr_user(auth.uid()) and public.case_access(auth.uid(),id) in ('owner','collaborator'))
  with check(public.is_hr_user(auth.uid()) and public.case_access(auth.uid(),id) in ('owner','collaborator'));

create or replace function public.audit_task_file_added()
returns trigger language plpgsql security definer set search_path=public as $$
declare case_id uuid;
begin
  select t.case_id into case_id from public.tasks t where t.id=new.task_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(new.uploaded_by,'task',new.task_id::text,'Task attachment added',case_id,
    jsonb_build_object('taskFileId',new.id,'filename',new.filename,'storagePath',new.storage_path));
  return new;
end
$$;
drop trigger if exists task_files_audit_added on public.task_files;
create trigger task_files_audit_added after insert on public.task_files
for each row execute function public.audit_task_file_added();

create or replace function public.list_operational_tasks(_case_id uuid default null)
returns table(
  id uuid,title text,description text,case_id uuid,case_type text,person_name text,person_team text,
  start_date date,contract_end_date date,last_working_day date,due_date date,priority text,status text,
  task_type text,owner_team text,owner_id uuid,checklist_item_id uuid,owner_name text,mandatory boolean,completed_at timestamptz,
  completed_by_name text,assignee_role text,default_task_key text,template_item_id uuid,source text,
  not_applicable_reason text,can_edit boolean
)
language sql stable security definer set search_path=public as $$
  select t.id,t.title,t.description,t.case_id,c.case_type,p.display_name,coalesce(tm.name,'—'),
    c.start_date,c.contract_end_date,c.last_working_day,t.due_date,t.priority,t.status,t.task_type,
    t.owner_team,t.owner_id,t.checklist_item_id,assignee.name,t.mandatory,t.completed_at,completer.name,
    t.assignee_role,t.default_task_key,t.template_item_id,t.source,t.not_applicable_reason,
    public.can_update_task(auth.uid(),t.id)
  from public.tasks t
  join public.cases c on c.id=t.case_id
  join public.persons p on p.id=c.person_id
  left join public.employments e on e.id=c.employment_id
  left join public.teams tm on tm.id=coalesce(e.team_id,p.team_id)
  left join public.profiles assignee on assignee.id=t.owner_id
  left join public.profiles completer on completer.id=t.completed_by
  where (_case_id is null or t.case_id=_case_id)
    and public.is_active_user(auth.uid())
    and (
      public.is_hr_user(auth.uid())
      or public.is_operational_team_member(auth.uid(),t.owner_team)
      or public.case_access(auth.uid(),t.case_id)<>'none'
    )
  order by t.due_date nulls last,t.created_at
$$;

create or replace function public.get_operational_case_summary(_case_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id',c.id,'person_id',c.person_id,'case_type',c.case_type,'employment_type',c.employment_type,
    'start_date',c.start_date,'contract_end_date',c.contract_end_date,'last_working_day',c.last_working_day,
    'end_date',c.end_date,'effective_date',c.effective_date,'role',c.role,'location',c.location,
    'supervisor_name',c.supervisor_name,'owner_id',c.owner_id,'status',c.status,'priority',c.priority,
    'joined_date',c.joined_date,'joined_at',c.joined_at,'left_date',c.left_date,'left_at',c.left_at,
    'persons',jsonb_build_object(
      'full_name',p.display_name,'lab_id',p.lab_id,'team_id',coalesce(e.team_id,p.team_id),
      'teams',jsonb_build_object('name',coalesce(tm.name,'—'))
    )
  )
  from public.cases c join public.persons p on p.id=c.person_id
  left join public.employments e on e.id=c.employment_id
  left join public.teams tm on tm.id=coalesce(e.team_id,p.team_id)
  where c.id=_case_id and public.is_active_user(auth.uid())
    and exists(
      select 1 from public.tasks t where t.case_id=c.id
        and public.is_operational_team_member(auth.uid(),t.owner_team)
    )
$$;

revoke all on function public.list_operational_tasks(uuid) from public,anon;
revoke all on function public.get_operational_case_summary(uuid) from public,anon;
grant execute on function public.list_operational_tasks(uuid) to authenticated;
grant execute on function public.get_operational_case_summary(uuid) to authenticated;

create or replace function public.enforce_mandatory_tasks_before_case_completed()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='Completed' and old.status is distinct from new.status and exists(
    select 1 from public.tasks t where t.case_id=new.id and t.mandatory
      and t.status not in ('Completed','Not Applicable')
  ) then
    raise exception 'Mandatory tasks must be completed before the Case can be completed';
  end if;
  return new;
end
$$;
drop trigger if exists cases_require_mandatory_tasks on public.cases;
create trigger cases_require_mandatory_tasks before update of status on public.cases
for each row execute function public.enforce_mandatory_tasks_before_case_completed();

-- Functional team users are not lifecycle managers merely because they can edit a Task.
create or replace function public.can_confirm_lifecycle_case(_case_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_hr_user(auth.uid())
    and public.case_access(auth.uid(),_case_id) in ('owner','collaborator')
$$;

-- Existing open cases receive missing Phase 2 tasks without deleting legacy work.
select public._sync_case_tasks_internal(c.id,'Phase 2 migration')
from public.cases c where c.status<>'Cancelled';
