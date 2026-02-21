import type { Instance } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth, isAuthErrorResponse } from "@/lib/auth";
import { instanceIdSchema } from "@/lib/instance-schema";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ErrorResponse = {
  error: string;
  details?: unknown;
  retryAfter?: number;
};

type InstanceResponse = {
  instance: Instance;
};

function invalidInput(details: unknown): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: "Invalid input", details }, { status: 400 });
}

function notFound(): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: "Instance not found" }, { status: 404 });
}

function internalServerError(): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function tooManyRequests(retryAfter: number): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { error: "Too many requests", retryAfter },
    { status: 429 },
  );
}

async function getValidatedId(
  params: RouteContext["params"],
): Promise<{ ok: true; id: string } | { ok: false; response: NextResponse<ErrorResponse> }> {
  const { id } = await params;
  const parsed = instanceIdSchema.safeParse(id);

  if (!parsed.success) {
    return { ok: false, response: invalidInput(parsed.error.issues) };
  }

  return { ok: true, id: parsed.data };
}

export async function POST(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse<InstanceResponse | ErrorResponse>> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;
  const rateLimitResult = checkRateLimit(userId);
  if (!rateLimitResult.allowed) {
    return tooManyRequests(rateLimitResult.retryAfter ?? 1);
  }

  const idResult = await getValidatedId(params);
  if (!idResult.ok) {
    return idResult.response;
  }

  try {
    const instance = await prisma.instance.findFirst({
      where: {
        id: idResult.id,
        userId,
      },
    });

    if (!instance) {
      return notFound();
    }

    await prisma.task.create({
      data: {
        type: "instance_start",
        params: { instanceId: idResult.id },
        userId,
        instanceId: idResult.id,
        status: "pending",
      },
    });

    return NextResponse.json({ instance }, { status: 202 });
  } catch (error: unknown) {
    logger.error(
      { err: error, userId, instanceId: idResult.id },
      "Failed to start instance",
    );
    return internalServerError();
  }
}
