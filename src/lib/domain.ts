export const EMPLOYMENT_TYPES = ["Employee", "Intern", "Leased Labour"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_STATUSES = ["planned", "active", "ending", "ended", "cancelled"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
export const BUSINESS_TIME_ZONE = "Europe/Zurich";

export function businessDate(date = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric",month:"2-digit",day:"2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((p) => [p.type,p.value]));
  return `${value["year"]}-${value["month"]}-${value["day"]}`;
}

export function displayName(input:{preferredName?:string|null;givenName?:string|null;familyName?:string|null;fallback:string}) {
  return input.preferredName?.trim() || [input.givenName,input.familyName].filter(Boolean).join(" ").trim() || input.fallback;
}
