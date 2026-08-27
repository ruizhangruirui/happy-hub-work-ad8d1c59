-- Phase 3 Closure: explicit Email Tasks, strict tokens, communication history and compose sessions.

alter table public.checklist_template_items
  add column if not exists task_type text not null default 'Task',
  add column if not exists preferred_email_template_id uuid references public.email_templates(id) on delete set null;
alter table public.checklist_template_items drop constraint if exists checklist_template_items_task_type_check;
alter table public.checklist_template_items add constraint checklist_template_items_task_type_check check(task_type in ('Task','Email'));
alter table public.tasks add column if not exists preferred_email_template_id uuid references public.email_templates(id) on delete set null;
alter table public.email_variable_library add column if not exists choices jsonb not null default '[]'::jsonb;

update public.checklist_template_items set task_type='Email'
where template_key in ('onb_hr_payroll','onb_hr_welcome','off_hr_email');
update public.tasks t set task_type=i.task_type,preferred_email_template_id=i.preferred_email_template_id,
  source_snapshot=t.source_snapshot||jsonb_build_object('taskType',i.task_type,'preferredEmailTemplateId',i.preferred_email_template_id)
from public.checklist_template_items i where i.id=t.template_item_id and t.status<>'Completed';

create or replace function public.snapshot_email_task_configuration()
returns trigger language plpgsql security definer set search_path=public as $$
declare item public.checklist_template_items%rowtype;
begin
  if new.template_item_id is not null then
    select * into item from public.checklist_template_items where id=new.template_item_id;
    new.task_type:=item.task_type;
    new.preferred_email_template_id:=item.preferred_email_template_id;
    new.source_snapshot:=coalesce(new.source_snapshot,'{}'::jsonb)||jsonb_build_object(
      'taskType',item.task_type,'preferredEmailTemplateId',item.preferred_email_template_id
    );
  end if;
  return new;
end $$;
drop trigger if exists tasks_snapshot_email_configuration on public.tasks;
create trigger tasks_snapshot_email_configuration before insert on public.tasks
for each row execute function public.snapshot_email_task_configuration();

create or replace function public.sync_open_email_task_configuration()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.tasks set task_type=new.task_type,preferred_email_template_id=new.preferred_email_template_id,
    source_snapshot=source_snapshot||jsonb_build_object('taskType',new.task_type,'preferredEmailTemplateId',new.preferred_email_template_id),updated_at=now()
  where template_item_id=new.id and status not in ('Completed','Not Applicable');
  return new;
end $$;
drop trigger if exists checklist_rules_sync_email_configuration on public.checklist_template_items;
create trigger checklist_rules_sync_email_configuration after update of task_type,preferred_email_template_id on public.checklist_template_items
for each row execute function public.sync_open_email_task_configuration();

drop function if exists public.list_operational_tasks(uuid);
create function public.list_operational_tasks(_case_id uuid default null)
returns table(
  id uuid,title text,description text,case_id uuid,case_type text,person_name text,person_team text,
  start_date date,contract_end_date date,last_working_day date,due_date date,priority text,status text,
  task_type text,owner_team text,owner_id uuid,checklist_item_id uuid,owner_name text,mandatory boolean,completed_at timestamptz,
  completed_by_name text,assignee_role text,default_task_key text,template_item_id uuid,source text,
  not_applicable_reason text,preferred_email_template_id uuid,can_edit boolean
)
language sql stable security definer set search_path=public as $$
  select t.id,t.title,t.description,t.case_id,c.case_type,p.display_name,coalesce(tm.name,'—'),
    c.start_date,c.contract_end_date,c.last_working_day,t.due_date,t.priority,t.status,t.task_type,
    t.owner_team,t.owner_id,t.checklist_item_id,assignee.name,t.mandatory,t.completed_at,completer.name,
    t.assignee_role,t.default_task_key,t.template_item_id,t.source,t.not_applicable_reason,
    t.preferred_email_template_id,public.can_update_task(auth.uid(),t.id)
  from public.tasks t join public.cases c on c.id=t.case_id join public.persons p on p.id=c.person_id
  left join public.employments e on e.id=c.employment_id left join public.teams tm on tm.id=coalesce(e.team_id,p.team_id)
  left join public.profiles assignee on assignee.id=t.owner_id left join public.profiles completer on completer.id=t.completed_by
  where (_case_id is null or t.case_id=_case_id) and public.is_active_user(auth.uid()) and (
    public.is_hr_user(auth.uid()) or public.is_operational_team_member(auth.uid(),t.owner_team) or public.case_access(auth.uid(),t.case_id)<>'none'
  ) order by t.due_date nulls last,t.created_at
$$;
revoke all on function public.list_operational_tasks(uuid) from public,anon;
grant execute on function public.list_operational_tasks(uuid) to authenticated;

alter table public.email_additional_attachments
  add column if not exists compose_session_id uuid,
  add column if not exists expires_at timestamptz;
update public.email_additional_attachments set compose_session_id=gen_random_uuid() where compose_session_id is null;
alter table public.email_additional_attachments alter column compose_session_id set not null;
alter table public.email_additional_attachments alter column expires_at set default (now()+interval '24 hours');
update public.email_additional_attachments set expires_at=created_at+interval '24 hours' where expires_at is null and communication_id is null;
create index if not exists email_additional_attachments_session_idx
  on public.email_additional_attachments(compose_session_id,communication_id);
alter table public.email_communications add column if not exists outlook_mode text;

-- Snapshot reusable attachment metadata at draft preparation so historical
-- communications do not change when the template is edited later.
create table if not exists public.email_communication_attachment_snapshots (
  id uuid primary key default gen_random_uuid(),
  communication_id uuid not null references public.email_communications(id) on delete cascade,
  source_attachment_id uuid,
  filename text not null,
  content_type text,
  size integer not null check(size between 0 and 26214400),
  source text not null default 'template' check(source in ('template','additional')),
  created_at timestamptz not null default now(),
  unique(communication_id,source,source_attachment_id)
);
grant select on public.email_communication_attachment_snapshots to authenticated;
grant all on public.email_communication_attachment_snapshots to service_role;
alter table public.email_communication_attachment_snapshots enable row level security;
drop policy if exists "HR reads communication attachment snapshots" on public.email_communication_attachment_snapshots;
create policy "HR reads communication attachment snapshots" on public.email_communication_attachment_snapshots for select to authenticated
  using(exists(select 1 from public.email_communications c where c.id=communication_id and public.can_compose_case_email(auth.uid(),c.case_id)));

create or replace function public.bind_email_compose_attachments(_compose_session_id uuid,_communication_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare comm public.email_communications%rowtype; bound integer;
begin
  select * into comm from public.email_communications where id=_communication_id for update;
  if comm.id is null or comm.prepared_by<>auth.uid() or not public.can_compose_case_email(auth.uid(),comm.case_id) then raise insufficient_privilege; end if;
  update public.email_additional_attachments set communication_id=comm.id,expires_at=null
  where compose_session_id=_compose_session_id and case_id=comm.case_id and uploaded_by=auth.uid() and communication_id is null;
  get diagnostics bound=row_count;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(auth.uid(),'email_communication',comm.id::text,'Additional attachments linked',comm.case_id,
    jsonb_build_object('composeSessionId',_compose_session_id,'attachmentCount',bound));
  return bound;
end $$;
revoke all on function public.bind_email_compose_attachments(uuid,uuid) from public,anon;
grant execute on function public.bind_email_compose_attachments(uuid,uuid) to authenticated;

create or replace function public.cleanup_abandoned_email_attachments()
returns text[] language plpgsql security definer set search_path=public as $$
declare paths text[];
begin
  if auth.uid() is not null and not public.can_manage_email_templates(auth.uid()) then raise insufficient_privilege; end if;
  with deleted as (
    delete from public.email_additional_attachments
    where communication_id is null and expires_at<now() returning storage_path
  ) select coalesce(array_agg(storage_path),'{}') into paths from deleted;
  return paths;
end $$;
revoke all on function public.cleanup_abandoned_email_attachments() from public,anon,authenticated;
grant execute on function public.cleanup_abandoned_email_attachments() to service_role;

create or replace function public.get_case_capabilities(_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare access text; manage boolean; compose boolean;
begin
  if not public.is_active_user(auth.uid()) then return null; end if;
  access:=public.case_access(auth.uid(),_case_id);
  if access='none' and not exists(
    select 1 from public.tasks t where t.case_id=_case_id and public.is_operational_team_member(auth.uid(),t.owner_team)
  ) then return null; end if;
  manage:=public.can_manage_case(auth.uid(),_case_id);
  compose:=public.can_compose_case_email(auth.uid(),_case_id);
  return jsonb_build_object(
    'canManageCase',manage,'canConfirmLifecycle',manage,'canManageTaskStructure',manage,
    'canManageChecklistRules',public.is_hr_user(auth.uid()),
    'canManageWorkflow',manage,'canManageFiles',manage,'canShareCase',manage,
    'canViewFullCase',manage,'canComposeEmail',compose
  );
end $$;

create or replace function public.list_email_eligible_case_ids()
returns setof uuid language sql stable security definer set search_path=public as $$
  select c.id from public.cases c where public.can_compose_case_email(auth.uid(),c.id) order by c.created_at desc
$$;
revoke all on function public.list_email_eligible_case_ids() from public,anon;
grant execute on function public.list_email_eligible_case_ids() to authenticated;

-- Strict parser: first find every {{...}} expression, then validate its exact inner syntax.
create or replace function public.validate_email_template_for_publish(_template_id uuid)
returns text[] language plpgsql stable security definer set search_path=public as $$
declare t public.email_templates%rowtype; token text; key text; errors text[] := '{}';
begin
  select * into t from public.email_templates where id=_template_id;
  if t.id is null then return array['Template not found']; end if;
  if nullif(trim(t.name),'') is null then errors:=array_append(errors,'Template name is required'); end if;
  if nullif(trim(t.subject),'') is null then errors:=array_append(errors,'Subject is required'); end if;
  if nullif(trim(t.body_html),'') is null then errors:=array_append(errors,'Body is required'); end if;
  if t.recipient_source not in ('personal_email','company_email','manual') then errors:=array_append(errors,'Recipient source is invalid'); end if;
  for token in select m[1] from regexp_matches(coalesce(t.subject,'')||E'\n'||coalesce(t.body_html,''),'\{\{([^}]*)\}\}','g') m loop
    key:=trim(token);
    if key !~ '^[a-z][a-z0-9_]*$' then errors:=array_append(errors,'Invalid variable: {{'||token||'}}');
    elsif not exists(select 1 from public.email_variable_library v where v.variable_key=key and v.active)
       and not exists(select 1 from public.email_template_variables v where v.template_id=t.id and v.variable_key=key) then
      errors:=array_append(errors,'Unknown variable: {{'||key||'}}');
    end if;
  end loop;
  if (length(coalesce(t.subject,''))-length(replace(coalesce(t.subject,''),'{{','')))/2 <> (length(coalesce(t.subject,''))-length(replace(coalesce(t.subject,''),'}}','')))/2
     or (length(coalesce(t.body_html,''))-length(replace(coalesce(t.body_html,''),'{{','')))/2 <> (length(coalesce(t.body_html,''))-length(replace(coalesce(t.body_html,''),'}}','')))/2 then
    errors:=array_append(errors,'Malformed variable delimiter');
  end if;
  return errors;
end $$;

create or replace function public.enforce_email_template_publish()
returns trigger language plpgsql set search_path=public as $$
declare token text; key text;
begin
  if new.status='Published' then
    if nullif(trim(new.name),'') is null or nullif(trim(new.subject),'') is null or nullif(trim(new.body_html),'') is null then raise exception 'Published template requires name, subject and body'; end if;
    for token in select m[1] from regexp_matches(coalesce(new.subject,'')||E'\n'||coalesce(new.body_html,''),'\{\{([^}]*)\}\}','g') m loop
      key:=trim(token);
      if key !~ '^[a-z][a-z0-9_]*$' then raise exception 'Invalid variable: {{%}}',token; end if;
      if not exists(select 1 from public.email_variable_library v where v.variable_key=key and v.active)
         and not exists(select 1 from public.email_template_variables v where v.template_id=new.id and v.variable_key=key) then raise exception 'Unknown variable: {{%}}',key; end if;
    end loop;
    if (length(new.subject)-length(replace(new.subject,'{{','')))/2<>(length(new.subject)-length(replace(new.subject,'}}','')))/2
       or (length(new.body_html)-length(replace(new.body_html,'{{','')))/2<>(length(new.body_html)-length(replace(new.body_html,'}}','')))/2 then raise exception 'Malformed variable delimiter'; end if;
  end if;
  new.variables=(select coalesce(jsonb_agg(distinct trim(m[1])),'[]'::jsonb) from regexp_matches(coalesce(new.subject,'')||E'\n'||coalesce(new.body_html,''),'\{\{([^}]*)\}\}','g') m where trim(m[1])~'^[a-z][a-z0-9_]*$');
  return new;
end $$;

create or replace function public.replace_email_template_variables(_template_id uuid,_variables jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare item jsonb; key text;
begin
  if not public.can_manage_email_templates(auth.uid()) then raise insufficient_privilege; end if;
  delete from public.email_template_variables where template_id=_template_id;
  for item in select value from jsonb_array_elements(coalesce(_variables,'[]'::jsonb)) loop
    key:=item->>'key';
    if exists(select 1 from public.email_variable_library where variable_key=key and active) then raise exception 'Template variable duplicates active global variable: %',key; end if;
    insert into public.email_template_variables(template_id,variable_key,display_name,data_type,required,default_value,description,choices)
    values(_template_id,key,coalesce(nullif(item->>'displayName',''),key),coalesce(item->>'dataType','text'),
      coalesce((item->>'required')::boolean,false),nullif(item->>'defaultValue',''),nullif(item->>'description',''),coalesce(item->'choices','[]'::jsonb));
  end loop;
end $$;

create or replace function public.record_email_event(
  _case_id uuid,_task_id uuid,_template_id uuid,_template_version integer,
  _recipient text,_subject text,_state text,_communication_id uuid,_outlook_mode text
) returns uuid language plpgsql security definer set search_path=public as $$
declare result_id uuid; task_row public.tasks%rowtype;
begin
  if not public.can_compose_case_email(auth.uid(),_case_id) then raise insufficient_privilege; end if;
  if _state not in ('Draft Prepared','Opened in Outlook','Marked Sent') then raise exception 'Invalid email state'; end if;
  if _task_id is not null then
    select * into task_row from public.tasks where id=_task_id and case_id=_case_id;
    if task_row.id is null or task_row.task_type<>'Email' or task_row.owner_team<>'HR' or not public.can_update_task(auth.uid(),task_row.id) then raise insufficient_privilege; end if;
  end if;
  if _communication_id is null then
    insert into public.email_communications(case_id,task_id,template_id,template_version,recipient,rendered_subject,state,prepared_by,opened_at,marked_sent_at,outlook_mode)
    values(_case_id,_task_id,_template_id,_template_version,_recipient,_subject,_state,auth.uid(),case when _state='Opened in Outlook' then now() end,case when _state='Marked Sent' then now() end,_outlook_mode) returning id into result_id;
    insert into public.email_communication_attachment_snapshots(
      communication_id,source_attachment_id,filename,content_type,size,source
    )
    select result_id,a.id,a.filename,a.content_type,a.size,'template'
    from public.email_template_attachments a where a.template_id=_template_id
    on conflict do nothing;
  else
    update public.email_communications set state=_state,outlook_mode=coalesce(_outlook_mode,outlook_mode),
      opened_at=case when _state='Opened in Outlook' then coalesce(opened_at,now()) else opened_at end,
      marked_sent_at=case when _state='Marked Sent' then now() else marked_sent_at end
    where id=_communication_id and case_id=_case_id and prepared_by=auth.uid() returning id into result_id;
    if result_id is null then raise insufficient_privilege; end if;
  end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(auth.uid(),'email_communication',result_id::text,_state,_case_id,
    jsonb_build_object('taskId',_task_id,'templateId',_template_id,'templateVersion',_template_version,'recipient',_recipient,'subject',_subject,'outlookMode',_outlook_mode));
  if _state='Marked Sent' and _task_id is not null then perform public.set_task_status(_task_id,'Completed',null); end if;
  return result_id;
end $$;
revoke all on function public.record_email_event(uuid,uuid,uuid,integer,text,text,text,uuid,text) from public,anon;
grant execute on function public.record_email_event(uuid,uuid,uuid,integer,text,text,text,uuid,text) to authenticated;

-- Preserve the Phase 3 eight-argument API without retaining its older, less
-- strict implementation. All callers now pass through the Closure checks.
create or replace function public.record_email_event(
  _case_id uuid,_task_id uuid,_template_id uuid,_template_version integer,
  _recipient text,_subject text,_state text,_communication_id uuid default null
) returns uuid language sql security definer set search_path=public as $$
  select public.record_email_event(
    _case_id,_task_id,_template_id,_template_version,_recipient,_subject,_state,_communication_id,null
  )
$$;
revoke all on function public.record_email_event(uuid,uuid,uuid,integer,text,text,text,uuid) from public,anon;
grant execute on function public.record_email_event(uuid,uuid,uuid,integer,text,text,text,uuid) to authenticated;

create or replace function public.audit_email_attachment_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare action_name text; actor uuid; entity uuid; related_case uuid; details jsonb;
begin
  action_name:=case when tg_op='INSERT' then 'Email attachment uploaded' else 'Email attachment removed' end;
  if tg_table_name='email_additional_attachments' then
    actor:=coalesce(auth.uid(),case when tg_op='DELETE' then old.uploaded_by else new.uploaded_by end);
    entity:=case when tg_op='DELETE' then old.id else new.id end;
    related_case:=case when tg_op='DELETE' then old.case_id else new.case_id end;
    details:=jsonb_build_object('filename',case when tg_op='DELETE' then old.filename else new.filename end);
  else
    actor:=coalesce(auth.uid(),case when tg_op='DELETE' then old.uploaded_by else new.uploaded_by end);
    entity:=case when tg_op='DELETE' then old.id else new.id end;
    related_case:=null;
    details:=jsonb_build_object(
      'filename',case when tg_op='DELETE' then old.filename else new.filename end,
      'templateId',case when tg_op='DELETE' then old.template_id else new.template_id end
    );
  end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(actor,'email_attachment',entity::text,action_name,related_case,details);
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists audit_template_email_attachment on public.email_template_attachments;
create trigger audit_template_email_attachment after insert or delete on public.email_template_attachments for each row execute function public.audit_email_attachment_change();
drop trigger if exists audit_additional_email_attachment on public.email_additional_attachments;
create trigger audit_additional_email_attachment after insert or delete on public.email_additional_attachments for each row execute function public.audit_email_attachment_change();
