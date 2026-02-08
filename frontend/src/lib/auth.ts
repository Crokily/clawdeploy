import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export type AuthErrorResponse = NextResponse<{ error: string }>;
export type AuthResult = string | AuthErrorResponse;

export async function requireAuth(): Promise<AuthResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return userId;
  } catch (error: unknown) {
    logger.error({ err: error }, "Failed to validate Clerk session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export function isAuthErrorResponse(
  result: AuthResult,
): result is AuthErrorResponse {
  return result instanceof NextResponse;
}
