import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { Badge, Icon, Loading } from "@/components/workbench/ui";

type PublicRequest = { id:string;personName:string;taskTitle:string;taskDescription:string|null;requestMessage:string|null;recipientName:string|null;recipientTeam:string|null;status:string;responseNote:string|null;dueDate:string|null;expiresAt:string;expired:boolean };

export const Route = createFileRoute("/respond/$token")({ ssr:false, head:()=>({meta:[{title:"Task Feedback · Team Workbench"}]}), component:ExternalFeedbackPage });

async function loadRequest(token:string,email:string):Promise<PublicRequest|null> {
  const {data,error}=await (supabase as any).rpc("get_external_collaboration_request",{_token:token,_recipient_email:email});
  if(error) throw error; return data as PublicRequest|null;
}

function ExternalFeedbackPage(){
  const {token}=Route.useParams();const {t,lang,setLang}=useLang();
  const [email,setEmail]=useState("");const [verifiedEmail,setVerifiedEmail]=useState("");
  const {data,isLoading,refetch}=useQuery({queryKey:["external-feedback",token,verifiedEmail],queryFn:()=>loadRequest(token,verifiedEmail),enabled:Boolean(verifiedEmail)});
  const [status,setStatus]=useState("Acknowledged");const [note,setNote]=useState("");const [busy,setBusy]=useState(false);
  if(!verifiedEmail)return <FeedbackShell><button className="langtoggle feedbacklang" onClick={()=>setLang(lang==="en"?"zh":"en")}>{lang==="en"?"中文":"EN"}</button><div className="feedbackcard"><div className="feedbackbrand"><span className="brandmark">TW</span><div><b>TEAM WORKBENCH</b><span>{t("Secure task feedback")}</span></div></div><div className="feedbackverify"><Icon name="lock"/><h1>{t("Verify your email")}</h1><p>{t("Enter the email address that received this request.")}</p><label><span>{t("Email")}</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&email.includes("@"))setVerifiedEmail(email)}}/></label><button className="primary feedbacksubmit" disabled={!email.includes("@")} onClick={()=>setVerifiedEmail(email)}>{t("Continue")}</button></div></div></FeedbackShell>;
  if(isLoading)return <Loading/>;
  if(!data)return <FeedbackShell><div className="feedbackempty"><Icon name="lock"/><h1>{t("Feedback link unavailable")}</h1><p>{t("This link is invalid or no longer available.")}</p></div></FeedbackShell>;
  const submit=async()=>{setBusy(true);try{const {data:ok,error}=await (supabase as any).rpc("respond_external_collaboration_request",{_token:token,_recipient_email:verifiedEmail,_status:status,_response_note:note||null});if(error)throw error;if(!ok)throw new Error("invalid");await refetch();toast.success(t("Progress updated. Thank you!"));}catch{toast.error(t("We could not save your response. The link may have expired."));}finally{setBusy(false)}};
  return <FeedbackShell><button className="langtoggle feedbacklang" onClick={()=>setLang(lang==="en"?"zh":"en")}>{lang==="en"?"中文":"EN"}</button><div className="feedbackcard">
    <div className="feedbackbrand"><span className="brandmark">TW</span><div><b>TEAM WORKBENCH</b><span>{t("External task update")}</span></div></div>
    {data.expired?<div className="feedbackempty"><Icon name="clock"/><h1>{t("Feedback link expired")}</h1><p>{t("Please contact the HR team for a new link.")}</p></div>:<>
      <p className="eyebrow">{t("ACTION REQUESTED")}</p><h1>{t(data.taskTitle)}</h1><p className="feedbackperson">{data.personName}</p>
      {data.taskDescription?<p className="feedbackdesc">{t(data.taskDescription)}</p>:null}{data.requestMessage?<div className="requestnote">{data.requestMessage}</div>:null}
      <div className="feedbackfacts"><div><span>{t("Requested for")}</span><b>{data.recipientName||data.recipientTeam||t("External collaborator")}</b></div><div><span>{t("Due Date")}</span><b>{fmtDate(data.dueDate,lang)}</b></div><div><span>{t("Current Status")}</span><Badge>{data.status}</Badge></div></div>
      <label><span>{t("Update progress")}</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="Acknowledged">{t("Acknowledged")}</option><option value="In Progress">{t("In Progress")}</option><option value="Completed">{t("Completed")}</option><option value="Blocked">{t("I have a problem")}</option></select></label>
      <label><span>{t("Comment (optional)")}</span><textarea rows={4} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder={t("Add a short update for the HR team")}/></label>
      <button className="primary feedbacksubmit" disabled={busy} onClick={submit}><Icon name="check"/>{busy?t("Saving…"):t("Send update")}</button><p className="feedbackprivacy"><Icon name="lock"/>{t("Only this task is shown. No Team Workbench account is required.")}</p>
    </>}
  </div></FeedbackShell>;
}

function FeedbackShell({children}:{children:React.ReactNode}){return <main className="feedbackpage">{children}</main>}
