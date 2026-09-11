export interface PeopleImportRow {
  rowNumber: number;
  givenName: string;
  familyName: string;
  preferredName?: string;
  personalEmail?: string;
  companyEmail?: string;
  employeeId?: string;
  phone?: string;
  employmentType: "Employee" | "Intern" | "Leased Labour";
  team?: string;
  role?: string;
  location?: string;
  supervisorName?: string;
  supervisorEmail?: string;
  workload?: number;
  contractType?: string;
  startDate: string;
  endDate?: string;
}

const aliases: Record<string, keyof PeopleImportRow> = {
  firstname: "givenName",
  givenname: "givenName",
  名: "givenName",
  lastname: "familyName",
  familyname: "familyName",
  姓: "familyName",
  preferredname: "preferredName",
  常用名: "preferredName",
  personalemail: "personalEmail",
  email: "personalEmail",
  个人邮箱: "personalEmail",
  companyemail: "companyEmail",
  公司邮箱: "companyEmail",
  employeeid: "employeeId",
  employeenumber: "employeeId",
  员工编号: "employeeId",
  工号: "employeeId",
  phone: "phone",
  电话: "phone",
  employmenttype: "employmentType",
  用工类型: "employmentType",
  team: "team",
  团队: "team",
  role: "role",
  title: "role",
  roletitle: "role",
  职位: "role",
  location: "location",
  工作地点: "location",
  supervisor: "supervisorName",
  supervisorname: "supervisorName",
  主管: "supervisorName",
  supervisoremail: "supervisorEmail",
  主管邮箱: "supervisorEmail",
  workload: "workload",
  工作量: "workload",
  contracttype: "contractType",
  合同类型: "contractType",
  startdate: "startDate",
  入职日期: "startDate",
  enddate: "endDate",
  contractenddate: "endDate",
  合同结束日期: "endDate",
};

const cleanHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-/]+/g, "");

function isoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.valueOf()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  return match ? `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}` : text;
}

export function normalizePeopleImportRows(rows: Record<string, unknown>[]): PeopleImportRow[] {
  return rows
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()))
    .map((row, index) => {
      const mapped: Record<string, unknown> = {};
      for (const [header, value] of Object.entries(row)) {
        const field = aliases[cleanHeader(header)];
        if (field) mapped[field] = value;
      }
      const employmentType = String(mapped["employmentType"] ?? "").trim();
      if (!mapped["givenName"] || !mapped["familyName"] || !mapped["startDate"] || !employmentType)
        throw new Error(
          `Row ${index + 2}: First Name, Last Name, Employment Type and Start Date are required.`,
        );
      if (!["Employee", "Intern", "Leased Labour"].includes(employmentType))
        throw new Error(
          `Row ${index + 2}: Employment Type must be Employee, Intern or Leased Labour.`,
        );
      const workload = String(mapped["workload"] ?? "").trim();
      const result: PeopleImportRow = {
        rowNumber: index + 2,
        givenName: String(mapped["givenName"]).trim(),
        familyName: String(mapped["familyName"]).trim(),
        employmentType: employmentType as PeopleImportRow["employmentType"],
        startDate: isoDate(mapped["startDate"]),
      };
      for (const key of [
        "preferredName",
        "personalEmail",
        "companyEmail",
        "employeeId",
        "phone",
        "team",
        "role",
        "location",
        "supervisorName",
        "supervisorEmail",
        "contractType",
      ] as const) {
        const value = String(mapped[key] ?? "").trim();
        if (value) result[key] = value;
      }
      const endDate = isoDate(mapped["endDate"]);
      if (endDate) result.endDate = endDate;
      if (workload) result.workload = Number(workload);
      return result;
    });
}

export const PEOPLE_IMPORT_COLUMNS = [
  "First Name",
  "Last Name",
  "Preferred Name",
  "Personal Email",
  "Company Email",
  "Employee ID",
  "Phone",
  "Employment Type",
  "Team",
  "Role / Title",
  "Location",
  "Supervisor",
  "Supervisor Email",
  "Workload",
  "Contract Type",
  "Start Date",
  "End Date",
];
