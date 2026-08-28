/* Server-only data layer for Team Workbench. Imported by workbench.functions.ts only. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccessLevel,
  CaseDetailDto,
  CaseCapabilitiesDto,
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
  EmailVariableDto,
  PeopleRowDto,
  PersonDetailDto,
  ChecklistTemplateDto,
  ChecklistTemplateItemDto,
  OperationsOverviewDto,
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
    if (s.scope_type === "team" && person && s.team_id && s.team_id === person.team_id)
      return "Scoped";
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
    effectiveDate:
      row.effective_date ??
      (String(row.case_type).toLowerCase() === "offboarding" ? row.end_date : row.start_date),
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
    contractEndDate: row.contract_end_date ?? null,
    lastWorkingDay: row.last_working_day ?? null,
    joinedDate: row.joined_date ?? null,
    joinedAt: row.joined_at ?? null,
    leftDate: row.left_date ?? null,
    leftAt: row.left_at ?? null,
    leavingType: row.leaving_type ?? null,
  };
}

export interface OperationsOverviewFilters {
  team?: string | undefined;
  employmentType?: string | undefined;
  caseType?: string | undefined;
  status?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export async function getOperationsOverview(
  supabase: Db,
  userId: string,
  filters: OperationsOverviewFilters,
): Promise<OperationsOverviewDto | { error: "access_denied" }> {
  if (!(await loadIdentity(supabase, userId))) return { error: "access_denied" };
  const { data, error } = await supabase.rpc("get_operations_overview", {
    _team: filters.team || null,
    _employment_type: filters.employmentType || null,
    _case_type: filters.caseType || null,
    _status: filters.status || null,
    _date_from: filters.dateFrom || null,
    _date_to: filters.dateTo || null,
  });
  if (error) {
    if (error.code === "42501") return { error: "access_denied" };
    throw new Error(error.message);
  }
  return data as OperationsOverviewDto;
}

function toTaskDto(
  t: any,
  nameOf: Map<string, string>,
  person = "",
  caseType: string | null = null,
): TaskDto {
  return {
    id: t.id,
    title: t.title,
    person,
    caseId: t.case_id,
    caseType,
    due: t.due_date,
    priority: t.priority,
    status: t.status,
    email: t.task_type === "Email",
    taskType: t.task_type === "Email" ? "Email" : "Task",
    preferredEmailTemplateId: t.preferred_email_template_id ?? null,
    ownerId: t.owner_id,
    ownerName: t.owner_name ?? (t.owner_id ? (nameOf.get(t.owner_id) ?? "") : ""),
    checklistItemId: t.checklist_item_id,
    completedAt: t.completed_at,
    assigneeRole: t.assignee_role ?? null,
    defaultTaskKey: t.default_task_key ?? null,
    description: t.description ?? null,
    ownerTeam: t.owner_team ?? "HR",
    mandatory: t.mandatory !== false,
    completedByName:
      t.completed_by_name ?? (t.completed_by ? (nameOf.get(t.completed_by) ?? null) : null),
    personTeam: t.person_team ?? "—",
    startDate: t.start_date ?? null,
    contractEndDate: t.contract_end_date ?? null,
    lastWorkingDay: t.last_working_day ?? null,
    templateItemId: t.template_item_id ?? null,
    source: t.source === "template" ? "template" : "manual",
    notApplicableReason: t.not_applicable_reason ?? null,
    canEdit: t.can_edit !== false,
  };
}

export async function getWorkbenchData(
  supabase: Db,
  userId: string,
): Promise<WorkbenchData | { error: "access_denied" }> {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" };

  const [casesRes, profilesRes, rolesRes, scopesRes, labsRes, teamsRes, tasksRes, operationalRes] =
    await Promise.all([
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
      supabase.rpc("list_operational_tasks", { _case_id: null }),
      supabase.from("user_operational_teams").select("user_id,owner_team"),
    ]);
  if (casesRes.error) throw new Error(casesRes.error.message);

  const labNames = new Map<string, string>(
    ((labsRes.data ?? []) as any[]).map((l) => [l.id, l.name]),
  );
  const teamNames = new Map<string, string>(
    ((teamsRes.data ?? []) as any[]).map((t) => [t.id, t.name]),
  );
  const profiles = (profilesRes.data ?? []) as any[];
  const nameOf = new Map<string, string>(profiles.map((p) => [p.id, p.name]));
  const roleOf = new Map<string, string>(
    ((rolesRes.data ?? []) as any[]).map((r) => [r.user_id, r.role]),
  );
  const scopesOf = new Map<string, any[]>();
  for (const s of (scopesRes.data ?? []) as any[]) {
    scopesOf.set(s.user_id, [...(scopesOf.get(s.user_id) ?? []), s]);
  }
  const operationalTeamsOf = new Map<string, Array<"HR" | "IT" | "Admin">>();
  for (const membership of (operationalRes.data ?? []) as any[]) {
    const team = membership.owner_team as "HR" | "IT" | "Admin";
    operationalTeamsOf.set(membership.user_id, [
      ...(operationalTeamsOf.get(membership.user_id) ?? []),
      team,
    ]);
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
    ((memberRows ?? []) as any[])
      .filter((m) => m.user_id === userId)
      .map((m) => [m.case_id, m.access_level]),
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
    operationalTeams: operationalTeamsOf.get(p.id) ?? [],
  }));

  const cases: CaseDto[] = caseRows.map((row) =>
    toCaseDto(row, computeAccess(identity, row, memberLevel.get(row.id)), nameOf),
  );
  const sharedCases = cases.filter(
    (c) => c.accessLevel === "Viewer" || c.accessLevel === "Collaborator",
  );

  const tasks: TaskDto[] = ((tasksRes.data ?? []) as any[]).map((t) =>
    toTaskDto(
      t,
      nameOf,
      t.person_name ?? "",
      String(t.case_type).toLowerCase() === "onboarding"
        ? "Onboarding"
        : String(t.case_type).toLowerCase() === "offboarding"
          ? "Offboarding"
          : null,
    ),
  );

  const currentUser: CurrentUser = {
    id: userId,
    name: identity.name,
    email: identity.email,
    title: identity.title,
    role: ROLE_LABEL[identity.role] ?? "Viewer",
    scopes: identity.scopes.map((s) => scopeLabel(s, labNames, teamNames)),
    operationalTeams: operationalTeamsOf.get(userId) ?? [],
  };

  return {
    currentUser,
    tasks,
    cases,
    sharedCases,
    users,
    labs: ((labsRes.data ?? []) as any[]).map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status ?? "Active",
    })),
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
  const { data: rawCapabilities, error: capabilitiesError } = await supabase.rpc(
    "get_case_capabilities",
    { _case_id: caseId },
  );
  if (capabilitiesError) throw new Error(capabilitiesError.message);
  if (!rawCapabilities) return { error: "not_found" };
  const capabilities = rawCapabilities as CaseCapabilitiesDto;
  let operationalOnly = !capabilities.canViewFullCase;
  let row: any = null;
  if (capabilities.canViewFullCase) {
    const { data: fullRow, error } = await supabase
      .from("cases")
      .select(
        "*, persons(full_name, given_name, preferred_name, email, employee_id, phone, lab_id, team_id, teams(name), manager:manager_id(full_name)), employments(company_email,workload)",
      )
      .eq("id", caseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    row = fullRow;
  }
  if (!row) {
    const { data: summary, error: summaryError } = await supabase.rpc(
      "get_operational_case_summary",
      { _case_id: caseId },
    );
    if (summaryError) throw new Error(summaryError.message);
    if (!summary) return { error: "not_found" };
    row = summary;
    operationalOnly = true;
  }
  const r = row as any;

  const [
    membersRes,
    profilesRes,
    checklistRes,
    historyRes,
    filesRes,
    workflowRes,
    externalRes,
    tasksRes,
    operationalTeamsRes,
    communicationsRes,
  ] = await Promise.all([
    supabase
      .from("case_members")
      .select("id,user_id,access_level")
      .eq("case_id", caseId)
      .is("revoked_at", null),
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
    supabase
      .from("external_collaboration_requests")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase.rpc("list_operational_tasks", { _case_id: caseId }),
    supabase.from("user_operational_teams").select("user_id,owner_team"),
    supabase
      .from("email_communications")
      .select(
        "*, email_templates(name), email_additional_attachments(id,filename,size,content_type), email_communication_attachment_snapshots(id,filename,size,content_type)",
      )
      .eq("case_id", caseId)
      .order("prepared_at", { ascending: false }),
  ]);

  const myMembership = ((membersRes.data ?? []) as any[]).find((m) => m.user_id === userId);
  const computedAccess = computeAccess(identity, r, myMembership?.access_level);
  const access = operationalOnly && computedAccess === "None" ? "Scoped" : computedAccess;
  const nameOf = new Map<string, string>(
    ((profilesRes.data ?? []) as any[]).map((p) => [p.id, p.name]),
  );
  const canSeeNotes = capabilities.canManageCase;
  const person = r.persons ?? {};

  const members: MemberDto[] = ((membersRes.data ?? []) as any[]).map((m) => ({
    id: m.id,
    userId: m.user_id,
    name: nameOf.get(m.user_id) ?? "Unknown",
    accessLevel: m.access_level === "collaborator" ? "Collaborator" : "Viewer",
  }));

  const operationalTaskRows = (tasksRes.data ?? []) as any[];
  const taskByChecklist = new Map<string, any>();
  for (const task of operationalTaskRows) {
    if (task.checklist_item_id) taskByChecklist.set(task.checklist_item_id, task);
  }
  const taskById = new Map<string, any>(operationalTaskRows.map((task) => [task.id, task]));
  const checklist: ChecklistDto[] = operationalOnly
    ? []
    : ((checklistRes.data ?? []) as any[]).map((c) => {
        const task = taskByChecklist.get(c.id) ?? (c.task_id ? taskById.get(c.task_id) : null);
        const status = task
          ? task.status === "Completed"
            ? "Completed"
            : task.status === "Not Applicable"
              ? "Not Required"
              : "Open"
          : c.status;
        const ownerId = task ? task.owner_id : c.owner_id;
        return {
          id: c.id,
          title: task?.title ?? c.title,
          section: task?.owner_team ?? c.section,
          status,
          ownerId,
          ownerName: task?.owner_name ?? (ownerId ? (nameOf.get(ownerId) ?? "") : ""),
          dueDate: task?.due_date ?? c.due_date,
          completedDate: task?.completed_at ?? c.completed_date,
          completedByName: task
            ? (task.completed_by_name ?? null)
            : c.completed_by
              ? (nameOf.get(c.completed_by) ?? null)
              : null,
          taskId: task?.id ?? c.task_id ?? null,
          ownerTeam:
            task?.owner_team ?? (c.section === "IT" || c.section === "Admin" ? c.section : "HR"),
          canEdit: task ? task.can_edit === true : capabilities.canManageCase,
        };
      });

  const history: HistoryDto[] = (operationalOnly ? [] : ((historyRes.data ?? []) as any[])).map(
    (h) => ({
      id: h.id,
      actorName: h.actor_id ? (nameOf.get(h.actor_id) ?? "System") : "System",
      action: h.action,
      field: h.field,
      oldValue: h.previous_value,
      newValue: h.new_value,
      at: h.created_at,
    }),
  );

  const files: FileDto[] = (operationalOnly ? [] : ((filesRes.data ?? []) as any[])).map((f) => ({
    id: f.id,
    filename: f.filename,
    size: f.size,
    contentType: f.content_type,
    at: f.created_at,
    uploadedByName: f.uploaded_by ? (nameOf.get(f.uploaded_by) ?? "") : "",
  }));
  const workflow: WorkflowItemDto[] = (
    operationalOnly ? [] : ((workflowRes.data ?? []) as any[])
  ).map((w) => ({
    id: w.id,
    key: w.step_key,
    title: w.title,
    description: w.description,
    sequence: w.sequence,
    targetDate: w.target_date,
    status: w.status,
    completedAt: w.completed_at,
    completedByName: w.completed_by ? (nameOf.get(w.completed_by) ?? null) : null,
  }));
  const externalRequests: ExternalRequestDto[] = (
    operationalOnly ? [] : ((externalRes.data ?? []) as any[])
  ).map((x) => ({
    id: x.id,
    workflowItemId: x.workflow_item_id,
    recipientEmail: x.recipient_email,
    recipientName: x.recipient_name,
    recipientTeam: x.recipient_team,
    status: x.status,
    responseNote: x.response_note,
    dueDate: x.due_date,
    expiresAt: x.expires_at,
    createdAt: x.created_at,
    respondedAt: x.responded_at,
  }));
  const tasks: TaskDto[] = operationalTaskRows.map((t) =>
    toTaskDto(t, nameOf, t.person_name ?? person.full_name ?? "", t.case_type ?? r.case_type),
  );

  const taskIds = tasks.map((task) => task.id);
  const { data: commentRows } = taskIds.length
    ? await supabase
        .from("task_comments")
        .select("id,task_id,author_id,body,created_at")
        .in("task_id", taskIds)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };
  const operationalTeamsOf = new Map<string, string[]>();
  for (const membership of (operationalTeamsRes.data ?? []) as any[]) {
    operationalTeamsOf.set(membership.user_id, [
      ...(operationalTeamsOf.get(membership.user_id) ?? []),
      membership.owner_team,
    ]);
  }
  const taskComments = ((commentRows ?? []) as any[]).map((comment) => ({
    id: comment.id,
    taskId: comment.task_id,
    authorName: nameOf.get(comment.author_id) ?? "User",
    authorTeam: operationalTeamsOf.get(comment.author_id)?.join(" / ") ?? null,
    body: comment.body,
    at: comment.created_at,
  }));

  const assignableUsers = ((profilesRes.data ?? []) as any[])
    .filter((p) => p.status === "Active")
    .map((p) => ({
      id: p.id,
      name: p.name,
      operationalTeams: operationalTeamsOf.get(p.id) ?? [],
    }));

  const communications = ((communicationsRes.data ?? []) as any[]).map((communication) => ({
    communicationId: communication.id,
    taskId: communication.task_id ?? null,
    templateId: communication.template_id ?? null,
    templateName: communication.email_templates?.name ?? "Email",
    templateVersion: communication.template_version ?? null,
    recipient: communication.recipient,
    renderedSubject: communication.rendered_subject,
    state: communication.state,
    outlookMode: communication.outlook_mode ?? null,
    preparedBy: nameOf.get(communication.prepared_by) ?? "User",
    preparedAt: communication.prepared_at,
    openedAt: communication.opened_at ?? null,
    markedSentAt: communication.marked_sent_at ?? null,
    attachments: [
      ...((communication.email_communication_attachment_snapshots ?? []) as any[]),
      ...((communication.email_additional_attachments ?? []) as any[]),
    ].map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      size: attachment.size,
      contentType: attachment.content_type ?? null,
    })),
  }));

  return {
    case: {
      ...toCaseDto(r, access, nameOf),
      personEmail: person.email ?? null,
      companyEmail: r.employments?.company_email ?? null,
      givenName: person.given_name ?? null,
      preferredName: person.preferred_name ?? null,
      employeeId: person.employee_id ?? null,
      phone: person.phone ?? null,
      managerName: person.manager?.full_name ?? null,
      workload: r.workload ?? null,
      contractType: r.contract_type ?? null,
      leavingReason: r.leaving_reason ?? null,
      notes: canSeeNotes ? (r.notes ?? null) : null,
    },
    checklist,
    members,
    history,
    files,
    workflow,
    tasks,
    taskComments,
    externalRequests,
    assignableUsers,
    capabilities,
    communications,
  };
}

export async function createExternalRequest(
  supabase: Db,
  userId: string,
  input: {
    workflowItemId: string;
    recipientEmail: string;
    recipientName?: string | undefined;
    recipientTeam?: string | undefined;
    requestMessage?: string | undefined;
    dueDate?: string | undefined;
  },
) {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" as const };
  const { data, error } = await supabase.rpc("create_external_collaboration_request", {
    _workflow_item_id: input.workflowItemId,
    _recipient_email: input.recipientEmail,
    _recipient_name: input.recipientName || null,
    _recipient_team: input.recipientTeam || null,
    _request_message: input.requestMessage || null,
    _due_date: input.dueDate || null,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return {
    ok: true as const,
    id: (data as any).id as string,
    token: (data as any).token as string,
  };
}

/* ---------------------------------- mutations ---------------------------------- */

export async function shareCase(
  supabase: Db,
  userId: string,
  input: { caseId: string; targetUserId: string; accessLevel: "viewer" | "collaborator" },
) {
  const { data: target } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", input.targetUserId)
    .maybeSingle();
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
  const { data: target } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", member.user_id)
    .maybeSingle();
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

export async function assignTask(
  supabase: Db,
  _userId: string,
  input: { taskId: string; ownerId: string | null },
) {
  const { error } = await supabase.rpc("assign_task", {
    _task_id: input.taskId,
    _assignee_id: input.ownerId,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const };
}

export async function createTask(
  supabase: Db,
  userId: string,
  input: {
    caseId: string;
    title: string;
    description?: string | null | undefined;
    dueDate?: string | undefined;
    priority: string;
    ownerId?: string | null | undefined;
    ownerTeam?: "HR" | "IT" | "Admin" | undefined;
    mandatory?: boolean | undefined;
  },
) {
  const { data, error } = await supabase.rpc("create_manual_task", {
    _case_id: input.caseId,
    _title: input.title,
    _description: input.description || null,
    _owner_team: input.ownerTeam ?? "HR",
    _assignee_id: input.ownerId ?? null,
    _mandatory: input.mandatory ?? true,
    _due_date: input.dueDate || null,
    _priority: input.priority,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, taskId: data as string };
}

export async function addTaskComment(
  supabase: Db,
  userId: string,
  input: { taskId: string; body: string },
) {
  if (!(await loadIdentity(supabase, userId))) return { error: "access_denied" as const };
  const { data, error } = await supabase.rpc("add_task_comment", {
    _task_id: input.taskId,
    _body: input.body,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, commentId: data as string };
}

export async function syncCaseTasks(supabase: Db, userId: string, caseId: string) {
  if (!(await loadIdentity(supabase, userId))) return { error: "access_denied" as const };
  const { data, error } = await supabase.rpc("sync_case_tasks", {
    _case_id: caseId,
    _reason: "Manual synchronization",
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, result: data };
}

export async function toggleTask(
  supabase: Db,
  userId: string,
  input: { taskId: string; complete: boolean },
) {
  return setTaskStatus(supabase, userId, {
    taskId: input.taskId,
    status: input.complete ? "Completed" : "Not Started",
  });
}

export async function toggleChecklist(
  supabase: Db,
  userId: string,
  input: { itemId: string; complete: boolean },
) {
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

export async function createOnboardingCase(
  supabase: Db,
  userId: string,
  input: CreateCaseInput & {
    personId?: string | undefined;
    preferredName?: string | undefined;
    employeeId?: string | undefined;
  },
) {
  const { data, error } = await supabase.rpc("create_onboarding_case_v2", {
    _existing_person_id: input.personId || null,
    _given_name: input.firstName,
    _family_name: input.lastName,
    _preferred_name: input.preferredName || null,
    _email: input.email || null,
    _employee_id: input.employeeId || null,
    _team_id: input.teamId || null,
    _employment_type: input.employmentType,
    _effective_date: input.startDate,
    _role_title: input.role || null,
    _location: input.location || null,
    _supervisor_name: input.supervisorName,
    _supervisor_email: input.supervisorEmail || null,
    _workload: null,
    _priority: input.priority,
    _notes: input.notes || null,
    _visa_required: input.visaRequired ?? false,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, caseId: (data as any).caseId as string };
}

export async function createOffboardingCase(
  supabase: Db,
  userId: string,
  input: {
    personId: string;
    employmentId: string;
    contractEndDate: string;
    lastWorkingDay?: string | undefined;
    leavingType?: string | undefined;
    leavingReason?: string | undefined;
    priority: string;
    notes?: string | undefined;
  },
) {
  const { data, error } = await supabase.rpc("create_offboarding_case_v3", {
    _person_id: input.personId,
    _employment_id: input.employmentId,
    _contract_end_date: input.contractEndDate || null,
    _last_working_day: input.lastWorkingDay || null,
    _leaving_type: input.leavingType || null,
    _leaving_reason: input.leavingReason || null,
    _priority: input.priority,
    _notes: input.notes || null,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  if ((data as any)?.error === "offboarding_exists")
    return { error: "offboarding_exists" as const, caseId: (data as any).caseId as string };
  return { ok: true as const, caseId: (data as any).caseId as string };
}

export async function updateOffboardingDates(
  supabase: Db,
  userId: string,
  input: { caseId: string; contractEndDate: string; lastWorkingDay?: string | undefined },
) {
  if (!(await loadIdentity(supabase, userId))) return { error: "forbidden" as const };
  const { error } = await supabase.rpc("update_offboarding_dates", {
    _case_id: input.caseId,
    _contract_end_date: input.contractEndDate,
    _last_working_day: input.lastWorkingDay || null,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const };
}

function peopleRow(row: any): PeopleRowDto {
  const employments = [...(row.employments ?? [])].sort((a: any, b: any) =>
    String(b.start_date ?? "").localeCompare(String(a.start_date ?? "")),
  );
  const e =
    employments.find((x: any) =>
      ["active", "ending", "planned"].includes(x.effective_status ?? x.status),
    ) ?? employments[0];
  return {
    personId: row.id,
    displayName: row.display_name || row.preferred_name || row.full_name,
    givenName: row.given_name,
    familyName: row.family_name,
    preferredName: row.preferred_name,
    email: row.email,
    employmentId: e?.id ?? null,
    employeeId: e?.employee_id ?? row.employee_id,
    employmentType: e?.employment_type ?? null,
    role: e?.role_title ?? null,
    team: e?.teams?.name ?? row.teams?.name ?? "—",
    teamId: e?.team_id ?? row.team_id,
    location: e?.location ?? null,
    status: e?.effective_status ?? e?.status ?? "no_employment",
    startDate: e?.start_date ?? null,
    endDate: e?.end_date ?? null,
    supervisorName: e?.supervisor_name ?? null,
  };
}

export async function getPeople(
  supabase: Db,
  userId: string,
): Promise<PeopleRowDto[] | { error: "access_denied" }> {
  if (!(await loadIdentity(supabase, userId))) return { error: "access_denied" };
  const [{ data: persons, error }, { data: employments }, { data: teams }] = await Promise.all([
    supabase.from("persons").select("*").is("archived_at", null).order("full_name"),
    supabase.from("employment_effective").select("*"),
    supabase.from("teams").select("id,name"),
  ]);
  if (error) throw new Error(error.message);
  const teamNames = new Map(((teams ?? []) as any[]).map((t) => [t.id, t.name]));
  const byPerson = new Map<string, any[]>();
  for (const e of (employments ?? []) as any[]) {
    e.teams = { name: teamNames.get(e.team_id) ?? "—" };
    byPerson.set(e.person_id, [...(byPerson.get(e.person_id) ?? []), e]);
  }
  return ((persons ?? []) as any[])
    .filter((p) => byPerson.has(p.id))
    .map((p) => peopleRow({ ...p, employments: byPerson.get(p.id) }));
}

export async function getPersonDetail(
  supabase: Db,
  userId: string,
  personId: string,
): Promise<PersonDetailDto | { error: "access_denied" | "not_found" }> {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" };
  const [
    { data: person, error },
    { data: employmentRows },
    { data: teams },
    { data: caseRows },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("persons").select("*").eq("id", personId).maybeSingle(),
    supabase.from("employment_effective").select("*").eq("person_id", personId),
    supabase.from("teams").select("id,name"),
    supabase
      .from("cases")
      .select("*, persons(full_name,lab_id,team_id,teams(name))")
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id,name"),
  ]);
  if (error) throw new Error(error.message);
  if (!person) return { error: "not_found" };
  if (!(employmentRows ?? []).length && !(caseRows ?? []).length) return { error: "access_denied" };
  const teamNames = new Map(((teams ?? []) as any[]).map((t) => [t.id, t.name]));
  const employmentData = ((employmentRows ?? []) as any[]).map((e) => ({
    ...e,
    teams: { name: teamNames.get(e.team_id) ?? "—" },
  }));
  const personWithEmployment = { ...person, employments: employmentData };
  const names = new Map(((profiles ?? []) as any[]).map((x) => [x.id, x.name]));
  const row = peopleRow(personWithEmployment);
  return {
    person: { ...row, phone: person.phone ?? null },
    employments: employmentData.map((e) => ({
      id: e.id,
      employmentType: e.employment_type,
      employeeId: e.employee_id,
      role: e.role_title,
      team: e.teams?.name ?? "—",
      location: e.location,
      status: e.effective_status ?? e.status,
      startDate: e.start_date,
      endDate: e.end_date,
      supervisorName: e.supervisor_name,
      workload: e.workload,
      contractType: e.contract_type,
    })),
    cases: ((caseRows ?? []) as any[]).map((c) => toCaseDto(c, computeAccess(identity, c), names)),
  };
}

export async function findOnboardingCandidates(
  supabase: Db,
  userId: string,
  input: {
    employeeId?: string | undefined;
    email?: string | undefined;
    fullName: string;
    teamId: string | null;
  },
) {
  if (!(await loadIdentity(supabase, userId))) return { error: "access_denied" as const };
  const { data, error } = await supabase.rpc("find_onboarding_person_candidates", {
    _employee_id: input.employeeId || null,
    _email: input.email || null,
    _full_name: input.fullName,
    _team_id: input.teamId,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return {
    candidates: ((data ?? []) as any[]).map((x) => ({
      personId: x.person_id,
      displayName: x.display_name,
      email: x.email,
      employeeId: x.employee_id,
      matchStrength: x.match_strength,
      matchReason: x.match_reason,
      lastEmploymentType: x.last_employment_type,
      lastTeam: x.last_team,
      lastEndDate: x.last_end_date,
      accessible: x.accessible,
    })),
  };
}

export async function setCaseConfirmation(
  supabase: Db,
  userId: string,
  caseId: string,
  confirmed: boolean,
) {
  if (!(await loadIdentity(supabase, userId))) return { error: "forbidden" as const };
  const { error } = await supabase.rpc("transition_lifecycle_case", {
    _case_id: caseId,
    _confirm: confirmed,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    if (/not found/i.test(error.message)) return { error: "not_found" as const };
    throw new Error(error.message);
  }
  return { ok: true as const };
}

export async function updatePersonIdentity(
  supabase: Db,
  userId: string,
  input: {
    personId: string;
    employeeId?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
  },
) {
  if (!(await loadIdentity(supabase, userId))) return { error: "forbidden" as const };
  const { data, error } = await supabase.rpc("update_person_identity", {
    _person_id: input.personId,
    _employee_id: input.employeeId || null,
    _email: input.email || null,
    _phone: input.phone || null,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, personId: (data as any).personId as string };
}

export async function setTaskStatus(
  supabase: Db,
  userId: string,
  input: { taskId: string; status: string; comment?: string | undefined },
) {
  if (!(await loadIdentity(supabase, userId))) return { error: "access_denied" as const };
  const { data, error } = await supabase.rpc("set_task_status", {
    _task_id: input.taskId,
    _status: input.status,
    _comment: input.comment || null,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return data ? { ok: true as const } : { error: "forbidden" as const };
}

export async function getActiveRoster(
  supabase: Db,
  userId: string,
): Promise<RosterPersonDto[] | { error: "access_denied" }> {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" };
  const { data, error } = await supabase
    .from("active_employee_roster")
    .select("*")
    .order("full_name");
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
    leaving: Boolean(row.leaving),
    lastWorkingDay: row.last_working_day ?? null,
  }));
}

export async function updateWorkflowItem(
  supabase: Db,
  userId: string,
  input: { itemId: string; status: string },
) {
  const complete = input.status === "Completed";
  const { data: item } = await supabase
    .from("case_workflow_items")
    .select("id,case_id,title,status")
    .eq("id", input.itemId)
    .maybeSingle();
  if (!item) return { error: "not_found" as const };
  const { error } = await supabase
    .from("case_workflow_items")
    .update({
      status: input.status,
      completed_at: complete ? new Date().toISOString() : null,
      completed_by: complete ? userId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.itemId);
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    entity_type: "workflow_item",
    entity_id: item.id,
    action: `Workflow: ${item.title}`,
    field: "status",
    previous_value: item.status,
    new_value: input.status,
    case_id: item.case_id,
  });
  return { ok: true as const };
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
  operationalTeams?: Array<"HR" | "IT" | "Admin"> | undefined;
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
  const adminDb = supabaseAdmin as any;

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
    await adminDb.from("user_operational_teams").delete().eq("user_id", input.id);
    if (input.operationalTeams?.length) {
      await adminDb.from("user_operational_teams").insert(
        input.operationalTeams.map((ownerTeam: "HR" | "IT" | "Admin") => ({
          user_id: input.id!,
          owner_team: ownerTeam,
        })),
      );
    }
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
    if (/already been registered|already exists|duplicate/i.test(error.message))
      return { error: "email_exists" as const };
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
  if (input.operationalTeams?.length) {
    await adminDb.from("user_operational_teams").insert(
      input.operationalTeams.map((ownerTeam: "HR" | "IT" | "Admin") => ({
        user_id: newId,
        owner_team: ownerTeam,
      })),
    );
  }
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
): Promise<
  | { templates: TemplateDto[]; globalVariables: EmailVariableDto[]; canManageTemplates: boolean }
  | { error: "access_denied" }
> {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" };
  const [templatesResult, variablesResult] = await Promise.all([
    supabase
      .from("email_templates")
      .select("*, email_template_attachments(*), email_template_variables(*)")
      .order("category")
      .order("name"),
    supabase.from("email_variable_library").select("*").eq("active", true).order("display_name"),
  ]);
  if (templatesResult.error) throw new Error(templatesResult.error.message);
  if (variablesResult.error) throw new Error(variablesResult.error.message);
  return {
    templates: ((templatesResult.data ?? []) as any[]).map((t) => ({
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
      description: t.description ?? "",
      recipientSource: (t.recipient_source ?? "personal_email") as
        "personal_email" | "company_email" | "manual",
      variableDefinitions: ((t.email_template_variables ?? []) as any[]).map((v) => ({
        key: v.variable_key,
        displayName: v.display_name ?? v.variable_key,
        dataType: v.data_type ?? "text",
        sourceType: "manual",
        sourceField: null,
        required: Boolean(v.required),
        defaultValue: v.default_value ?? null,
        description: v.description ?? null,
        choices: Array.isArray(v.choices) ? v.choices : [],
      })),
      attachments: ((t.email_template_attachments ?? []) as any[]).map((a) => ({
        id: a.id,
        filename: a.filename,
        storagePath: a.storage_path,
        contentType: a.content_type ?? null,
        size: a.size ?? 0,
      })),
      archivedAt: t.archived_at ?? null,
      createdAt: t.created_at,
    })),
    globalVariables: ((variablesResult.data ?? []) as any[]).map((v) => ({
      key: v.variable_key,
      displayName: v.display_name,
      dataType: v.data_type,
      sourceType: v.source_type,
      sourceField: v.source_field ?? null,
      required: Boolean(v.required),
      defaultValue: v.default_value ?? null,
      description: v.description ?? null,
      choices: Array.isArray(v.choices) ? v.choices : [],
    })),
    canManageTemplates: ["admin", "operator"].includes(identity.role),
  };
}

export async function listChecklistTemplateItems(
  supabase: Db,
  userId: string,
): Promise<
  | {
      items: ChecklistTemplateItemDto[];
      templates: ChecklistTemplateDto[];
      emailTemplates: { id: string; name: string; applicableCaseTypes: string[] }[];
    }
  | { error: "access_denied" }
> {
  if (!(await loadIdentity(supabase, userId))) return { error: "access_denied" };
  const [itemsResult, templatesResult, emailTemplatesResult] = await Promise.all([
    supabase
      .from("checklist_template_items")
      .select("*, checklist_templates(name,version)")
      .order("case_type")
      .order("sort_order"),
    supabase.from("checklist_templates").select("*").order("case_type").order("name"),
    supabase
      .from("email_templates")
      .select("id,name,applicable_case_types")
      .eq("status", "Published")
      .order("name"),
  ]);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (templatesResult.error) throw new Error(templatesResult.error.message);
  if (emailTemplatesResult.error) throw new Error(emailTemplatesResult.error.message);
  return {
    emailTemplates: ((emailTemplatesResult.data ?? []) as any[]).map((template) => ({
      id: template.id,
      name: template.name,
      applicableCaseTypes: template.applicable_case_types ?? [],
    })),
    templates: ((templatesResult.data ?? []) as any[]).map((template) => ({
      id: template.id,
      key: template.template_key,
      name: template.name,
      caseType: template.case_type,
      description: template.description ?? null,
      active: template.active !== false,
      version: Number(template.version ?? 1),
    })),
    items: ((itemsResult.data ?? []) as any[]).map((item) => ({
      id: item.id,
      templateId: item.template_id,
      templateName: item.checklist_templates?.name ?? "Checklist",
      templateVersion: Number(item.checklist_templates?.version ?? 1),
      key: item.template_key,
      caseType: item.case_type,
      title: item.title,
      description: item.description ?? null,
      ownerTeam: item.owner_team,
      mandatory: item.mandatory !== false,
      active: item.active !== false && item.enabled !== false,
      employmentTypes: item.applicable_employment_types ?? [],
      leavingTypes: item.applicable_leaving_types ?? [],
      leavingReasons: item.applicable_leaving_reasons ?? [],
      dueReference: item.due_reference ?? "manual",
      dueOffsetDays: Number(item.due_offset_days ?? 0),
      sortOrder: Number(item.sort_order ?? 0),
      taskType: item.task_type === "Email" ? "Email" : "Task",
      preferredEmailTemplateId: item.preferred_email_template_id ?? null,
    })),
  };
}

export async function saveChecklistTemplateItem(
  supabase: Db,
  userId: string,
  input: {
    id?: string | undefined;
    templateId: string;
    caseType: "Onboarding" | "Offboarding";
    title: string;
    description?: string | null | undefined;
    ownerTeam: "HR" | "IT" | "Admin";
    mandatory: boolean;
    active: boolean;
    employmentTypes: string[];
    leavingTypes: string[];
    leavingReasons: string[];
    dueReference: "start_date" | "contract_end_date" | "last_working_day" | "manual";
    dueOffsetDays: number;
    sortOrder: number;
    taskType: "Task" | "Email";
    preferredEmailTemplateId?: string | null | undefined;
  },
) {
  const identity = await loadIdentity(supabase, userId);
  if (!identity || !(identity.role === "admin" || identity.role === "operator")) {
    const { data: hr } = await supabase.rpc("is_hr_user", { _user_id: userId });
    if (!hr) return { error: "forbidden" as const };
  }
  const { data: template, error: templateError } = await supabase
    .from("checklist_templates")
    .select("id,case_type")
    .eq("id", input.templateId)
    .maybeSingle();
  if (templateError) throw new Error(templateError.message);
  if (!template || template.case_type !== input.caseType) return { error: "not_found" as const };
  const payload = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    owner_team: input.ownerTeam,
    mandatory: input.mandatory,
    active: input.active,
    enabled: input.active,
    applicable_employment_types: input.employmentTypes,
    applicable_leaving_types: input.leavingTypes,
    applicable_leaving_reasons: input.leavingReasons,
    due_reference: input.dueReference,
    due_offset_days: input.dueOffsetDays,
    sort_order: input.sortOrder,
    task_type: input.taskType,
    preferred_email_template_id:
      input.taskType === "Email" ? (input.preferredEmailTemplateId ?? null) : null,
    updated_at: new Date().toISOString(),
  };
  const operation = input.id
    ? supabase
        .from("checklist_template_items")
        .update(payload)
        .eq("id", input.id)
        .eq("template_id", input.templateId)
    : supabase.from("checklist_template_items").insert({
        ...payload,
        template_id: input.templateId,
        template_key: `custom_${crypto.randomUUID().replaceAll("-", "")}`,
        case_type: input.caseType,
        due_rule: "Manual",
      });
  const { error } = await operation;
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  await supabase
    .from("checklist_templates")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.templateId);
  return { ok: true as const };
}

export async function saveChecklistTemplate(
  supabase: Db,
  userId: string,
  input: {
    id?: string | undefined;
    name: string;
    description?: string | null | undefined;
    caseType: "Onboarding" | "Offboarding";
    active: boolean;
  },
) {
  const identity = await loadIdentity(supabase, userId);
  if (!identity || !(identity.role === "admin" || identity.role === "operator")) {
    const { data: hr } = await supabase.rpc("is_hr_user", { _user_id: userId });
    if (!hr) return { error: "forbidden" as const };
  }
  const payload = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data: existing, error: lookupError } = await supabase
      .from("checklist_templates")
      .select("id,case_type,version")
      .eq("id", input.id)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!existing || existing.case_type !== input.caseType) return { error: "not_found" as const };
    const { error } = await supabase
      .from("checklist_templates")
      .update({ ...payload, version: Number(existing.version ?? 1) + 1 })
      .eq("id", input.id);
    if (error) {
      if (error.code === "42501") return { error: "forbidden" as const };
      throw new Error(error.message);
    }
    return { ok: true as const, id: input.id };
  }
  const slug =
    input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "checklist";
  const { data, error } = await supabase
    .from("checklist_templates")
    .insert({
      ...payload,
      template_key: `${slug}_${crypto.randomUUID().slice(0, 8)}`,
      case_type: input.caseType,
      version: 1,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, id: data.id as string };
}

export async function listPublishedTemplates(supabase: Db, userId: string) {
  const result = await listTemplates(supabase, userId);
  return "error" in result
    ? result
    : { ...result, templates: result.templates.filter((t) => t.status === "Published") };
}

export async function listEmailEligibleCaseIds(supabase: Db, _userId: string) {
  const { data, error } = await supabase.rpc("list_email_eligible_case_ids");
  if (error) throw new Error(error.message);
  return { caseIds: (data ?? []) as string[] };
}

export interface SaveTemplateInput {
  id?: string | undefined;
  name: string;
  category: string;
  status: "Draft" | "Published" | "Archived";
  subject: string;
  body: string;
  variables: string[];
  description?: string | undefined;
  recipientSource?: "personal_email" | "company_email" | "manual" | undefined;
  applicableCaseTypes: string[];
  variableDefinitions: EmailVariableDto[];
}

function cleanVariables(values: string[]) {
  return [
    ...new Set(
      values
        .map((v) =>
          v
            .trim()
            .replace(/^\{\{\s*/, "")
            .replace(/\s*\}\}$/, ""),
        )
        .filter(Boolean),
    ),
  ];
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
    description: input.description?.trim() || null,
    recipient_source: input.recipientSource ?? "personal_email",
    applicable_case_types: input.applicableCaseTypes,
    archived_at: input.status === "Archived" ? new Date().toISOString() : null,
    published_at: input.status === "Published" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data: existing } = await supabase
      .from("email_templates")
      .select("id,name,version")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing) return { error: "not_found" as const };
    const { error } = await supabase
      .from("email_templates")
      .update({
        ...payload,
        status: input.status === "Published" ? "Draft" : input.status,
        version: Number((existing as any).version ?? 1) + 1,
      })
      .eq("id", input.id);
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
    const { error: variableError } = await supabase.rpc("replace_email_template_variables", {
      _template_id: input.id,
      _variables: input.variableDefinitions,
    });
    if (variableError) throw new Error(variableError.message);
    if (input.status === "Published") {
      const { data: validation } = await supabase.rpc("validate_email_template_for_publish", {
        _template_id: input.id,
      });
      if ((validation as string[] | null)?.length)
        return { error: "invalid_template" as const, details: validation };
      const { error: publishError } = await supabase
        .from("email_templates")
        .update({ status: "Published", published_at: new Date().toISOString() })
        .eq("id", input.id);
      if (publishError) throw new Error(publishError.message);
    }
    return { ok: true as const, id: input.id };
  }

  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      ...payload,
      status: input.status === "Published" ? "Draft" : input.status,
      owner_id: userId,
      created_by: userId,
      language: "en",
      version: 1,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  const { error: variableError } = await supabase.rpc("replace_email_template_variables", {
    _template_id: data.id,
    _variables: input.variableDefinitions,
  });
  if (variableError) throw new Error(variableError.message);
  if (input.status === "Published") {
    const { data: validation } = await supabase.rpc("validate_email_template_for_publish", {
      _template_id: data.id,
    });
    if ((validation as string[] | null)?.length)
      return { error: "invalid_template" as const, details: validation };
    const { error: publishError } = await supabase
      .from("email_templates")
      .update({ status: "Published", published_at: new Date().toISOString() })
      .eq("id", data.id);
    if (publishError) throw new Error(publishError.message);
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
  _userId: string,
  input: {
    caseId: string;
    taskId?: string | undefined;
    templateId: string;
    templateVersion: number;
    subject: string;
    body: string;
    recipient: string;
  },
) {
  const { data, error } = await supabase.rpc("record_email_event", {
    _case_id: input.caseId,
    _task_id: input.taskId ?? null,
    _template_id: input.templateId,
    _template_version: input.templateVersion,
    _recipient: input.recipient,
    _subject: input.subject,
    _state: "Draft Prepared",
    _communication_id: null,
    _outlook_mode: null,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, communicationId: data as string };
}

export async function recordEmailOpened(
  supabase: Db,
  _userId: string,
  input: {
    communicationId: string;
    caseId: string;
    taskId?: string | undefined;
    templateId: string;
    templateVersion: number;
    subject: string;
    recipient: string;
    outlookMode: "desktop_bridge" | "mailto";
  },
) {
  const { error } = await supabase.rpc("record_email_event", {
    _case_id: input.caseId,
    _task_id: input.taskId ?? null,
    _template_id: input.templateId,
    _template_version: input.templateVersion,
    _recipient: input.recipient,
    _subject: input.subject,
    _state: "Opened in Outlook",
    _communication_id: input.communicationId,
    _outlook_mode: input.outlookMode,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const };
}

export async function bindEmailComposeAttachments(
  supabase: Db,
  _userId: string,
  input: { composeSessionId: string; communicationId: string },
) {
  const { data, error } = await supabase.rpc("bind_email_compose_attachments", {
    _compose_session_id: input.composeSessionId,
    _communication_id: input.communicationId,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, bound: Number(data ?? 0) };
}

export async function requestTemporaryEmailAttachmentDeletion(
  supabase: Db,
  _userId: string,
  attachmentId: string,
) {
  const { data, error } = await supabase.rpc("request_temporary_email_attachment_deletion", {
    _attachment_id: attachmentId,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return { ok: true as const, storagePath: data as string };
}

export async function finalizeTemporaryEmailAttachmentDeletion(
  supabase: Db,
  _userId: string,
  attachmentId: string,
) {
  const { data, error } = await supabase.rpc("finalize_temporary_email_attachment_deletion", {
    _attachment_id: attachmentId,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  return data ? ({ ok: true as const } as const) : ({ error: "forbidden" as const } as const);
}

export async function completeEmailTask(
  supabase: Db,
  userId: string,
  input: {
    taskId?: string | undefined;
    caseId: string;
    templateId: string;
    subject: string;
    body: string;
    recipient: string;
    communicationId: string;
    templateVersion: number;
  },
) {
  const identity = await loadIdentity(supabase, userId);
  if (!identity) return { error: "access_denied" as const };
  const { data, error } = await supabase.rpc("record_email_event", {
    _task_id: input.taskId ?? null,
    _case_id: input.caseId,
    _template_id: input.templateId,
    _template_version: input.templateVersion,
    _subject: input.subject,
    _recipient: input.recipient,
    _state: "Marked Sent",
    _communication_id: input.communicationId,
    _outlook_mode: null,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  if (!data) return { error: "forbidden" as const };
  return { ok: true as const };
}

export async function assignChecklistOwner(
  supabase: Db,
  _userId: string,
  input: { itemId: string; ownerId: string | null },
) {
  const { data, error } = await supabase.rpc("assign_checklist_owner", {
    _item_id: input.itemId,
    _assignee_id: input.ownerId,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" as const };
    throw new Error(error.message);
  }
  if (data === false) return { error: "forbidden" as const };
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
    const patch: Record<string, string> = {
      name: input.name,
      updated_at: new Date().toISOString(),
    };
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

  const { data, error } = await supabase
    .from("labs")
    .insert({ name: input.name })
    .select("id")
    .single();
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
  input: {
    id?: string | undefined;
    name: string;
    labId: string;
    status?: "Active" | "Inactive" | undefined;
  },
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
