"use client";
import { useState } from "react";
import { useConvex } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLearnMediaClient } from "@/lib/learn/mediaClient";
import { encodeCourseArchive, decodeCourseArchive, remapCourseDocument, ARCHIVE_MAX_BYTES, type CourseArchive } from "@/lib/learn/courseArchive";
import { useLocale } from "@/lib/i18n";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
export default function CoursePortability({ courseId }: {courseId:Id<"learnCollections">}) {
 const client=useConvex(),media=useLearnMediaClient(),router=useRouter(),{locale}=useLocale(),ar=locale==="ar",[busy,setBusy]=useState(false);
 const run=async(fn:()=>Promise<void>,loading:string,success:string)=>{setBusy(true);try{await toast.promise(fn,{loading,success});}catch{/* shown by the toast */}finally{setBusy(false);}};
 const exportCourse=()=>run(async()=>{
  const manifest=await client.query(api.coursePortability.manifest,{courseId}),lessons:CourseArchive["lessons"]=[],refs=new Map<string,{kind:"form"|"quiz"|"flashcards"|"source";id:string}>();
  const add=(kind:"form"|"quiz"|"flashcards"|"source",id:string)=>refs.set(`${kind}:${id}`,{kind,id});
  for(const courseModuleItem of manifest.modules)for(const a of courseModuleItem.assessments)add(a.kind,a.id);
  for(const lessonId of manifest.lessonIds){const lesson=await client.query(api.coursePortability.lesson,{lessonId});
   for(const d of lesson.decks)if(!lesson.document.blocks.some(b=>b.type==="flashcards"&&b.setId===d.setId))lesson.document.blocks.push({id:`legacy_deck_${lesson.document.blocks.length}`,type:"flashcards",setId:d.setId,citations:[],conceptIds:[]});
   for(const a of lesson.assessments)if(!lesson.document.blocks.some(b=>b.type==="quiz"&&b.asset.kind===a.asset.kind&&b.asset.id===a.asset.id))lesson.document.blocks.push({id:`legacy_quiz_${lesson.document.blocks.length}`,type:"quiz",asset:a.asset,citations:[],conceptIds:[]});
   if(lesson.document.blocks.length>500)throw new Error("Export would exceed the 500-block lesson limit. Move legacy practice into inline blocks first.");
   lessons.push(lesson);for(const b of lesson.document.blocks){for(const c of b.citations)add("source",c.sourceId);if("sourceId" in b)add("source",b.sourceId);if(b.type==="flashcards")add("flashcards",b.setId);if(b.type==="quiz")add(b.asset.kind,b.asset.id);}
  }
  const assets:CourseArchive["assets"]=[],files:Record<string,Uint8Array>={};let total=0;
  for(const asset of refs.values()){const a=await client.query(api.coursePortability.asset,{asset});assets.push(a);if(a.kind==="source"&&a.hasFile){const url=await media.resolve(`chaos-source:${a.id}`),blob=await fetch(url).then(r=>{if(!r.ok)throw new Error("Source download failed.");return r.blob();});total+=blob.size;if(total>ARCHIVE_MAX_BYTES)throw new Error("Archive exceeds 150 MiB.");files[`assets/${a.id}`]=new Uint8Array(await blob.arrayBuffer());}}
  const bytes=encodeCourseArchive({manifest,lessons,assets},files),url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/zip"})),link=document.createElement("a");link.href=url;link.download="course.zip";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 },ar?"جارٍ تصدير الدورة…":"Exporting course…",ar?"تم تصدير الدورة":"Course exported");
 const importCourse=(file:File)=>run(async()=>{
  if(file.size>ARCHIVE_MAX_BYTES)throw new Error("Archive exceeds 150 MiB.");const {data,files}=decodeCourseArchive(new Uint8Array(await file.arrayBuffer())),ids=new Map<string,string>();let created:Id<"learnCollections">|undefined;
  try{
   created=await client.mutation(api.courses.create,{title:data.manifest.metadata.title,language:data.manifest.metadata.language});
   const {title,description,language,tags,coverUrl,coverY,icon}=data.manifest.metadata;await client.mutation(api.courses.update,{courseId:created,title,description,language,tags,coverUrl,coverY,icon,details:data.manifest.details});
   for(const a of data.assets){let id:string;
    if(a.kind==="form")id=await client.mutation(api.forms.createForm,{definition:a.definition});
    else if(a.kind==="quiz")id=await client.mutation(api.coursePortability.importClassicQuiz,{title:a.title,description:a.description,questions:a.questions});
    else if(a.kind==="flashcards")id=await client.mutation(api.flashcards.create,{title:a.title,cards:a.cards});
    else {if(a.hasFile){const bytes=files[`assets/${a.id}`];if(!bytes)throw new Error("Missing archived source file.");id=(await media.upload(new File([new Uint8Array(bytes)],a.metadata.title,{type:a.contentType||"application/octet-stream"}),{title:a.metadata.title,origin:a.metadata.origin})).slice(13);await client.mutation(api.learnSources.update,{sourceId:id as Id<"learnSources">,metadata:a.metadata,metadataVisibility:"private",contentVisibility:"private"});}else id=await client.mutation(api.learnSources.create,{metadata:a.metadata,metadataVisibility:"private",contentVisibility:"private"});}
    ids.set(`${a.kind}:${a.id}`,id);
   }
   for(const oldId of data.manifest.lessonIds){const lesson=data.lessons.find(l=>l.id===oldId)!;const id=await client.mutation(api.coursePortability.importLesson,{courseId:created,metadata:lesson.metadata,document:remapCourseDocument(lesson.document,ids)});ids.set(`lesson:${oldId}`,id);}
   const resolve=(kind:string,id:string)=>{const value=ids.get(`${kind}:${id}`);if(!value)throw new Error("Missing module reference.");return value;};
   await client.mutation(api.courses.setModules,{courseId:created,modules:data.manifest.modules.map(m=>({...m,lessonIds:m.lessonIds.map(id=>resolve("lesson",id) as Id<"lessons">),assessments:m.assessments.map(a=>({...a,id:resolve(a.kind,a.id)}))}))});
   router.push(`/dashboard/courses/${created}`);
  }catch(e){throw new Error(`${errorMessage(e)}${created?` Private partial import saved at /dashboard/courses/${created}; review it before retrying.`:""}`);}
 },ar?"جارٍ استيراد الدورة…":"Importing course…",ar?"تم استيراد الدورة":"Course imported");
 return <div className="cb-row"><span className="font-semibold">{ar?"تصدير واستيراد":"Export and import"}</span><p className="cb-note">{ar?"يحفظ الأرشيف ترتيب الدروس والوحدات والمواد والمصادر المملوكة لك. الاستيراد ينشئ مسودات خاصة دون إجابات الطلاب أو تقدمهم.":"The archive preserves ordered lessons, modules, reusable assets and owned source files. Import creates private drafts without student answers or progress."}</p><div className="lx-actions"><button type="button" className="ws-btn" disabled={busy} onClick={()=>void exportCourse()}>{ar?"تصدير course.zip":"Export course.zip"}</button><label className="ws-btn">{ar?"استيراد course.zip":"Import course.zip"}<input type="file" className="sr-only" accept=".zip,application/zip" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void importCourse(file);}}/></label></div>{busy&&<p role="status">{ar?"جارٍ نقل الدورة…":"Transferring course…"}</p>}</div>;
}
