import { v } from "convex/values";
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { env, httpAction, internalQuery } from "./_generated/server";
import { answerText } from "./formLogic";
import { sha256Hex } from "./serverUtils";
import { CREDIT_LABEL, validPublicAlias } from "../lib/maxFeedback";

const SHARE_ID="y4h9v9c43d";
const KIND="qb89e8cad1a", MESSAGE="qff64dd6583", AREA="q4e9d6d55ea", VERSION="qbc34d35e5d";
const equal=async(a:string,b:string)=>{
  const [x,y]=await Promise.all([sha256Hex(a),sha256Hex(b)]);
  let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;
};

/** Only this one form, only completed non-spam reports, no account identity or hidden fields. */
export const page = internalQuery({
  args:{paginationOpts:paginationOptsValidator},
  handler:async(ctx,{paginationOpts})=>{
    const form=await ctx.db.query("forms").withIndex("by_shareId",q=>q.eq("shareId",SHARE_ID)).unique();
    if(!form||form.pendingDeleteAt||form.isBanned)throw new Error("Feedback source unavailable");
    const batch=await ctx.db.query("formResponses").withIndex("by_form_status_spam_submitted",q=>q.eq("formId",form._id).eq("status","completed").eq("spam",false)).order("asc").paginate({...paginationOpts,numItems:Math.min(50,Math.max(1,paginationOpts.numItems))});
    const rows=[];
    for(const r of batch.page){
      const version=await ctx.db.query("formVersions").withIndex("by_formId_and_version",q=>q.eq("formId",form._id).eq("version",r.version)).unique();
      if(!version)throw new Error("Feedback version unavailable");
      const get=(id:string)=>{const f=version.definition.fields.find(f=>f.id===id);return f?answerText(f,r.answers[id]):"";};
      const aliasField=version.definition.fields.find(f=>f.type==="text"&&f.label===CREDIT_LABEL);
      const alias=aliasField?get(aliasField.id):"";
      rows.push({sourceKey:"response_"+r._id,receipt:r.receiptCode,receivedAt:r.submittedAt,kind:get(KIND),message:get(MESSAGE),area:get(AREA),version:get(VERSION),...(validPublicAlias(alias)?{publicAlias:alias.trim()}:{}),sourceUpdatedAt:r.updatedAt});
    }
    return {rows,cursor:batch.continueCursor,done:batch.isDone};
  }
});
export const maxFeedbackSync=httpAction(async(ctx,request)=>{
  const key=env.MAX_FEEDBACK_SYNC_KEY;
  const provided=request.headers.get("authorization")??"";
  const headers={"Cache-Control":"no-store"};
  if(!key||key.length<32)return new Response(null,{status:503,headers});
  if(provided.length>512||!await equal(provided,"Bearer "+key))return new Response(null,{status:401,headers});
  const cursor=new URL(request.url).searchParams.get("cursor");
  if(cursor&&cursor.length>4096)return new Response(null,{status:400,headers});
  try{
    const result=await ctx.runQuery(makeFunctionReference<"query">("maxFeedbackSync:page"),{paginationOpts:{cursor,numItems:50}});
    return Response.json(result,{headers});
  }catch{return new Response(null,{status:503,headers});}
});
