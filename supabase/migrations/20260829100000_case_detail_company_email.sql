-- Keep the Employment schema aligned with the Case Detail and Email Center contract.
-- This field is nullable because a company mailbox may not exist yet during onboarding.
alter table public.employments
  add column if not exists company_email text;

comment on column public.employments.company_email is
  'Company-issued email address used by Case Detail and Email Center recipient resolution.';
