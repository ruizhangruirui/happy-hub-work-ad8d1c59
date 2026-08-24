-- 1. Supervisor info on every case
ALTER TABLE public.cases
  ADD COLUMN supervisor_name text,
  ADD COLUMN supervisor_email text;

-- 2. Admins can manage labs (read policy already exists for all active users)
GRANT INSERT, UPDATE, DELETE ON public.labs TO authenticated;

CREATE POLICY "Admins manage labs"
ON public.labs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Admins can manage teams
GRANT INSERT, UPDATE, DELETE ON public.teams TO authenticated;

CREATE POLICY "Admins manage teams"
ON public.teams
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));