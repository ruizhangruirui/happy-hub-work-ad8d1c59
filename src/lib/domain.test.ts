import {describe,expect,it} from "vitest";
import {businessDate,displayName,effectiveEmploymentStatus,EMPLOYMENT_TYPES,taskDateBuckets} from "./domain";
describe("canonical HR domain",()=>{
  it("uses Zurich business date across UTC midnight",()=>expect(businessDate(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-02"));
  it("uses preferred display name",()=>expect(displayName({preferredName:"Rui",givenName:"Ruiying",familyName:"Zhang",fallback:"Unknown"})).toBe("Rui"));
  it("keeps one employment vocabulary",()=>expect(EMPLOYMENT_TYPES).toEqual(["Employee","Intern","Leased Labour"]));
  const base={storedStatus:"active",startDate:"2026-09-01",confirmedOnboarding:true,confirmedOffboardingDate:null};
  it("derives future start without mutation",()=>{expect(effectiveEmploymentStatus(base,"2026-08-31")).toBe("planned");expect(effectiveEmploymentStatus(base,"2026-09-01")).toBe("active")});
  it("derives current active employment",()=>expect(effectiveEmploymentStatus({...base,startDate:"2026-01-01"},"2026-08-27")).toBe("active"));
  it("derives future and passed exit",()=>{expect(effectiveEmploymentStatus({...base,confirmedOffboardingDate:"2026-09-30"},"2026-08-27")).toBe("ending");expect(effectiveEmploymentStatus({...base,confirmedOffboardingDate:"2026-08-26"},"2026-08-27")).toBe("ended")});
  it("keeps cancelled terminal",()=>expect(effectiveEmploymentStatus({...base,storedStatus:"cancelled"},"2026-08-27")).toBe("cancelled"));
  it("separates overdue from due soon",()=>{const b=taskDateBuckets([{due:"2026-08-26"},{due:"2026-08-27"},{due:"2026-09-10"}],"2026-08-27");expect(b.overdue).toHaveLength(1);expect(b.dueSoon).toHaveLength(2)});
});
