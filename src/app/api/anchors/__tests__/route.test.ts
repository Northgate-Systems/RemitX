import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCurrentUser, mockListAnchors, mockEstimateFee } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockListAnchors: vi.fn(),
  mockEstimateFee: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/anchors", () => ({
  listAnchors: mockListAnchors,
  estimateFee: mockEstimateFee,
}));

import { GET } from "../route";

function makeRequest(query = "") {
  return new Request(`http://localhost/api/anchors${query}`);
}

function fakeUser() {
  return { id: "user-1" };
}

// 25 fake anchors so pagination actually has more than one page to test.
function fakeAnchors(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `anchor-${i}`,
    name: `Anchor ${i}`,
    feePercent: 1,
  }));
}

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockListAnchors.mockReset();
  mockEstimateFee.mockReset();
  mockGetCurrentUser.mockResolvedValue(fakeUser());
  mockListAnchors.mockReturnValue(fakeAnchors(25));
  mockEstimateFee.mockImplementation((anchor: { feePercent: number }, amount: number) => amount * (anchor.feePercent / 100));
});

describe("GET /api/anchors", () => {
  it("rejects an unauthenticated request before touching the anchor list", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(mockListAnchors).not.toHaveBeenCalled();
  });

  it("defaults to page 1 of 20, with pagination metadata reflecting the full filtered set", async () => {
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.anchors).toHaveLength(20);
    expect(body.data.anchors[0].id).toBe("anchor-0");
    expect(body.data.pagination).toEqual({ page: 1, pageSize: 20, total: 25, totalPages: 2 });
  });

  it("returns the second page's remainder, not a full page of stale/duplicate rows", async () => {
    const response = await GET(makeRequest("?page=2"));
    const body = await response.json();

    expect(body.data.anchors).toHaveLength(5);
    expect(body.data.anchors[0].id).toBe("anchor-20");
    expect(body.data.pagination).toEqual({ page: 1 * 2, pageSize: 20, total: 25, totalPages: 2 });
  });

  it("honors an explicit pageSize", async () => {
    const response = await GET(makeRequest("?page=1&pageSize=10"));
    const body = await response.json();

    expect(body.data.anchors).toHaveLength(10);
    expect(body.data.pagination).toEqual({ page: 1, pageSize: 10, total: 25, totalPages: 3 });
  });

  it("returns an empty page (not an error) past the end of the result set", async () => {
    const response = await GET(makeRequest("?page=99"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.anchors).toHaveLength(0);
    expect(body.data.pagination.totalPages).toBe(2);
  });

  it("rejects a non-positive page with 400, without calling listAnchors", async () => {
    const response = await GET(makeRequest("?page=0"));

    expect(response.status).toBe(400);
  });

  it("rejects a pageSize above the cap with 400", async () => {
    const response = await GET(makeRequest("?pageSize=500"));

    expect(response.status).toBe(400);
  });

  it("rejects a non-numeric page with 400 instead of silently defaulting", async () => {
    const response = await GET(makeRequest("?page=not-a-number"));

    expect(response.status).toBe(400);
  });

  it("still passes corridor/assetCode/amount through to listAnchors/estimateFee unchanged", async () => {
    await GET(makeRequest("?corridor=Nigeria&assetCode=USDC&amount=500"));

    expect(mockListAnchors).toHaveBeenCalledWith({ corridor: "Nigeria", assetCode: "USDC" });
    expect(mockEstimateFee).toHaveBeenCalledWith(expect.objectContaining({ id: "anchor-0" }), 500);
  });
});
