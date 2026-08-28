export type AccessLevel = "Owner" | "Collaborator" | "Viewer" | "Scoped" | "None";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: string;
  scopes: string[];
  operationalTeams: Array<"HR" | "IT" | "Admin">;
}

export interface UserDto {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  role: string;
  status: string;
  scopes: string[];
  operationalTeams: Array<"HR" | "IT" | "Admin">;
}

export interface TaskDto {
  id: string;
  title: string;
  person: string;
  caseId: string | null;
  caseType: string | null;
  due: string | null;
  priority: string;
  status: string;
  email: boolean;
  taskType: "Task" | "Email";
  preferredEmailTemplateId: string | null;
  ownerId: string | null;
  ownerName: string;
  checklistItemId: string | null;
  completedAt: string | null;
  assigneeRole: string | null;
  defaultTaskKey: string | null;
  description: string | null;
  ownerTeam: "HR" | "IT" | "Admin";
  mandatory: boolean;
  completedByName: string | null;
  personTeam: string;
  startDate: string | null;
  contractEndDate: string | null;
  lastWorkingDay: string | null;
  templateItemId: string | null;
  source: "template" | "manual";
  notApplicableReason: string | null;
  canEdit: boolean;
}

export interface TaskCommentDto {
  id: string;
  taskId: string;
  authorName: string;
  authorTeam: string | null;
  body: string;
  at: string;
}

export interface ChecklistTemplateItemDto {
  id: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  key: string;
  caseType: "Onboarding" | "Offboarding";
  title: string;
  description: string | null;
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
  preferredEmailTemplateId: string | null;
}

export interface ChecklistTemplateDto {
  id: string;
  key: string;
  name: string;
  caseType: "Onboarding" | "Offboarding";
  description: string | null;
  active: boolean;
  version: number;
}

export interface CaseDto {
  id: string;
  name: string;
  initials: string;
  caseType: string;
  employmentType: string;
  team: string;
  startDate: string;
  endDate: string | null;
  effectiveDate: string | null;
  employmentId: string | null;
  owner: string;
  ownerId: string;
  status: string;
  priority: string;
  accessLevel: AccessLevel;
  role: string | null;
  location: string | null;
  supervisorName: string | null;
  supervisorEmail: string | null;
  contractEndDate: string | null;
  lastWorkingDay: string | null;
  joinedDate: string | null;
  joinedAt: string | null;
  leftDate: string | null;
  leftAt: string | null;
  leavingType: string | null;
}

export interface OperationsOverviewDto {
  businessDate: string;
  metrics: {
    activePeople: number;
    preboarding: number;
    leaving: number;
    joinedYtd: number;
    leftYtd: number;
  };
  activePeople: Array<{
    personId: string;
    caseId: string;
    name: string;
    employeeId: string | null;
    employmentType: string;
    team: string;
    role: string | null;
    location: string | null;
    supervisorName: string | null;
    startDate: string;
    leaving: boolean;
    lastWorkingDay: string | null;
  }>;
  upcomingJoiners: OperationsCaseSummaryDto[];
  upcomingLeavers: OperationsCaseSummaryDto[];
  attentionCases: Array<{
    caseId: string;
    taskId: string | null;
    name: string;
    caseType: string;
    severity: "Critical" | "Warning" | "Info";
    reason: string;
  }>;
  taskWorkload: Array<{
    ownerTeam: "HR" | "IT" | "Admin";
    open: number;
    overdue: number;
    dueSoon: number;
    unassigned: number;
  }>;
  activeByEmploymentType: Array<{ name: string; value: number }>;
  activeByTeam: Array<{ name: string; value: number }>;
  monthlyLifecycleTrend: Array<{ month: string; joined: number; left: number }>;
  tasks: OperationsTaskReportDto[];
}

export interface OperationsCaseSummaryDto {
  caseId: string;
  name: string;
  team: string;
  employmentType: string;
  startDate?: string | null;
  lastWorkingDay?: string | null;
  contractEndDate?: string | null;
  leavingType?: string | null;
  status: string;
  mandatoryCompleted: number;
  mandatoryTotal: number;
  overdueTasks: number;
}

export interface OperationsTaskReportDto {
  id: string;
  caseId: string;
  title: string;
  person: string;
  caseType: string;
  ownerTeam: "HR" | "IT" | "Admin";
  assignee: string | null;
  mandatory: boolean;
  status: string;
  dueDate: string | null;
  completedBy: string | null;
  completedAt: string | null;
}

export interface ChecklistDto {
  id: string;
  title: string;
  section: string;
  status: string;
  ownerId: string | null;
  ownerName: string;
  dueDate: string | null;
  completedDate: string | null;
  completedByName: string | null;
  taskId: string | null;
  ownerTeam: "HR" | "IT" | "Admin";
  canEdit: boolean;
}

export interface CaseCapabilitiesDto {
  canManageCase: boolean;
  canConfirmLifecycle: boolean;
  canManageTaskStructure: boolean;
  canManageChecklistRules: boolean;
  canManageWorkflow: boolean;
  canManageFiles: boolean;
  canShareCase: boolean;
  canViewFullCase: boolean;
  canComposeEmail: boolean;
}

export interface MemberDto {
  id: string;
  userId: string;
  name: string;
  accessLevel: string;
}

export interface HistoryDto {
  id: string;
  actorName: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  at: string;
}

export interface FileDto {
  id: string;
  filename: string;
  size: number | null;
  contentType: string | null;
  at: string;
  uploadedByName: string;
}

export interface WorkflowItemDto {
  id: string;
  key: string;
  title: string;
  description: string | null;
  sequence: number;
  targetDate: string | null;
  status: "Not Started" | "In Progress" | "Blocked" | "Completed" | "Not Required";
  completedAt: string | null;
  completedByName: string | null;
}

export interface ExternalRequestDto {
  id: string;
  workflowItemId: string;
  recipientEmail: string;
  recipientName: string | null;
  recipientTeam: string | null;
  status: string;
  responseNote: string | null;
  dueDate: string | null;
  expiresAt: string;
  createdAt: string;
  respondedAt: string | null;
}

export interface EmailCommunicationDto {
  communicationId: string;
  taskId: string | null;
  templateId: string | null;
  templateName: string;
  templateVersion: number | null;
  recipient: string;
  renderedSubject: string;
  state: "Draft Prepared" | "Opened in Outlook" | "Marked Sent";
  outlookMode: string | null;
  preparedBy: string;
  preparedAt: string;
  openedAt: string | null;
  markedSentAt: string | null;
  attachments: { id: string; filename: string; size: number; contentType: string | null }[];
}

export interface CaseDetailDto {
  case: CaseDto & {
    givenName: string | null;
    preferredName: string | null;
    personEmail: string | null;
    companyEmail: string | null;
    employeeId: string | null;
    phone: string | null;
    managerName: string | null;
    workload: string | null;
    contractType: string | null;
    leavingReason: string | null;
    notes: string | null;
  };
  checklist: ChecklistDto[];
  members: MemberDto[];
  history: HistoryDto[];
  files: FileDto[];
  workflow: WorkflowItemDto[];
  tasks: TaskDto[];
  externalRequests: ExternalRequestDto[];
  taskComments: TaskCommentDto[];
  assignableUsers: { id: string; name: string; operationalTeams: string[] }[];
  capabilities: CaseCapabilitiesDto;
  communications: EmailCommunicationDto[];
}

export interface TemplateDto {
  id: string;
  name: string;
  category: string;
  status: string;
  updatedAt: string;
  subject: string;
  body: string;
  variables: string[];
  applicableCaseTypes: string[];
  version: number;
  description: string;
  recipientSource: "personal_email" | "company_email" | "manual";
  variableDefinitions: EmailVariableDto[];
  attachments: EmailAttachmentDto[];
  archivedAt: string | null;
  createdAt: string;
}

export interface EmailVariableDto {
  key: string;
  displayName: string;
  dataType: string;
  sourceType: string;
  sourceField: string | null;
  required: boolean;
  defaultValue: string | null;
  description: string | null;
  choices?: string[];
}
export interface EmailAttachmentDto {
  id: string;
  filename: string;
  storagePath: string;
  contentType: string | null;
  size: number;
}

export interface EmailComposeDataDto {
  templates: TemplateDto[];
  globalVariables: EmailVariableDto[];
  canManageTemplates: boolean;
}

export interface PeopleRowDto {
  personId: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  preferredName: string | null;
  email: string | null;
  employmentId: string | null;
  employeeId: string | null;
  employmentType: string | null;
  role: string | null;
  team: string;
  teamId: string | null;
  location: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  supervisorName: string | null;
}
export interface PersonCandidateDto {
  personId: string | null;
  displayName: string;
  email: string | null;
  employeeId: string | null;
  matchStrength: "strong" | "warning";
  matchReason: "employee_id" | "email" | "name" | "restricted";
  lastEmploymentType: string | null;
  lastTeam: string | null;
  lastEndDate: string | null;
  accessible: boolean;
}
export interface PersonDetailDto {
  person: PeopleRowDto & { phone: string | null };
  employments: Array<{
    id: string;
    employmentType: string;
    employeeId: string | null;
    role: string | null;
    team: string;
    location: string | null;
    status: string;
    startDate: string | null;
    endDate: string | null;
    supervisorName: string | null;
    workload: number | null;
    contractType: string | null;
  }>;
  cases: CaseDto[];
}

export interface RosterPersonDto {
  personId: string;
  caseId: string;
  name: string;
  email: string | null;
  employeeId: string | null;
  phone: string | null;
  employmentType: string;
  role: string | null;
  location: string | null;
  team: string;
  startDate: string;
  supervisorName: string | null;
  leaving: boolean;
  lastWorkingDay: string | null;
}

export interface WorkbenchData {
  currentUser: CurrentUser;
  tasks: TaskDto[];
  cases: CaseDto[];
  sharedCases: CaseDto[];
  users: UserDto[];
  labs: { id: string; name: string; status: string }[];
  teams: { id: string; name: string; labId: string | null; status: string }[];
  permissions: Record<string, string[]>;
}
