import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { syncInstanceStates } from "@/lib/state-sync";

export const runtime = "nodejs";

type ErrorResponse = {
  error: string;
};

type SyncResponse = {
  checked: number;
  updated: number;
};

function unauthorized(): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function internalServerError(): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function POST(
  request: Request,
): Promise<NextResponse<SyncResponse | ErrorResponse>> {
  const providedSecret = request.headers.get("x-sync-secret");
  const expectedSecret = process.env.SYNC_SECRET;

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return unauthorized();
  }

  try {
    const result = await syncInstanceStates();
    return NextResponse.json(result);
  } catch (error: unknown) {
    logger.error({ err: error }, "Failed to synchronize instance states");
    return internalServerError();
  }
}
