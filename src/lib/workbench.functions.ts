import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as wb from "./workbench.server";

export const getWorkbenchDataFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => wb.getWorkbenchData(context.supabase as wb.Db, context.userId));

export const getCaseDetailFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ caseId: z.string().uuid() }).parse(data))
  .handler(({ data, context }) =>
    wb.getCaseDetail(context.supabase as wb.Db, context.userId, data.caseId),
  );

export const shareCaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        caseId: z.string().uuid(),
        targetUserId: z.string().uuid(),
        accessLevel: z.enum(["viewer", "collaborator"]),
      })
      .parse(data),
  )
  .handler(({ data, context }) => wb.shareCase(context.supabase as wb.Db, context.userId, data));

export const removeMemberFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ memberId: z.string().uuid() }).parse(data))
  .handler(({ data, context }) =>
    wb.removeMember(context.supabase as wb.Db, context.userId, data.memberId),
  );

export const assignTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ taskId: z.string().uuid(), ownerId: z.string().uuid().nullable() }).parse(data),
  )
  .handler(({ data, context }) => wb.assignTask(context.supabase as wb.Db, context.userId, data));

export const createTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        caseId: z.string().uuid(),
        title: z.string().min(1).max(200),
        dueDate: z.string().max(10).optional(),
        priority: z.enum(["High", "Medium", "Low"]),
        ownerId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) => wb.createTask(context.supabase as wb.Db, context.userId, data));

export const toggleTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ taskId: z.string().uuid(), complete: z.boolean() }).parse(data),
  )
  .handler(({ data, context }) => wb.toggleTask(context.supabase as wb.Db, context.userId, data));

export const setTaskStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        taskId: z.string().uuid(),
        status: z.enum([
          "Not Started",
          "Open",
          "In Progress",
          "Waiting",
          "Blocked",
          "Completed",
          "Not Applicable",
        ]),
        comment: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) =>
    wb.setTaskStatus(context.supabase as wb.Db, context.userId, data),
  );

export const toggleChecklistFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ itemId: z.string().uuid(), complete: z.boolean() }).parse(data),
  )
  .handler(({ data, context }) =>
    wb.toggleChecklist(context.supabase as wb.Db, context.userId, data),
  );

const onboardingInput = z.object({
  personId: z.string().uuid().optional(),
  preferredName: z.string().max(60).optional(),
  employeeId: z.string().max(80).optional(),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  teamId: z.string().uuid().nullable().optional(),
  caseType: z.literal("onboarding"),
  employmentType: z.enum(["Employee", "Intern", "Leased Labour"]),
  startDate: z.string().length(10),
  role: z.string().max(120).optional(),
  location: z.string().max(120).optional(),
  supervisorName: z.string().min(1).max(120),
  supervisorEmail: z.union([z.string().email(), z.literal("")]).optional(),
  priority: z.enum(["High", "Medium", "Low"]),
  notes: z.string().max(2000).optional(),
  visaRequired: z.boolean().optional(),
});
export const createOnboardingCaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => onboardingInput.parse(d))
  .handler(({ data, context }) =>
    wb.createOnboardingCase(context.supabase as wb.Db, context.userId, data),
  );
export const createOffboardingCaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        personId: z.string().uuid(),
        employmentId: z.string().uuid(),
        contractEndDate: z.string().length(10),
        lastWorkingDay: z.string().length(10).optional(),
        leavingType: z.string().max(80).optional(),
        leavingReason: z.string().max(500).optional(),
        priority: z.enum(["High", "Medium", "Low"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(({ data, context }) =>
    wb.createOffboardingCase(context.supabase as wb.Db, context.userId, data),
  );
export const getPeopleFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => wb.getPeople(context.supabase as wb.Db, context.userId));
export const getPersonDetailFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ personId: z.string().uuid() }).parse(d))
  .handler(({ data, context }) =>
    wb.getPersonDetail(context.supabase as wb.Db, context.userId, data.personId),
  );
export const updatePersonIdentityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        personId: z.string().uuid(),
        employeeId: z.string().max(80).optional(),
        email: z.union([z.string().email(), z.literal("")]).optional(),
        phone: z.string().max(80).optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) =>
    wb.updatePersonIdentity(context.supabase as wb.Db, context.userId, data),
  );
export const findOnboardingCandidatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        employeeId: z.string().max(80).optional(),
        email: z.string().max(320).optional(),
        fullName: z.string().max(140),
        teamId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(({ data, context }) =>
    wb.findOnboardingCandidates(context.supabase as wb.Db, context.userId, data),
  );

export const setCaseConfirmationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ caseId: z.string().uuid(), confirmed: z.boolean() }).parse(data),
  )
  .handler(({ data, context }) =>
    wb.setCaseConfirmation(context.supabase as wb.Db, context.userId, data.caseId, data.confirmed),
  );

export const updateOffboardingDatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        caseId: z.string().uuid(),
        contractEndDate: z.string().length(10),
        lastWorkingDay: z.string().length(10).optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) =>
    wb.updateOffboardingDates(context.supabase as wb.Db, context.userId, data),
  );

export const getActiveRosterFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => wb.getActiveRoster(context.supabase as wb.Db, context.userId));

export const createExternalRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        workflowItemId: z.string().uuid(),
        recipientEmail: z.string().email().max(320),
        recipientName: z.string().max(120).optional(),
        recipientTeam: z.string().max(120).optional(),
        requestMessage: z.string().max(1000).optional(),
        dueDate: z.string().max(10).optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) =>
    wb.createExternalRequest(context.supabase as wb.Db, context.userId, data),
  );

export const updateWorkflowItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        itemId: z.string().uuid(),
        status: z.enum(["Not Started", "In Progress", "Blocked", "Completed", "Not Required"]),
      })
      .parse(data),
  )
  .handler(({ data, context }) =>
    wb.updateWorkflowItem(context.supabase as wb.Db, context.userId, data),
  );

export const saveUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        email: z.string().email().max(320).optional(),
        title: z.string().max(120).optional(),
        role: z.enum(["admin", "operator", "manager", "viewer"]),
        status: z.enum(["Active", "Inactive"]),
        scopeType: z.enum(["all_organization", "lab", "team", "assigned_cases"]).optional(),
        labId: z.string().uuid().nullable().optional(),
        teamId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) => wb.saveUser(context.supabase as wb.Db, context.userId, data));

export const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => wb.listTemplates(context.supabase as wb.Db, context.userId));

export const listPublishedTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => wb.listPublishedTemplates(context.supabase as wb.Db, context.userId));

export const saveTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(160),
        category: z.string().min(1).max(80),
        status: z.enum(["Draft", "Published"]),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(20000),
        variables: z.array(z.string().max(120)).max(50),
        description: z.string().max(1000).optional(),
        recipientSource: z.enum(["personal_email", "company_email", "manual"]).optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) => wb.saveTemplate(context.supabase as wb.Db, context.userId, data));

export const saveEmailDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        caseId: z.string().uuid(),
        templateId: z.string().uuid(),
        subject: z.string().min(1).max(300),
        body: z.string().max(20000),
        recipient: z.string().max(320),
      })
      .parse(data),
  )
  .handler(({ data, context }) =>
    wb.saveEmailDraft(context.supabase as wb.Db, context.userId, data),
  );

export const completeEmailTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        taskId: z.string().uuid(),
        caseId: z.string().uuid(),
        templateId: z.string().uuid(),
        subject: z.string().min(1).max(300),
        body: z.string().max(20000),
        recipient: z.string().max(320),
      })
      .parse(data),
  )
  .handler(({ data, context }) =>
    wb.completeEmailTask(context.supabase as wb.Db, context.userId, data),
  );

export const assignChecklistOwnerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ itemId: z.string().uuid(), ownerId: z.string().uuid().nullable() }).parse(data),
  )
  .handler(({ data, context }) =>
    wb.assignChecklistOwner(context.supabase as wb.Db, context.userId, data),
  );

export const saveLabFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        status: z.enum(["Active", "Inactive"]).optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) => wb.saveLab(context.supabase as wb.Db, context.userId, data));

export const saveTeamFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        labId: z.string().uuid(),
        status: z.enum(["Active", "Inactive"]).optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) => wb.saveTeam(context.supabase as wb.Db, context.userId, data));
