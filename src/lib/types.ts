export type AccessLevel = "Owner" | "Collaborator" | "Viewer" | "Scoped" | "None";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: string;
  scopes: string[];
}

export interface UserDto {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  role: string;
  status: string;
  scopes: string[];
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
  ownerId: string | null;
  ownerName: string;
  checklistItemId: string | null;
  completedAt: string | null;
  assigneeRole: string | null;
  defaultTaskKey: string | null;
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

export interface CaseDetailDto {
  case: CaseDto & {
    givenName: string | null;
    preferredName: string | null;
    personEmail: string | null;
    employeeId: string | null;
    phone: string | null;
    managerName: string | null;
    workload: string | null;
    contractType: string | null;
    notes: string | null;
  };
  checklist: ChecklistDto[];
  members: MemberDto[];
  history: HistoryDto[];
  files: FileDto[];
  workflow: WorkflowItemDto[];
  tasks: TaskDto[];
  externalRequests: ExternalRequestDto[];
  assignableUsers: { id: string; name: string }[];
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
}

export interface PeopleRowDto { personId:string;displayName:string;givenName:string|null;familyName:string|null;preferredName:string|null;email:string|null;employmentId:string|null;employeeId:string|null;employmentType:string|null;role:string|null;team:string;teamId:string|null;location:string|null;status:string;startDate:string|null;endDate:string|null;supervisorName:string|null; }
export interface PersonCandidateDto {personId:string;displayName:string;email:string|null;employeeId:string|null;matchStrength:"strong"|"warning";matchReason:"employee_id"|"email"|"name";lastEmploymentType:string|null;lastTeam:string|null;lastEndDate:string|null}
export interface PersonDetailDto { person:PeopleRowDto & {phone:string|null}; employments:Array<{id:string;employmentType:string;employeeId:string|null;role:string|null;team:string;location:string|null;status:string;startDate:string|null;endDate:string|null;supervisorName:string|null;workload:number|null;contractType:string|null}>; cases:CaseDto[]; }

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
