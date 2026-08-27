-- Phase 3: Email Center V2. Email preparation remains HR-only and never sends mail.

alter table public.email_variable_library
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.email_templates drop constraint if exists email_templates_status_check;
alter table public.email_templates add constraint email_templates_status_check
  check (status in ('Draft','Published','Archived'));
alter table public.email_templates
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists published_at timestamptz;
update public.email_templates set created_by=owner_id where created_by is null;

create table if not exists public.email_template_variables (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.email_templates(id) on delete cascade,
  variable_key text not null check(variable_key ~ '^[a-z][a-z0-9_]*$'),
  display_name text not null,
  data_type text not null default 'text' check(lower(data_type) in ('text','date','email','number','boolean','dropdown','choice')),
  required boolean not null default false,
  default_value text,
  description text,
  choices jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id,variable_key)
);

alter table public.checklist_template_items
  add column if not exists preferred_email_template_id uuid references public.email_templates(id) on delete set null;
alter table public.tasks
  add column if not exists preferred_email_template_id uuid references public.email_templates(id) on delete set null;

create table if not exists public.email_communications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  template_id uuid references public.email_templates(id) on delete set null,
  template_version integer,
  recipient text not null,
  rendered_subject text not null,
  state text not null check(state in ('Draft Prepared','Opened in Outlook','Marked Sent')),
  prepared_by uuid not null references auth.users(id),
  prepared_at timestamptz not null default now(),
  opened_at timestamptz,
  marked_sent_at timestamptz
);
create index if not exists email_communications_case_idx on public.email_communications(case_id,prepared_at desc);

create table if not exists public.email_additional_attachments (
  id uuid primary key default gen_random_uuid(),
  communication_id uuid references public.email_communications(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  filename text not null,
  storage_path text not null unique,
  content_type text,
  size integer not null check(size between 0 and 26214400),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.can_manage_email_templates(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user(_user_id) and public.is_hr_user(_user_id)
    and (public.has_role(_user_id,'admin') or public.has_role(_user_id,'operator'))
$$;

create or replace function public.can_compose_case_email(_user_id uuid,_case_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user(_user_id) and public.is_hr_user(_user_id)
    and public.case_access(_user_id,_case_id)<>'none'
$$;

revoke all on public.email_variable_library from authenticated;
grant select,insert,update on public.email_variable_library to authenticated;
drop policy if exists "Active users read email variables" on public.email_variable_library;
drop policy if exists "HR reads email variables" on public.email_variable_library;
drop policy if exists "HR manages email variables" on public.email_variable_library;
create policy "HR reads email variables" on public.email_variable_library for select to authenticated
  using(public.is_hr_user(auth.uid()));
create policy "HR manages email variables" on public.email_variable_library for all to authenticated
  using(public.can_manage_email_templates(auth.uid())) with check(public.can_manage_email_templates(auth.uid()));

grant select,insert,update,delete on public.email_template_variables to authenticated;
grant all on public.email_template_variables to service_role;
alter table public.email_template_variables enable row level security;
create policy "HR reads template variables" on public.email_template_variables for select to authenticated
  using(public.is_hr_user(auth.uid()));
create policy "HR manages template variables" on public.email_template_variables for all to authenticated
  using(public.can_manage_email_templates(auth.uid())) with check(public.can_manage_email_templates(auth.uid()));

drop policy if exists "email_templates_select_active" on public.email_templates;
drop policy if exists "email_templates_manage_admin_operator" on public.email_templates;
drop policy if exists "Active users read published templates" on public.email_templates;
create policy "HR reads email templates" on public.email_templates for select to authenticated
  using(public.is_hr_user(auth.uid()) and (status='Published' or public.can_manage_email_templates(auth.uid())));
create policy "HR managers create templates" on public.email_templates for insert to authenticated
  with check(public.can_manage_email_templates(auth.uid()) and owner_id=auth.uid());
create policy "HR managers update templates" on public.email_templates for update to authenticated
  using(public.can_manage_email_templates(auth.uid())) with check(public.can_manage_email_templates(auth.uid()));

drop policy if exists "Active users read template attachments" on public.email_template_attachments;
drop policy if exists "HR manages template attachments" on public.email_template_attachments;
create policy "HR reads template attachments" on public.email_template_attachments for select to authenticated
  using(public.is_hr_user(auth.uid()));
create policy "HR managers add template attachments" on public.email_template_attachments for insert to authenticated
  with check(public.can_manage_email_templates(auth.uid()) and uploaded_by=auth.uid());
create policy "HR managers remove template attachments" on public.email_template_attachments for delete to authenticated
  using(public.can_manage_email_templates(auth.uid()));

grant select,insert,update on public.email_communications to authenticated;
grant all on public.email_communications to service_role;
alter table public.email_communications enable row level security;
create policy "HR reads case communications" on public.email_communications for select to authenticated
  using(case_id is not null and public.can_compose_case_email(auth.uid(),case_id));
create policy "HR creates case communications" on public.email_communications for insert to authenticated
  with check(prepared_by=auth.uid() and case_id is not null and public.can_compose_case_email(auth.uid(),case_id));

grant select,insert,delete on public.email_additional_attachments to authenticated;
grant all on public.email_additional_attachments to service_role;
alter table public.email_additional_attachments enable row level security;
create policy "HR reads additional email attachments" on public.email_additional_attachments for select to authenticated
  using(case_id is not null and public.can_compose_case_email(auth.uid(),case_id));
create policy "HR adds additional email attachments" on public.email_additional_attachments for insert to authenticated
  with check(uploaded_by=auth.uid() and case_id is not null and public.can_compose_case_email(auth.uid(),case_id));
create policy "HR removes additional email attachments" on public.email_additional_attachments for delete to authenticated
  using(uploaded_by=auth.uid() and case_id is not null and public.can_compose_case_email(auth.uid(),case_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('email-attachments','email-attachments',false,26214400,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;

drop policy if exists "HR reads email attachment objects" on storage.objects;
drop policy if exists "HR managers upload email attachment objects" on storage.objects;
drop policy if exists "HR managers update email attachment objects" on storage.objects;
drop policy if exists "HR managers delete email attachment objects" on storage.objects;
create policy "HR reads email attachment objects" on storage.objects for select to authenticated
  using(bucket_id='email-attachments' and public.is_hr_user(auth.uid()));
create policy "HR managers upload email attachment objects" on storage.objects for insert to authenticated
  with check(bucket_id='email-attachments' and (
    public.can_manage_email_templates(auth.uid()) or
    ((storage.foldername(name))[1]='additional' and public.can_compose_case_email(auth.uid(),((storage.foldername(name))[2])::uuid))
  ));
create policy "HR managers update email attachment objects" on storage.objects for update to authenticated
  using(bucket_id='email-attachments' and public.can_manage_email_templates(auth.uid()))
  with check(bucket_id='email-attachments' and public.can_manage_email_templates(auth.uid()));
create policy "HR managers delete email attachment objects" on storage.objects for delete to authenticated
  using(bucket_id='email-attachments' and (
    public.can_manage_email_templates(auth.uid()) or
    ((storage.foldername(name))[1]='additional' and public.can_compose_case_email(auth.uid(),((storage.foldername(name))[2])::uuid))
  ));

create or replace function public.validate_email_template_for_publish(_template_id uuid)
returns text[] language plpgsql stable security definer set search_path=public as $$
declare t public.email_templates%rowtype; key text; errors text[] := '{}';
begin
  select * into t from public.email_templates where id=_template_id;
  if t.id is null then return array['Template not found']; end if;
  if nullif(trim(t.name),'') is null then errors:=array_append(errors,'Template name is required'); end if;
  if nullif(trim(t.subject),'') is null then errors:=array_append(errors,'Subject is required'); end if;
  if nullif(trim(t.body_html),'') is null then errors:=array_append(errors,'Body is required'); end if;
  if t.recipient_source not in ('personal_email','company_email','manual') then errors:=array_append(errors,'Recipient source is invalid'); end if;
  for key in select distinct m[1] from regexp_matches(coalesce(t.subject,'')||E'\n'||coalesce(t.body_html,''),'\{\{\s*([a-z][a-z0-9_]*)\s*\}\}','g') m loop
    if not exists(select 1 from public.email_variable_library v where v.variable_key=key and v.active)
       and not exists(select 1 from public.email_template_variables v where v.template_id=t.id and v.variable_key=key) then
      errors:=array_append(errors,'Unknown variable: {{'||key||'}}');
    end if;
  end loop;
  if exists(select 1 from public.email_template_attachments a where a.template_id=t.id and nullif(a.storage_path,'') is null) then
    errors:=array_append(errors,'Attachment metadata is invalid');
  end if;
  return errors;
end $$;

create or replace function public.replace_email_template_variables(_template_id uuid,_variables jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
  if not public.can_manage_email_templates(auth.uid()) then raise insufficient_privilege; end if;
  if not exists(select 1 from public.email_templates where id=_template_id) then raise exception 'Template not found'; end if;
  delete from public.email_template_variables where template_id=_template_id;
  for item in select value from jsonb_array_elements(coalesce(_variables,'[]'::jsonb)) loop
    insert into public.email_template_variables(template_id,variable_key,display_name,data_type,required,default_value,description,choices)
    values(_template_id,item->>'key',coalesce(nullif(item->>'displayName',''),item->>'key'),coalesce(item->>'dataType','text'),
      coalesce((item->>'required')::boolean,false),nullif(item->>'defaultValue',''),nullif(item->>'description',''),
      coalesce(item->'choices','[]'::jsonb));
  end loop;
end $$;
revoke all on function public.replace_email_template_variables(uuid,jsonb) from public,anon;
grant execute on function public.replace_email_template_variables(uuid,jsonb) to authenticated;

create or replace function public.enforce_email_template_publish()
returns trigger language plpgsql set search_path=public as $$
declare key text;
begin
  if new.status='Published' then
    if nullif(trim(new.name),'') is null or nullif(trim(new.subject),'') is null or nullif(trim(new.body_html),'') is null then
      raise exception 'Published template requires name, subject and body';
    end if;
    if new.recipient_source not in ('personal_email','company_email','manual') then raise exception 'Invalid recipient source'; end if;
    for key in select distinct m[1] from regexp_matches(coalesce(new.subject,'')||E'\n'||coalesce(new.body_html,''),'\{\{\s*([a-z][a-z0-9_]*)\s*\}\}','g') m loop
      if not exists(select 1 from public.email_variable_library v where v.variable_key=key and v.active)
         and not exists(select 1 from public.email_template_variables v where v.template_id=new.id and v.variable_key=key) then
        raise exception 'Unknown variable: {{%}}',key;
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists enforce_email_template_publish_trigger on public.email_templates;
create trigger enforce_email_template_publish_trigger before insert or update of status,subject,body_html on public.email_templates
for each row execute function public.enforce_email_template_publish();

create or replace function public.record_email_event(
  _case_id uuid,_task_id uuid,_template_id uuid,_template_version integer,
  _recipient text,_subject text,_state text,_communication_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare result_id uuid; task_row public.tasks%rowtype;
begin
  if not public.can_compose_case_email(auth.uid(),_case_id) then raise insufficient_privilege; end if;
  if _state not in ('Draft Prepared','Opened in Outlook','Marked Sent') then raise exception 'Invalid email state'; end if;
  if _task_id is not null then
    select * into task_row from public.tasks where id=_task_id and case_id=_case_id;
    if task_row.id is null or task_row.owner_team<>'HR' or not public.can_update_task(auth.uid(),task_row.id) then raise insufficient_privilege; end if;
  end if;
  if _communication_id is null then
    insert into public.email_communications(case_id,task_id,template_id,template_version,recipient,rendered_subject,state,prepared_by,
      opened_at,marked_sent_at)
    values(_case_id,_task_id,_template_id,_template_version,_recipient,_subject,_state,auth.uid(),
      case when _state='Opened in Outlook' then now() end,case when _state='Marked Sent' then now() end) returning id into result_id;
  else
    update public.email_communications set state=_state,
      opened_at=case when _state='Opened in Outlook' then coalesce(opened_at,now()) else opened_at end,
      marked_sent_at=case when _state='Marked Sent' then now() else marked_sent_at end
    where id=_communication_id and prepared_by=auth.uid() returning id into result_id;
    if result_id is null then raise insufficient_privilege; end if;
  end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(auth.uid(),'email_communication',result_id::text,_state,_case_id,
    jsonb_build_object('taskId',_task_id,'templateId',_template_id,'templateVersion',_template_version,'recipient',_recipient,'subject',_subject));
  if _state='Marked Sent' and _task_id is not null then perform public.set_task_status(_task_id,'Completed',null); end if;
  return result_id;
end $$;
revoke all on function public.record_email_event(uuid,uuid,uuid,integer,text,text,text,uuid) from public,anon;
grant execute on function public.record_email_event(uuid,uuid,uuid,integer,text,text,text,uuid) to authenticated;

insert into public.email_variable_library(variable_key,display_name,data_type,source_type,source_field,required,description,active)
values
 ('first_name','First Name','text','person','first_name',false,'Legal first name',true),
 ('preferred_name','Preferred Name','text','person','preferred_name',false,'Preferred first name',true),
 ('phone','Phone','text','person','phone',false,'Personal phone',true),
 ('role','Role','text','employment','role',false,'Role title',true),
 ('supervisor_email','Supervisor Email','email','employment','supervisor_email',false,'Supervisor email',true),
 ('workload','Workload','number','employment','workload',false,'Employment workload',true),
 ('leaving_type','Leaving Type','text','offboarding_case','leaving_type',false,'Leaving type',true),
 ('leaving_reason','Leaving Reason','text','offboarding_case','leaving_reason',false,'Leaving reason',true),
 ('meeting_room','Meeting Room','text','manual',null,false,'Meeting room',true),
 ('contact_person','Contact Person','text','manual',null,false,'Contact person',true),
 ('contact_email','Contact Email','email','manual',null,false,'Contact email',true),
 ('special_instruction','Special Instruction','text','manual',null,false,'Additional instruction',true)
on conflict(variable_key) do update set display_name=excluded.display_name,data_type=excluded.data_type,
  source_type=excluded.source_type,source_field=excluded.source_field,description=excluded.description,active=true;

-- Normalize legacy dotted tokens once so every published template uses stable snake_case keys.
update public.email_templates set
  subject=replace(replace(replace(replace(replace(replace(replace(replace(subject,
    '{{person.first_name}}','{{first_name}}'),'{{person.full_name}}','{{employee_name}}'),
    '{{case.start_date}}','{{start_date}}'),'{{case.end_date}}','{{contract_end_date}}'),
    '{{manager.name}}','{{supervisor_name}}'),'{{person.team}}','{{team}}'),
    '{{case.role}}','{{role}}'),'{{manual.additional_information}}','{{special_instruction}}'),
  body_html=replace(replace(replace(replace(replace(replace(replace(replace(body_html,
    '{{person.first_name}}','{{first_name}}'),'{{person.full_name}}','{{employee_name}}'),
    '{{case.start_date}}','{{start_date}}'),'{{case.end_date}}','{{contract_end_date}}'),
    '{{manager.name}}','{{supervisor_name}}'),'{{person.team}}','{{team}}'),
    '{{case.role}}','{{role}}'),'{{manual.additional_information}}','{{special_instruction}}'),
  variables=(select coalesce(jsonb_agg(distinct case value#>>'{}'
    when 'person.first_name' then 'first_name' when 'person.full_name' then 'employee_name'
    when 'case.start_date' then 'start_date' when 'case.end_date' then 'contract_end_date'
    when 'manager.name' then 'supervisor_name' when 'person.team' then 'team'
    when 'case.role' then 'role' when 'manual.additional_information' then 'special_instruction'
    else value#>>'{}' end),'[]'::jsonb) from jsonb_array_elements(variables));
