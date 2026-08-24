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
  .handler(({ data, context }) => wb.getCaseDetail(context.supabase as wb.Db, context.userId, data.caseId));

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
  .handler(({ data, context }) => wb.removeMember(context.supabase as wb.Db, context.userId, data.memberId));

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
  .inputValidator((data) => z.object({ taskId: z.string().uuid(), complete: z.boolean() }).parse(data))
  .handler(({ data, context }) => wb.toggleTask(context.supabase as wb.Db, context.userId, data));

export const toggleChecklistFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ itemId: z.string().uuid(), complete: z.boolean() }).parse(data))
  .handler(({ data, context }) => wb.toggleChecklist(context.supabase as wb.Db, context.userId, data));

export const createCaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        firstName: z.string().min(1).max(60),
        lastName: z.string().min(1).max(60),
        email: z.union([z.string().email().max(320), z.literal("")]).optional(),
        teamId: z.string().uuid().nullable().optional(),
        caseType: z.enum(["onboarding", "offboarding"]),
        employmentType: z.enum(["Employee", "Intern", "Contractor"]),
        startDate: z.string().min(4).max(10),
        endDate: z.string().max(10).optional(),
        role: z.string().max(120).optional(),
        location: z.string().max(120).optional(),
        supervisorName: z.string().min(1).max(120),
        supervisorEmail: z.union([z.string().email().max(320), z.literal("")]).optional(),
        priority: z.enum(["High", "Medium", "Low"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(({ data, context }) => wb.createCase(context.supabase as wb.Db, context.userId, data));

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
  .handler(({ data, context }) => wb.saveEmailDraft(context.supabase as wb.Db, context.userId, data));

export const assignChecklistOwnerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ itemId: z.string().uuid(), ownerId: z.string().uuid().nullable() }).parse(data),
  )
  .handler(({ data, context }) => wb.assignChecklistOwner(context.supabase as wb.Db, context.userId, data));

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
