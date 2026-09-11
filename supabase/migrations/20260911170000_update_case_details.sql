-- One authorized transaction edits the Person, Employment and Case snapshot.
create or replace function public.update_case_details(
  _case_id uuid, _given_name text, _family_name text, _preferred_name text,
  _personal_email text, _company_email text, _employee_id text, _phone text, _team_id uuid,
  _employment_type text, _role text, _location text, _supervisor_name text,
  _supervisor_email text, _workload integer, _contract_type text,
  _start_date date, _contract_end_date date, _last_working_day date,
  _leaving_type text, _leaving_reason text, _priority text, _notes text,
  _visa_required boolean
) returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype; old_snapshot jsonb;
begin
  select * into c from public.cases where id=_case_id for update;
  if c.id is null then raise exception 'Case not found'; end if;
  if not public.can_manage_case(auth.uid(),c.id) then raise insufficient_privilege; end if;
  if nullif(trim(_given_name),'') is null or nullif(trim(_family_name),'') is null then raise exception 'Name is required'; end if;
  if _start_date is null then raise exception 'Start Date is required'; end if;
  if c.case_type='Offboarding' and _contract_end_date is null then raise exception 'Contract End Date is required'; end if;
  if _priority not in ('High','Medium','Low') then raise exception 'Invalid priority'; end if;
  old_snapshot:=jsonb_build_object('startDate',c.start_date,'contractEndDate',c.contract_end_date,'supervisor',c.supervisor_name,'email',(select email from public.persons where id=c.person_id));

  update public.persons set
    given_name=trim(_given_name),first_name=trim(_given_name),family_name=trim(_family_name),last_name=trim(_family_name),
    full_name=trim(_given_name)||' '||trim(_family_name),
    display_name=coalesce(nullif(trim(_preferred_name),''),trim(_given_name)||' '||trim(_family_name)),
    preferred_name=nullif(trim(_preferred_name),''),email=nullif(trim(_personal_email),''),
    employee_id=nullif(trim(_employee_id),''),phone=nullif(trim(_phone),''),team_id=_team_id,updated_at=now()
  where id=c.person_id;

  update public.employments set employment_type=_employment_type,employee_id=nullif(trim(_employee_id),''),company_email=nullif(trim(_company_email),''),
    team_id=_team_id,role_title=nullif(trim(_role),''),location=nullif(trim(_location),''),
    supervisor_name=nullif(trim(_supervisor_name),''),supervisor_email=nullif(trim(_supervisor_email),''),
    workload=_workload,contract_type=nullif(trim(_contract_type),''),start_date=_start_date,
    end_date=case when c.case_type='Offboarding' then _contract_end_date else end_date end,updated_at=now()
  where id=c.employment_id;

  update public.cases set employment_type=_employment_type,start_date=_start_date,
    effective_date=case when c.case_type='Onboarding' then _start_date else _contract_end_date end,
    end_date=case when c.case_type='Offboarding' then _contract_end_date else end_date end,
    contract_end_date=case when c.case_type='Offboarding' then _contract_end_date else contract_end_date end,
    last_working_day=case when c.case_type='Offboarding' then _last_working_day else last_working_day end,
    role=nullif(trim(_role),''),location=nullif(trim(_location),''),supervisor_name=nullif(trim(_supervisor_name),''),
    supervisor_email=nullif(trim(_supervisor_email),''),workload=_workload,contract_type=nullif(trim(_contract_type),''),
    leaving_type=case when c.case_type='Offboarding' then nullif(trim(_leaving_type),'') else leaving_type end,
    leaving_reason=case when c.case_type='Offboarding' then nullif(trim(_leaving_reason),'') else leaving_reason end,
    priority=_priority,notes=nullif(trim(_notes),''),visa_required=coalesce(_visa_required,false),updated_at=now()
  where id=c.id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'case',c.id::text,'Updated Case details','case_details',old_snapshot::text,
    jsonb_build_object('startDate',_start_date,'contractEndDate',_contract_end_date,'supervisor',_supervisor_name,'email',_personal_email)::text,c.id,
    jsonb_build_object('personId',c.person_id,'employmentId',c.employment_id));
  return jsonb_build_object('caseId',c.id);
end $$;
revoke all on function public.update_case_details(uuid,text,text,text,text,text,text,text,uuid,text,text,text,text,text,integer,text,date,date,date,text,text,text,text,boolean) from public,anon;
grant execute on function public.update_case_details(uuid,text,text,text,text,text,text,text,uuid,text,text,text,text,text,integer,text,date,date,date,text,text,text,text,boolean) to authenticated;
