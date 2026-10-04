"use client";
import { ChaosSelect } from "@/components/workspace/ChaosSelect";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocBlock } from "@/lib/docs/types";

type EditableType = Exclude<DocBlock["type"], "keys">;
const blockNames: Record<EditableType, string> = { p: "Paragraph", heading: "Heading", tip: "Tip", steps: "Numbered steps", list: "Bullet list" };
function headingAnchor(blocks: DocBlock[]) {
  const existing = new Set(blocks.flatMap(block => block.type === "heading" ? [block.id] : []));
  let index = 1;
  while (existing.has(`section-${index}`)) index++;
  return `section-${index}`;
}
function emptyBlock(type: EditableType, blocks: DocBlock[], text = ""): DocBlock {
  if (type === "heading") return { type, id: headingAnchor(blocks), text };
  if (type === "steps" || type === "list") return { type, items: text ? text.split("\n") : [""] };
  return { type, text };
}
function blockText(block: DocBlock) {
  return block.type === "list" || block.type === "steps" ? block.items.join("\n") : block.type === "keys" ? block.items.map(item => item.label).join("\n") : block.text;
}
function parseBlocks(raw: string): DocBlock[] {
  const result: unknown = JSON.parse(raw);
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
  if (!Array.isArray(result) || !result.every(item => {
    if (!item || typeof item !== "object") return false;
    const block = item as Record<string, unknown>;
    if (block.type === "p" || block.type === "tip") return typeof block.text === "string";
    if (block.type === "heading") return typeof block.text === "string" && typeof block.id === "string";
    if (block.type === "list" || block.type === "steps") return strings(block.items);
    return block.type === "keys" && Array.isArray(block.items) && block.items.every(row => row && typeof row === "object" && typeof row.label === "string" && strings(row.keys));
  })) throw new Error("Use paragraph, heading, tip, list, steps, or keys blocks with their required fields.");
  return result as DocBlock[];
}

export default function DocumentationPanel() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const articles = useQuery(api.docs.adminList, { locale });
  const save = useMutation(api.docs.save);
  const [selected, setSelected] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [sectionId, setSectionId] = useState("getting-started");
  const [sectionTitle, setSectionTitle] = useState("Getting started");
  const [order, setOrder] = useState(0);
  const [revision, setRevision] = useState<number | undefined>();
  const [blocks, setBlocks] = useState<DocBlock[]>([{ type: "p", text: "" }]);
  const [advanced, setAdvanced] = useState(false);
  const [rawBlocks, setRawBlocks] = useState("");
  const [addType, setAddType] = useState<EditableType>("p");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const edit = (article: NonNullable<typeof articles>[number] | null) => {
    setSelected(article?.slug ?? null); setSlug(article?.slug ?? ""); setTitle(article?.content.title ?? ""); setSummary(article?.content.summary ?? "");
    setSectionId(article?.sectionId ?? "getting-started"); setSectionTitle(article?.sectionTitle ?? "Getting started"); setOrder(article?.order ?? articles?.length ?? 0); setRevision(article?.revision);
    setBlocks(article?.content.blocks ?? [{ type: "p", text: "" }]); setAdvanced(false); setStatus("");
  };
  const updateBlock = (index: number, block: DocBlock) => setBlocks(current => current.map((item, at) => at === index ? block : item));
  const moveBlock = (index: number, direction: -1 | 1) => setBlocks(current => { const moved = [...current]; const destination = index + direction; if (destination < 0 || destination >= moved.length) return current; [moved[index], moved[destination]] = [moved[destination], moved[index]]; return moved; });
  const toggleAdvanced = () => {
    if (!advanced) { setRawBlocks(JSON.stringify(blocks, null, 2)); setAdvanced(true); return; }
    try { setBlocks(parseBlocks(rawBlocks)); setAdvanced(false); setStatus(""); } catch (error) { setStatus(error instanceof Error ? error.message : "Invalid block JSON."); }
  };
  const submit = async (publish: boolean) => {
    setBusy(true); setStatus("");
    try {
      const parsed = advanced ? parseBlocks(rawBlocks) : blocks;
      const result = await save({ locale, slug, sectionId, sectionTitle, order, content: { title, summary, blocks: parsed }, expectedRevision: revision, publish });
      setSelected(slug); setRevision(result.revision); setStatus(publish ? "Published. The guide is available in Docs and app search." : "Draft saved. Publish when the guide is ready.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save this guide."); } finally { setBusy(false); }
  };
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Documentation</h2><div className="flex gap-3"><ChaosSelect aria-label="Documentation language" className="border rounded-md p-2 bg-background" value={locale} onChange={event => { setLocale(event.target.value as "en" | "ar"); edit(null); }}><option value="en">English</option><option value="ar">العربية</option></ChaosSelect><Button onClick={() => edit(null)}>Create guide</Button></div></div>
    <div className="grid gap-6 md:grid-cols-[240px_1fr]">
      <nav aria-label="Documentation articles" className="space-y-1 max-h-[650px] overflow-y-auto">{articles === undefined ? <p>Loading guides…</p> : articles.map(article => <button key={article.slug} className={`block w-full text-start p-3 rounded-md border ${selected === article.slug ? "border-primary" : "border-transparent"}`} onClick={() => edit(article)}><span className="block font-medium">{article.content.title}</span><small>{article.published ? "Published" : "Draft"} · {article.slug}</small></button>)}</nav>
      <form onSubmit={event => { event.preventDefault(); void submit(false); }} className="space-y-4">
        <label className="block">Title<Input value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} /></label>
        <label className="block">Slug<Input value={slug} onChange={event => setSlug(event.target.value)} required disabled={selected !== null} placeholder="connect-chatgpt" /></label>
        <label className="block">Summary<Input value={summary} onChange={event => setSummary(event.target.value)} maxLength={2000} /></label>
        <div className="grid gap-3 sm:grid-cols-3"><label>Section ID<Input value={sectionId} onChange={event => setSectionId(event.target.value)} required /></label><label>Section title<Input value={sectionTitle} onChange={event => setSectionTitle(event.target.value)} required /></label><label>Order<Input type="number" value={order} onChange={event => setOrder(Number(event.target.value))} required /></label></div>
        <div className="flex items-center justify-between gap-3"><h3 className="font-medium">Guide content</h3><Button type="button" variant="outline" size="sm" onClick={toggleAdvanced}>{advanced ? "Use block editor" : "Advanced JSON"}</Button></div>
        {advanced ? <label className="block">Content blocks (JSON)<textarea className="block w-full min-h-80 font-mono text-sm p-3 border rounded-md bg-background" value={rawBlocks} onChange={event => setRawBlocks(event.target.value)} spellCheck={false} aria-describedby="doc-block-help" /></label> : <div className="space-y-3">
          {blocks.map((block, index) => <fieldset key={index} className="border rounded-lg p-3 space-y-3">
            <legend className="px-1 text-sm text-muted-foreground">Block {index + 1}</legend>
            <div className="flex flex-wrap gap-2 items-center justify-between">
              {block.type === "keys" ? <span className="font-medium">Keyboard shortcuts</span> : <ChaosSelect aria-label={`Block ${index + 1} type`} className="border rounded-md p-2 bg-background" value={block.type} onChange={event => updateBlock(index, emptyBlock(event.target.value as EditableType, blocks, blockText(block)))}>{Object.entries(blockNames).map(([type, name]) => <option key={type} value={type}>{name}</option>)}</ChaosSelect>}
              <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} aria-label={`Move block ${index + 1} up`} onClick={() => moveBlock(index, -1)}>Up</Button><Button type="button" size="sm" variant="outline" disabled={index === blocks.length - 1} aria-label={`Move block ${index + 1} down`} onClick={() => moveBlock(index, 1)}>Down</Button><Button type="button" size="sm" variant="outline" aria-label={`Remove block ${index + 1}`} onClick={() => setBlocks(current => current.filter((_, at) => at !== index))}>Remove</Button></div>
            </div>
            {block.type === "heading" && <label className="block text-sm">Link anchor<Input value={block.id} onChange={event => updateBlock(index, { ...block, id: event.target.value })} placeholder="connect-chaos" /></label>}
            {block.type === "keys" ? <div><ul className="space-y-1">{block.items.map((item, at) => <li key={at}><kbd>{item.keys.join(" + ")}</kbd> — {item.label}</li>)}</ul><p className="text-sm text-muted-foreground mt-2">Edit keyboard shortcut rows in Advanced JSON.</p></div> : <label className="block text-sm">{block.type === "steps" || block.type === "list" ? "Items (one per line)" : "Text"}<textarea className="block w-full min-h-24 p-3 border rounded-md bg-background" value={blockText(block)} onChange={event => updateBlock(index, block.type === "steps" || block.type === "list" ? { ...block, items: event.target.value.split("\n") } : { ...block, text: event.target.value })} /></label>}
          </fieldset>)}
          <div className="flex gap-2"><ChaosSelect aria-label="New block type" className="border rounded-md p-2 bg-background" value={addType} onChange={event => setAddType(event.target.value as EditableType)}>{Object.entries(blockNames).map(([type, name]) => <option key={type} value={type}>{name}</option>)}</ChaosSelect><Button type="button" variant="outline" onClick={() => setBlocks(current => [...current, emptyBlock(addType, current)])}>Add block</Button></div>
        </div>}
        <p id="doc-block-help" className="text-sm text-muted-foreground">Write text directly, add headings with stable link anchors, and put each list item on its own line. Bold, code and links work in text. Admins can also author guides through the Chaos MCP connection.</p>
        <div className="flex gap-3"><Button type="submit" variant="outline" disabled={busy}>Save draft</Button><Button type="button" disabled={busy} onClick={() => void submit(true)}>Publish guide</Button>{selected && <a href={`/docs/${selected}`} target="_blank" rel="noreferrer" className="self-center underline">View guide</a>}</div>
        {status && <p role="status">{status}</p>}
      </form>
    </div>
  </section>;
}
