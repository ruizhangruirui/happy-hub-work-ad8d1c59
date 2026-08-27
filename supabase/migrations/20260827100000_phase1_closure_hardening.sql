-- Phase 1 closure: canonical authorization, effective state, atomic transitions and rehire.

-- Employee ID is a durable Person identifier. It may repeat across that Person's
-- historical Employment episodes, but remains unique between Persons.
drop index if exists public.employments_employee_id_unique;

create or replace function public.can_manage_team(_user_id uuid, _team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user(_user_id) and (
    public.has_role(_user_id,'admin') or public.has_role(_user_id,'operator')
    or exists(select 1 from public.user_scopes s where s.user_id=_user_id and (
      s.scope_type='all_organization'
      or (s.scope_type='team' and s.team_id=_team_id)
      or (s.scope_type='lab' and s.lab_id=(select t.lab_id from public.teams t where t.id=_team_id))
    ))
  )
$$;

create or replace function public.can_access_employment(_user_id uuid,_employment_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user(_user_id) and exists(
    select 1 from public.employments e where e.id=_employment_id and (
      public.can_manage_team(_user_id,e.team_id)
      or exists(select 1 from public.cases c left join public.case_members m on m.case_id=c.id and m.user_id=_user_id and m.revoked_at is null
        where c.employment_id=e.id and (c.owner_id=_user_id or m.user_id is not null))
    )
  )
$$;

drop policy if exists "Active users view employments" on public.employments;
drop policy if exists "Case creators manage employments" on public.employments;
drop policy if exists "Case creators update employments" on public.employments;
create policy "Scoped users view employments" on public.employments for select to authenticated using(public.can_access_employment(auth.uid(),id));
create policy "Scoped lifecycle managers insert employments" on public.employments for insert to authenticated with check(public.can_manage_team(auth.uid(),team_id));
create policy "Scoped lifecycle managers update employments" on public.employments for update to authenticated using(public.can_manage_team(auth.uid(),team_id)) with check(public.can_manage_team(auth.uid(),team_id));

create or replace function public.get_effective_employment_status(_employment_id uuid,_as_of date default current_date)
returns text language sql stable security definer set search_path=public as $$
  select case
    when e.status='cancelled' then 'cancelled'
    when exists(select 1 from public.cases oc where oc.employment_id=e.id and oc.case_type='Offboarding' and oc.status='Confirmed' and oc.effective_date < _as_of) then 'ended'
    when exists(select 1 from public.cases oc where oc.employment_id=e.id and oc.case_type='Offboarding' and oc.status='Confirmed' and oc.effective_date >= _as_of) then 'ending'
    when e.source_onboarding_case_id is not null and not exists(select 1 from public.cases c where c.id=e.source_onboarding_case_id and c.status='Confirmed') then 'planned'
    when e.start_date is not null and e.start_date > _as_of then 'planned'
    else 'active' end
  from public.employments e where e.id=_employment_id
$$;

create or replace view public.employment_effective with(security_invoker=true) as
select e.*,public.get_effective_employment_status(e.id,current_date) effective_status from public.employments e;
grant select on public.employment_effective to authenticated;
revoke all on function public.get_effective_employment_status(uuid,date) from public,anon;
grant execute on function public.get_effective_employment_status(uuid,date) to authenticated;

create or replace view public.active_employee_roster with(security_invoker=true) as
select p.id person_id,e.source_onboarding_case_id case_id,p.display_name full_name,p.email,
  coalesce(e.employee_id,p.employee_id) employee_id,p.phone,e.employment_type,e.role_title role,e.location,
  t.name team_name,e.start_date,e.supervisor_name
from public.employment_effective e join public.persons p on p.id=e.person_id left join public.teams t on t.id=e.team_id
where e.effective_status in('active','ending') and p.archived_at is null;
grant select on public.active_employee_roster to authenticated;

drop trigger if exists cases_sync_employment_confirmation on public.cases;
drop function if exists public.sync_employment_from_case_confirmation();

create or replace function public.transition_lifecycle_case(_case_id uuid,_confirm boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype; old_status text; next_status text; old_emp text; next_emp text;
begin
  select * into c from public.cases where id=_case_id for update;
  if c.id is null then raise exception 'Case not found'; end if;
  if c.employment_id is null then raise exception 'Lifecycle case requires reconciled employment'; end if;
  if public.case_access(auth.uid(),c.id) not in('owner','collaborator') then raise insufficient_privilege; end if;
  if not(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator') or public.has_role(auth.uid(),'manager')) then raise insufficient_privilege; end if;
  old_status:=c.status; next_status:=case when _confirm then 'Confirmed' else 'Preparing' end;
  if _confirm and c.status<>'Preparing' then raise exception 'Only preparing cases can be confirmed'; end if;
  if not _confirm and c.status<>'Confirmed' then raise exception 'Only confirmed cases can be reopened'; end if;
  select status into old_emp from public.employments where id=c.employment_id for update;
  update public.cases set status=next_status where id=c.id;
  if c.case_type='Onboarding' then
    update public.employments set status=case when _confirm then case when start_date>current_date then 'planned' else 'active' end else 'planned' end,updated_at=now() where id=c.employment_id;
  else
    if _confirm then update public.employments set status=case when c.effective_date<current_date then 'ended' else 'ending' end,end_date=c.effective_date,updated_at=now() where id=c.employment_id;
    else update public.employments set status=case when start_date>current_date then 'planned' else 'active' end,end_date=null,updated_at=now() where id=c.employment_id
      and not exists(select 1 from public.cases x where x.employment_id=c.employment_id and x.case_type='Offboarding' and x.status='Confirmed' and x.id<>c.id);
    end if;
  end if;
  select status into next_emp from public.employments where id=c.employment_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'case',c.id::text,case when _confirm then 'Confirmed lifecycle case' else 'Reopened lifecycle case' end,'status',old_status,next_status,c.id,
    jsonb_build_object('personId',c.person_id,'employmentId',c.employment_id,'employmentPrevious',old_emp,'employmentNew',next_emp));
  return jsonb_build_object('caseId',c.id,'status',next_status,'employmentStatus',next_emp);
end $$;
revoke all on function public.transition_lifecycle_case(uuid,boolean) from public,anon;
grant execute on function public.transition_lifecycle_case(uuid,boolean) to authenticated;

-- Disable the architecture-breaking generic creation API.
revoke all on function public.create_workbench_case(text,text,text,uuid,text,text,date,date,text,text,text,text,text,text,boolean) from authenticated,anon,public;
drop function public.create_workbench_case(text,text,text,uuid,text,text,date,date,text,text,text,text,text,text,boolean);

-- Name-only results are warnings; the creation RPC blocks only employee ID/email matches.
create or replace function public.find_onboarding_person_candidates(_employee_id text,_email text,_full_name text,_team_id uuid)
returns table(person_id uuid,display_name text,email text,employee_id text,match_strength text,match_reason text,last_employment_type text,last_team text,last_end_date date)
language sql stable security definer set search_path=public as $$
  select p.id,coalesce(p.display_name,p.full_name),p.email,p.employee_id,
    case when nullif(trim(_employee_id),'') is not null and lower(p.employee_id)=lower(trim(_employee_id)) then 'strong'
         when nullif(trim(_email),'') is not null and lower(trim(p.email))=lower(trim(_email)) then 'strong' else 'warning' end,
    case when nullif(trim(_employee_id),'') is not null and lower(p.employee_id)=lower(trim(_employee_id)) then 'employee_id'
         when nullif(trim(_email),'') is not null and lower(trim(p.email))=lower(trim(_email)) then 'email' else 'name' end,
    le.employment_type,t.name,le.end_date
  from public.persons p
  left join lateral(select e.* from public.employments e where e.person_id=p.id order by e.start_date desc nulls last limit 1) le on true
  left join public.teams t on t.id=le.team_id
  where p.archived_at is null and public.can_manage_team(auth.uid(),coalesce(le.team_id,p.team_id,_team_id)) and (
    (nullif(trim(_employee_id),'') is not null and lower(p.employee_id)=lower(trim(_employee_id))) or
    (nullif(trim(_email),'') is not null and lower(trim(p.email))=lower(trim(_email))) or
    (nullif(trim(_full_name),'') is not null and lower(regexp_replace(p.full_name,'\\s+','','g'))=lower(regexp_replace(trim(_full_name),'\\s+','','g')))
  ) order by 5,2
$$;
grant execute on function public.find_onboarding_person_candidates(text,text,text,uuid) to authenticated;

-- Replace creation RPC: scope checked internally; strong identifier matches must reuse Person.
drop function public.create_onboarding_case_v2(uuid,text,text,text,text,text,uuid,text,text,text,text,date,integer,text,text,boolean);
create function public.create_onboarding_case_v2(_existing_person_id uuid,_given_name text,_family_name text,_preferred_name text,_email text,_employee_id text,_employment_type text,_team_id uuid,_role_title text,_location text,_supervisor_name text,_supervisor_email text,_effective_date date,_workload integer,_priority text,_notes text,_visa_required boolean,_allow_new_despite_match boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare person_id uuid;employment_id uuid;case_id uuid;candidate uuid;
begin
  if not public.can_manage_team(auth.uid(),_team_id) then raise insufficient_privilege; end if;
  if _employment_type not in('Employee','Intern','Leased Labour') then raise exception 'Invalid employment type'; end if;
  if _existing_person_id is null then
    select p.id into candidate from public.persons p where (nullif(trim(_employee_id),'') is not null and lower(p.employee_id)=lower(trim(_employee_id))) or (nullif(trim(_email),'') is not null and lower(trim(p.email))=lower(trim(_email))) limit 1;
    if candidate is not null then raise exception using message='Existing person match requires resolution',errcode='P0001'; end if;
    insert into public.persons(first_name,last_name,full_name,given_name,family_name,preferred_name,display_name,email,employee_id,team_id)
    values(trim(_given_name),trim(_family_name),trim(_given_name||' '||_family_name),trim(_given_name),trim(_family_name),nullif(trim(_preferred_name),''),coalesce(nullif(trim(_preferred_name),''),trim(_given_name||' '||_family_name)),nullif(lower(trim(_email)),''),nullif(trim(_employee_id),''),_team_id) returning id into person_id;
  else
    select id into person_id from public.persons where id=_existing_person_id and archived_at is null;
    if person_id is null then raise exception 'Person not found'; end if;
    if not exists(select 1 from public.persons p where p.id=person_id and public.can_manage_team(auth.uid(),coalesce(p.team_id,_team_id))) then raise insufficient_privilege; end if;
  end if;
  insert into public.employments(person_id,employment_type,employee_id,team_id,role_title,location,supervisor_name,supervisor_email,workload,start_date,status)
  values(person_id,_employment_type,nullif(trim(_employee_id),''),_team_id,nullif(_role_title,''),nullif(_location,''),nullif(_supervisor_name,''),nullif(_supervisor_email,''),_workload,_effective_date,'planned') returning id into employment_id;
  insert into public.cases(person_id,employment_id,case_type,employment_type,start_date,effective_date,role,location,supervisor_name,supervisor_email,priority,status,owner_id,notes,visa_required)
  values(person_id,employment_id,'Onboarding',_employment_type,_effective_date,_effective_date,nullif(_role_title,''),nullif(_location,''),_supervisor_name,nullif(_supervisor_email,''),_priority,'Preparing',auth.uid(),nullif(_notes,''),coalesce(_visa_required,false)) returning id into case_id;
  update public.employments set source_onboarding_case_id=case_id where id=employment_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata) values(auth.uid(),'case',case_id::text,case when _existing_person_id is null then 'Created onboarding with new person' else 'Reused person for new employment' end,case_id,jsonb_build_object('personId',person_id,'employmentId',employment_id));
  return jsonb_build_object('caseId',case_id,'personId',person_id,'employmentId',employment_id);
end $$;
grant execute on function public.create_onboarding_case_v2(uuid,text,text,text,text,text,text,uuid,text,text,text,text,date,integer,text,text,boolean,boolean) to authenticated;

create unique index if not exists cases_one_open_onboarding_per_employment on public.cases(employment_id) where case_type='Onboarding' and status not in('Cancelled');
create unique index if not exists cases_one_open_offboarding_per_employment on public.cases(employment_id) where case_type='Offboarding' and status not in('Cancelled');

create or replace function public.create_offboarding_case_v2(_person_id uuid,_employment_id uuid,_effective_date date,_leaving_type text,_leaving_reason text,_priority text,_notes text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.employment_effective%rowtype;case_id uuid;existing_case uuid;
begin
  if not public.can_access_employment(auth.uid(),_employment_id) or not(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator') or public.has_role(auth.uid(),'manager')) then raise insufficient_privilege; end if;
  select * into e from public.employment_effective where id=_employment_id and person_id=_person_id and effective_status='active';
  if e.id is null then raise exception 'Active employment not found'; end if;
  select id into existing_case from public.cases where employment_id=e.id and case_type='Offboarding' and status<>'Cancelled' limit 1;
  if existing_case is not null then return jsonb_build_object('error','offboarding_exists','caseId',existing_case); end if;
  insert into public.cases(person_id,employment_id,case_type,employment_type,start_date,end_date,effective_date,role,location,supervisor_name,supervisor_email,priority,status,owner_id,notes,leaving_type,leaving_reason)
  values(_person_id,e.id,'Offboarding',e.employment_type,e.start_date,_effective_date,_effective_date,e.role_title,e.location,e.supervisor_name,e.supervisor_email,_priority,'Preparing',auth.uid(),nullif(_notes,''),nullif(_leaving_type,''),nullif(_leaving_reason,'')) returning id into case_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata) values(auth.uid(),'case',case_id::text,'Created offboarding for existing employment',case_id,jsonb_build_object('personId',_person_id,'employmentId',e.id));
  return jsonb_build_object('caseId',case_id,'personId',_person_id,'employmentId',e.id);
end $$;
