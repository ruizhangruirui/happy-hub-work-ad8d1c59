import { describe, expect, it } from "vitest";
import { insertTemplateVariable } from "./template-variable-insert";

describe("template variable insertion", () => {
  it("inserts at the cursor instead of always appending", () => {
    expect(insertTemplateVariable("Hello !", "first_name", 6)).toEqual({
      value: "Hello {{first_name}}!",
      caret: 20,
    });
  });

  it("replaces selected text", () => {
    expect(insertTemplateVariable("Hello name", "candidate_name", 6, 10).value).toBe(
      "Hello {{candidate_name}}",
    );
  });
});
