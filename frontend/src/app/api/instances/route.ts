import type { Instance } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth, isAuthErrorResponse } from "@/lib/auth";
import { createInstanceSchema } from "@/lib/instance-schema";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ErrorResponse = {
  error: string;
  details?: unknown;
};

type ListInstancesResponse = {
  instances: Instance[];
};

type SingleInstanceResponse = {
  instance: Instance;
};

function invalidInput(details: unknown): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: "Invalid input", details }, { status: 400 });
}

function internalServerError(): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(): Promise<
  NextResponse<ListInstancesResponse | ErrorResponse>
> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;

  try {
    const instances = await prisma.instance.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ instances });
  } catch (error: unknown) {
    logger.error({ err: error, userId }, "Failed to fetch instances");
    return internalServerError();
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse<SingleInstanceResponse | ErrorResponse>> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error: unknown) {
    logger.error({ err: error, userId }, "Invalid JSON for instance creation");
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = createInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error.issues);
  }

  try {
    const instance = await prisma.instance.create({
      data: {
        ...parsed.data,
        userId,
        status: "pending",
      },
    });

    return NextResponse.json({ instance }, { status: 201 });
  } catch (error: unknown) {
    logger.error({ err: error, userId }, "Failed to create instance");
    return internalServerError();
  }
}
