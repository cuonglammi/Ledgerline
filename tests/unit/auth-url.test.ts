import { describe, expect, it } from "vitest";
import { authBaseURL } from "@/lib/auth-url";

describe("authBaseURL", () => {
  it("keeps only the origin, so a path can't move the auth endpoints", () => {
    expect(authBaseURL("https://ledgerline.vercel.app")).toBe("https://ledgerline.vercel.app");
    expect(authBaseURL("https://ledgerline.vercel.app/")).toBe("https://ledgerline.vercel.app");
    expect(authBaseURL("https://ledgerline.vercel.app/sign-in")).toBe("https://ledgerline.vercel.app");
    expect(authBaseURL("https://ledgerline.vercel.app/api/auth?x=1#y")).toBe("https://ledgerline.vercel.app");
    expect(authBaseURL("http://localhost:3000/inbox")).toBe("http://localhost:3000");
  });

  it("tolerates whitespace and a missing scheme", () => {
    expect(authBaseURL("  https://ledgerline.vercel.app \n")).toBe("https://ledgerline.vercel.app");
    expect(authBaseURL("ledgerline.vercel.app")).toBe("https://ledgerline.vercel.app");
    expect(authBaseURL("localhost:3000")).toBe("http://localhost:3000");
  });

  it("returns undefined when unset, and explains a value that isn't a URL", () => {
    expect(authBaseURL(undefined)).toBeUndefined();
    expect(authBaseURL("   ")).toBeUndefined();
    expect(() => authBaseURL("https://")).toThrow(/BETTER_AUTH_URL is not a valid URL/);
  });
});
