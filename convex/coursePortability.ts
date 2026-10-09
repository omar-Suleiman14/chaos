import { v, type Infer } from "convex/values";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { requireActiveUser } from "./authz";
import { getCourse, setOutlineCourse } from "./courses";
import { createLessonForActor } from "./lessons";
import { lessonDocument, lessonMeta } from "./learnModel";
import { createFormRecord } from "./forms";
import { quizFormQuestion } from "./integrationContract";
import { toDefinition } from "./mcpContract";
import { quizQuestionFields } from "./quizModel";
const ref = v.object({ kind: v.union(v.literal("form"),v.literal("flashcards"),v.literal("source")), id:v.string() });
export async function exportCourseManifest(ctx: QueryCtx, courseId: import("./_generated/dataModel").Id<"learnCollections">, actor: string) {
 const course = await getCourse(ctx,{courseId},actor);
 const row = await ctx.db.get("learnCollections",courseId);
 return { format:"chaos-course" as const, version:1 as const, metadata:row!.metadata, details:row!.details, modules:course.modules, lessonIds:course.lessons.map(l=>l.id) };
}
export const manifest = query({ args:{courseId:v.id("learnCollections")}, handler:async(ctx,{courseId})=>exportCourseManifest(ctx,courseId,(await requireActiveUser(ctx)).identity.subject) });
export const lesson = query({args:{lessonId:v.id("lessons")},handler:async(ctx,{lessonId})=>{
 const {identity}=await requireActiveUser(ctx);const row=await ctx.db.get("lessons",lessonId);
 if(!row||row.ownerId!==identity.subject)throw new Error("NOT_FOUND");
 const assessments=await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order",q=>q.eq("lessonId",lessonId)).take(50);
 const decks=await ctx.db.query("lessonFlashcards").withIndex("by_lessonId_and_order",q=>q.eq("lessonId",lessonId)).take(50);
 return {id:lessonId,metadata:row.metadata,document:row.draft,assessments:assessments.map(a=>({asset:a.asset,label:a.label,order:a.order})),decks:decks.map(d=>({setId:d.setId,label:d.label,order:d.order}))};
}});
export const asset = query({args:{asset:ref},handler:async(ctx,{asset})=>{
 const {identity}=await requireActiveUser(ctx);
 if(asset.kind==="form"){const id=ctx.db.normalizeId("forms",asset.id),r=id?await ctx.db.get("forms",id):null;if(!r||r.ownerId!==identity.subject)throw new Error("NOT_FOUND: Quiz not owned.");return {kind:"form" as const,id:asset.id,definition:r.draft};}
 if(asset.kind==="flashcards"){const id=ctx.db.normalizeId("flashcardSets",asset.id),r=id?await ctx.db.get("flashcardSets",id):null;if(!r||r.ownerId!==identity.subject)throw new Error("NOT_FOUND: Deck not owned.");return {kind:"flashcards" as const,id:asset.id,title:r.title,cards:r.cards};}
 const id=ctx.db.normalizeId("learnSources",asset.id),r=id?await ctx.db.get("learnSources",id):null;if(!r||r.ownerId!==identity.subject||r.status==="removed")throw new Error("NOT_FOUND: Source not owned.");return {kind:"source" as const,id:asset.id,metadata:r.metadata,hasFile:!!r.storageId,contentType:r.contentType};
}});
/** A quiz from a course archive made before classic quizzes were retired, imported as a private quiz form. */
export const importArchivedQuiz = mutation({args:{title:v.string(),description:v.optional(v.string()),questions:v.array(v.object(quizQuestionFields))},returns:v.id("forms"),handler:async(ctx,args)=>{
 const {identity}=await requireActiveUser(ctx);if(args.questions.length>200||args.title.length>200||(args.description?.length??0)>4000||new TextEncoder().encode(JSON.stringify(args)).length>300000)throw new Error("IMPORT_LIMIT");
 const definition=toDefinition({title:args.title,description:args.description,quizMode:true,questions:[...args.questions].sort((a,b)=>a.order-b.order).map(quizFormQuestion)});
 return createFormRecord(ctx,identity.subject,definition);
}});
const importLessonArgs={courseId:v.id("learnCollections"),metadata:lessonMeta,document:lessonDocument};
export const importLesson = mutation({args:importLessonArgs,returns:v.id("lessons"),handler:async(ctx,args)=>importCourseLesson(ctx,args,(await requireActiveUser(ctx)).identity.subject)});
export async function importCourseLesson(ctx:MutationCtx,args:Infer<ReturnType<typeof importLessonValidator>>,actor:string){
 const identity={subject:actor};const course=await getCourse(ctx,{courseId:args.courseId},identity.subject);if(!course.isOwner)throw new Error("NOT_FOUND: Course not found.");if(course.lessons.length>=100)throw new Error("COURSE_LIMIT");
 for(const block of args.document.blocks){
  if(block.type==="flashcards"){const r=await ctx.db.get("flashcardSets",block.setId);if(!r||r.ownerId!==identity.subject)throw new Error("NOT_OWNED");}
  if(block.type==="quiz"){const r=block.asset.kind==="form"?await ctx.db.get("forms",block.asset.id):null;if(!r||r.ownerId!==identity.subject)throw new Error("NOT_OWNED");}
  const sources=[...block.citations.map(c=>c.sourceId),...("sourceId" in block?[block.sourceId]:[])];for(const id of sources){const r=await ctx.db.get("learnSources",id);if(!r||r.ownerId!==identity.subject||r.status==="removed")throw new Error("SOURCE_NOT_OWNED");}
 }
 const id=await createLessonForActor(ctx,identity.subject,{metadata:args.metadata,document:args.document},true);
 await setOutlineCourse(ctx,{courseId:args.courseId,lessonIds:[...course.lessons.map(l=>l.id),id]},identity.subject);return id;
}
function importLessonValidator(){return v.object(importLessonArgs);}
