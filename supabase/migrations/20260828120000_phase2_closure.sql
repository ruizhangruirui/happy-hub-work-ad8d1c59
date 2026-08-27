-- Phase 2 closure: capability-based Case actions and Task-authoritative Checklist state.
-- Generic Case sharing never grants HR lifecycle or Task-structure permissions.

create or replace function public.can_manage_case(_user_id uuid,_case_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_hr_user(_user_id)
    and public.case_access(_user_id,_case_id) in ('owner','collaborator')
$$;

revoke all on function public.can_manage_case(uuid,uuid) from public,anon;
grant execute on function public.can_manage_case(uuid,uuid) to authenticated;

create or replace function public.get_case_capabilities(_case_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select case when public.is_active_user(auth.uid()) and (
    public.case_access(auth.uid(),_case_id)<>'none'
    or exists(
      select 1 from public.tasks t where t.case_id=_case_id
        and public.is_operational_team_member(auth.uid(),t.owner_team)
    )
  ) then jsonb_build_object(
    'canManageCase',public.can_manage_case(auth.uid(),_case_id),
    'canConfirmLifecycle',public.can_confirm_lifecycle_case(_case_id),
    'canManageTaskStructure',public.can_manage_case(auth.uid(),_case_id),
    'canManageChecklistRules',public.is_hr_user(auth.uid()),
    'canManageWorkflow',public.can_manage_case(auth.uid(),_case_id),
    'canManageFiles',public.can_manage_case(auth.uid(),_case_id),
    'canShareCase',public.case_access(auth.uid(),_case_id)='owner',
    'canViewFullCase',public.can_manage_case(auth.uid(),_case_id)
  ) else null end
$$;

revoke all on function public.get_case_capabilities(uuid) from public,anon;
grant execute on function public.get_case_capabilities(uuid) to authenticated;

-- A shared Viewer/Collaborator or an operational team member receives only the
-- limited Case summary. Full HR Person fields are not returned by this RPC.
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
  where c.id=_case_id and public.is_active_user(auth.uid()) and (
    public.case_access(auth.uid(),c.id)<>'none'
    or exists(
      select 1 from public.tasks t where t.case_id=c.id
        and public.is_operational_team_member(auth.uid(),t.owner_team)
    )
  )
$$;

-- HR Case management, workflow, files and structural Checklist edits are
-- capability-controlled; shared collaborators no longer inherit them.
drop policy if exists "Case editors create workflow" on public.case_workflow_items;
drop policy if exists "Case editors update workflow" on public.case_workflow_items;
drop policy if exists "Case owners delete workflow" on public.case_workflow_items;
drop policy if exists "HR case managers create workflow" on public.case_workflow_items;
drop policy if exists "HR case managers update workflow" on public.case_workflow_items;
drop policy if exists "HR case managers delete workflow" on public.case_workflow_items;
create policy "HR case managers create workflow" on public.case_workflow_items
  for insert to authenticated with check(public.can_manage_case(auth.uid(),case_id));
create policy "HR case managers update workflow" on public.case_workflow_items
  for update to authenticated using(public.can_manage_case(auth.uid(),case_id))
  with check(public.can_manage_case(auth.uid(),case_id));
create policy "HR case managers delete workflow" on public.case_workflow_items
  for delete to authenticated using(public.can_manage_case(auth.uid(),case_id));

drop policy if exists "Owners and collaborators upload files" on public.case_files;
drop policy if exists "Owners and collaborators delete files" on public.case_files;
drop policy if exists "Files visible with case access" on public.case_files;
drop policy if exists "HR case managers view files" on public.case_files;
drop policy if exists "HR case managers upload files" on public.case_files;
drop policy if exists "HR case managers delete files" on public.case_files;
create policy "HR case managers view files" on public.case_files
  for select to authenticated using(public.can_manage_case(auth.uid(),case_id));
create policy "HR case managers upload files" on public.case_files
  for insert to authenticated with check(
    public.can_manage_case(auth.uid(),case_id) and uploaded_by=auth.uid()
  );
create policy "HR case managers delete files" on public.case_files
  for delete to authenticated using(public.can_manage_case(auth.uid(),case_id));

drop policy if exists "Case files uploadable by case editors" on storage.objects;
drop policy if exists "Case files updatable by case editors" on storage.objects;
drop policy if exists "Case files deletable by case editors" on storage.objects;
drop policy if exists "Case files readable with case access" on storage.objects;
drop policy if exists "Case files readable by HR case managers" on storage.objects;
drop policy if exists "Case files uploadable by HR case managers" on storage.objects;
drop policy if exists "Case files updatable by HR case managers" on storage.objects;
drop policy if exists "Case files deletable by HR case managers" on storage.objects;
create policy "Case files readable by HR case managers" on storage.objects
  for select to authenticated using(
    bucket_id='case-files'
    and public.can_manage_case(auth.uid(),(split_part(name,'/',1))::uuid)
  );
create policy "Case files uploadable by HR case managers" on storage.objects
  for insert to authenticated with check(
    bucket_id='case-files'
    and public.can_manage_case(auth.uid(),(split_part(name,'/',1))::uuid)
  );
create policy "Case files updatable by HR case managers" on storage.objects
  for update to authenticated using(
    bucket_id='case-files'
    and public.can_manage_case(auth.uid(),(split_part(name,'/',1))::uuid)
  ) with check(
    bucket_id='case-files'
    and public.can_manage_case(auth.uid(),(split_part(name,'/',1))::uuid)
  );
create policy "Case files deletable by HR case managers" on storage.objects
  for delete to authenticated using(
    bucket_id='case-files'
    and public.can_manage_case(auth.uid(),(split_part(name,'/',1))::uuid)
  );

drop policy if exists "Owners and collaborators manage checklist" on public.checklist_items;
drop policy if exists "Case editors and item owners update checklist" on public.checklist_items;
drop policy if exists "Owners and collaborators delete checklist items" on public.checklist_items;
drop policy if exists "HR case managers create checklist" on public.checklist_items;
drop policy if exists "HR case managers delete checklist" on public.checklist_items;
create policy "HR case managers create checklist" on public.checklist_items
  for insert to authenticated with check(public.can_manage_case(auth.uid(),case_id));
create policy "HR case managers delete checklist" on public.checklist_items
  for delete to authenticated using(public.can_manage_case(auth.uid(),case_id));
revoke update on public.checklist_items from authenticated;

-- Keep the legacy Checklist projection synchronized, but Task remains the
-- authoritative operational record for linked Phase 2 items.
create or replace function public.project_task_to_checklist()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.checklist_item_id is not null then
    update public.checklist_items set
      owner_id=new.owner_id,
      due_date=new.due_date,
      status=case
        when new.status='Completed' then 'Completed'
        when new.status='Not Applicable' then 'Not Required'
        else 'Open'
      end,
      completed_date=case when new.status='Completed' then new.completed_at else null end,
      completed_by=case when new.status='Completed' then new.completed_by else null end,
      updated_at=now()
    where id=new.checklist_item_id;
  end if;
  update public.checklist_items set
    owner_id=new.owner_id,
    due_date=new.due_date,
    status=case
      when new.status='Completed' then 'Completed'
      when new.status='Not Applicable' then 'Not Required'
      else 'Open'
    end,
    completed_date=case when new.status='Completed' then new.completed_at else null end,
    completed_by=case when new.status='Completed' then new.completed_by else null end,
    updated_at=now()
  where task_id=new.id and id is distinct from new.checklist_item_id;
  return new;
end
$$;

drop trigger if exists tasks_project_to_checklist on public.tasks;
create trigger tasks_project_to_checklist
after update of owner_id,status,due_date,completed_at,completed_by on public.tasks
for each row execute function public.project_task_to_checklist();

create or replace function public.assign_checklist_owner(_item_id uuid,_assignee_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare item public.checklist_items%rowtype; linked_task_id uuid; owner_team text;
begin
  select * into item from public.checklist_items where id=_item_id for update;
  if item.id is null then raise exception 'Checklist item not found'; end if;
  select t.id,t.owner_team into linked_task_id,owner_team
  from public.tasks t where t.id=item.task_id or t.checklist_item_id=item.id
  order by (t.id=item.task_id) desc limit 1;
  if linked_task_id is not null then
    perform public.assign_task(linked_task_id,_assignee_id);
    return true;
  end if;
  if not public.can_manage_case(auth.uid(),item.case_id) then raise insufficient_privilege; end if;
  owner_team:=case when item.section in ('HR','IT','Admin') then item.section else 'HR' end;
  if _assignee_id is not null and not public.is_operational_team_member(_assignee_id,owner_team) then
    raise exception 'Assignee must belong to the checklist owner team';
  end if;
  update public.checklist_items set owner_id=_assignee_id,updated_at=now() where id=item.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'checklist_item',item.id::text,'Legacy checklist item assigned','owner_id',
    item.owner_id::text,_assignee_id::text,item.case_id,jsonb_build_object('ownerTeam',owner_team));
  return true;
end
$$;

create or replace function public.set_checklist_completion(_item_id uuid,_complete boolean)
returns void language plpgsql security definer set search_path=public as $$
declare item public.checklist_items%rowtype; linked_task_id uuid;
begin
  select * into item from public.checklist_items where id=_item_id for update;
  if item.id is null then raise exception 'Checklist item not found'; end if;
  select t.id into linked_task_id from public.tasks t
  where t.id=item.task_id or t.checklist_item_id=item.id
  order by (t.id=item.task_id) desc limit 1;
  if linked_task_id is not null then
    perform public.set_task_status(linked_task_id,case when _complete then 'Completed' else 'Not Started' end,null);
    return;
  end if;
  if not public.can_manage_case(auth.uid(),item.case_id) then raise insufficient_privilege; end if;
  update public.checklist_items set
    status=case when _complete then 'Completed' else 'Open' end,
    completed_date=case when _complete then now() else null end,
    completed_by=case when _complete then auth.uid() else null end,
    updated_at=now()
  where id=item.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id)
  values(auth.uid(),'checklist_item',item.id::text,
    case when _complete then 'Legacy checklist item completed' else 'Legacy checklist item reopened' end,
    'status',item.status,case when _complete then 'Completed' else 'Open' end,item.case_id);
end
$$;

revoke all on function public.assign_checklist_owner(uuid,uuid) from public,anon;
revoke all on function public.set_checklist_completion(uuid,boolean) from public,anon;
grant execute on function public.assign_checklist_owner(uuid,uuid) to authenticated;
grant execute on function public.set_checklist_completion(uuid,boolean) to authenticated;

-- Offboarding date editing and external workflow requests are HR Case actions.
create or replace function public.update_offboarding_dates(_case_id uuid,_contract_end_date date,_last_working_day date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.cases%rowtype;
begin
  if _contract_end_date is null then raise exception 'Contract End Date is required'; end if;
  select * into c from public.cases where id=_case_id and case_type='Offboarding' for update;
  if c.id is null then raise exception 'Offboarding case not found'; end if;
  if not public.can_manage_case(auth.uid(),c.id) then raise insufficient_privilege; end if;
  update public.cases set contract_end_date=_contract_end_date,last_working_day=_last_working_day,
    end_date=_contract_end_date,effective_date=_contract_end_date,updated_at=now() where id=c.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,previous_value,new_value,case_id,metadata)
  values(auth.uid(),'case',c.id::text,'Updated offboarding dates','contract_end_date / last_working_day',
    concat_ws(' / ',c.contract_end_date::text,c.last_working_day::text),concat_ws(' / ',_contract_end_date::text,_last_working_day::text),c.id,
    jsonb_build_object('contractEndDatePrevious',c.contract_end_date,'contractEndDateNew',_contract_end_date,
      'lastWorkingDayPrevious',c.last_working_day,'lastWorkingDayNew',_last_working_day));
  return jsonb_build_object('caseId',c.id,'contractEndDate',_contract_end_date,'lastWorkingDay',_last_working_day);
end
$$;

create or replace function public.create_external_collaboration_request(
  _workflow_item_id uuid,_recipient_email text,_recipient_name text default null,
  _recipient_team text default null,_request_message text default null,_due_date date default null
)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  caller_id uuid:=auth.uid(); item_row public.case_workflow_items%rowtype;
  request_id uuid; raw_token text:=encode(gen_random_bytes(32),'hex');
begin
  select * into item_row from public.case_workflow_items where id=_workflow_item_id;
  if caller_id is null or item_row.id is null or not public.can_manage_case(caller_id,item_row.case_id) then
    raise insufficient_privilege using message='Not authorized to request an external update';
  end if;
  if _recipient_email is null or position('@' in _recipient_email)<2 then
    raise exception 'A valid recipient email is required';
  end if;
  insert into public.external_collaboration_requests(
    case_id,workflow_item_id,recipient_email,recipient_name,recipient_team,
    request_message,token_hash,due_date,expires_at,created_by
  ) values(
    item_row.case_id,item_row.id,lower(trim(_recipient_email)),nullif(trim(_recipient_name),''),
    nullif(trim(_recipient_team),''),nullif(trim(_request_message),''),
    encode(digest(raw_token,'sha256'),'hex'),_due_date,
    greatest(now()+interval '30 days',coalesce(_due_date::timestamptz+interval '30 days',now()+interval '90 days')),
    caller_id
  ) returning id into request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,field,new_value,case_id)
  values(caller_id,'external_collaboration_request',request_id,'Requested external workflow update',
    'recipient_email',lower(trim(_recipient_email)),item_row.case_id);
  return jsonb_build_object('id',request_id,'token',raw_token);
end
$$;
