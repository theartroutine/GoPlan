import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

function requestFor(pathname: string): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`);
}

describe("proxy", () => {
  it("allows anonymous public memory share pages", () => {
    const response = proxy(requestFor("/share/memories/public-slug"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects anonymous protected pages to login", () => {
    const response = proxy(requestFor("/trips/trip_1/memories"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });
});
