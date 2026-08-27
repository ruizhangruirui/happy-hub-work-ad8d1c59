import type { EmailAttachmentDto, EmailVariableDto, TemplateDto } from "./types";

export type EmailSourceData = Record<string, Record<string, unknown> | undefined>;

export interface EmailComposeResult {
  resolvedValues: Record<string, string>;
  missingRequired: EmailVariableDto[];
  unknownVariables: string[];
  renderedSubject: string;
  renderedBody: string;
}

export interface OutlookAttachment extends EmailAttachmentDto {
  downloadUrl?: string;
  source: "template" | "additional";
}

const TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
export const EMAIL_VARIABLE_KEY = /^[a-z][a-z0-9_]*$/;

export function extractEmailVariableKeys(subject: string, body: string): string[] {
  return [...new Set([...`${subject}\n${body}`.matchAll(TOKEN)].map((match) => match[1]!))];
}

export function validateEmailTemplate(
  template: Pick<
    TemplateDto,
    "name" | "subject" | "body" | "recipientSource" | "variableDefinitions"
  >,
  globalVariables: EmailVariableDto[],
): string[] {
  const errors: string[] = [];
  if (!template.name.trim()) errors.push("Template name is required");
  if (!template.subject.trim()) errors.push("Subject is required");
  if (!template.body.trim()) errors.push("Body is required");
  if (!template.recipientSource) errors.push("Recipient source is required");
  const definitions = new Map(
    [...globalVariables, ...template.variableDefinitions].map((definition) => [
      definition.key,
      definition,
    ]),
  );
  for (const key of extractEmailVariableKeys(template.subject, template.body)) {
    if (!EMAIL_VARIABLE_KEY.test(key)) errors.push(`Invalid variable key: ${key}`);
    else if (!definitions.has(key)) errors.push(`Unknown variable: {{${key}}}`);
  }
  return errors;
}

function formatValue(value: unknown, dataType: string, locale: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (dataType.toLowerCase() === "date") {
    const raw = String(value);
    const date = new Date(`${raw.slice(0, 10)}T12:00:00Z`);
    if (!Number.isNaN(date.valueOf())) return new Intl.DateTimeFormat(locale).format(date);
  }
  if (dataType.toLowerCase() === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function resolveEmailVariables(input: {
  template: TemplateDto;
  globalVariables: EmailVariableDto[];
  sources: EmailSourceData;
  manualValues?: Record<string, string>;
  locale?: string;
}): EmailComposeResult {
  const { template, globalVariables, sources, manualValues = {}, locale = "en-GB" } = input;
  const definitions = new Map<string, EmailVariableDto>();
  for (const definition of [...globalVariables, ...template.variableDefinitions]) {
    definitions.set(definition.key, definition);
  }
  const keys = extractEmailVariableKeys(template.subject, template.body);
  const resolvedValues: Record<string, string> = {};
  const missingRequired: EmailVariableDto[] = [];
  const unknownVariables: string[] = [];
  for (const key of keys) {
    const definition = definitions.get(key);
    if (!definition) {
      unknownVariables.push(key);
      resolvedValues[key] = "";
      continue;
    }
    const raw =
      manualValues[key] ??
      (definition.sourceType === "manual"
        ? definition.defaultValue
        : sources[definition.sourceType]?.[definition.sourceField ?? key]) ??
      definition.defaultValue;
    const value = formatValue(raw, definition.dataType, locale);
    resolvedValues[key] = value;
    if (definition.required && !value.trim()) missingRequired.push(definition);
  }
  const render = (text: string) =>
    text.replace(TOKEN, (_token, key: string) => resolvedValues[key] ?? "");
  return {
    resolvedValues,
    missingRequired,
    unknownVariables,
    renderedSubject: render(template.subject),
    renderedBody: render(template.body),
  };
}

export function resolveRecipient(input: {
  source: TemplateDto["recipientSource"];
  personalEmail?: string | null | undefined;
  companyEmail?: string | null | undefined;
  override?: string;
}): string {
  if (input.override?.trim()) return input.override.trim();
  if (input.source === "personal_email") return input.personalEmail?.trim() ?? "";
  if (input.source === "company_email") return input.companyEmail?.trim() ?? "";
  return "";
}
