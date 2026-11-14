import { NextRequest } from "next/server";
import { performDemoLogin } from "@/lib/demo-login";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return performDemoLogin(request);
}
