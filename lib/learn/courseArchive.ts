import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LessonDocument } from "@/convex/learnModel";
export type CourseArchive = { manifest: FunctionReturnType<typeof api.coursePortability.manifest>; lessons: FunctionReturnType<typeof api.coursePortability.lesson>[]; assets: FunctionReturnType<typeof api.coursePortability.asset>[] };
export const ARCHIVE_MAX_BYTES = 150*1024*1024;
export function encodeCourseArchive(data: CourseArchive, files: Record<string,Uint8Array>) {
 const entries={"course.json":strToU8(JSON.stringify(data)),...files};
 if(Object.values(entries).reduce((n,b)=>n+b.byteLength,0)>ARCHIVE_MAX_BYTES)throw new Error("Course archive exceeds 150 MiB.");
 return zipSync(entries,{level:1});
}
export function decodeCourseArchive(bytes: Uint8Array): { data: CourseArchive; files: Record<string,Uint8Array> } {
 if(bytes.byteLength>ARCHIVE_MAX_BYTES)throw new Error("Course archive exceeds 150 MiB.");
 let total=0,count=0;const files=unzipSync(bytes,{filter:file=>{count++;total+=file.originalSize;if(count>1001||total>ARCHIVE_MAX_BYTES||file.originalSize>25*1024*1024||!/^course\.json$|^assets\/[a-zA-Z0-9_-]+$/.test(file.name))throw new Error("Invalid or oversized archive entry.");return true;}});
 if(!files["course.json"])throw new Error("Missing course.json.");
 const data=JSON.parse(strFromU8(files["course.json"])) as CourseArchive;
 if(!data||data.manifest?.format!=="chaos-course"||data.manifest.version!==1||!Array.isArray(data.lessons)||data.lessons.length>100||!Array.isArray(data.assets)||data.assets.length>1000||!Array.isArray(data.manifest.lessonIds)||data.manifest.lessonIds.length!==data.lessons.length||new Set(data.lessons.map(l=>l.id)).size!==data.lessons.length||data.manifest.lessonIds.some(id=>!data.lessons.some(l=>l.id===id)))throw new Error("Unsupported or invalid Chaos course archive.");
 return {data,files};
}
export function remapCourseDocument(document: LessonDocument, ids: Map<string,string>): LessonDocument {
 const lookup=(kind:string,id:string)=>{const value=ids.get(`${kind}:${id}`);if(!value)throw new Error(`Missing archived ${kind} reference.`);return value;};
 return {schemaVersion:1,blocks:document.blocks.map(b=>({...b,citations:b.citations.map(c=>({...c,sourceId:lookup("source",c.sourceId) as Id<"learnSources">})),...("sourceId" in b?{sourceId:lookup("source",b.sourceId) as Id<"learnSources">}:{}),...(b.type==="flashcards"?{setId:lookup("flashcards",b.setId) as Id<"flashcardSets">}:{}),...(b.type==="quiz"?{asset:{kind:b.asset.kind,id:lookup(b.asset.kind,b.asset.id)}}:{})})) as LessonDocument["blocks"]};
}
