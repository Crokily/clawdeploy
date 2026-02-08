import type { Instance } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth, isAuthErrorResponse } from "@/lib/auth";
import { instanceIdSchema, updateInstanceSchema } from "@/lib/instance-schema";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ErrorResponse = {
  error: string;
  details?: unknown;
};

type InstanceResponse = {
  instance: Instance;
};

type DeleteResponse = {
  success: true;
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

export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse<InstanceResponse | ErrorResponse>> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;
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

    return NextResponse.json({ instance });
  } catch (error: unknown) {
    logger.error(
      { err: error, userId, instanceId: idResult.id },
      "Failed to fetch instance",
    );
    return internalServerError();
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse<InstanceResponse | ErrorResponse>> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;
  const idResult = await getValidatedId(params);
  if (!idResult.ok) {
    return idResult.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error: unknown) {
    logger.error(
      { err: error, userId, instanceId: idResult.id },
      "Invalid JSON for instance update",
    );
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = updateInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error.issues);
  }

  try {
    const result = await prisma.instance.updateMany({
      where: {
        id: idResult.id,
        userId,
      },
      data: parsed.data,
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

    return NextResponse.json({ instance: updated });
  } catch (error: unknown) {
    logger.error(
      { err: error, userId, instanceId: idResult.id },
      "Failed to update instance",
    );
    return internalServerError();
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse<DeleteResponse | ErrorResponse>> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;
  const idResult = await getValidatedId(params);
  if (!idResult.ok) {
    return idResult.response;
  }

  try {
    const result = await prisma.instance.deleteMany({
      where: {
        id: idResult.id,
        userId,
      },
    });

    if (result.count === 0) {
      return notFound();
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error(
      { err: error, userId, instanceId: idResult.id },
      "Failed to delete instance",
    );
    return internalServerError();
  }
}
