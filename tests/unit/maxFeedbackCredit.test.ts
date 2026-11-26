import { describe, expect, it } from "vitest";
import { parseMaxFeedback } from "../../lib/maxFeedback";
const base={kind:"Bug",area:"Editor",version:"2.0",message:"Something broke",submissionKey:"abcdef1234"};
describe("optional public attribution",()=>{
 it("defaults to anonymous",()=>expect(parseMaxFeedback(JSON.stringify(base))).not.toHaveProperty("publicAlias"));
 it("accepts a deliberate alias and rejects emails or markup",()=>{
  expect(parseMaxFeedback(JSON.stringify({...base,publicAlias:"مستخدم Max"}))?.publicAlias).toBe("مستخدم Max");
  expect(parseMaxFeedback(JSON.stringify({...base,publicAlias:"name@example.com"}))).toBeNull();
  expect(parseMaxFeedback(JSON.stringify({...base,publicAlias:"<script>"}))).toBeNull();
 });
});
