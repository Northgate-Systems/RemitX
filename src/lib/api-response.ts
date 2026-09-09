import { NextResponse } from "next/server";

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(
  message: string,
  status = 400,
  headers?: HeadersInit
) {
  return NextResponse.json(
    { success: false, error: message },
    headers ? { status, headers } : { status }
  );
}

export function unauthorizedResponse() {
  return errorResponse("Unauthorized", 401);
}