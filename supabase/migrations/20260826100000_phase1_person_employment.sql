-- Phase 1: durable Person identity and canonical Employment records.
alter table public.persons add column if not exists given_name text;
alter table public.persons add column if not exists family_name text;
alter table public.persons add column if not exists preferred_name text;
alter table public.persons add column if not exists display_name text;
update public.persons set
  given_name=coalesce(given_name,first_name), family_name=coalesce(family_name,last_name),
  display_name=coalesce(display_name,full_name)
where given_name is null or family_name is null or display_name is null;

create table public.employments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id),
  employment_type text not null check (employment_type in ('Employee','Intern','Leased Labour')),
  employee_id text,
  team_id uuid references public.teams(id),
  role_title text,
  location text,
  supervisor_person_id uuid references public.persons(id),
  supervisor_name text,
  supervisor_email text,
  workload integer,
  contract_type text,
  start_date date,
  end_date date,
  status text not null check (status in ('planned','active','ending','ended','cancelled')),
  source_onboarding_case_id uuid unique references public.cases(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employments_person_idx on public.employments(person_id,status);
create unique index employments_employee_id_unique on public.employments(lower(employee_id)) where employee_id is not null and trim(employee_id)<>'';
alter table public.employments enable row level security;
grant select,insert,update on public.employments to authenticated;
grant all on public.employments to service_role;
create policy "Active users view employments" on public.employments for select to authenticated using(public.is_active_user(auth.uid()));
create policy "Case creators manage employments" on public.employments for insert to authenticated with check(public.is_active_user(auth.uid()) and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator') or public.has_role(auth.uid(),'manager')));
create policy "Case creators update employments" on public.employments for update to authenticated using(public.is_active_user(auth.uid()) and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator') or public.has_role(auth.uid(),'manager')));

alter table public.cases add column if not exists employment_id uuid references public.employments(id);
alter table public.cases add column if not exists effective_date date;
alter table public.cases add column if not exists leaving_type text;
alter table public.cases add column if not exists leaving_reason text;
update public.cases set effective_date=case when case_type='Onboarding' then start_date else coalesce(end_date,start_date) end where effective_date is null;

create table public.person_reconciliation_report (
  id uuid primary key default gen_random_uuid(), offboarding_case_id uuid not null references public.cases(id),
  duplicate_person_id uuid not null references public.persons(id), canonical_person_id uuid references public.persons(id),
  matching_rule text, confidence text not null, migration_status text not null,
  linked_onboarding_case_id uuid references public.cases(id), details jsonb not null default '{}', created_at timestamptz not null default now(),
  unique(offboarding_case_id)
);
alter table public.person_reconciliation_report enable row level security;
grant select on public.person_reconciliation_report to authenticated;
grant all on public.person_reconciliation_report to service_role;
create policy "Admins view reconciliation" on public.person_reconciliation_report for select to authenticated using(public.has_role(auth.uid(),'admin'));

with candidates as (
  select oc.id off_case,op.id duplicate_person,ip.id canonical_person,ic.id onboarding_case,
    case when op.employee_id is not null and lower(op.employee_id)=lower(ip.employee_id) then 1
         when op.email is not null and lower(trim(op.email))=lower(trim(ip.email)) then 2
         when lower(regexp_replace(op.full_name,'\\s+','','g'))=lower(regexp_replace(ip.full_name,'\\s+','','g')) and op.team_id is not distinct from ip.team_id then 3 end priority
  from public.cases oc join public.persons op on op.id=oc.person_id
  join public.persons ip on ip.id<>op.id join public.cases ic on ic.person_id=ip.id and ic.case_type='Onboarding'
  where oc.case_type='Offboarding' and ((op.employee_id is not null and lower(op.employee_id)=lower(ip.employee_id)) or (op.email is not null and lower(trim(op.email))=lower(trim(ip.email))) or (lower(regexp_replace(op.full_name,'\\s+','','g'))=lower(regexp_replace(ip.full_name,'\\s+','','g')) and op.team_id is not distinct from ip.team_id))
), ranked as (select *,min(priority) over(partition by off_case) best from candidates), best_counted as (
  select *,count(*) over(partition by off_case,best) best_count from ranked where priority=best
), best as (
  select *,row_number() over(partition by off_case order by canonical_person) rn from best_counted
)
insert into public.person_reconciliation_report(offboarding_case_id,duplicate_person_id,canonical_person_id,matching_rule,confidence,migration_status,linked_onboarding_case_id)
select oc.id,oc.person_id,b.canonical_person,case b.priority when 1 then 'employee_id' when 2 then 'email' when 3 then 'normalized_name_team' end,
  case when b.best_count=1 then 'AUTO_MATCH' else 'AMBIGUOUS' end,case when b.best_count=1 then 'MIGRATED' else 'REVIEW_REQUIRED' end,b.onboarding_case
from public.cases oc left join best b on b.off_case=oc.id and b.rn=1
where oc.case_type='Offboarding'
on conflict(offboarding_case_id) do nothing;
update public.person_reconciliation_report set confidence='NO_MATCH',migration_status='REVIEW_REQUIRED' where canonical_person_id is null;
update public.cases c set person_id=r.canonical_person_id from public.person_reconciliation_report r where r.offboarding_case_id=c.id and r.confidence='AUTO_MATCH';

insert into public.employments(person_id,employment_type,employee_id,team_id,role_title,location,supervisor_name,supervisor_email,workload,contract_type,start_date,status,source_onboarding_case_id)
select c.person_id,case when c.employment_type in('Employee','Intern','Leased Labour') then c.employment_type else 'Employee' end,
  p.employee_id,p.team_id,c.role,c.location,c.supervisor_name,c.supervisor_email,c.workload,c.contract_type,c.effective_date,
  case when c.status='Cancelled' then 'cancelled' when c.status='Confirmed' and c.effective_date<=current_date then 'active' else 'planned' end,c.id
from public.cases c join public.persons p on p.id=c.person_id where c.case_type='Onboarding'
on conflict(source_onboarding_case_id) do nothing;
insert into public.employments(person_id,employment_type,employee_id,team_id,start_date,status)
select p.id,'Employee',p.employee_id,p.team_id,null,'active' from public.persons p
where p.employee_id is not null and not exists(select 1 from public.employments e where e.person_id=p.id);
update public.cases c set employment_id=e.id from public.employments e where c.employment_id is null and e.person_id=c.person_id and e.id=(select e2.id from public.employments e2 where e2.person_id=c.person_id order by e2.start_date desc nulls last limit 1);

create or replace view public.active_employee_roster with(security_invoker=true) as
select p.id person_id,e.source_onboarding_case_id case_id,p.display_name full_name,p.email,e.employee_id,p.phone,e.employment_type,e.role_title role,e.location,t.name team_name,e.start_date,e.supervisor_name
from public.employments e join public.persons p on p.id=e.person_id left join public.teams t on t.id=e.team_id
where e.status in('active','ending') and (e.start_date is null or e.start_date<=current_date) and (e.end_date is null or e.end_date>=current_date) and p.archived_at is null;
grant select on public.active_employee_roster to authenticated;

create or replace function public.sync_employment_from_case_confirmation() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='Confirmed' and old.status is distinct from new.status and new.employment_id is not null then
    if new.case_type='Onboarding' then update public.employments set status=case when start_date<=current_date then 'active' else 'planned' end,updated_at=now() where id=new.employment_id;
    else update public.employments set status=case when new.effective_date<=current_date then 'ended' else 'ending' end,end_date=new.effective_date,updated_at=now() where id=new.employment_id; end if;
  end if; return new;
end $$;
create trigger cases_sync_employment_confirmation after update of status on public.cases for each row execute function public.sync_employment_from_case_confirmation();

create or replace function public.initialize_case_workflow_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin if new.case_type='Onboarding' then perform public.initialize_case_workflow(new.id); end if; return new; end $$;

create or replace function public.create_onboarding_case_v2(
  _existing_person_id uuid,_given_name text,_family_name text,_preferred_name text,_email text,
  _employment_type text,_team_id uuid,_role_title text,_location text,_supervisor_name text,_supervisor_email text,
  _effective_date date,_workload integer,_priority text,_notes text,_visa_required boolean
) returns jsonb language plpgsql security definer set search_path=public as $$
declare caller_id uuid:=auth.uid();person_id uuid;employment_id uuid;case_id uuid;
begin
  if caller_id is null or not public.is_active_user(caller_id) or not(public.has_role(caller_id,'admin') or public.has_role(caller_id,'operator') or public.has_role(caller_id,'manager')) then raise insufficient_privilege; end if;
  if _employment_type not in('Employee','Intern','Leased Labour') then raise exception 'Invalid employment type'; end if;
  if _existing_person_id is null then
    insert into public.persons(first_name,last_name,full_name,given_name,family_name,preferred_name,display_name,email,team_id)
    values(trim(_given_name),trim(_family_name),trim(_given_name||' '||_family_name),trim(_given_name),trim(_family_name),nullif(trim(_preferred_name),''),coalesce(nullif(trim(_preferred_name),''),trim(_given_name||' '||_family_name)),nullif(lower(trim(_email)),''),_team_id) returning id into person_id;
  else select id into person_id from public.persons where id=_existing_person_id and archived_at is null; if person_id is null then raise exception 'Person not found'; end if; end if;
  insert into public.employments(person_id,employment_type,team_id,role_title,location,supervisor_name,supervisor_email,workload,start_date,status)
  values(person_id,_employment_type,_team_id,nullif(_role_title,''),nullif(_location,''),nullif(_supervisor_name,''),nullif(_supervisor_email,''),_workload,_effective_date,'planned') returning id into employment_id;
  insert into public.cases(person_id,employment_id,case_type,employment_type,start_date,effective_date,role,location,supervisor_name,supervisor_email,priority,status,owner_id,notes,visa_required)
  values(person_id,employment_id,'Onboarding',_employment_type,_effective_date,_effective_date,nullif(_role_title,''),nullif(_location,''),_supervisor_name,nullif(_supervisor_email,''),_priority,'Preparing',caller_id,nullif(_notes,''),coalesce(_visa_required,false)) returning id into case_id;
  update public.employments set source_onboarding_case_id=case_id where id=employment_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id) values(caller_id,'case',case_id::text,'Created onboarding case',case_id);
  return jsonb_build_object('caseId',case_id,'personId',person_id,'employmentId',employment_id);
end $$;

create or replace function public.create_offboarding_case_v2(
  _person_id uuid,_employment_id uuid,_effective_date date,_leaving_type text,_leaving_reason text,_priority text,_notes text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare caller_id uuid:=auth.uid();e public.employments%rowtype;case_id uuid;
begin
  if caller_id is null or not public.is_active_user(caller_id) or not(public.has_role(caller_id,'admin') or public.has_role(caller_id,'operator') or public.has_role(caller_id,'manager')) then raise insufficient_privilege; end if;
  select * into e from public.employments where id=_employment_id and person_id=_person_id and status in('active','ending');
  if e.id is null then raise exception 'Active employment not found'; end if;
  if exists(select 1 from public.cases where employment_id=e.id and case_type='Offboarding' and status not in('Cancelled','Archived')) then raise exception 'Open offboarding already exists'; end if;
  insert into public.cases(person_id,employment_id,case_type,employment_type,start_date,end_date,effective_date,role,location,supervisor_name,supervisor_email,priority,status,owner_id,notes,leaving_type,leaving_reason)
  values(_person_id,e.id,'Offboarding',e.employment_type,e.start_date,_effective_date,_effective_date,e.role_title,e.location,e.supervisor_name,e.supervisor_email,_priority,'Preparing',caller_id,nullif(_notes,''),nullif(_leaving_type,''),nullif(_leaving_reason,'')) returning id into case_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id) values(caller_id,'case',case_id::text,'Created offboarding case for existing person',case_id);
  return jsonb_build_object('caseId',case_id,'personId',_person_id,'employmentId',e.id);
end $$;
revoke all on function public.create_onboarding_case_v2(uuid,text,text,text,text,text,uuid,text,text,text,text,date,integer,text,text,boolean) from public,anon;
grant execute on function public.create_onboarding_case_v2(uuid,text,text,text,text,text,uuid,text,text,text,text,date,integer,text,text,boolean) to authenticated;
revoke all on function public.create_offboarding_case_v2(uuid,uuid,date,text,text,text,text) from public,anon;
grant execute on function public.create_offboarding_case_v2(uuid,uuid,date,text,text,text,text) to authenticated;

-- Empty legacy duplicate Persons are archived only when they have no remaining references.
update public.persons p set archived_at=now() where p.archived_at is null and not exists(select 1 from public.cases c where c.person_id=p.id) and not exists(select 1 from public.employments e where e.person_id=p.id) and not exists(select 1 from public.persons child where child.manager_id=p.id) and exists(select 1 from public.persons canonical where canonical.id<>p.id and canonical.archived_at is null and p.email is not null and lower(canonical.email)=lower(p.email) and (exists(select 1 from public.cases c2 where c2.person_id=canonical.id) or exists(select 1 from public.employments e2 where e2.person_id=canonical.id)));
