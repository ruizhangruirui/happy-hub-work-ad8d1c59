import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const migration=readFileSync(new URL("../../supabase/migrations/20260827100000_phase1_closure_hardening.sql",import.meta.url),"utf8");
const server=readFileSync(new URL("./workbench.server.ts",import.meta.url),"utf8");
describe("Phase 1 architecture contracts",()=>{
  it("removes the generic creation path",()=>{expect(server).not.toContain('rpc("create_workbench_case"');expect(migration).toContain("drop function public.create_workbench_case")});
  it("centralizes effective status",()=>{expect(migration).toContain("get_effective_employment_status");expect(migration).toContain("employment_effective");expect(migration).toContain("e.effective_status in('active','ending')")});
  it("uses atomic confirm/reopen",()=>expect(migration).toContain("transition_lifecycle_case"));
  it("enforces team scope inside definer RPCs",()=>{expect(migration).toContain("can_manage_team(auth.uid(),_team_id)");expect(migration).toContain("can_access_employment(auth.uid(),_employment_id)")});
  it("supports rehire and never name-auto-merges",()=>{expect(migration).toContain("Reused person for new employment");expect(migration).toContain("match_strength");expect(migration).toContain("Name-only")});
  it("prevents duplicate lifecycle cases",()=>{expect(migration).toContain("cases_one_open_onboarding_per_employment");expect(migration).toContain("cases_one_open_offboarding_per_employment")});
});
