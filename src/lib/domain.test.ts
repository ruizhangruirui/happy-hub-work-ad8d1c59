import {describe,expect,it} from "vitest";
import {businessDate,displayName,EMPLOYMENT_TYPES} from "./domain";
describe("canonical HR domain",()=>{
  it("uses Zurich business date across UTC midnight",()=>expect(businessDate(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-02"));
  it("uses preferred display name",()=>expect(displayName({preferredName:"Rui",givenName:"Ruiying",familyName:"Zhang",fallback:"Unknown"})).toBe("Rui"));
  it("keeps one employment vocabulary",()=>expect(EMPLOYMENT_TYPES).toEqual(["Employee","Intern","Leased Labour"]));
});
