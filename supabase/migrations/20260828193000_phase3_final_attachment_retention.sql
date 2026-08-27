-- Phase 3 final release: bound Additional Attachments are immutable evidence.

alter table public.email_additional_attachments
  add column if not exists deletion_requested_at timestamptz;

revoke delete on public.email_additional_attachments from authenticated;
drop policy if exists "HR removes additional email attachments" on public.email_additional_attachments;

create or replace function public.request_temporary_email_attachment_deletion(_attachment_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare attachment public.email_additional_attachments%rowtype;
begin
  select * into attachment from public.email_additional_attachments where id=_attachment_id for update;
  if attachment.id is null
     or attachment.communication_id is not null
     or attachment.uploaded_by<>auth.uid()
     or not public.can_compose_case_email(auth.uid(),attachment.case_id) then
    raise insufficient_privilege;
  end if;
  update public.email_additional_attachments
    set deletion_requested_at=coalesce(deletion_requested_at,now())
    where id=attachment.id;
  return attachment.storage_path;
end $$;
revoke all on function public.request_temporary_email_attachment_deletion(uuid) from public,anon;
grant execute on function public.request_temporary_email_attachment_deletion(uuid) to authenticated;

create or replace function public.finalize_temporary_email_attachment_deletion(_attachment_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare removed_count integer;
begin
  delete from public.email_additional_attachments
  where id=_attachment_id
    and communication_id is null
    and deletion_requested_at is not null
    and uploaded_by=auth.uid()
    and public.can_compose_case_email(auth.uid(),case_id);
  get diagnostics removed_count=row_count;
  return removed_count>0;
end $$;
revoke all on function public.finalize_temporary_email_attachment_deletion(uuid) from public,anon;
grant execute on function public.finalize_temporary_email_attachment_deletion(uuid) to authenticated;

-- Binding and deletion requests are mutually exclusive.
create or replace function public.bind_email_compose_attachments(_compose_session_id uuid,_communication_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare comm public.email_communications%rowtype; bound integer;
begin
  select * into comm from public.email_communications where id=_communication_id for update;
  if comm.id is null or comm.prepared_by<>auth.uid() or not public.can_compose_case_email(auth.uid(),comm.case_id) then raise insufficient_privilege; end if;
  update public.email_additional_attachments set communication_id=comm.id,expires_at=null
  where compose_session_id=_compose_session_id and case_id=comm.case_id and uploaded_by=auth.uid()
    and communication_id is null and deletion_requested_at is null;
  get diagnostics bound=row_count;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,case_id,metadata)
  values(auth.uid(),'email_communication',comm.id::text,'Additional attachments linked',comm.case_id,
    jsonb_build_object('composeSessionId',_compose_session_id,'attachmentCount',bound));
  return bound;
end $$;

-- Storage deletion for one-off files is possible only after the secure RPC has
-- marked the matching unbound metadata row. Bound rows can never satisfy it.
drop policy if exists "HR managers delete email attachment objects" on storage.objects;
create policy "HR deletes governed email attachment objects" on storage.objects for delete to authenticated
  using(bucket_id='email-attachments' and (
    ((storage.foldername(name))[1]='email-templates' and public.can_manage_email_templates(auth.uid()))
    or exists(
      select 1 from public.email_additional_attachments a
      where a.storage_path=name and a.uploaded_by=auth.uid()
        and a.communication_id is null and a.deletion_requested_at is not null
        and public.can_compose_case_email(auth.uid(),a.case_id)
    )
  ));
