create or replace function public.import_people(_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r jsonb; p_id uuid; e_id uuid; team_id uuid; created_count integer:=0; updated_count integer:=0;
  errors jsonb:='[]'::jsonb; row_no integer; start_on date; end_on date; emp_type text;
begin
  if not public.is_active_user(auth.uid()) or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'operator')) then
    raise insufficient_privilege;
  end if;
  if jsonb_typeof(_rows)<>'array' or jsonb_array_length(_rows)=0 or jsonb_array_length(_rows)>500 then
    raise exception 'Import must contain between 1 and 500 rows';
  end if;
  for r in select value from jsonb_array_elements(_rows) loop
    begin
      row_no:=coalesce((r->>'rowNumber')::integer,0); start_on:=(r->>'startDate')::date;
      end_on:=nullif(r->>'endDate','')::date; emp_type:=r->>'employmentType';
      if start_on>public.business_date() then raise exception 'Future joiners must be added through Onboarding'; end if;
      if end_on is not null and end_on<public.business_date() then raise exception 'End Date has already passed'; end if;
      if emp_type not in ('Employee','Intern','Leased Labour') then raise exception 'Invalid Employment Type'; end if;
      team_id:=null;
      if nullif(trim(r->>'team'),'') is not null then
        select id into team_id from public.teams where lower(trim(name))=lower(trim(r->>'team')) and status='Active' limit 1;
        if team_id is null then raise exception 'Team "%" was not found',r->>'team'; end if;
      end if;
      p_id:=null;
      if nullif(trim(r->>'employeeId'),'') is not null then
        select id into p_id from public.persons where lower(trim(employee_id))=lower(trim(r->>'employeeId')) and archived_at is null limit 1;
      end if;
      if p_id is null and nullif(trim(r->>'personalEmail'),'') is not null then
        select id into p_id from public.persons where lower(trim(email))=lower(trim(r->>'personalEmail')) and archived_at is null limit 1;
      end if;
      if p_id is null then
        insert into public.persons(given_name,first_name,family_name,last_name,full_name,display_name,preferred_name,email,employee_id,phone,team_id,created_by)
        values(trim(r->>'givenName'),trim(r->>'givenName'),trim(r->>'familyName'),trim(r->>'familyName'),trim(r->>'givenName')||' '||trim(r->>'familyName'),
          coalesce(nullif(trim(r->>'preferredName'),''),trim(r->>'givenName')||' '||trim(r->>'familyName')),nullif(trim(r->>'preferredName'),''),
          nullif(trim(r->>'personalEmail'),''),nullif(trim(r->>'employeeId'),''),nullif(trim(r->>'phone'),''),team_id,auth.uid()) returning id into p_id;
        insert into public.employments(person_id,employment_type,employee_id,company_email,team_id,role_title,location,supervisor_name,supervisor_email,workload,contract_type,start_date,end_date,status)
        values(p_id,emp_type,nullif(trim(r->>'employeeId'),''),nullif(trim(r->>'companyEmail'),''),team_id,nullif(trim(r->>'role'),''),nullif(trim(r->>'location'),''),
          nullif(trim(r->>'supervisorName'),''),nullif(trim(r->>'supervisorEmail'),''),nullif(r->>'workload','')::integer,nullif(trim(r->>'contractType'),''),start_on,end_on,case when end_on is null then 'active' else 'ending' end);
        created_count:=created_count+1;
      else
        if not public.can_manage_person(auth.uid(),p_id) then raise insufficient_privilege; end if;
        update public.persons set given_name=trim(r->>'givenName'),first_name=trim(r->>'givenName'),family_name=trim(r->>'familyName'),last_name=trim(r->>'familyName'),
          full_name=trim(r->>'givenName')||' '||trim(r->>'familyName'),display_name=coalesce(nullif(trim(r->>'preferredName'),''),trim(r->>'givenName')||' '||trim(r->>'familyName')),
          preferred_name=nullif(trim(r->>'preferredName'),''),email=coalesce(nullif(trim(r->>'personalEmail'),''),email),employee_id=coalesce(nullif(trim(r->>'employeeId'),''),employee_id),
          phone=coalesce(nullif(trim(r->>'phone'),''),phone),team_id=coalesce(team_id,public.persons.team_id),updated_at=now() where id=p_id;
        select ee.id into e_id from public.employment_effective ee where ee.person_id=p_id and ee.effective_status in ('active','ending') order by ee.start_date desc nulls last limit 1;
        if e_id is null then
          insert into public.employments(person_id,employment_type,employee_id,company_email,team_id,role_title,location,supervisor_name,supervisor_email,workload,contract_type,start_date,end_date,status)
          values(p_id,emp_type,nullif(trim(r->>'employeeId'),''),nullif(trim(r->>'companyEmail'),''),team_id,nullif(trim(r->>'role'),''),nullif(trim(r->>'location'),''),nullif(trim(r->>'supervisorName'),''),nullif(trim(r->>'supervisorEmail'),''),nullif(r->>'workload','')::integer,nullif(trim(r->>'contractType'),''),start_on,end_on,case when end_on is null then 'active' else 'ending' end);
        else
          update public.employments set employment_type=emp_type,employee_id=coalesce(nullif(trim(r->>'employeeId'),''),employee_id),company_email=coalesce(nullif(trim(r->>'companyEmail'),''),company_email),
            team_id=coalesce(team_id,public.employments.team_id),role_title=coalesce(nullif(trim(r->>'role'),''),role_title),location=coalesce(nullif(trim(r->>'location'),''),location),
            supervisor_name=coalesce(nullif(trim(r->>'supervisorName'),''),supervisor_name),supervisor_email=coalesce(nullif(trim(r->>'supervisorEmail'),''),supervisor_email),
            workload=coalesce(nullif(r->>'workload','')::integer,workload),contract_type=coalesce(nullif(trim(r->>'contractType'),''),contract_type),start_date=start_on,end_date=end_on,
            status=case when end_on is null then 'active' else 'ending' end,updated_at=now() where id=e_id;
        end if;
        updated_count:=updated_count+1;
      end if;
      insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,new_value,metadata)
      values(auth.uid(),'person',p_id::text,'Imported People record','people_import',r::text,jsonb_build_object('row',row_no));
    exception when others then
      errors:=errors||jsonb_build_array(jsonb_build_object('row',row_no,'message',sqlerrm));
    end;
  end loop;
  return jsonb_build_object('created',created_count,'updated',updated_count,'errors',errors);
end $$;
revoke all on function public.import_people(jsonb) from public,anon;
grant execute on function public.import_people(jsonb) to authenticated;

create or replace function public.export_people()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'givenName',p.given_name,'familyName',p.family_name,'preferredName',p.preferred_name,
    'personalEmail',p.email,'companyEmail',e.company_email,'employeeId',coalesce(e.employee_id,p.employee_id),
    'phone',p.phone,'employmentType',e.employment_type,'team',t.name,'role',e.role_title,
    'location',e.location,'supervisorName',e.supervisor_name,'supervisorEmail',e.supervisor_email,
    'workload',e.workload,'contractType',e.contract_type,'status',e.effective_status,
    'startDate',e.start_date,'endDate',e.end_date
  ) order by p.display_name),'[]'::jsonb)
  from public.persons p
  join lateral (
    select base.*,public.get_effective_employment_status(base.id,public.business_date()) effective_status
    from public.employments base
    where base.person_id=p.id
      and public.get_effective_employment_status(base.id,public.business_date()) in ('active','ending')
      and public.can_access_employment(auth.uid(),base.id)
    order by case public.get_effective_employment_status(base.id,public.business_date()) when 'active' then 1 else 2 end,
      base.start_date desc nulls last limit 1
  ) e on true
  left join public.teams t on t.id=e.team_id
  where p.archived_at is null and public.is_active_user(auth.uid())
$$;
revoke all on function public.export_people() from public,anon;
grant execute on function public.export_people() to authenticated;
