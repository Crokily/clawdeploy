import type { Instance } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth, isAuthErrorResponse } from "@/lib/auth";
import { stopContainer } from "@/lib/docker";
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

function missingContainer(): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { error: "Instance has no container" },
    { status: 400 },
  );
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

    if (!instance.containerId) {
      return missingContainer();
    }

    await stopContainer(instance.containerId);

    const result = await prisma.instance.updateMany({
      where: {
        id: idResult.id,
        userId,
      },
      data: {
        status: "stopped",
      },
    });

    if (result.count === 0) {
      return notFound();
    }

    const updated = await prisma.instance.findFirst({
      where: {
        id: idResult.id,
        userId,
      },
    });

    if (!updated) {
      return notFound();
    }

    // Update Nginx port map (remove stopped instance)
    try {
      const { updateNginxPortMap } = await import("@/lib/nginx");
      await updateNginxPortMap();
    } catch {
      // Non-critical
    }

    return NextResponse.json({ instance: updated });
  } catch (error: unknown) {
    logger.error(
      { err: error, userId, instanceId: idResult.id },
      "Failed to stop instance",
    );
    return internalServerError();
  }
}
