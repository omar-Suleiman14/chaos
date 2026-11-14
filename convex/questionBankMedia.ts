import { v } from "convex/values";
import { makeFunctionReference, type HttpRouter } from "convex/server";
import { action, env, httpAction, internalMutation, internalQuery, mutation, query,
  type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthIdentity } from "./authIdentity";
import { requireActiveUser, creatorRestricted } from "./authz";
import { consumeRate } from "./serverUtils";
import { r2Config, signR2Request, validMediaSignature } from "../lib/r2/privateR2";

export const QUESTION_IMAGE_PATH = "/learn/question-images/content";
const MAX_BYTES = 5 * 1024 * 1024;
const PENDING_MS = 15 * 60_000;
const URL_SECONDS = 60;
const types = new Set(["image/png", "image/jpeg", "image/webp"]);
const mediaArgs = { mediaId: v.id("questionBankMedia") };
const info = v.object({ key:v.string(),mimeType:v.string(),bytes:v.number() });
const readyInfo = v.object({key:v.string(),mimeType:v.string(),bytes:v.number(),etag:v.string()});
const keyFor = (id: Id<"questionBankMedia">) => "question-images/" + id;
const headers = { "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS",
  "Access-Control-Allow-Headers":"Authorization" };

/** Owner-only upload reservation. No course enrollment, student or MCP privileges. */
export const reserveUpload = mutation({
  args:{mimeType:v.string(),bytes:v.number()}, returns:v.id("questionBankMedia"),
  handler:async(ctx,{mimeType,bytes})=>{
    const {identity,user}=await requireActiveUser(ctx);
    if(!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
    if(!types.has(mimeType)||!Number.isSafeInteger(bytes)||bytes<1||bytes>MAX_BYTES)
      throw new Error("INVALID_IMAGE: PNG, JPEG or WebP, 5 MiB maximum.");
    if(await creatorRestricted(ctx,identity.subject)) throw new Error("FORBIDDEN: Account restricted.");
    await consumeRate(ctx,"question-images:reserve:"+identity.subject,40,60*60_000);
    const now=Date.now();
    return ctx.db.insert("questionBankMedia",{
      ownerId:identity.subject,mimeType,bytes,status:"pending",createdAt:now,expiresAt:now+PENDING_MS,
    });
  },
});
async function getPendingRow(ctx:QueryCtx,mediaId:Id<"questionBankMedia">) {
  const identity=await getAuthIdentity(ctx);
  if(!identity||await creatorRestricted(ctx,identity.subject)) return null;
  const row=await ctx.db.get("questionBankMedia",mediaId);
  return row?.ownerId===identity.subject && row.status==="pending" && row.expiresAt>Date.now()?row:null;
}
export const getPending = internalQuery({
  args:mediaArgs,returns:v.union(v.null(),info),
  handler:async(ctx,{mediaId})=>{
    const row=await getPendingRow(ctx,mediaId);
    return row?{key:keyFor(mediaId),mimeType:row.mimeType,bytes:row.bytes}:null;
  },
});
const pendingRef=makeFunctionReference<"query",{mediaId:Id<"questionBankMedia">},
  {key:string;mimeType:string;bytes:number}|null>("questionBankMedia:getPending");
export const getUploadTarget=action({
  args:mediaArgs,returns:v.object({url:v.string(),headers:v.object({
    "Content-Type":v.string(),"If-None-Match":v.literal("*"),
  }),expiresAt:v.number()}),
  handler:async(ctx,{mediaId})=>{
    const row=await ctx.runQuery(pendingRef,{mediaId});
    if(!row) throw new Error("NOT_FOUND: Upload reservation unavailable.");
    const signed=await signR2Request(r2Config(env),"PUT",row.key,{
      contentType:row.mimeType,expiresSeconds:URL_SECONDS,
    });
    return {url:signed.url,headers:{"Content-Type":row.mimeType,"If-None-Match":"*" as const},
      expiresAt:Date.now()+URL_SECONDS*1000};
  },
});
export const markReady=internalMutation({
  args:{...mediaArgs,etag:v.string()},returns:v.null(),
  handler:async(ctx,{mediaId,etag})=>{
    const {identity}=await requireActiveUser(ctx);
    const row=await ctx.db.get("questionBankMedia",mediaId);
    if(!row||row.ownerId!==identity.subject||row.status!=="pending"||
      row.expiresAt<=Date.now()||!/^"[A-Za-z0-9-]{16,128}"$/.test(etag))
      throw new Error("NOT_FOUND: Upload reservation expired.");
    await ctx.db.patch("questionBankMedia",mediaId,{status:"ready",etag});
    return null;
  },
});
const readyRef=makeFunctionReference<"mutation",{mediaId:Id<"questionBankMedia">;etag:string},null>("questionBankMedia:markReady");
export const completeUpload=action({
  args:mediaArgs,returns:v.null(),
  handler:async(ctx,{mediaId})=>{
    const row=await ctx.runQuery(pendingRef,{mediaId});
    if(!row) throw new Error("NOT_FOUND: Upload reservation unavailable.");
    const cfg=r2Config(env);
    const head=await signR2Request(cfg,"HEAD",row.key,{expiresSeconds:20});
    const response=await fetch(head.url,{method:"HEAD",cache:"no-store",redirect:"error"});
    const etag=response.headers.get("etag")??"";
    const size=Number(response.headers.get("content-length"));
    const mime=(response.headers.get("content-type")??"").split(";")[0].trim().toLowerCase();
    if(!response.ok||!Number.isSafeInteger(size)||size!==row.bytes||mime!==row.mimeType||
      !/^"[A-Za-z0-9-]{16,128}"$/.test(etag)) throw new Error("R2 upload metadata mismatch.");
    const signed=await signR2Request(cfg,"GET",row.key,{expiresSeconds:20});
    const sample=await fetch(signed.url,{headers:{Range:"bytes=0-31","If-Match":etag},
      cache:"no-store",redirect:"error"});
    if(sample.status!==206||!validMediaSignature(row.mimeType,new Uint8Array(await sample.arrayBuffer())))
      throw new Error("Image signature does not match the declared file format.");
    await ctx.runMutation(readyRef,{mediaId,etag});
    return null;
  },
});
/** Authenticated metadata only. Never hand a public or browser-signed R2 GET URL to a client. */
export const getContentUrl=query({
  args:mediaArgs,returns:v.union(v.null(),v.string()),
  handler:async(ctx,{mediaId})=>{
    const identity=await getAuthIdentity(ctx);
    if(!identity||await creatorRestricted(ctx,identity.subject)) return null;
    const row=await ctx.db.get("questionBankMedia",mediaId);
    if(!row||row.ownerId!==identity.subject||row.status!=="ready"||!row.etag) return null;
    const url=new URL(QUESTION_IMAGE_PATH,env.CONVEX_SITE_URL);
    url.searchParams.set("mediaId",mediaId);
    return url.toString();
  },
});
export const getReady=internalQuery({
  args:{id:v.string()},returns:v.union(v.null(),readyInfo),
  handler:async(ctx,{id})=>{
    const identity=await getAuthIdentity(ctx);
    if(!identity||await creatorRestricted(ctx,identity.subject)) return null;
    const mediaId=ctx.db.normalizeId("questionBankMedia",id);
    if(!mediaId)return null;
    const row=await ctx.db.get("questionBankMedia",mediaId);
    return row?.ownerId===identity.subject&&row.status==="ready"&&row.etag
      ?{key:keyFor(mediaId),mimeType:row.mimeType,bytes:row.bytes,etag:row.etag}:null;
  },
});
const getReadyRef=makeFunctionReference<"query",{id:string},
  {key:string;mimeType:string;bytes:number;etag:string}|null>("questionBankMedia:getReady");
export const content=httpAction(async(ctx,request)=>{
  if(request.method!=="GET")return new Response("Method not allowed",{status:405,headers});
  const id=new URL(request.url).searchParams.get("mediaId");
  if(!id||id.length>200)return new Response("Not found",{status:404,headers});
  const row=await ctx.runQuery(getReadyRef,{id});
  if(!row)return new Response("Not found",{status:404,headers});
  try{
    const signed=await signR2Request(r2Config(env),"GET",row.key,{expiresSeconds:20});
    const upstream=await fetch(signed.url,{headers:{"If-Match":row.etag},
      cache:"no-store",redirect:"error"});
    if(!upstream.ok||!upstream.body||upstream.headers.get("etag")!==row.etag)
      return new Response("Not found",{status:404,headers});
    return new Response(upstream.body,{headers:{
      ...headers,"Content-Type":row.mimeType,"Content-Disposition":"inline",
      "Content-Length":String(row.bytes),
    }});
  }catch{return new Response("Media unavailable",{status:503,headers});}
});
export function registerQuestionBankMediaRoutes(http:HttpRouter) {
  http.route({path:QUESTION_IMAGE_PATH,method:"GET",handler:content});
  http.route({path:QUESTION_IMAGE_PATH,method:"OPTIONS",
    handler:httpAction(async()=>new Response(null,{status:204,headers}))});
}
