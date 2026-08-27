export const EMPLOYMENT_TYPES = ["Employee", "Intern", "Leased Labour"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_STATUSES = ["planned", "active", "ending", "ended", "cancelled"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
export const BUSINESS_TIME_ZONE = "Europe/Zurich";

export function businessDate(date = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${value["year"]}-${value["month"]}-${value["day"]}`;
}

export function displayName(input: {
  preferredName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  fallback: string;
}) {
  return (
    input.preferredName?.trim() ||
    [input.givenName, input.familyName].filter(Boolean).join(" ").trim() ||
    input.fallback
  );
}

export function effectiveEmploymentStatus(
  input: {
    storedStatus: string;
    startDate: string | null;
    confirmedOnboarding: boolean;
    confirmedOffboardingDate: string | null;
  },
  today: string,
): EmploymentStatus {
  if (input.storedStatus === "cancelled") return "cancelled";
  if (input.confirmedOffboardingDate)
    return input.confirmedOffboardingDate < today ? "ended" : "ending";
  if (!input.confirmedOnboarding) return "planned";
  return input.startDate && input.startDate > today ? "planned" : "active";
}

export function taskDateBuckets<T extends { due: string | null }>(
  tasks: T[],
  today: string,
  windowDays = 14,
) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + windowDays);
  const through = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;
  return {
    overdue: tasks.filter((x) => x.due && x.due < today),
    dueSoon: tasks.filter((x) => x.due && x.due >= today && x.due <= through),
  };
}

export function taskProgressSummary<T extends { status: string; mandatory?: boolean }>(
  tasks: T[],
  mandatoryOnly = false,
) {
  const candidates = mandatoryOnly ? tasks.filter((task) => task.mandatory !== false) : tasks;
  const applicable = candidates.filter((task) => task.status !== "Not Applicable");
  const completed = applicable.filter((task) => task.status === "Completed").length;
  return {
    completed,
    applicable: applicable.length,
    notApplicable: candidates.length - applicable.length,
    percent: applicable.length
      ? Math.round((completed / applicable.length) * 100)
      : candidates.length
        ? 100
        : 0,
  };
}
