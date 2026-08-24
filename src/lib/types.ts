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
  owner: string;
  ownerId: string;
  status: string;
  priority: string;
  accessLevel: AccessLevel;
  role: string | null;
  location: string | null;
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

export interface CaseDetailDto {
  case: CaseDto & {
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
}

export interface WorkbenchData {
  currentUser: CurrentUser;
  tasks: TaskDto[];
  cases: CaseDto[];
  sharedCases: CaseDto[];
  users: UserDto[];
  labs: { id: string; name: string }[];
  teams: { id: string; name: string; labId: string | null }[];
  permissions: Record<string, string[]>;
}
