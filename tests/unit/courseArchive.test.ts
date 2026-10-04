import { expect, it } from "vitest";
import { encodeCourseArchive, decodeCourseArchive, remapCourseDocument, type CourseArchive } from "@/lib/learn/courseArchive";
import type { Id } from "@/convex/_generated/dataModel";
const lessonId="old_lesson" as Id<"lessons">;
const metadata={title:"Example",description:"",language:"en",tags:[]};
const data:CourseArchive={manifest:{format:"chaos-course",version:1,metadata,modules:[],lessonIds:[lessonId]},lessons:[{id:lessonId,metadata,document:{schemaVersion:1,blocks:[{id:"cards",type:"flashcards",setId:"old_deck" as Id<"flashcardSets">,citations:[],conceptIds:[]}]},assessments:[],decks:[]}],assets:[{kind:"flashcards",id:"old_deck",title:"Cards",cards:[{id:"card",front:"Front",back:"Back",conceptIds:[]}]}]};
it("round trips a versioned course and remaps shared assets without changing structure",()=>{
 const result=decodeCourseArchive(encodeCourseArchive(data,{})).data;
 expect(result).toEqual(data);
 expect(remapCourseDocument(result.lessons[0].document,new Map([["flashcards:old_deck","new_deck"]])).blocks[0]).toMatchObject({id:"cards",setId:"new_deck"});
 expect(()=>remapCourseDocument(result.lessons[0].document,new Map())).toThrow("Missing archived");
});
it("rejects incompatible archives before import writes",()=>{
 const incompatible={...data,manifest:{...data.manifest,version:2}} as unknown as CourseArchive;
 expect(()=>decodeCourseArchive(encodeCourseArchive(incompatible,{}))).toThrow("Unsupported");
});
