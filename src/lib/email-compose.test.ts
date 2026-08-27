import { describe, expect, it } from "vitest";
import {
  extractEmailVariableKeys,
  resolveEmailVariables,
  resolveRecipient,
  validateEmailTemplate,
} from "./email-compose";
import type { EmailVariableDto, TemplateDto } from "./types";

const variable = (key: string, overrides: Partial<EmailVariableDto> = {}): EmailVariableDto => ({
  key,
  displayName: key,
  dataType: "text",
  sourceType: "person",
  sourceField: key,
  required: false,
  defaultValue: null,
  description: null,
  ...overrides,
});
const template = (overrides: Partial<TemplateDto> = {}): TemplateDto => ({
  id: "template",
  name: "Welcome",
  category: "Onboarding",
  status: "Published",
  updatedAt: "2026-08-28",
  subject: "Hello {{employee_name}}",
  body: "Start {{start_date}} {{optional_note}}",
  variables: ["employee_name", "start_date", "optional_note"],
  applicableCaseTypes: ["onboarding"],
  version: 1,
  description: "",
  recipientSource: "personal_email",
  variableDefinitions: [],
  attachments: [],
  archivedAt: null,
  createdAt: "2026-08-28",
  ...overrides,
});

describe("Email Center V2 deterministic compose service", () => {
  const globals = [
    variable("employee_name", { sourceField: "display_name", required: true }),
    variable("start_date", { sourceType: "onboarding_case", dataType: "date" }),
    variable("optional_note", { sourceType: "manual" }),
    variable("last_working_day", {
      sourceType: "offboarding_case",
      sourceField: "last_working_day",
      dataType: "date",
    }),
  ];

  it("resolves Person and Case variables and removes an empty optional token", () => {
    const result = resolveEmailVariables({
      template: template(),
      globalVariables: globals,
      sources: {
        person: { display_name: "Peter Müller" },
        onboarding_case: { start_date: "2026-09-01" },
      },
      locale: "en-GB",
    });
    expect(result.renderedSubject).toBe("Hello Peter Müller");
    expect(result.renderedBody).toBe("Start 01/09/2026 ");
    expect(result.renderedBody).not.toContain("{{");
  });

  it("resolves an offboarding date", () => {
    const result = resolveEmailVariables({
      template: template({ body: "Your last working day is {{last_working_day}}." }),
      globalVariables: globals,
      sources: { offboarding_case: { last_working_day: "2026-12-31" } },
      locale: "en-GB",
    });
    expect(result.renderedBody).toBe("Your last working day is 31/12/2026.");
  });

  it("blocks a missing required manual variable without leaking the token", () => {
    const meetingRoom = variable("meeting_room", { sourceType: "manual", required: true });
    const result = resolveEmailVariables({
      template: template({ body: "Meet at {{meeting_room}}", variableDefinitions: [meetingRoom] }),
      globalVariables: globals,
      sources: {},
    });
    expect(result.missingRequired.map((item) => item.key)).toEqual([
      "employee_name",
      "meeting_room",
    ]);
    expect(result.renderedBody).toBe("Meet at ");
  });

  it("uses an explicit recipient override without mutating profile data", () => {
    const profile = { personalEmail: "peter@example.com", companyEmail: "peter@company.com" };
    expect(resolveRecipient({ source: "personal_email", ...profile })).toBe("peter@example.com");
    expect(resolveRecipient({ source: "company_email", ...profile })).toBe("peter@company.com");
    expect(
      resolveRecipient({ source: "personal_email", ...profile, override: "other@example.com" }),
    ).toBe("other@example.com");
    expect(profile.personalEmail).toBe("peter@example.com");
  });

  it("rejects unknown variables for publication", () => {
    expect(validateEmailTemplate(template({ body: "{{unknown_xyz}}" }), globals)).toContain(
      "Unknown variable: {{unknown_xyz}}",
    );
    expect(extractEmailVariableKeys("{{employee_name}}", "{{employee_name}}")).toEqual([
      "employee_name",
    ]);
  });
});
