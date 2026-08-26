/* Server-only data layer for Team Workbench. Imported by workbench.functions.ts only. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccessLevel,
  CaseDetailDto,
  CaseDto,
  ChecklistDto,
  CurrentUser,
  FileDto,
  HistoryDto,
  MemberDto,
  TaskDto,
  TemplateDto,
  UserDto,
  WorkbenchData,
  WorkflowItemDto,
  RosterPersonDto,
  ExternalRequestDto,
  PeopleRowDto,
  PersonDetailDto,
} from "./types";

export type Db = SupabaseClient<any, any, any>;

export const PERMISSIONS: Record<string, string[]> = {
  Admin: ["Full access", "User management", "Sharing management", "Template management"],
  Operator: ["Manage cases & tasks", "All-organization scope", "Template management"],
  Manager: ["Team-scoped cases", "Assign & complete tasks", "Compose emails"],
  Viewer: ["Read-only access", "Shared cases only"],
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  operator: "Operator",
  manager: "Manager",
  viewer: "Viewer",
};

export interface Identity {
  userId: string;
  name: string;
  email: string;
  title: string | null;
  role: string;
  scopes: { scope_type: string; lab_id: string | null; team_id: string | null }[];
}

export async function loadIdentity(supabase: Db, userId: string): Promise<Identity | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,name,title,status")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.status !== "Active") return null;
  const [{ data: roleRow }, { data: scopes }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
    supabase.from("user_scopes").select("scope_type,lab_id,team_id").eq("user_id", userId),
  ]);
  return {
    userId,
    name: profile.name,
    email: profile.email,
    title: profile.title,
    role: roleRow?.role ?? "viewer",
    scopes: scopes ?? [],
  };
}

function computeAccess(
  identity: Identity,
  row: { owner_id: string; persons?: { lab_id: string | null; team_id: string | null } | null },
  memberLevel?: string | null,
): AccessLevel {
  if (identity.role === "admin" || row.owner_id === identity.userId) return "Owner";
  if (memberLevel === "collaborator") return "Collaborator";
  if (memberLevel === "viewer") return "Viewer";
  const person = row.persons;
  for (const s of identity.scopes) {
    if (s.scope_type === "all_organization") return "Scoped";
    if (s.scope_type === "lab" && person && s.lab_id && s.lab_id === person.lab_id) return "Scoped";
    if (s.scope_type === "team" && person && s.team_id && s.team_id === person.team_id) return "Scoped";
  }
  return "None";
}

function scopeLabel(
  s: { scope_type: string; lab_id: string | null; team_id: string | null },
  labNames: Map<string, string>,
  teamNames: Map<string, string>,
): string {
  if (s.scope_type === "all_organization") return "All Organization";
  if (s.scope_type === "lab") return `Lab: ${(s.lab_id && labNames.get(s.lab_id)) || "—"}`;
  if (s.scope_type === "team") return `Team: ${(s.team_id && teamNames.get(s.team_id)) || "—"}`;
  return "Assigned Cases";
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toCaseDto(row: any, accessLevel: AccessLevel, nameOf: Map<string, string>): CaseDto {
  const person = row.persons ?? {};
  const name: string = person.full_name ?? "";
  return {
    id: row.id,
    name,
    initials: initialsOf(name),
    caseType: String(row.case_type).toLowerCase() === "onboarding" ? "Onboarding" : "Offboarding",
    employmentType: row.employment_type,
    team: person.teams?.name ?? "—",
    startDate: row.start_date,
    endDate: row.end_date,
    effectiveDate: row.effective_date ?? (String(row.case_type).toLowerCase() === "offboarding" ? row.end_date : row.start_date),
    employmentId: row.employment_id ?? null,
    owner: nameOf.get(row.owner_id) ?? "",
    ownerId: row.owner_id,
    status: row.status,
    priority: row.priority,
    accessLevel,
    role: row.role,
    location: row.location,
    supervisorName: row.supervisor_name ?? null,
    supervisorEmail: row.supervisor_email ?? null,
  };
}

export async function getWorkbenchData(
  supabase: Db,
  userId: string,
): Promise<WorkbenchData | { error: "access_denied" }> {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" };

  const [casesRes, profilesRes, rolesRes, scopesRes, labsRes, teamsRes, tasksRes] = await Promise.all([
    supabase
      .from("cases")
      .select("*, persons(full_name, lab_id, team_id, teams(name))")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id,name,email,title,status"),
    supabase.from("user_roles").select("user_id,role"),
    supabase.from("user_scopes").select("user_id,scope_type,lab_id,team_id"),
    supabase.from("labs").select("id,name,status").order("name"),
    supabase.from("teams").select("id,name,lab_id,status").order("name"),
    supabase
      .from("tasks")
      .select("*, cases(case_type, persons(full_name))")
      .eq("owner_id", userId)
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);
  if (casesRes.error) throw new Error(casesRes.error.message);

  const labNames = new Map<string, string>(((labsRes.data ?? []) as any[]).map((l) => [l.id, l.name]));
  const teamNames = new Map<string, string>(((teamsRes.data ?? []) as any[]).map((t) => [t.id, t.name]));
  const profiles = (profilesRes.data ?? []) as any[];
  const nameOf = new Map<string, string>(profiles.map((p) => [p.id, p.name]));
  const roleOf = new Map<string, string>(((rolesRes.data ?? []) as any[]).map((r) => [r.user_id, r.role]));
  const scopesOf = new Map<string, any[]>();
  for (const s of (scopesRes.data ?? []) as any[]) {
    scopesOf.set(s.user_id, [...(scopesOf.get(s.user_id) ?? []), s]);
  }

  const caseRows = (casesRes.data ?? []) as any[];
  const caseIds = caseRows.map((c) => c.id as string);
  const { data: memberRows } = caseIds.length
    ? await supabase
        .from("case_members")
        .select("case_id,user_id,access_level")
        .in("case_id", caseIds)
        .is("revoked_at", null)
    : { data: [] as any[] };
  const memberLevel = new Map<string, string>(
    ((memberRows ?? []) as any[]).filter((m) => m.user_id === userId).map((m) => [m.case_id, m.access_level]),
  );

  const isAdmin = identity.role === "admin";
  const users: UserDto[] = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    email: isAdmin || p.id === userId ? p.email : null,
    title: p.title,
    role: ROLE_LABEL[roleOf.get(p.id) ?? "viewer"] ?? "Viewer",
    status: p.status,
    scopes: (scopesOf.get(p.id) ?? []).map((s: any) => scopeLabel(s, labNames, teamNames)),
  }));

  const cases: CaseDto[] = caseRows.map((row) =>
    toCaseDto(row, computeAccess(identity, row, memberLevel.get(row.id)), nameOf),
  );
  const sharedCases = cases.filter((c) => c.accessLevel === "Viewer" || c.accessLevel === "Collaborator");

  const tasks: TaskDto[] = ((tasksRes.data ?? []) as any[]).map((t) => ({
    id: t.id,
    title: t.title,
    person: t.cases?.persons?.full_name ?? "",
    caseId: t.case_id,
    caseType:
      String(t.cases?.case_type).toLowerCase() === "onboarding"
        ? "Onboarding"
        : String(t.cases?.case_type).toLowerCase() === "offboarding"
          ? "Offboarding"
          : null,
    due: t.due_date,
    priority: t.priority,
    status: t.status,
    email: t.task_type === "Email",
    ownerId: t.owner_id,
    ownerName: t.owner_id ? (nameOf.get(t.owner_id) ?? "") : "",
    checklistItemId: t.checklist_item_id,
    completedAt: t.completed_at,
    assigneeRole: t.assignee_role ?? null,
    defaultTaskKey: t.default_task_key ?? null,
  }));

  const currentUser: CurrentUser = {
    id: userId,
    name: identity.name,
    email: identity.email,
    title: identity.title,
    role: ROLE_LABEL[identity.role] ?? "Viewer",
    scopes: identity.scopes.map((s) => scopeLabel(s, labNames, teamNames)),
  };

  return {
    currentUser,
    tasks,
    cases,
    sharedCases,
    users,
    labs: ((labsRes.data ?? []) as any[]).map((l) => ({ id: l.id, name: l.name, status: l.status ?? "Active" })),
    teams: ((teamsRes.data ?? []) as any[]).map((t) => ({
      id: t.id,
      name: t.name,
      labId: t.lab_id,
      status: t.status ?? "Active",
    })),
    permissions: PERMISSIONS,
  };
}

export async function getCaseDetail(
  supabase: Db,
  userId: string,
  caseId: string,
): Promise<CaseDetailDto | { error: "access_denied" | "not_found" }> {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" };
  const { data: row, error } = await supabase
    .from("cases")
    .select(
      "*, persons(full_name, email, employee_id, phone, lab_id, team_id, teams(name), manager:manager_id(full_name))",
    )
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { error: "not_found" };
  const r = row as any;

  const [membersRes, profilesRes, checklistRes, historyRes, filesRes, workflowRes, externalRes, tasksRes] = await Promise.all([
    supabase.from("case_members").select("id,user_id,access_level").eq("case_id", caseId).is("revoked_at", null),
    supabase.from("profiles").select("id,name,status"),
    supabase.from("checklist_items").select("*").eq("case_id", caseId).order("sort_order"),
    supabase
      .from("audit_logs")
      .select("id,actor_id,action,field,previous_value,new_value,created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("case_files")
      .select("id,filename,size,content_type,created_at,uploaded_by")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase.from("case_workflow_items").select("*").eq("case_id", caseId).order("sequence"),
    supabase.from("external_collaboration_requests").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("case_id", caseId).order("due_date", { ascending: true, nullsFirst: false }),
  ]);

  const myMembership = ((membersRes.data ?? []) as any[]).find((m) => m.user_id === userId);
  const access = computeAccess(identity, r, myMembership?.access_level);
  const nameOf = new Map<string, string>(((profilesRes.data ?? []) as any[]).map((p) => [p.id, p.name]));
  const canSeeNotes = access === "Owner" || access === "Collaborator";
  const person = r.persons ?? {};

  const members: MemberDto[] = ((membersRes.data ?? []) as any[]).map((m) => ({
    id: m.id,
    userId: m.user_id,
    name: nameOf.get(m.user_id) ?? "Unknown",
    accessLevel: m.access_level === "collaborator" ? "Collaborator" : "Viewer",
  }));

  const checklist: ChecklistDto[] = ((checklistRes.data ?? []) as any[]).map((c) => ({
    id: c.id,
    title: c.title,
    section: c.section,
    status: c.status,
    ownerId: c.owner_id,
    ownerName: c.owner_id ? (nameOf.get(c.owner_id) ?? "") : "",
    dueDate: c.due_date,
    completedDate: c.completed_date,
    completedByName: c.completed_by ? (nameOf.get(c.completed_by) ?? null) : null,
    taskId: null,
  }));

  const itemIds = checklist.map((c) => c.id);
  if (itemIds.length) {
    const { data: taskLinks } = await supabase.from("tasks").select("id,checklist_item_id").in("checklist_item_id", itemIds);
    const linkOf = new Map<string, string>(((taskLinks ?? []) as any[]).map((t) => [t.checklist_item_id, t.id]));
    for (const c of checklist) c.taskId = linkOf.get(c.id) ?? null;
  }

  const history: HistoryDto[] = ((historyRes.data ?? []) as any[]).map((h) => ({
    id: h.id,
    actorName: h.actor_id ? (nameOf.get(h.actor_id) ?? "System") : "System",
    action: h.action,
    field: h.field,
    oldValue: h.previous_value,
    newValue: h.new_value,
    at: h.created_at,
  }));

  const files: FileDto[] = ((filesRes.data ?? []) as any[]).map((f) => ({
    id: f.id,
    filename: f.filename,
    size: f.size,
    contentType: f.content_type,
    at: f.created_at,
    uploadedByName: f.uploaded_by ? (nameOf.get(f.uploaded_by) ?? "") : "",
  }));
  const workflow: WorkflowItemDto[] = ((workflowRes.data ?? []) as any[]).map((w) => ({
    id:w.id,key:w.step_key,title:w.title,description:w.description,sequence:w.sequence,
    targetDate:w.target_date,status:w.status,completedAt:w.completed_at,
    completedByName:w.completed_by ? (nameOf.get(w.completed_by) ?? null) : null,
  }));
  const externalRequests: ExternalRequestDto[] = ((externalRes.data ?? []) as any[]).map((x) => ({
    id:x.id,workflowItemId:x.workflow_item_id,recipientEmail:x.recipient_email,recipientName:x.recipient_name,
    recipientTeam:x.recipient_team,status:x.status,responseNote:x.response_note,dueDate:x.due_date,
    expiresAt:x.expires_at,createdAt:x.created_at,respondedAt:x.responded_at,
  }));
  const tasks: TaskDto[] = ((tasksRes.data ?? []) as any[]).map((t) => ({
    id:t.id,title:t.title,person:person.full_name ?? "",caseId:t.case_id,caseType:r.case_type,due:t.due_date,
    priority:t.priority,status:t.status,email:t.task_type === "Email",ownerId:t.owner_id,
    ownerName:t.owner_id ? (nameOf.get(t.owner_id) ?? "") : "",checklistItemId:t.checklist_item_id,
    completedAt:t.completed_at,assigneeRole:t.assignee_role ?? null,defaultTaskKey:t.default_task_key ?? null,
  }));

  const assignableUsers = ((profilesRes.data ?? []) as any[])
    .filter((p) => p.status === "Active")
    .map((p) => ({ id: p.id, name: p.name }));

  return {
    case: {
      ...toCaseDto(r, access, nameOf),
      personEmail: person.email ?? null,
      givenName: person.given_name ?? null,
      preferredName: person.preferred_name ?? null,
      employeeId: person.employee_id ?? null,
      phone: person.phone ?? null,
      managerName: person.manager?.full_name ?? null,
      workload: r.workload ?? null,
      contractType: r.contract_type ?? null,
      notes: canSeeNotes ? (r.notes ?? null) : null,
    },
    checklist,
    members,
    history,
    files,
    workflow,
    tasks,
    externalRequests,
    assignableUsers,
  };
}

export async function createExternalRequest(supabase: Db, userId: string, input: {
  workflowItemId:string; recipientEmail:string; recipientName?:string|undefined; recipientTeam?:string|undefined; requestMessage?:string|undefined; dueDate?:string|undefined;
}) {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error:"access_denied" as const };
  const { data, error } = await supabase.rpc("create_external_collaboration_request", {
    _workflow_item_id:input.workflowItemId,_recipient_email:input.recipientEmail,
    _recipient_name:input.recipientName || null,_recipient_team:input.recipientTeam || null,
    _request_message:input.requestMessage || null,_due_date:input.dueDate || null,
  });
  if (error) {
    if (error.code === "42501") return { error:"forbidden" as const };
    throw new Error(error.message);
  }
  return { ok:true as const,id:(data as any).id as string,token:(data as any).token as string };
}

/* ---------------------------------- mutations ---------------------------------- */

export async function shareCase(
  supabase: Db,
  userId: string,
  input: { caseId: string; targetUserId: string; accessLevel: "viewer" | "collaborator" },
) {
  const { data: target } = await supabase.from("profiles").select("name").eq("id", input.targetUserId).maybeSingle();
  const { error } = await supabase.from("case_members").insert({
    case_id: input.caseId,
    user_id: input.targetUserId,
    access_level: input.accessLevel,
    created_by: userId,
  });
  if (error) {
    if (error.code === "23505") return { error: "already_shared" as const };
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "case_member",
    entity_id: input.targetUserId,
    action: `Shared case with ${target?.name ?? "user"}`,
    field: "access_level",
    new_value: input.accessLevel,
    case_id: input.caseId,
  });
  return { ok: true as const };
}

export async function removeMember(supabase: Db, userId: string, memberId: string) {
  const { data: member } = await supabase
    .from("case_members")
    .select("id,case_id,user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return { error: "not_found" as const };
  const { data: target } = await supabase.from("profiles").select("name").eq("id", member.user_id).maybeSingle();
  const { error } = await supabase.from("case_members").delete().eq("id", memberId);
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "case_member",
    entity_id: member.user_id,
    action: `Removed access for ${target?.name ?? "user"}`,
    case_id: member.case_id,
  });
  return { ok: true as const };
}

export async function assignTask(supabase: Db, userId: string, input: { taskId: string; ownerId: string | null }) {
  const { data: task } = await supabase.from("tasks").select("id,case_id,title").eq("id", input.taskId).maybeSingle();
  if (!task) return { error: "not_found" as const };
  const { error } = await supabase.from("tasks").update({ owner_id: input.ownerId }).eq("id", input.taskId);
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  const { data: assignee } = input.ownerId
    ? await supabase.from("profiles").select("name").eq("id", input.ownerId).maybeSingle()
    : { data: null };
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "task",
    entity_id: input.taskId,
    action: input.ownerId ? `Assigned "${task.title}" to ${assignee?.name ?? "user"}` : `Unassigned "${task.title}"`,
    field: "owner_id",
    new_value: input.ownerId,
    case_id: task.case_id,
  });
  return { ok: true as const };
}

export async function createTask(
  supabase: Db,
  userId: string,
  input: { caseId: string; title: string; dueDate?: string | undefined; priority: string; ownerId?: string | null | undefined },
) {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      case_id: input.caseId,
      title: input.title,
      task_type: "Task",
      status: "Not Started",
      priority: input.priority,
      due_date: input.dueDate || null,
      owner_id: input.ownerId ?? userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "task",
    entity_id: data.id,
    action: `Created task "${input.title}"`,
    case_id: input.caseId,
  });
  return { ok: true as const, taskId: data.id };
}

export async function toggleTask(supabase: Db, userId: string, input: { taskId: string; complete: boolean }) {
  const { data, error } = await supabase.rpc("set_task_completion", {
    _task_id: input.taskId,
    _complete: input.complete,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  if (data === false) return { error: "forbidden" as const };
  return { ok: true as const };
}

export async function toggleChecklist(supabase: Db, userId: string, input: { itemId: string; complete: boolean }) {
  const { data, error } = await supabase.rpc("set_checklist_completion", {
    _item_id: input.itemId,
    _complete: input.complete,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  if (data === false) return { error: "forbidden" as const };
  return { ok: true as const };
}

export interface CreateCaseInput {
  firstName: string;
  lastName: string;
  email?: string | undefined;
  teamId?: string | null | undefined;
  caseType: "onboarding" | "offboarding";
  employmentType: string;
  startDate: string;
  endDate?: string | undefined;
  role?: string | undefined;
  location?: string | undefined;
  supervisorName: string;
  supervisorEmail?: string | undefined;
  priority: string;
  notes?: string | undefined;
  visaRequired?: boolean | undefined;
}

export async function createCase(supabase: Db, userId: string, input: CreateCaseInput) {
  const { data: caseId, error } = await supabase.rpc("create_workbench_case", {
    _first_name: input.firstName,
    _last_name: input.lastName,
    _email: input.email || null,
    _team_id: input.teamId || null,
    _case_type: input.caseType === "onboarding" ? "Onboarding" : "Offboarding",
    _employment_type: input.employmentType,
    _start_date: input.startDate,
    _end_date: input.endDate || null,
    _role: input.role || null,
    _location: input.location || null,
    _supervisor_name: input.supervisorName,
    _supervisor_email: input.supervisorEmail || null,
    _priority: input.priority,
    _notes: input.notes || null,
    _visa_required: input.visaRequired ?? false,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, caseId: caseId as string };
}

export async function createOnboardingCase(supabase: Db, userId: string, input: CreateCaseInput & { personId?: string | undefined; preferredName?: string | undefined }) {
  const { data, error } = await supabase.rpc("create_onboarding_case_v2", {
    _existing_person_id: input.personId || null, _given_name: input.firstName, _family_name: input.lastName,
    _preferred_name: input.preferredName || null, _email: input.email || null, _team_id: input.teamId || null,
    _employment_type: input.employmentType, _effective_date: input.startDate, _role_title: input.role || null,
    _location: input.location || null, _supervisor_name: input.supervisorName, _supervisor_email: input.supervisorEmail || null,
    _workload: null, _priority: input.priority, _notes: input.notes || null, _visa_required: input.visaRequired ?? false,
  });
  if (error) { if (error.code === "42501") return { error: "forbidden" as const }; throw new Error(error.message); }
  return { ok: true as const, caseId: (data as any).caseId as string };
}

export async function createOffboardingCase(supabase: Db, userId: string, input: { personId:string; employmentId:string; lastWorkingDay:string; leavingType?:string | undefined; leavingReason?:string | undefined; priority:string; notes?:string | undefined }) {
  const { data, error } = await supabase.rpc("create_offboarding_case_v2", {
    _person_id: input.personId, _employment_id: input.employmentId, _effective_date: input.lastWorkingDay,
    _leaving_type: input.leavingType || null, _leaving_reason: input.leavingReason || null,
    _priority: input.priority, _notes: input.notes || null,
  });
  if (error) { if (error.code === "42501") return { error: "forbidden" as const }; throw new Error(error.message); }
  return { ok: true as const, caseId: (data as any).caseId as string };
}

function peopleRow(row:any): PeopleRowDto {
  const employments = [...(row.employments ?? [])].sort((a:any,b:any)=>String(b.start_date ?? "").localeCompare(String(a.start_date ?? "")));
  const e = employments.find((x:any)=>["active","ending","planned"].includes(x.status)) ?? employments[0];
  return { personId:row.id, displayName:row.display_name || row.preferred_name || row.full_name,
    givenName:row.given_name, familyName:row.family_name, preferredName:row.preferred_name, email:row.email,
    employmentId:e?.id ?? null, employeeId:e?.employee_id ?? row.employee_id, employmentType:e?.employment_type ?? null,
    role:e?.role_title ?? null, team:e?.teams?.name ?? row.teams?.name ?? "—", teamId:e?.team_id ?? row.team_id,
    location:e?.location ?? null, status:e?.status ?? "no_employment", startDate:e?.start_date ?? null,
    endDate:e?.end_date ?? null, supervisorName:e?.supervisor_name ?? null };
}

export async function getPeople(supabase:Db,userId:string):Promise<PeopleRowDto[]|{error:"access_denied"}>{
  if(!await loadIdentity(supabase,userId)) return {error:"access_denied"};
  const {data,error}=await supabase.from("persons").select("*, teams(name), employments(*, teams(name))").is("archived_at",null).order("full_name");
  if(error) throw new Error(error.message); return ((data??[]) as any[]).map(peopleRow);
}

export async function getPersonDetail(supabase:Db,userId:string,personId:string):Promise<PersonDetailDto|{error:"access_denied"|"not_found"}>{
  const identity=await loadIdentity(supabase,userId); if(!identity)return {error:"access_denied"};
  const [{data:person,error},{data:caseRows},{data:profiles}]=await Promise.all([
    supabase.from("persons").select("*, teams(name), employments(*, teams(name))").eq("id",personId).maybeSingle(),
    supabase.from("cases").select("*, persons(full_name,lab_id,team_id,teams(name))").eq("person_id",personId).order("created_at",{ascending:false}),
    supabase.from("profiles").select("id,name")]);
  if(error)throw new Error(error.message); if(!person)return {error:"not_found"};
  const names=new Map(((profiles??[]) as any[]).map(x=>[x.id,x.name])); const row=peopleRow(person);
  return {person:{...row,phone:person.phone??null}, employments:((person.employments??[]) as any[]).map(e=>({id:e.id,employmentType:e.employment_type,employeeId:e.employee_id,role:e.role_title,team:e.teams?.name??"—",location:e.location,status:e.status,startDate:e.start_date,endDate:e.end_date,supervisorName:e.supervisor_name,workload:e.workload,contractType:e.contract_type})), cases:((caseRows??[]) as any[]).map(c=>toCaseDto(c,computeAccess(identity,c),names))};
}

export async function setCaseConfirmation(supabase: Db, userId: string, caseId: string, confirmed: boolean) {
  const identity = await loadIdentity(supabase, userId);
  if (!identity || !["admin", "operator", "manager"].includes(identity.role)) {
    return { error: "forbidden" as const };
  }
  const { data: current } = await supabase.from("cases").select("id,case_type,status").eq("id", caseId).maybeSingle();
  if (!current) return { error: "not_found" as const };
  const nextStatus = confirmed ? "Confirmed" : "Preparing";
  const { error } = await supabase.from("cases").update({ status: nextStatus }).eq("id", caseId);
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "case",
    entity_id: caseId,
    action: confirmed ? `Confirmed ${String(current.case_type).toLowerCase()}` : "Reopened case",
    field: "status",
    previous_value: current.status,
    new_value: nextStatus,
    case_id: caseId,
  });
  return { ok: true as const };
}

export async function getActiveRoster(supabase: Db, userId: string): Promise<RosterPersonDto[] | { error: "access_denied" }> {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" };
  const { data, error } = await supabase.from("active_employee_roster").select("*").order("full_name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    personId: row.person_id,
    caseId: row.case_id,
    name: row.full_name,
    email: row.email,
    employeeId: row.employee_id,
    phone: row.phone,
    employmentType: row.employment_type ?? "Employee",
    role: row.role,
    location: row.location,
    team: row.team_name ?? "—",
    startDate: row.start_date,
    supervisorName: row.supervisor_name,
  }));
}

export async function updateWorkflowItem(supabase:Db,userId:string,input:{itemId:string;status:string}){
  const complete=input.status==="Completed";
  const {data:item}=await supabase.from("case_workflow_items").select("id,case_id,title,status").eq("id",input.itemId).maybeSingle();
  if(!item)return {error:"not_found" as const};
  const {error}=await supabase.from("case_workflow_items").update({status:input.status,completed_at:complete?new Date().toISOString():null,completed_by:complete?userId:null,updated_at:new Date().toISOString()}).eq("id",input.itemId);
  if(error){if(error.code==="42501")return {error:"forbidden" as const};throw new Error(error.message)}
  await supabase.from("audit_logs").insert({actor_id:userId,entity_type:"workflow_item",entity_id:item.id,action:`Workflow: ${item.title}`,field:"status",previous_value:item.status,new_value:input.status,case_id:item.case_id});
  return {ok:true as const};
}

export interface SaveUserInput {
  id?: string | undefined;
  name: string;
  email?: string | undefined;
  title?: string | undefined;
  role: "admin" | "operator" | "manager" | "viewer";
  status: "Active" | "Inactive";
  scopeType?: "all_organization" | "lab" | "team" | "assigned_cases" | undefined;
  labId?: string | null | undefined;
  teamId?: string | null | undefined;
}

function scopeRow(input: SaveUserInput, userId: string) {
  return {
    user_id: userId,
    scope_type: input.scopeType ?? "assigned_cases",
    lab_id: input.scopeType === "lab" ? (input.labId ?? null) : null,
    team_id: input.scopeType === "team" ? (input.teamId ?? null) : null,
  };
}

export async function saveUser(supabase: Db, userId: string, input: SaveUserInput) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) return { error: "forbidden" as const };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (input.id) {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ name: input.name, title: input.title || null, status: input.status })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", input.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: input.id, role: input.role });
    await supabaseAdmin.from("user_scopes").delete().eq("user_id", input.id);
    if (input.scopeType) await supabaseAdmin.from("user_scopes").insert(scopeRow(input, input.id));
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      entity_type: "user",
      entity_id: input.id,
      action: `Updated user ${input.name}`,
      new_value: `${input.role} / ${input.status}`,
    });
    return { ok: true as const };
  }

  if (!input.email) return { error: "email_required" as const };
  const tempPassword = `Tw${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}!`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (error) {
    if (/already been registered|already exists|duplicate/i.test(error.message)) return { error: "email_exists" as const };
    throw new Error(error.message);
  }
  const newId = data.user.id;
  const { error: pErr } = await supabaseAdmin.from("profiles").insert({
    id: newId,
    email: input.email,
    name: input.name,
    title: input.title || null,
    status: input.status,
  });
  if (pErr) {
    await supabaseAdmin.auth.admin.deleteUser(newId);
    if (pErr.code === "23505") return { error: "email_exists" as const };
    throw new Error(pErr.message);
  }
  await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: input.role });
  if (input.scopeType) await supabaseAdmin.from("user_scopes").insert(scopeRow(input, newId));
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "user",
    entity_id: newId,
    action: `Created user ${input.name}`,
  });
  return { ok: true as const, password: tempPassword };
}

export async function listTemplates(
  supabase: Db,
  userId: string,
): Promise<{ templates: TemplateDto[] } | { error: "access_denied" }> {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" };
  const { data, error } = await supabase.from("email_templates").select("*").order("category").order("name");
  if (error) throw new Error(error.message);
  return {
    templates: ((data ?? []) as any[]).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      status: t.status,
      updatedAt: t.updated_at,
      subject: t.subject ?? "",
      body: t.body_html ?? "",
      variables: ((t.variables ?? []) as any[])
        .map((v) => (typeof v === "string" ? v : (v?.key ?? "")))
        .filter(Boolean),
      applicableCaseTypes: (t.applicable_case_types ?? ["onboarding", "offboarding"]) as string[],
      version: Number(t.version ?? 1),
    })),
  };
}

export async function listPublishedTemplates(supabase: Db, userId: string) {
  const result = await listTemplates(supabase, userId);
  return "error" in result ? result : { templates: result.templates.filter((t) => t.status === "Published") };
}

export interface SaveTemplateInput {
  id?: string | undefined;
  name: string;
  category: string;
  status: "Draft" | "Published";
  subject: string;
  body: string;
  variables: string[];
}

function cleanVariables(values: string[]) {
  return [...new Set(values.map((v) => v.trim().replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "")).filter(Boolean))];
}

export async function saveTemplate(supabase: Db, userId: string, input: SaveTemplateInput) {
  const identity = await loadIdentity(supabase, userId);
  if (!identity || !["admin", "operator"].includes(identity.role)) {
    return { error: "forbidden" as const };
  }

  const payload = {
    name: input.name.trim(),
    category: input.category.trim(),
    status: input.status,
    subject: input.subject.trim(),
    body_html: input.body,
    variables: cleanVariables(input.variables),
    applicable_case_types: input.category.trim().toLowerCase() === "onboarding"
      ? ["onboarding"]
      : input.category.trim().toLowerCase() === "offboarding"
        ? ["offboarding"]
        : ["onboarding", "offboarding"],
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data: existing } = await supabase.from("email_templates").select("id,name").eq("id", input.id).maybeSingle();
    if (!existing) return { error: "not_found" as const };
    const { error } = await supabase.from("email_templates").update(payload).eq("id", input.id);
    if (error) {
      if (error.code === "42501") return { error: "forbidden" as const };
      throw new Error(error.message);
    }
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      entity_type: "email_template",
      entity_id: input.id,
      action: `Updated template ${payload.name}`,
      field: "template",
      previous_value: existing.name,
      new_value: payload.name,
    });
    return { ok: true as const, id: input.id };
  }

  const { data, error } = await supabase
    .from("email_templates")
    .insert({ ...payload, owner_id: userId, language: "en", version: 1 })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "email_template",
    entity_id: data.id,
    action: `Created template ${payload.name}`,
  });
  return { ok: true as const, id: data.id as string };
}

export async function saveEmailDraft(
  supabase: Db,
  userId: string,
  input: { caseId: string; templateId: string; subject: string; body: string; recipient: string },
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "case",
    entity_id: input.caseId,
    action: "Email draft saved",
    metadata: { templateId: input.templateId, subject: input.subject, recipient: input.recipient, body: input.body },
    case_id: input.caseId,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const };
}

export async function completeEmailTask(supabase:Db,userId:string,input:{taskId:string;caseId:string;templateId:string;subject:string;body:string;recipient:string}){
  const identity=await loadIdentity(supabase,userId);if(!identity)return {error:"access_denied" as const};
  const {data,error}=await supabase.rpc("complete_email_task",{
    _task_id:input.taskId,_case_id:input.caseId,_template_id:input.templateId,
    _subject:input.subject,_body:input.body,_recipient:input.recipient,
  });
  if(error){if(error.code==="42501")return {error:"forbidden" as const};throw new Error(error.message)}
  if(data===false)return {error:"forbidden" as const};return {ok:true as const};
}

export async function assignChecklistOwner(
  supabase: Db,
  userId: string,
  input: { itemId: string; ownerId: string | null },
) {
  const { data: item } = await supabase
    .from("checklist_items")
    .select("id,case_id,title")
    .eq("id", input.itemId)
    .maybeSingle();
  if (!item) return { error: "not_found" as const };
  const { error } = await supabase.from("checklist_items").update({ owner_id: input.ownerId }).eq("id", input.itemId);
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  const { data: assignee } = input.ownerId
    ? await supabase.from("profiles").select("name").eq("id", input.ownerId).maybeSingle()
    : { data: null };
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "checklist_item",
    entity_id: input.itemId,
    action: input.ownerId ? `Assigned "${item.title}" to ${assignee?.name ?? "user"}` : `Unassigned "${item.title}"`,
    field: "owner_id",
    new_value: input.ownerId,
    case_id: item.case_id,
  });
  return { ok: true as const };
}

/* ------------------------- org management (admin) ------------------------- */

async function requireAdmin(supabase: Db, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) return { error: "forbidden" as const };
  return { ok: true as const };
}

export async function saveLab(
  supabase: Db,
  userId: string,
  input: { id?: string | undefined; name: string; status?: "Active" | "Inactive" | undefined },
) {
  const gate = await requireAdmin(supabase, userId);
  if ("error" in gate) return gate;

  if (input.id) {
    const patch: Record<string, string> = { name: input.name, updated_at: new Date().toISOString() };
    if (input.status) patch["status"] = input.status;
    const { error } = await supabase.from("labs").update(patch).eq("id", input.id);
    if (error) {
      if (error.code === "42501") return { error: "forbidden" as const };
      throw new Error(error.message);
    }
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      entity_type: "lab",
      entity_id: input.id,
      action: `Lab updated: ${input.name}`,
    });
    return { ok: true as const };
  }

  const { data, error } = await supabase.from("labs").insert({ name: input.name }).select("id").single();
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "lab",
    entity_id: data.id,
    action: `Lab created: ${input.name}`,
  });
  return { ok: true as const, id: data.id };
}

export async function saveTeam(
  supabase: Db,
  userId: string,
  input: { id?: string | undefined; name: string; labId: string; status?: "Active" | "Inactive" | undefined },
) {
  const gate = await requireAdmin(supabase, userId);
  if ("error" in gate) return gate;

  if (input.id) {
    const patch: Record<string, string> = {
      name: input.name,
      lab_id: input.labId,
      updated_at: new Date().toISOString(),
    };
    if (input.status) patch["status"] = input.status;
    const { error } = await supabase.from("teams").update(patch).eq("id", input.id);
    if (error) {
      if (error.code === "42501") return { error: "forbidden" as const };
      throw new Error(error.message);
    }
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      entity_type: "team",
      entity_id: input.id,
      action: `Team updated: ${input.name}`,
    });
    return { ok: true as const };
  }

  const { data, error } = await supabase
    .from("teams")
    .insert({ name: input.name, lab_id: input.labId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "team",
    entity_id: data.id,
    action: `Team created: ${input.name}`,
  });
  return { ok: true as const, id: data.id };
}
