-- Phase 1 closure: make Contract End Date required, keep Last Working Day
-- independently nullable, and support later date confirmation/correction.

-- Legacy rows had only one date. Preserve that known value as Contract End
-- Date while leaving the existing Last Working Day untouched; the two fields
-- can then be corrected independently by HR.
update public.cases
set contract_end_date=coalesce(end_date,effective_date,last_working_day),
    end_date=coalesce(end_date,effective_date,last_working_day),
    effective_date=coalesce(end_date,effective_date,last_working_day)
where case_type='Offboarding' and contract_end_date is null;

update public.cases
set effective_date=contract_end_date,
    end_date=contract_end_date
where case_type='Offboarding' and contract_end_date is not null;

create or replace function public.create_offboarding_case_v3(
  _person_id uuid,_employment_id uuid,_contract_end_date date,_last_working_day date,
  _leaving_type text,_leaving_reason text,_priority text,_notes text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.employments%rowtype; case_id uuid; existing_case uuid;
begin
  if _contract_end_date is null then raise exception 'Contract End Date is required'; end if;
  if not public.can_access_employment(auth.uid(),_employment_id)
    or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator') or public.has_role(auth.uid(),'manager'))
  then raise insufficient_privilege; end if;
  select * into e from public.employments where id=_employment_id and person_id=_person_id;
  if e.id is null or public.get_effective_employment_status(e.id,public.business_date()) not in ('active','ending') then raise exception 'Active employment not found'; end if;
  select id into existing_case from public.cases where employment_id=e.id and case_type='Offboarding' and status<>'Cancelled' limit 1;
  if existing_case is not null then return jsonb_build_object('error','offboarding_exists','caseId',existing_case); end if;
  insert into public.cases(person_id,employment_id,case_type,employment_type,start_date,end_date,effective_date,
    contract_end_date,last_working_day,role,location,supervisor_name,supervisor_email,priority,status,owner_id,notes,leaving_type,leaving_reason)
  values(_person_id,e.id,'Offboarding',e.employment_type,e.start_date,_contract_end_date,_contract_end_date,
    _contract_end_date,_last_working_day,e.role_title,e.location,e.supervisor_name,e.supervisor_email,_priority,'Preparing',auth.uid(),
    nullif(_notes,''),nullif(_leaving_type,''),nullif(_leaving_reason,'')) returning id into case_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(auth.uid(),'case',case_id::text,'Created offboarding for existing employment',case_id,
    jsonb_build_object('personId',_person_id,'employmentId',e.id,'contractEndDate',_contract_end_date,'lastWorkingDay',_last_working_day));
  return jsonb_build_object('caseId',case_id,'personId',_person_id,'employmentId',e.id);
end
$$;

create or replace function public.update_offboarding_dates(_case_id uuid,_contract_end_date date,_last_working_day date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype;
begin
  if _contract_end_date is null then raise exception 'Contract End Date is required'; end if;
  select * into c from public.cases where id=_case_id and case_type='Offboarding' for update;
  if c.id is null then raise exception 'Offboarding case not found'; end if;
  if public.case_access(auth.uid(),c.id) not in ('owner','collaborator')
    or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator') or public.has_role(auth.uid(),'manager'))
  then raise insufficient_privilege; end if;
  update public.cases set contract_end_date=_contract_end_date,end_date=_contract_end_date,effective_date=_contract_end_date,
    last_working_day=_last_working_day,updated_at=now() where id=c.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'case',c.id::text,'Updated offboarding dates','contract_end_date / last_working_day',
    concat_ws(' / ',c.contract_end_date::text,c.last_working_day::text),concat_ws(' / ',_contract_end_date::text,_last_working_day::text),c.id,
    jsonb_build_object('contractEndDatePrevious',c.contract_end_date,'contractEndDateNew',_contract_end_date,
      'lastWorkingDayPrevious',c.last_working_day,'lastWorkingDayNew',_last_working_day));
  return jsonb_build_object('caseId',c.id,'contractEndDate',_contract_end_date,'lastWorkingDay',_last_working_day);
end
$$;

revoke all on function public.update_offboarding_dates(uuid,date,date) from public,anon;
grant execute on function public.update_offboarding_dates(uuid,date,date) to authenticated;
