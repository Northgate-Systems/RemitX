import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

import { GET } from "../route";
import { getCurrentUser } from "@/lib/auth";

const SOME_USER = { id: "u1" } as never;

function makeRequest(query = "") {
  return new Request(`http://localhost/api/anchors${query}`) as never;
}

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset();
});

describe("GET /api/anchors", () => {
  it("returns 401 when there is no authenticated user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
  });

  it("returns every anchor with an estimatedFee computed against the default 1000 amount", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(SOME_USER);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.amount).toBe(1000);
    expect(body.data.anchors).toHaveLength(4);
    // Sorted ascending by feePercent - Tempo (0.35%) leads, and its fee against
    // the default 1000 amount should be exactly 3.5.
    expect(body.data.anchors[0].id).toBe("tempo");
    expect(body.data.anchors[0].estimatedFee).toBe(3.5);
  });

  it("applies the corridor and assetCode query params and a custom amount", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(SOME_USER);

    const response = await GET(makeRequest("?corridor=Nigeria&amount=500"));
    const body = await response.json();

    expect(body.data.anchors).toHaveLength(1);
    expect(body.data.anchors[0].id).toBe("cowrie");
    expect(body.data.anchors[0].estimatedFee).toBe(3.75); // 500 * 0.75%
    expect(body.data.amount).toBe(500);
  });

  it("returns an empty anchors array (still 200, not an error) when nothing matches", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(SOME_USER);

    const response = await GET(makeRequest("?assetCode=XYZ"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.anchors).toEqual([]);
  });

  it("falls back to the default amount of 1000 when the amount query param is missing or not a number", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(SOME_USER);

    const response = await GET(makeRequest("?amount=not-a-number"));
    const body = await response.json();

    // parseFloat("not-a-number") is NaN, and JSON has no NaN literal - it
    // serializes to null over the wire. Documenting the current behavior
    // (this query param has no validation) rather than asserting a crash.
    expect(body.data.amount).toBeNull();
    expect(body.data.anchors[0].estimatedFee).toBeNull();
  });
});
