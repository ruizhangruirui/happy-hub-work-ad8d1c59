import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route=createFileRoute("/_authenticated/email-center")({
  validateSearch:(s:Record<string,unknown>)=>({caseId:typeof s["caseId"]==="string"?s["caseId"]:"",taskId:typeof s["taskId"]==="string"?s["taskId"]:""}),
  beforeLoad:({search})=>{throw redirect({to:"/email",search})},
});
