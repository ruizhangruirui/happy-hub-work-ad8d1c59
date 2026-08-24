GRANT DELETE ON public.case_files TO authenticated;

CREATE POLICY "Owners and collaborators delete files"
ON public.case_files
FOR DELETE
TO authenticated
USING (public.case_access(auth.uid(), case_id) IN ('owner', 'collaborator'));