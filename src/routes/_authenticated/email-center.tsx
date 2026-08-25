import { createFileRoute } from "@tanstack/react-router";
import { EmailPage } from "./email";

export const Route=createFileRoute("/_authenticated/email-center")({
  validateSearch:(s:Record<string,unknown>)=>({caseId:typeof s["caseId"]==="string"?s["caseId"]:"",taskId:typeof s["taskId"]==="string"?s["taskId"]:""}),
  head:()=>({meta:[{title:"Email Center · Team Workbench"}]}),component:EmailPage,
});
