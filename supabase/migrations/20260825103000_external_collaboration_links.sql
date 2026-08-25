create extension if not exists pgcrypto with schema extensions;

create table if not exists public.external_collaboration_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  workflow_item_id uuid not null references public.case_workflow_items(id) on delete cascade,
  recipient_email text not null,
  recipient_name text,
  recipient_team text,
  request_message text,
  status text not null default 'Sent' check (status in ('Sent','Acknowledged','In Progress','Completed','Blocked')),
  response_note text,
  token_hash text not null unique,
  due_date date,
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists external_collaboration_case_idx on public.external_collaboration_requests(case_id, created_at desc);
create index if not exists external_collaboration_workflow_idx on public.external_collaboration_requests(workflow_item_id, created_at desc);
alter table public.external_collaboration_requests enable row level security;

create policy "Case collaborators view external requests"
on public.external_collaboration_requests for select to authenticated
using (public.case_access(auth.uid(), case_id) in ('owner','collaborator'));

grant select on public.external_collaboration_requests to authenticated;
revoke all on public.external_collaboration_requests from anon;

create or replace function public.create_external_collaboration_request(
  _workflow_item_id uuid,
  _recipient_email text,
  _recipient_name text default null,
  _recipient_team text default null,
  _request_message text default null,
  _due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_id uuid := auth.uid();
  item_row public.case_workflow_items%rowtype;
  request_id uuid;
  raw_token text := encode(gen_random_bytes(32), 'hex');
begin
  select * into item_row from public.case_workflow_items where id = _workflow_item_id;
  if caller_id is null or item_row.id is null or public.case_access(caller_id, item_row.case_id) not in ('owner','collaborator') then
    raise insufficient_privilege using message = 'Not authorized to request an external update';
  end if;
  if _recipient_email is null or position('@' in _recipient_email) < 2 then
    raise exception 'A valid recipient email is required';
  end if;

  insert into public.external_collaboration_requests(
    case_id, workflow_item_id, recipient_email, recipient_name, recipient_team,
    request_message, token_hash, due_date, expires_at, created_by
  ) values (
    item_row.case_id, item_row.id, lower(trim(_recipient_email)), nullif(trim(_recipient_name), ''),
    nullif(trim(_recipient_team), ''), nullif(trim(_request_message), ''),
    encode(digest(raw_token, 'sha256'), 'hex'), _due_date,
    greatest(now() + interval '30 days', coalesce(_due_date::timestamptz + interval '30 days', now() + interval '90 days')),
    caller_id
  ) returning id into request_id;

  insert into public.audit_logs(actor_id, entity_type, entity_id, action, field, new_value, case_id)
  values (caller_id, 'external_collaboration_request', request_id, 'Requested external workflow update', 'recipient_email', lower(trim(_recipient_email)), item_row.case_id);

  return jsonb_build_object('id', request_id, 'token', raw_token);
end;
$$;

create or replace function public.get_external_collaboration_request(_token text, _recipient_email text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', r.id,
    'personName', p.full_name,
    'taskTitle', w.title,
    'taskDescription', w.description,
    'requestMessage', r.request_message,
    'recipientName', r.recipient_name,
    'recipientTeam', r.recipient_team,
    'status', r.status,
    'responseNote', r.response_note,
    'dueDate', r.due_date,
    'expiresAt', r.expires_at,
    'expired', r.expires_at < now()
  )
  from public.external_collaboration_requests r
  join public.case_workflow_items w on w.id = r.workflow_item_id
  join public.cases c on c.id = r.case_id
  join public.persons p on p.id = c.person_id
  where r.token_hash = encode(digest(_token, 'sha256'), 'hex')
    and r.recipient_email = lower(trim(_recipient_email))
$$;

create or replace function public.respond_external_collaboration_request(
  _token text,
  _recipient_email text,
  _status text,
  _response_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_row public.external_collaboration_requests%rowtype;
  workflow_status text;
begin
  if _status not in ('Acknowledged','In Progress','Completed','Blocked') then
    raise exception 'Invalid response status';
  end if;
  select * into request_row from public.external_collaboration_requests
  where token_hash = encode(digest(_token, 'sha256'), 'hex')
    and recipient_email = lower(trim(_recipient_email)) for update;
  if request_row.id is null then return false; end if;
  if request_row.expires_at < now() then raise exception 'This feedback link has expired'; end if;

  update public.external_collaboration_requests set
    status = _status,
    response_note = nullif(trim(_response_note), ''),
    responded_at = now(),
    updated_at = now()
  where id = request_row.id;

  workflow_status := case _status when 'Completed' then 'Completed' when 'Blocked' then 'Blocked' else 'In Progress' end;
  update public.case_workflow_items set
    status = workflow_status,
    completed_at = case when workflow_status = 'Completed' then now() else null end,
    completed_by = null,
    updated_at = now()
  where id = request_row.workflow_item_id;

  return true;
end;
$$;

revoke all on function public.create_external_collaboration_request(uuid,text,text,text,text,date) from public, anon;
grant execute on function public.create_external_collaboration_request(uuid,text,text,text,text,date) to authenticated;
revoke all on function public.get_external_collaboration_request(text,text) from public;
grant execute on function public.get_external_collaboration_request(text,text) to anon, authenticated;
revoke all on function public.respond_external_collaboration_request(text,text,text,text) from public;
grant execute on function public.respond_external_collaboration_request(text,text,text,text) to anon, authenticated;
