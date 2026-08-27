-- Phase 1 lifecycle optimization only.
-- Preserve Person/Employment/Case history and make confirmation irreversible
-- through the ordinary workflow-reopen action.

-- Safely map legacy generic confirmations. The owner is used as the best
-- available historical actor; the original updated_at preserves chronology.
update public.cases c
set status='Joined',
    joined_date=coalesce(c.joined_date,c.effective_date,c.start_date,c.updated_at::date),
    joined_at=coalesce(c.joined_at,c.updated_at),
    joined_by=coalesce(c.joined_by,c.owner_id)
where c.case_type='Onboarding' and c.status='Confirmed';

update public.cases c
set status='Left',
    left_date=coalesce(c.left_date,c.last_working_day,c.effective_date,c.end_date,c.updated_at::date),
    left_at=coalesce(c.left_at,c.updated_at),
    left_by=coalesce(c.left_by,c.owner_id)
where c.case_type='Offboarding' and c.status='Confirmed';

update public.employments e set status='active',updated_at=now()
where exists(select 1 from public.cases c where c.employment_id=e.id and c.case_type='Onboarding' and c.joined_at is not null)
  and not exists(select 1 from public.cases c where c.employment_id=e.id and c.case_type='Offboarding' and c.left_at is not null);

update public.employments e set status='ended',updated_at=now()
where exists(select 1 from public.cases c where c.employment_id=e.id and c.case_type='Offboarding' and c.left_at is not null);

create or replace function public.can_confirm_lifecycle_case(_case_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.case_access(auth.uid(),_case_id) in ('owner','collaborator')
    and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator') or public.has_role(auth.uid(),'manager'))
$$;

create or replace function public.confirm_joined(_case_id uuid,_joined_date date default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype; e public.employments%rowtype; actual_date date:=coalesce(_joined_date,public.business_date());
begin
  select * into c from public.cases where id=_case_id for update;
  if c.id is null or c.case_type<>'Onboarding' then raise exception 'Onboarding case not found'; end if;
  if not public.can_confirm_lifecycle_case(c.id) then raise insufficient_privilege; end if;
  if c.joined_at is not null then raise exception 'Joining already confirmed'; end if;
  select * into e from public.employments where id=c.employment_id for update;
  if e.id is null then raise exception 'Lifecycle case requires reconciled employment'; end if;

  update public.cases set status='Joined',joined_date=actual_date,joined_at=now(),joined_by=auth.uid(),updated_at=now() where id=c.id;
  update public.employments set status='active',start_date=coalesce(start_date,actual_date),updated_at=now() where id=e.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'case',c.id::text,'Confirmed joined','status',c.status,'Joined',c.id,
    jsonb_build_object('personId',c.person_id,'employmentId',e.id,'joinedDate',actual_date));
  return jsonb_build_object('caseId',c.id,'status','Joined','joinedDate',actual_date);
end
$$;

create or replace function public.confirm_left(_case_id uuid,_leaving_date date default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype; e public.employments%rowtype; actual_date date;
begin
  select * into c from public.cases where id=_case_id for update;
  if c.id is null or c.case_type<>'Offboarding' then raise exception 'Offboarding case not found'; end if;
  if not public.can_confirm_lifecycle_case(c.id) then raise insufficient_privilege; end if;
  if c.left_at is not null then raise exception 'Leaving already confirmed'; end if;
  select * into e from public.employments where id=c.employment_id for update;
  if e.id is null then raise exception 'Lifecycle case requires reconciled employment'; end if;
  actual_date:=coalesce(_leaving_date,c.last_working_day,public.business_date());

  update public.cases set status='Left',left_date=actual_date,left_at=now(),left_by=auth.uid(),updated_at=now() where id=c.id;
  -- Explicit confirmation is authoritative and immediately excludes the row
  -- from Active People, including when actual_date is today or in the future.
  update public.employments set status='ended',end_date=coalesce(c.contract_end_date,end_date),updated_at=now() where id=e.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'case',c.id::text,'Confirmed left','status',c.status,'Left',c.id,
    jsonb_build_object('personId',c.person_id,'employmentId',e.id,'leavingDate',actual_date,
      'contractEndDate',c.contract_end_date,'lastWorkingDay',c.last_working_day));
  return jsonb_build_object('caseId',c.id,'status','Left','leavingDate',actual_date);
end
$$;

-- Reopening workflow never reverses Person/Employment lifecycle and never
-- clears confirmation metadata. A privileged lifecycle correction must be a
-- separately designed action; ordinary users cannot reactivate Former people.
create or replace function public.reopen_case_workflow(_case_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype; next_status text;
begin
  select * into c from public.cases where id=_case_id for update;
  if c.id is null then raise exception 'Case not found'; end if;
  if not public.can_confirm_lifecycle_case(c.id) then raise insufficient_privilege; end if;
  next_status:=case
    when c.case_type='Onboarding' and c.joined_at is not null then 'Follow-up'
    when c.case_type='Offboarding' and c.left_at is not null then 'Follow-up'
    else 'Preparing' end;
  update public.cases set status=next_status,updated_at=now() where id=c.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id)
  values(auth.uid(),'case',c.id::text,'Reopened case workflow','status',c.status,next_status,c.id);
  return jsonb_build_object('caseId',c.id,'status',next_status,'lifecycleUnchanged',true);
end
$$;

-- Compatibility wrapper for existing clients. `_confirm=false` now means
-- workflow reopen only, not lifecycle reversal.
create or replace function public.transition_lifecycle_case(_case_id uuid,_confirm boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare case_type text;
begin
  if not _confirm then return public.reopen_case_workflow(_case_id); end if;
  select c.case_type into case_type from public.cases c where c.id=_case_id;
  if case_type='Onboarding' then return public.confirm_joined(_case_id,null); end if;
  if case_type='Offboarding' then return public.confirm_left(_case_id,null); end if;
  raise exception 'Case not found';
end
$$;

revoke all on function public.can_confirm_lifecycle_case(uuid) from public,anon;
revoke all on function public.confirm_joined(uuid,date) from public,anon;
revoke all on function public.confirm_left(uuid,date) from public,anon;
revoke all on function public.reopen_case_workflow(uuid) from public,anon;
grant execute on function public.can_confirm_lifecycle_case(uuid) to authenticated;
grant execute on function public.confirm_joined(uuid,date) to authenticated;
grant execute on function public.confirm_left(uuid,date) to authenticated;
grant execute on function public.reopen_case_workflow(uuid) to authenticated;

-- Same-Person enrichment for initially missing identity data.
create or replace function public.update_person_identity(_person_id uuid,_employee_id text,_email text,_phone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.persons%rowtype; normalized_id text:=public.normalize_employee_id(_employee_id);
begin
  select * into p from public.persons where id=_person_id for update;
  if p.id is null then raise exception 'Person not found'; end if;
  if not public.can_manage_person(auth.uid(),p.id) then raise insufficient_privilege; end if;
  update public.persons set employee_id=normalized_id,email=nullif(lower(trim(_email)),''),phone=nullif(trim(_phone),''),updated_at=now() where id=p.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,metadata)
  values(auth.uid(),'person',p.id::text,'Updated Person identity','employee_id',p.employee_id,normalized_id,
    jsonb_build_object('emailPrevious',p.email,'emailNew',nullif(lower(trim(_email)),''),'phoneChanged',p.phone is distinct from nullif(trim(_phone),'')));
  return jsonb_build_object('personId',p.id,'employeeId',normalized_id);
end
$$;
revoke all on function public.update_person_identity(uuid,text,text,text) from public,anon;
grant execute on function public.update_person_identity(uuid,text,text,text) to authenticated;
