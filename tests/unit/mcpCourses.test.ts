import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "@/lib/mcp/server";
it("registers course review annotations and strips client actor injection", async () => {
 const call = vi.fn(async () => ({ courseId: "course1" }));
 const server = createChaosMcpServer({ call, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
 const client = new Client({ name: "test", version: "1" });
 const [a,b] = InMemoryTransport.createLinkedPair();
 await Promise.all([server.connect(a),client.connect(b)]);
 const { tools } = await client.listTools();
 const byName = Object.fromEntries(tools.map(t => [t.name,t]));
 const expected = {
 create_course: { readOnlyHint:false, destructiveHint:false, openWorldHint:false, idempotentHint:false },
 create_full_course: { readOnlyHint:false, destructiveHint:false, openWorldHint:true, idempotentHint:false },
 get_course: { readOnlyHint:true, destructiveHint:false, openWorldHint:false, idempotentHint:true },
 update_course: { readOnlyHint:false, destructiveHint:false, openWorldHint:false, idempotentHint:true },
 set_course_outline: { readOnlyHint:false, destructiveHint:true, openWorldHint:false, idempotentHint:true },
 add_course_lesson: { readOnlyHint:false, destructiveHint:false, openWorldHint:false, idempotentHint:false },
 publish_course: { readOnlyHint:false, destructiveHint:true, openWorldHint:true, idempotentHint:false },
 list_courses: { readOnlyHint:true, destructiveHint:false, openWorldHint:false, idempotentHint:true },
 set_course_archived: { readOnlyHint:false, destructiveHint:true, openWorldHint:true, idempotentHint:true },
 unpublish_course: { readOnlyHint:false, destructiveHint:true, openWorldHint:true, idempotentHint:true },
 };
 expect(tools.filter(t => t.name.includes("course")).map(t => t.name).sort()).toEqual(Object.keys(expected).sort());
 for (const [name, annotations] of Object.entries(expected)) {
  expect(byName[name].annotations).toMatchObject(annotations);
  expect(byName[name].inputSchema.properties).not.toHaveProperty("userId");
  expect(byName[name]._meta?.securitySchemes).toEqual([{type:"oauth2",scopes:["openid","profile","email"]}]);
  expect(byName[name].outputSchema).toBeDefined();
 }
 expect(byName.publish_course.description).toContain("Only on explicit user request");
 expect(byName.publish_course.description).toContain("some lessons may have published");
 expect(byName.publish_course.description).toContain("do not automatically retry");
 expect(byName.create_course.description).toContain("Never publishes");
 expect(byName.add_course_lesson.description).toContain("Does not publish");
 expect(byName.set_course_outline.description).toContain("complete ordered");
 expect(byName.publish_course.annotations).toMatchObject({ readOnlyHint:false, destructiveHint:true, openWorldHint:true, idempotentHint:false });
 expect(byName.set_course_outline.annotations).toMatchObject({ destructiveHint:true, openWorldHint:false });
 expect(byName.get_course.annotations?.readOnlyHint).toBe(true);
 expect(byName.create_course._meta?.securitySchemes).toEqual([{type:"oauth2",scopes:["openid","profile","email"]}]);
 expect(byName.create_course.inputSchema.properties).not.toHaveProperty("userId");
 const result = await client.callTool({ name:"create_course", arguments:{title:"Course",userId:"foreign"} });
 expect(result.isError).toBeFalsy();
 expect(call).toHaveBeenCalledWith("create_course",{title:"Course"});
 expect((await client.callTool({name:"set_course_outline",arguments:{courseId:"x",lessonIds:Array(101).fill("l")}})).isError).toBe(true);
 await client.close(); await server.close();
});

it("matches backend visibility for publish input and owner output, rejecting unlisted before dispatch", async () => {
 const call = vi.fn(async () => ({ ok: true }));
 const server = createChaosMcpServer({ call, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
 const client = new Client({ name: "visibility-test", version: "1" });
 const [a,b] = InMemoryTransport.createLinkedPair();
 await Promise.all([server.connect(a),client.connect(b)]);
 try {
  const { tools } = await client.listTools();
  const publish = tools.find(t => t.name === "publish_course")!;
  const get = tools.find(t => t.name === "get_course")!;
  expect(publish.inputSchema.properties?.visibility).toMatchObject({ enum: ["public", "restricted", "private"] });
  expect(get.outputSchema?.properties?.visibility).toMatchObject({ enum: ["public", "restricted", "private"] });
  const rejected = await client.callTool({ name:"publish_course", arguments:{courseId:"course1",visibility:"unlisted"} });
  expect(rejected.isError).toBe(true);
  expect(call).not.toHaveBeenCalled();
  for (const visibility of ["public", "restricted", "private"]) {
   const result = await client.callTool({ name:"publish_course", arguments:{courseId:"course1",visibility} });
   expect(result.isError).toBeFalsy();
   expect(call).toHaveBeenLastCalledWith("publish_course", {courseId:"course1",visibility});
  }
 } finally { await client.close(); await server.close(); }
});

it("advertises truthful Learn/course/folder instructions and verified publication links", async () => {
 const server = createChaosMcpServer({ call: null, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
 const client = new Client({ name: "instructions-test", version: "1" });
 const [a,b] = InMemoryTransport.createLinkedPair();
 await Promise.all([server.connect(a),client.connect(b)]);
 try {
  const instructions = client.getInstructions()!;
  for (const text of ["Learn lessons and courses", "Folders are private organisation", "publish false", "person selected", "never supply an actor/userId", "Lesson and course tools do not return shareUrl", "publish_course returns ok true", "courseId from verified create_course", "https://chaos.fail/learn/courses/<courseId>", "https://chaos.fail/learn/<lessonId>", "offset 0?500, limit 1?100", "follow nextOffset until null", "outlineFrom draft require edit permission", "Folder changes never publish content", "Do not automatically retry"]) expect(instructions).toContain(text);
  expect(instructions).not.toContain("share the returned shareUrl");
  expect(instructions).not.toMatch(/AI provider|model provider/i);
 } finally { await client.close(); await server.close(); }
});

it("create_full_course builds the course, every lesson with its blocks, then publishes publicly", async () => {
 const call = vi.fn(async (tool: string, _input?: Record<string, unknown>) => tool === "create_course" ? { courseId: "course1" } : tool === "add_course_lesson" ? { lessonId: `lesson${call.mock.calls.filter(([t]) => t === "add_course_lesson").length}` } : tool === "publish_course" ? { ok: true } : { ok: true, revision: 1 });
 const server = createChaosMcpServer({ call, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
 const client = new Client({ name: "full-course", version: "1" });
 const [a,b] = InMemoryTransport.createLinkedPair();
 await Promise.all([server.connect(a),client.connect(b)]);
 try {
  const doc = { schemaVersion: 1, blocks: [{ id: "p1", type: "paragraph", text: "Hello", citations: [], conceptIds: [] }] };
  const result = await client.callTool({ name: "create_full_course", arguments: { title: "Stars", icon: "🔭", coverUrl: "/covers/webb/carina.jpg", userId: "foreign", lessons: [{ title: "One", document: doc }, { title: "Two", document: doc }] } });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({ courseId: "course1", lessonIds: ["lesson1", "lesson2"], published: true });
  expect(call.mock.calls.map(([t]) => t)).toEqual(["create_course", "update_course", "add_course_lesson", "save_lesson_draft", "add_course_lesson", "save_lesson_draft", "publish_course"]);
  expect(call).toHaveBeenCalledWith("update_course", { courseId: "course1", coverUrl: "/covers/webb/carina.jpg", icon: "🔭" });
  expect(call).toHaveBeenLastCalledWith("publish_course", { courseId: "course1", visibility: "public" });
  for (const [, input] of call.mock.calls) expect(input).not.toHaveProperty("userId");
  call.mockClear();
  await client.callTool({ name: "create_full_course", arguments: { title: "Draft", publish: false, lessons: [{ title: "One", document: doc }] } });
  expect(call.mock.calls.map(([t]) => t)).not.toContain("publish_course");
 } finally { await client.close(); await server.close(); }
});
