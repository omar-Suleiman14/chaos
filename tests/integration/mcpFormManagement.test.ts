/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
const modules = import.meta.glob("../../convex/**/*.*s");
const list = makeFunctionReference<"query">("mcpFormManagement:collaborators"), change = makeFunctionReference<"mutation">("mcpFormManagement:changeCollaborator"), analytics = makeFunctionReference<"query">("mcpFormManagement:analytics"), artifact = makeFunctionReference<"action">("mcpFormManagement:exportArtifact");
async function setup() {
 const t=convexTest(schema,modules); const formId=await t.run(async ctx=>{
  for(const user of ["owner","other"]) await ctx.db.insert("users",{clerkId:user,name:user,username:user,email:`${user}@example.com`,createdAt:0});
  const teamId=await ctx.db.insert("businessTeams", { name: "Business", ownerId: "owner", createdAt: 0 });
  await ctx.db.insert("businessMembers", { teamId, userId: "owner", role: "owner", joinedAt: 0 });
  const draft=emptyDefinition("Analytics export"); draft.fields=[{id:"q",type:"text",label:"Question",required:false}];
  const id=await ctx.db.insert("forms",{ownerId:"owner",title:draft.title,shareId:"management",status:"draft",draft,draftRevision:1,settings:defaultFormSettings,responseCount:1,partialCount:0,createdAt:0,updatedAt:0});
  await ctx.db.insert("formVersions",{formId:id,version:1,definition:draft,publishedAt:0,publishedBy:"owner",draftRevision:1});
  await ctx.db.insert("formResponses",{formId:id,version:1,status:"completed",answers:{q:"=PRIVATE()"},submissionKey:"s",receiptCode:"r",language:"en",startedAt:0,submittedAt:100,updatedAt:100,reviewed:false,tags:[],spam:false,searchText:"PRIVATE"});
  return id;
 });return {t,formId,userId:"owner"};
}
it("guards permission changes against unauthorized users and native membership changes",async()=>{
 const {t,formId,userId}=await setup(); const input={formId,userId};
 await expect(t.query(list,{...input,userId:"other"})).rejects.toThrow("FORBIDDEN");
 const initial=await t.query(list,input);
 const changed=await t.mutation(change,{...input,expectedMembershipRevision:initial.membershipRevision,email:" Other@Example.com ",role:"viewer"});
 await expect(t.mutation(change,{...input,expectedMembershipRevision:initial.membershipRevision,email:"other@example.com",role:"editor"})).rejects.toThrow("MEMBERSHIP_CONFLICT");
 await expect(t.mutation(change,{...input,expectedMembershipRevision:changed.membershipRevision,email:"owner@example.com",role:null})).rejects.toThrow("INVALID_EMAIL");
 await t.mutation(change,{...input,expectedMembershipRevision:changed.membershipRevision,email:"other@example.com",role:null});
 expect((await t.query(list,input)).members).toEqual([]);
});

it.each([undefined, false])("never authorizes MCP through an unverified profile email (%s)", async (emailVerified) => {
 const { t, formId, userId } = await setup();
 const read = makeFunctionReference<"query">("mcp:getForm");
 const search = makeFunctionReference<"query">("mcp:searchForms");
 const update = makeFunctionReference<"mutation">("mcp:updateForm");
 const native = t.withIdentity({ subject: "other", issuer: "https://test", tokenIdentifier: "https://test|other", email: "other@example.com", ...(emailVerified === undefined ? {} : { emailVerified }) });
 const initial = await t.query(list, { formId, userId });
 await t.mutation(change, { formId, userId, expectedMembershipRevision: initial.membershipRevision, email: "other@example.com", role: "editor" });
 const row = (await t.run(ctx => ctx.db.query("formCollaborators").collect()))[0];
 expect(row).toMatchObject({ status: "pending" });
 expect(row.userId).toBeUndefined();
 expect(await t.run(ctx => ctx.db.query("notifications").collect())).toEqual([]);
 const assertDenied = async () => {
  expect((await t.query(search, { userId: "other" })).items).toEqual([]);
  await expect(t.query(read, { userId: "other", id: formId })).rejects.toThrow("NOT_FOUND");
  await expect(t.mutation(update, { userId: "other", id: formId, input: { title: "Stolen draft" } })).rejects.toThrow("NOT_FOUND");
  await expect(native.mutation(makeFunctionReference<"mutation">("forms:acceptInvite"), { collaboratorId: row._id })).rejects.toThrow("UNAUTHORIZED");
 };
 await assertDenied();
 // Historical pending prebindings must not act as accepted account grants.
 await t.run(ctx => ctx.db.patch("formCollaborators", row._id, { userId: "other" }));
 expect((await t.query(list, { formId, userId })).members[0].joined).toBe(false);
 await assertDenied();
 const beforeAccept = await t.query(list, { formId, userId });
 await t.withIdentity({ subject: "other", issuer: "https://test", tokenIdentifier: "https://test|other", email: "other@example.com", emailVerified: true }).mutation(makeFunctionReference<"mutation">("forms:acceptInvite"), { collaboratorId: row._id });
 expect((await t.query(list, { formId, userId })).membershipRevision).not.toBe(beforeAccept.membershipRevision);
 expect((await t.query(list, { formId, userId })).members[0].joined).toBe(true);
 expect((await t.query(search, { userId: "other" })).items).toHaveLength(1);
 expect((await t.query(read, { userId: "other", id: formId })).role).toBe("editor");
 await t.mutation(update, { userId: "other", id: formId, input: { title: "Authorized draft" } });
 expect((await t.run(ctx => ctx.db.get("forms", formId)))!.title).toBe("Authorized draft");
 // Preserve historical explicit account grants, but never declined grants.
 await t.run(ctx => ctx.db.patch("formCollaborators", row._id, { status: undefined }));
 expect((await t.query(read, { userId: "other", id: formId })).role).toBe("editor");
 await t.run(ctx => ctx.db.patch("formCollaborators", row._id, { status: "declined" }));
 expect((await t.query(search, { userId: "other" })).items).toEqual([]);
 await expect(t.query(read, { userId: "other", id: formId })).rejects.toThrow("NOT_FOUND");
 await expect(t.mutation(update, { userId: "other", id: formId, input: { title: "Declined draft" } })).rejects.toThrow("NOT_FOUND");
});
it("returns aggregate analytics without individual text or private definition",async()=>{
 const {t,formId,userId}=await setup(); const result=await t.query(analytics,{formId,userId});
 expect(result.analysisJson).not.toContain("PRIVATE"); expect(JSON.parse(result.analysisJson).definition).toBeUndefined();
 expect(JSON.parse(result.analysisJson).responseCount).toBe(1);
 const native=await t.withIdentity({subject:userId,issuer:"https://test",tokenIdentifier:`https://test|${userId}`,email:"owner@example.com"}).query(makeFunctionReference<"query">("formResults:getAnalysis"),{formId});
 expect(JSON.parse(result.analysisJson).fields[0].answered).toBe(native.fields[0].answered);
 expect(JSON.parse(result.analysisJson).sampled).toBe(native.sampled);
 await expect(t.query(analytics,{formId,userId:"other"})).rejects.toThrow("FORBIDDEN");
});
it("creates bounded artifacts in all formats, escapes CSV formulas, and expires storage",async()=>{
 vi.useFakeTimers(); try{
 const {t,formId,userId}=await setup();
 await expect(t.action(artifact,{formId,userId:"other",format:"json",includePartial:false,includeSpam:false})).rejects.toThrow("FORBIDDEN");
 for(const format of ["csv","xlsx","json"]){
 const result=await t.action(artifact,{formId,userId,format,includePartial:false,includeSpam:false});
 expect(result.rows).toBe(1); expect(result.byteSize).toBeGreaterThan(0); expect(result).not.toHaveProperty("answers");
 }
 const stored=await t.run(ctx=>ctx.db.system.query("_storage").collect()); expect(stored).toHaveLength(3);
 const contents=await t.run(async ctx=>(await ctx.storage.get(stored[0]._id))!.text());
 expect(contents).toContain("'=PRIVATE()");
 await t.finishAllScheduledFunctions(vi.runAllTimers);
 expect(await t.run(ctx=>ctx.db.system.query("_storage").collect())).toHaveLength(0);
 }finally{vi.useRealTimers();}
});




it("rejects oversized exports without storing partial artifacts", async()=>{
 vi.useFakeTimers(); try{
 const {t,formId,userId}=await setup();
 await t.run(async ctx=>{ for(let i=0;i<90;i++) await ctx.db.insert("formResponses",{formId,version:1,status:"completed",answers:{q:"x".repeat(100_000)},submissionKey:`big${i}`,receiptCode:`big${i}`,language:"en",startedAt:0,submittedAt:101+i,updatedAt:101+i,reviewed:false,tags:[],spam:false,searchText:""}); });
 await expect(t.action(artifact,{formId,userId,format:"json",includePartial:false,includeSpam:false})).rejects.toThrow("EXPORT_LIMIT");
 expect(await t.run(ctx=>ctx.db.system.query("_storage").collect())).toHaveLength(0);
 }finally{vi.useRealTimers();}
});
