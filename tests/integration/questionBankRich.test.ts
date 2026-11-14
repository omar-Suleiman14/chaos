import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(()=>vi.unstubAllEnvs());
const base={
  kind:"single_choice" as const,prompt:"A 62-year-old with chest pain: which artery?",
  choices:[{id:"a",text:"LAD"},{id:"b",text:"RCA"}],
  correctChoiceIds:["a"],points:2,topics:["Cardiology"],terms:[],outcomes:[],
  status:"ready" as const,explanation:"Review the ECG and symptoms.",
};
async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN",creatorIdentity.issuer);
  const t=createTestConvex();
  const doctor=t.withIdentity(creatorIdentity);
  const other=t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser,{});
  await other.mutation(api.quizFunctions.getOrCreateUser,{});
  const courseId=await doctor.mutation(api.courses.create,{title:"Medicine"});
  return {t,doctor,other,courseId};
}
it("stores clinical vignettes and media only for their owning author",async()=>{
  const {t,doctor,other,courseId}=await fixture();
  const mediaId=await doctor.mutation(api.questionBankMedia.reserveUpload,{
    mimeType:"image/png",bytes:100,
  });
  await expect(other.query(api.questionBankMedia.getContentUrl,{mediaId})).resolves.toBe(null);
  await expect(doctor.mutation(api.questionBank.createForCourse,{
    courseId,item:{...base,caseStudy:{stem:"ECG demonstrates ST elevation",media:[{mediaId,alt:"12-lead ECG"}]}},
  })).rejects.toThrow("NOT_FOUND");
  await t.run(ctx=>ctx.db.patch("questionBankMedia",mediaId,{status:"ready",etag:'"aaaaaaaaaaaaaaaa"'}));
  const questionId=await doctor.mutation(api.questionBank.createForCourse,{
    courseId,item:{...base,caseStudy:{stem:"ECG demonstrates ST elevation",media:[{mediaId,alt:"12-lead ECG"}]}},
  });
  const stored=await doctor.query(api.questionBank.get,{questionId});
  expect(stored.caseStudy?.media[0].mediaId).toBe(mediaId);
  await expect(other.query(api.questionBank.get,{questionId})).rejects.toThrow("NOT_FOUND");
  expect(await doctor.query(api.questionBankMedia.getContentUrl,{mediaId})).toContain("question-images/content");
  const draftId=await doctor.mutation(api.examBuilder.createDraft,{courseId});
  const listed=await doctor.query(api.examBuilder.candidates,{draftId,allocationId:"whole_course"});
  const candidate=listed.questions.find(q=>q.questionId===questionId);
  expect(candidate).not.toHaveProperty("correctChoiceIds");
  expect(candidate).not.toHaveProperty("caseStudy");
  const foreign=await other.mutation(api.questionBankMedia.reserveUpload,{mimeType:"image/png",bytes:64});
  await t.run(ctx=>ctx.db.patch("questionBankMedia",foreign,{status:"ready",etag:'"bbbbbbbbbbbbbbbb"'}));
  await expect(doctor.mutation(api.questionBank.update,{
    questionId,expectedRevision:0,item:{...base,caseStudy:{stem:"Test",media:[{mediaId:foreign,alt:"Foreign"}]}},
  })).rejects.toThrow("NOT_FOUND");
});
it("imports 1–50 questions atomically as drafts, with no partial writes on validation failure",async()=>{
  const {doctor,other,courseId}=await fixture();
  await expect(doctor.mutation(api.questionBank.importForCourse,{
    courseId,items:[base,{...base,prompt:""}],
  })).rejects.toThrow("VALIDATION_FAILED");
  expect((await doctor.query(api.questionBank.listForCourse,{courseId})).total).toBe(0);
  const result=await doctor.mutation(api.questionBank.importForCourse,{
    courseId,items:[{...base,caseStudy:{stem:"Vignette only",media:[]}},base],
  });
  expect(result.created).toBe(2);
  const rows=await doctor.query(api.questionBank.listForCourse,{courseId});
  expect(rows.items).toHaveLength(2);
  expect(rows.items.every(x=>x.status==="draft")).toBe(true);
  expect((await doctor.query(api.questionBank.selectForExam,{courseId})).questions).toHaveLength(0);
  const exported=await doctor.query(api.questionBank.exportForCourse,{courseId});
  expect(exported.items).toHaveLength(2);
  expect(exported.items[0].correctChoiceIds).toEqual(["a"]);
  expect(JSON.stringify(exported)).not.toContain("ownerId");
  expect(JSON.stringify(exported)).not.toContain("scopeKey");
  await expect(other.query(api.questionBank.exportForCourse,{courseId})).rejects.toThrow("NOT_FOUND");
  await expect(other.mutation(api.questionBank.importForCourse,{courseId,items:[base]}))
    .rejects.toThrow("NOT_FOUND");
});
it("rejects invalid cases, excessive imports, cross-account image references and unsupported files",async()=>{
  const {doctor,courseId}=await fixture();
  await expect(doctor.mutation(api.questionBank.createForCourse,{
    courseId,item:{...base,caseStudy:{stem:"",media:[]}},
  })).rejects.toThrow("VALIDATION_FAILED");
  await expect(doctor.mutation(api.questionBank.createForCourse,{
    courseId,item:{...base,caseStudy:{stem:"Case",media:[]},topics:["Cardiology","cardiology"]},
  })).rejects.toThrow("VALIDATION_FAILED");
  await expect(doctor.mutation(api.questionBank.importForCourse,{
    courseId,items:Array.from({length:51},(_,i)=>({...base,prompt:"Question "+i})),
  })).rejects.toThrow("VALIDATION_FAILED");
  await expect(doctor.mutation(api.questionBankMedia.reserveUpload,{
    mimeType:"image/svg+xml",bytes:100,
  })).rejects.toThrow("INVALID_IMAGE");
  await expect(doctor.mutation(api.questionBankMedia.reserveUpload,{
    mimeType:"image/png",bytes:6*1024*1024,
  })).rejects.toThrow("INVALID_IMAGE");
});
