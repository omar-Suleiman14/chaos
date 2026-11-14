"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAction, useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Download, ImagePlus, Plus, Save, Upload, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BankDraft } from "@/convex/questionBankModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import PrivateCaseImage from "@/components/courses/PrivateCaseImage";
import "@/components/courses/courses.css";

const t = {
  en: {
    back:"Exam builder",title:"Question authoring",intro:"Private question bank for this course. Drafts are not available in exams until marked ready.",
    new:"New question",list:"Course questions",empty:"No course questions yet.",prompt:"Question",kind:"Question type",
    single:"Single choice",multiple:"Multiple choice",tf:"True / false",written:"Written answer",
    points:"Points",ready:"Ready for exam selection",choices:"Choices",addChoice:"Add choice",correct:"Correct answer",
    sample:"Model answer / marking guidance",explanation:"Explanation",tags:"Topics (comma-separated)",
    terms:"Academic terms (comma-separated)",outcomes:"Learning outcomes (comma-separated)",
    case:"Clinical case",caseStem:"Clinical vignette",caseHelp:"Write a clinical history and attach up to four private R2 images.",
    image:"Upload case image",alt:"Describe image for accessibility",remove:"Remove",save:"Save question",
    saving:"Saving…",success:"Question saved",newSaved:"Question created and linked to course",
    edit:"Edit",rev:"Revision",type:"Status",draft:"Draft",archived:"Archived",
    import:"Import JSON",export:"Export JSON",importNote:"Up to 50 questions per import. Imported questions stay drafts; images must be uploaded separately.",
    imported:"Questions imported as drafts",exported:"Private question bank exported",
    failed:"Could not complete the action.",choose:"Select a question or create a new one.",
    imageDone:"Image uploaded privately",imageFail:"Image upload failed",tooLarge:"PNG, JPEG or WebP only, up to 5 MiB.",
    imageAlt:"Case image alt text",module:"Assign module tag",noModule:"Whole course only",
    next:"Next page",prev:"Previous page",addToModule:"Link question to module",
    privacy:"Answer keys are visible only to the question owner. Student delivery and immutable exam snapshots are not enabled.",
  },
  ar: {
    back:"منشئ الامتحانات",title:"تأليف الأسئلة",intro:"بنك أسئلة خاص بهذه الدورة. لا تظهر المسودات للاختيار في الامتحانات حتى تجعلها جاهزة.",
    new:"سؤال جديد",list:"أسئلة الدورة",empty:"لا توجد أسئلة في هذه الدورة بعد.",prompt:"نص السؤال",kind:"نوع السؤال",
    single:"اختيار واحد",multiple:"اختيارات متعددة",tf:"صح أو خطأ",written:"سؤال مقالي",
    points:"الدرجات",ready:"جاهز للاختيار في الامتحان",choices:"الاختيارات",addChoice:"أضف اختيارًا",correct:"الإجابة الصحيحة",
    sample:"نموذج الإجابة ومعايير التصحيح",explanation:"شرح الإجابة",tags:"الموضوعات (افصل بفاصلة)",
    terms:"الفصول الدراسية (افصل بفاصلة)",outcomes:"نواتج التعلم (افصل بفاصلة)",
    case:"حالة إكلينيكية",caseStem:"وصف الحالة الإكلينيكية",caseHelp:"أدخل التاريخ المرضي وارفق حتى ٤ صور خاصة عبر R2.",
    image:"رفع صورة للحالة",alt:"وصف الصورة لتسهيل الوصول",remove:"إزالة",save:"احفظ السؤال",
    saving:"جارٍ الحفظ…",success:"تم حفظ السؤال",newSaved:"أُنشئ السؤال وربط بالدورة",
    edit:"تعديل",rev:"الإصدار",type:"الحالة",draft:"مسودة",archived:"مؤرشف",
    import:"استيراد JSON",export:"تصدير JSON",importNote:"حتى ٥٠ سؤالًا في كل دفعة. تظل الأسئلة المستوردة مسودات وتُرفع صورها بشكل منفصل.",
    imported:"استوردنا الأسئلة كمسودات",exported:"تم تصدير بنك الأسئلة الخاص",
    failed:"تعذرت العملية",choose:"اختر سؤالًا أو أنشئ سؤالًا جديدًا.",
    imageDone:"تم رفع الصورة بشكل خاص",imageFail:"تعذر رفع الصورة",tooLarge:"PNG أو JPEG أو WebP بحد أقصى ٥ ميجابايت.",
    imageAlt:"وصف صورة الحالة",module:"ربط بوحدة",noModule:"الدورة كلها",
    next:"الصفحة التالية",prev:"الصفحة السابقة",addToModule:"اربط السؤال بوحدة",
    privacy:"مفاتيح الإجابة تظهر للمالك فقط. لم تُفَعَّل بعد النسخ الثابتة للامتحانات أو تقديمها للطلاب.",
  },
} as const;
const initial = (): BankDraft => ({
  kind:"single_choice",prompt:"",choices:[{id:"a",text:""},{id:"b",text:""}],
  correctChoiceIds:["a"],points:1,topics:[],terms:[],outcomes:[],status:"draft",
});
const parseTags = (value:string) => value.split(",").map(x=>x.trim()).filter(Boolean);
const answerKinds = ["single_choice","multiple_choice","true_false","written"] as const;
type Kind = (typeof answerKinds)[number];

export default function CourseQuestionBank({params}:{params:Promise<{id:string}>}) {
  const {id}=use(params);
  const courseId=id as Id<"learnCollections">;
  const {locale}=useLocale();
  const ar=locale==="ar";
  const tx=t[ar?"ar":"en"];
  const {isAuthenticated}=useConvexAuth();
  const convex=useConvex();
  const course=useQuery(api.courses.get,isAuthenticated?{courseId}:"skip");
  const [offset,setOffset]=useState(0);
  const questions=useQuery(api.questionBank.listForCourse,isAuthenticated?{courseId,offset}:"skip");
  const [selected,setSelected]=useState<Id<"questionBankItems">|null>(null);
  const saved=useQuery(api.questionBank.get,isAuthenticated&&selected?{questionId:selected}:"skip");
  const [item,setItem]=useState<BankDraft>(initial);
  const [revision,setRevision]=useState<number|null>(null);
  const [moduleId,setModuleId]=useState("");
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [altText,setAltText]=useState("");
  const create=useMutation(api.questionBank.createForCourse);
  const update=useMutation(api.questionBank.update);
  const link=useMutation(api.questionBank.addScope);
  const importRows=useMutation(api.questionBank.importForCourse);
  const reserveMedia=useMutation(api.questionBankMedia.reserveUpload);
  const getUploadTarget=useAction(api.questionBankMedia.getUploadTarget);
  const complete=useAction(api.questionBankMedia.completeUpload);

  useEffect(()=>{
    if(saved&&selected&&revision!==saved.revision) {
      setItem({
        kind:saved.kind,prompt:saved.prompt,choices:saved.choices,
        correctChoiceIds:saved.correctChoiceIds,sampleAnswer:saved.sampleAnswer,
        explanation:saved.explanation,points:saved.points,topics:saved.topics,
        terms:saved.terms,outcomes:saved.outcomes,status:saved.status==="archived"?"draft":saved.status,
        caseStudy:saved.caseStudy,
      });
      setRevision(saved.revision);
    }
  },[saved,selected,revision]);
  const patch=(next:Partial<BankDraft>)=>setItem(old=>({...old,...next}));
  const pick=(id:Id<"questionBankItems">)=>{
    setSelected(id);setRevision(null);setModuleId("");
  };
  const reset=()=>{setSelected(null);setRevision(null);setItem(initial());setModuleId("");setAltText("");};
  const setKind=(kind:Kind)=>{
    if(kind==="true_false")patch({kind,choices:[],correctChoiceIds:["true"]});
    else if(kind==="written")patch({kind,choices:[],correctChoiceIds:[]});
    else patch({kind,choices:[{id:"a",text:""},{id:"b",text:""}],correctChoiceIds:["a"]});
  };
  const editChoice=(id:string,value:string)=>patch({
    choices:item.choices.map(c=>c.id===id?{...c,text:value}:c),
  });
  const toggleCorrect=(id:string)=>{
    const next=item.kind==="single_choice"?[id]:
      item.correctChoiceIds.includes(id)?item.correctChoiceIds.filter(x=>x!==id):[...item.correctChoiceIds,id];
    patch({correctChoiceIds:next});
  };
  const save=async()=>{
    if(busy)return;
    setBusy(true);
    try{
      const payload={...item,...(item.caseStudy && !item.caseStudy.stem.trim() && !item.caseStudy.media.length
        ? {caseStudy:undefined}: {})};
      let questionId:Id<"questionBankItems">;
      if(selected && revision!==null) {
        await update({questionId:selected,expectedRevision:revision,item:payload});
        questionId=selected;
        setRevision(null);
      }else{
        questionId=await create({courseId,item:payload});
        pick(questionId);
      }
      if(moduleId) await link({questionId,courseId,moduleId});
      toast.success(selected?tx.success:tx.newSaved);
    }catch(error){toast.error(error,{fallback:tx.failed});}
    finally{setBusy(false);}
  };
  const uploadImage=async(file:File|undefined)=>{
    if(!file||uploading)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size<1||file.size>5*1024*1024) {
      toast.error(tx.tooLarge);return;
    }
    if(!altText.trim()) {toast.error(tx.imageAlt);return;}
    if((item.caseStudy?.media.length??0)>=4)return;
    setUploading(true);
    try{
      const mediaId=await reserveMedia({mimeType:file.type,bytes:file.size});
      const target=await getUploadTarget({mediaId});
      const uploaded=await fetch(target.url,{method:"PUT",body:file,headers:target.headers,cache:"no-store"});
      if(!uploaded.ok)throw new Error(tx.imageFail);
      await complete({mediaId});
      patch({caseStudy:{stem:item.caseStudy?.stem??"",
        media:[...(item.caseStudy?.media??[]),{mediaId,alt:altText.trim()}]}});
      setAltText("");
      toast.success(tx.imageDone);
    }catch(error){toast.error(error,{fallback:tx.imageFail});}
    finally{setUploading(false);}
  };
  const importFile=async(file:File|undefined)=>{
    if(!file||busy)return;
    setBusy(true);
    try{
      if(file.size>512*1024)throw new Error("File exceeds the 512 KiB import limit.");
      const data:unknown=JSON.parse(await file.text());
      if(!data||typeof data!=="object"||!("version" in data)||data.version!==1||
        !("questions" in data)||!Array.isArray(data.questions))
        throw new Error("Expected Chaos question-bank JSON version 1.");
      const rows=data.questions as BankDraft[];
      const result=await importRows({courseId,items:rows});
      reset();setOffset(0);toast.success(tx.imported+" ("+result.created+")");
    }catch(error){toast.error(error,{fallback:tx.failed});}
    finally{setBusy(false);}
  };
  const exportFile=async()=>{
    if(busy)return;
    setBusy(true);
    try{
      const results:BankDraft[]=[];
      let next:number|null=0;
      while(next!==null){
        const page=await convex.query(api.questionBank.exportForCourse,{courseId,offset:next});
        results.push(...page.items);
        next=page.nextOffset;
        if(results.length>1000)throw new Error("Question export limit exceeded.");
      }
      const blob=new Blob([JSON.stringify({format:"chaos-question-bank",version:1,
        exportedAt:new Date().toISOString(),questions:results},null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download="chaos-question-bank-"+id+".json";
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      toast.success(tx.exported);
    }catch(error){toast.error(error,{fallback:tx.failed});}
    finally{setBusy(false);}
  };

  if(!isAuthenticated||course===undefined||questions===undefined)
    return <PageSkeleton label={tx.title}/>;
  if(!course||!course.isOwner)return <div className="ws-empty">Not found or unauthorized.</div>;
  return <main className="cb cb-page mx-auto max-w-6xl space-y-5" dir={ar?"rtl":"ltr"}>
    <Link className="ws-btn ws-btn--ghost ws-btn--sm" href={`/dashboard/courses/${id}/exams`}>
      <ArrowLeft size={16} aria-hidden />{tx.back}</Link>
    <header className="space-y-1"><h1 className="ws-page-title">{tx.title}</h1>
      <p className="ws-page-subtitle">{tx.intro}</p></header>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={reset} className="ws-btn ws-btn--primary"><Plus size={16}/>{tx.new}</button>
      <label className="ws-btn ws-btn--ghost cursor-pointer"><Upload size={16}/>{tx.import}
        <input className="sr-only" type="file" accept=".json,application/json" disabled={busy}
          onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value="";void importFile(file);}}/>
      </label>
      <button type="button" className="ws-btn ws-btn--ghost" disabled={busy}
        onClick={()=>void exportFile()}><Download size={16}/>{tx.export}</button>
    </div>
    <p className="cb-note">{tx.importNote}</p>
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="cb-section space-y-3">
        <h2>{tx.list} ({questions.total})</h2>
        {!questions.items.length&&<p className="cb-note">{tx.empty}</p>}
        {questions.items.map(q=><button key={q._id} type="button"
          className={"w-full rounded-lg border p-3 text-start text-sm hover:bg-muted/50 "+
            (selected===q._id?"border-primary":"border-border")}
          onClick={()=>pick(q._id)}>
          <span className="font-medium break-words" dir="auto">{q.prompt.slice(0,120)}</span>
          <span className="block text-xs text-muted-foreground">{q.status} · {q.kind}</span>
        </button>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={offset===0}
            onClick={()=>setOffset(Math.max(0,offset-30))}>{tx.prev}</button>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={questions.nextOffset===null}
            onClick={()=>setOffset(questions.nextOffset??offset)}>{tx.next}</button>
        </div>
      </aside>
      <section className="cb-section grid gap-4">
        <div className="flex justify-between gap-2">
          <h2>{selected?tx.edit:tx.new}</h2>
          {selected&&<span className="text-sm text-muted-foreground">{tx.rev}: {revision??"…"}</span>}
        </div>
        <label className="grid gap-1">{tx.kind}
          <select className="kb-input" value={item.kind} onChange={e=>setKind(e.target.value as Kind)}>
            {answerKinds.map(k=><option key={k} value={k}>{({
              single_choice:tx.single,multiple_choice:tx.multiple,
              true_false:tx.tf,written:tx.written,
            })[k]}</option>)}
          </select></label>
        <label className="grid gap-1">{tx.prompt}
          <textarea className="kb-input min-h-24" dir="auto" maxLength={10000}
            value={item.prompt} onChange={e=>patch({prompt:e.target.value})}/></label>
        {(item.kind==="single_choice"||item.kind==="multiple_choice")&&<fieldset className="grid gap-2">
          <legend className="font-medium mb-2">{tx.choices}</legend>
          {item.choices.map((choice,i)=><div key={choice.id} className="flex items-center gap-2">
            <label className="flex items-center gap-2 shrink-0">
              <input type={item.kind==="single_choice"?"radio":"checkbox"}
                name="correct-choice" checked={item.correctChoiceIds.includes(choice.id)}
                onChange={()=>toggleCorrect(choice.id)} aria-label={tx.correct+" "+(i+1)}/>
            </label>
            <input className="kb-input flex-1 min-w-0" maxLength={2000}
              placeholder={String(i+1)} dir="auto" value={choice.text}
              onChange={e=>editChoice(choice.id,e.target.value)}/>
            {item.choices.length>2&&<button type="button" className="ws-btn ws-btn--ghost ws-btn--sm"
              aria-label={tx.remove+" "+(i+1)} onClick={()=>patch({
                choices:item.choices.filter(c=>c.id!==choice.id),
                correctChoiceIds:item.correctChoiceIds.filter(k=>k!==choice.id),
              })}><X size={15}/></button>}
          </div>)}
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm justify-self-start"
            disabled={item.choices.length>=12} onClick={()=>patch({choices:[...item.choices,
              {id:crypto.randomUUID().replaceAll("-","").slice(0,20),text:""}]})}>
            <Plus size={15}/>{tx.addChoice}</button>
        </fieldset>}
        {item.kind==="true_false"&&<fieldset className="flex gap-5">
          <legend>{tx.correct}</legend>
          {["true","false"].map(value=><label key={value} className="flex items-center gap-2">
            <input type="radio" checked={item.correctChoiceIds[0]===value}
              onChange={()=>patch({correctChoiceIds:[value]})}/>{value}</label>)}
        </fieldset>}
        {item.kind==="written"&&<label className="grid gap-1">{tx.sample}
          <textarea className="kb-input" value={item.sampleAnswer??""} dir="auto"
            maxLength={10000} onChange={e=>patch({sampleAnswer:e.target.value})}/></label>}
        <label className="grid gap-1">{tx.explanation}
          <textarea className="kb-input" value={item.explanation??""} dir="auto"
            maxLength={10000} onChange={e=>patch({explanation:e.target.value})}/></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">{tx.points}
            <input type="number" className="kb-input" min={0.01} max={100} step={0.01}
              value={item.points} onChange={e=>patch({points:Number(e.target.value)})}/></label>
          <label className="grid gap-1">{tx.module}
            <select className="kb-input" value={moduleId} onChange={e=>setModuleId(e.target.value)}>
              <option value="">{tx.noModule}</option>
              {(course.modules??[]).map(m=><option value={m.id} key={m.id}>{m.title}</option>)}
            </select></label>
          {(["topics","terms","outcomes"] as const).map(key=><label className="grid gap-1" key={key}>
            {key==="topics"?tx.tags:key==="terms"?tx.terms:tx.outcomes}
            <input className="kb-input" dir="auto" value={item[key].join(", ")}
              onChange={e=>patch({[key]:parseTags(e.target.value)})}/>
          </label>)}
        </div>
        <fieldset className="rounded-xl border border-border p-3 space-y-3">
          <legend className="font-medium px-1">{tx.case}</legend>
          <p className="cb-note">{tx.caseHelp}</p>
          <label className="grid gap-1">{tx.caseStem}
            <textarea className="kb-input" maxLength={6000} dir="auto"
              value={item.caseStudy?.stem??""} onChange={e=>patch({
                caseStudy:{stem:e.target.value,media:item.caseStudy?.media??[]},
              })}/></label>
          {(item.caseStudy?.media??[]).map(image=><div className="flex gap-2 items-center" key={image.mediaId}>
            <div className="flex-1 min-w-0"><PrivateCaseImage mediaId={image.mediaId} alt={image.alt}/></div>
            <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={()=>patch({
              caseStudy:{stem:item.caseStudy?.stem??"",media:(item.caseStudy?.media??[]).filter(m=>m.mediaId!==image.mediaId)},
            })}>{tx.remove}</button>
          </div>)}
          <label className="grid gap-1">{tx.alt}
            <input className="kb-input" value={altText} maxLength={500}
              onChange={e=>setAltText(e.target.value)} dir="auto"/></label>
          <label className="ws-btn ws-btn--ghost ws-btn--sm inline-flex cursor-pointer">
            <ImagePlus size={15}/>{uploading?tx.saving:tx.image}
            <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp"
              disabled={uploading||(item.caseStudy?.media.length??0)>=4}
              onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value="";void uploadImage(file);}}/>
          </label>
        </fieldset>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={item.status==="ready"}
            onChange={e=>patch({status:e.target.checked?"ready":"draft"})}/>{tx.ready}
        </label>
        <p className="cb-note">{tx.privacy}</p>
        <button type="button" className="ws-btn ws-btn--primary justify-self-start"
          disabled={busy||uploading||Boolean(selected&&revision===null)}
          onClick={()=>void save()}><Save size={16}/>{busy?tx.saving:tx.save}</button>
      </section>
    </div>
  </main>;
}
