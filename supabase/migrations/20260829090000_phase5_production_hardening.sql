-- Phase 5: production security, retention and storage consistency hardening.

-- All application buckets are private and enforce the same allow-list in Storage
-- that the browser validates before upload.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('case-files','case-files',false,26214400,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg'
])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

alter table public.case_files add column if not exists deletion_requested_at timestamptz;

alter table public.case_files drop constraint if exists case_files_size_valid;
alter table public.case_files add constraint case_files_size_valid
  check(size between 0 and 26214400) not valid;
alter table public.case_files drop constraint if exists case_files_content_type_valid;
alter table public.case_files add constraint case_files_content_type_valid check(
  content_type is null or content_type in(
    'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg'
  )
) not valid;

alter table public.task_files drop constraint if exists task_files_size_valid;
alter table public.task_files add constraint task_files_size_valid
  check(size between 0 and 26214400) not valid;

-- Case file deletion is authorized and staged in PostgreSQL before Storage may
-- remove the object. This closes the browser's former Storage/metadata race.
revoke delete on public.case_files from authenticated;
drop policy if exists "HR case managers delete files" on public.case_files;

create or replace function public.request_case_file_deletion(_file_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare file_row public.case_files%rowtype;
begin
  select * into file_row from public.case_files where id=_file_id for update;
  if file_row.id is null or not public.can_manage_case(auth.uid(),file_row.case_id) then
    raise insufficient_privilege;
  end if;
  update public.case_files set deletion_requested_at=coalesce(deletion_requested_at,now())
  where id=file_row.id;
  return file_row.storage_path;
end $$;
revoke all on function public.request_case_file_deletion(uuid) from public,anon;
grant execute on function public.request_case_file_deletion(uuid) to authenticated;

create or replace function public.finalize_case_file_deletion(_file_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare removed_count integer;
begin
  delete from public.case_files
  where id=_file_id and deletion_requested_at is not null
    and public.can_manage_case(auth.uid(),case_id);
  get diagnostics removed_count=row_count;
  return removed_count>0;
end $$;
revoke all on function public.finalize_case_file_deletion(uuid) from public,anon;
grant execute on function public.finalize_case_file_deletion(uuid) to authenticated;

drop policy if exists "Case files deletable by HR case managers" on storage.objects;
create policy "Case files deletable after governed request" on storage.objects
  for delete to authenticated using(
    bucket_id='case-files' and exists(
      select 1 from public.case_files f
      where f.storage_path=name and f.deletion_requested_at is not null
        and public.can_manage_case(auth.uid(),f.case_id)
    )
  );

-- Abandoned compose cleanup is a deliberate service-role maintenance flow:
-- mark -> delete only returned Storage paths -> finalize only successful paths.
-- Bound historical evidence is excluded at every stage.
create or replace function public.cleanup_abandoned_email_attachments()
returns text[] language plpgsql security definer set search_path=public as $$
declare paths text[];
begin
  update public.email_additional_attachments
  set deletion_requested_at=coalesce(deletion_requested_at,now())
  where communication_id is null and expires_at<now();
  select coalesce(array_agg(storage_path),'{}') into paths
  from public.email_additional_attachments
  where communication_id is null and expires_at<now() and deletion_requested_at is not null;
  return paths;
end $$;
revoke all on function public.cleanup_abandoned_email_attachments() from public,anon,authenticated;
grant execute on function public.cleanup_abandoned_email_attachments() to service_role;

create or replace function public.finalize_abandoned_email_attachment_cleanup(_storage_paths text[])
returns integer language plpgsql security definer set search_path=public as $$
declare removed_count integer;
begin
  delete from public.email_additional_attachments
  where communication_id is null and expires_at<now() and deletion_requested_at is not null
    and storage_path=any(coalesce(_storage_paths,'{}'));
  get diagnostics removed_count=row_count;
  return removed_count;
end $$;
revoke all on function public.finalize_abandoned_email_attachment_cleanup(text[]) from public,anon,authenticated;
grant execute on function public.finalize_abandoned_email_attachment_cleanup(text[]) to service_role;

-- Communication audit events retain operational identity, not message content
-- or recipient/subject personal data.
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
    if task_row.id is null or task_row.task_type<>'Email' or task_row.owner_team<>'HR'
       or not public.can_update_task(auth.uid(),task_row.id) then raise insufficient_privilege; end if;
  end if;
  if _communication_id is null then
    insert into public.email_communications(
      case_id,task_id,template_id,template_version,recipient,rendered_subject,state,prepared_by,
      opened_at,marked_sent_at,outlook_mode
    ) values(
      _case_id,_task_id,_template_id,_template_version,_recipient,_subject,_state,auth.uid(),
      case when _state='Opened in Outlook' then now() end,
      case when _state='Marked Sent' then now() end,_outlook_mode
    ) returning id into result_id;
    insert into public.email_communication_attachment_snapshots(
      communication_id,source_attachment_id,filename,content_type,size,source
    )
    select result_id,a.id,a.filename,a.content_type,a.size,'template'
    from public.email_template_attachments a where a.template_id=_template_id
    on conflict do nothing;
  else
    update public.email_communications set
      state=_state,outlook_mode=coalesce(_outlook_mode,outlook_mode),
      opened_at=case when _state='Opened in Outlook' then coalesce(opened_at,now()) else opened_at end,
      marked_sent_at=case when _state='Marked Sent' then now() else marked_sent_at end
    where id=_communication_id and case_id=_case_id and prepared_by=auth.uid()
    returning id into result_id;
    if result_id is null then raise insufficient_privilege; end if;
  end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(auth.uid(),'email_communication',result_id::text,_state,_case_id,
    jsonb_strip_nulls(jsonb_build_object(
      'taskId',_task_id,'templateId',_template_id,'templateVersion',_template_version,
      'outlookMode',_outlook_mode
    )));
  if _state='Marked Sent' and _task_id is not null then
    perform public.set_task_status(_task_id,'Completed',null);
  end if;
  return result_id;
end $$;
revoke all on function public.record_email_event(uuid,uuid,uuid,integer,text,text,text,uuid,text) from public,anon;
grant execute on function public.record_email_event(uuid,uuid,uuid,integer,text,text,text,uuid,text) to authenticated;

-- Remove sensitive values written by earlier application versions while
-- preserving the human-readable business event.
update public.audit_logs set metadata=metadata-'body'-'subject'-'recipient'
where metadata ?| array['body','subject','recipient'];
update public.audit_logs set metadata=metadata-'emailPrevious'-'emailNew'
where metadata ?| array['emailPrevious','emailNew'];

-- The compatibility mutation is not used by V1 and must not remain an
-- alternate authenticated email-completion path.
revoke all on function public.complete_email_task(uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated;

-- SECURITY DEFINER functions default to PUBLIC EXECUTE in PostgreSQL. Trigger
-- and internal helpers need no caller grant; policy/RPC helpers receive the
-- narrow authenticated grant below.
revoke all on function public.audit_task_file_added() from public,anon;
revoke all on function public.create_default_onboarding_tasks() from public,anon;
revoke all on function public.snapshot_email_task_configuration() from public,anon;
revoke all on function public.sync_open_email_task_configuration() from public,anon;
revoke all on function public.sync_person_employee_id_to_employments() from public,anon;
revoke all on function public.find_onboarding_person_candidates(text,text,text,uuid) from public,anon;
revoke all on function public.calculate_case_task_due_date(uuid,text,integer) from public,anon;
revoke all on function public.is_operational_team_member(uuid,text) from public,anon;
revoke all on function public.refresh_case_workflow_status(uuid) from public,anon;
revoke all on function public.generate_case_tasks(uuid) from public,anon;
revoke all on function public.sync_case_tasks_after_case_change() from public,anon;
revoke all on function public.resolve_case_task_due_date(uuid,text,integer) from public,anon;
revoke all on function public.enforce_mandatory_tasks_before_case_completed() from public,anon;
revoke all on function public.project_task_to_checklist() from public,anon;
revoke all on function public.can_manage_email_templates(uuid) from public,anon;
revoke all on function public.can_compose_case_email(uuid,uuid) from public,anon;
revoke all on function public.validate_email_template_for_publish(uuid) from public,anon;
revoke all on function public.audit_email_attachment_change() from public,anon;

grant execute on function public.find_onboarding_person_candidates(text,text,text,uuid) to authenticated;
grant execute on function public.is_operational_team_member(uuid,text) to authenticated;
grant execute on function public.is_active_user(uuid) to authenticated;
grant execute on function public.has_role(uuid,public.app_role) to authenticated;
grant execute on function public.can_manage_email_templates(uuid) to authenticated;
grant execute on function public.can_compose_case_email(uuid,uuid) to authenticated;
grant execute on function public.validate_email_template_for_publish(uuid) to authenticated;

-- Purpose-specific, authorization-safe People pagination. The former endpoint
-- loaded every Person, Employment and Team into memory for each request.
create or replace function public.list_people_page(
  _search text default null,_status text default null,_page integer default 1,_page_size integer default 50
) returns jsonb language sql stable security definer set search_path=public as $$
  with params as (
    select greatest(coalesce(_page,1),1) page,
      least(greatest(coalesce(_page_size,50),1),100) page_size,
      nullif(lower(trim(_search)),'') search,
      nullif(trim(_status),'') status
  ), eligible as (
    select p.id person_id,p.display_name,p.given_name,p.family_name,p.preferred_name,p.email,
      coalesce(e.employee_id,p.employee_id) employee_id,e.id employment_id,e.employment_type,
      e.role_title role,e.team_id,coalesce(t.name,'—') team,e.location,e.effective_status status,
      e.start_date,e.end_date,e.supervisor_name
    from public.persons p
    join lateral (
      select ee.* from public.employment_effective ee
      where ee.person_id=p.id and public.can_access_employment(auth.uid(),ee.id)
      order by
        case ee.effective_status when 'active' then 1 when 'ending' then 2 when 'planned' then 3 else 4 end,
        ee.start_date desc nulls last
      limit 1
    ) e on true
    left join public.teams t on t.id=e.team_id
    cross join params x
    where p.archived_at is null and public.is_active_user(auth.uid())
      and (x.status is null or e.effective_status=x.status)
      and (x.search is null or concat_ws(' ',p.display_name,p.email,p.employee_id,e.employee_id,e.role_title,t.name)
        ilike '%'||x.search||'%')
  ), counted as (select count(*)::integer total from eligible), page_rows as (
    select * from eligible order by display_name,person_id
    offset (select (page-1)*page_size from params)
    limit (select page_size from params)
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'personId',person_id,'displayName',display_name,'givenName',given_name,'familyName',family_name,
      'preferredName',preferred_name,'email',email,'employmentId',employment_id,'employeeId',employee_id,
      'employmentType',employment_type,'role',role,'team',team,'teamId',team_id,'location',location,
      'status',status,'startDate',start_date,'endDate',end_date,'supervisorName',supervisor_name
    ) order by display_name) from page_rows),'[]'::jsonb),
    'page',(select page from params),'pageSize',(select page_size from params),
    'total',(select total from counted),
    'totalPages',greatest(1,ceil((select total from counted)::numeric/(select page_size from params))::integer)
  )
$$;
revoke all on function public.list_people_page(text,text,integer,integer) from public,anon;
grant execute on function public.list_people_page(text,text,integer,integer) to authenticated;

-- Profile email, System Role and Data Scope are not an organization-wide
-- directory. Active users receive a name/title directory DTO; only self and
-- System Admin can read the underlying profile/authorization rows directly.
create or replace function public.list_profile_directory()
returns table(id uuid,name text,title text,status text)
language sql stable security definer set search_path=public as $$
  select p.id,p.name,p.title,p.status from public.profiles p
  where public.is_active_user(auth.uid()) and p.status='Active'
  order by p.name
$$;
revoke all on function public.list_profile_directory() from public,anon;
grant execute on function public.list_profile_directory() to authenticated;

drop policy if exists "Active users read profiles" on public.profiles;
create policy "Users read own profile and admins read profiles" on public.profiles
for select to authenticated using(
  public.is_active_user(auth.uid()) and (id=auth.uid() or public.has_role(auth.uid(),'admin'))
);

drop policy if exists "Active users read roles" on public.user_roles;
create policy "Users read own role and admins read roles" on public.user_roles
for select to authenticated using(
  public.is_active_user(auth.uid()) and (user_id=auth.uid() or public.has_role(auth.uid(),'admin'))
);

drop policy if exists "Active users read scopes" on public.user_scopes;
create policy "Users read own scope and admins read scopes" on public.user_scopes
for select to authenticated using(
  public.is_active_user(auth.uid()) and (user_id=auth.uid() or public.has_role(auth.uid(),'admin'))
);

drop policy if exists "Active users read labs" on public.labs;
create policy "Active users read labs" on public.labs for select to authenticated
using(public.is_active_user(auth.uid()));
drop policy if exists "Active users read teams" on public.teams;
create policy "Active users read teams" on public.teams for select to authenticated
using(public.is_active_user(auth.uid()));
