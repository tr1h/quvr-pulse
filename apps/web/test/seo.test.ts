import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("jsonLd", () => {
  it("cannot close its <script> tag", async () => {
    const { jsonLd } = await import("../src/lib/seo");
    const out = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});
