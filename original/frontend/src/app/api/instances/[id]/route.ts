import { Prisma, type Instance } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth, isAuthErrorResponse } from "@/lib/auth";
import { removeContainer } from "@/lib/docker";
import { removeInstanceStorage } from "@/lib/instance-config";
import { instanceIdSchema, updateInstanceSchema } from "@/lib/instance-schema";
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

function tooManyRequests(retryAfter: number): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { error: "Too many requests", retryAfter },
    { status: 429 },
  );
}

function redactInstanceSecrets(instance: Instance, includeToken: boolean = false): Instance {
  return {
    ...instance,
    botToken: null,
    apiKey: null,
    gatewayToken: includeToken ? instance.gatewayToken : null,
  };
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

    // Return gatewayToken to the owning user
    return NextResponse.json({ instance: redactInstanceSecrets(instance, true) });
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

  const { config, ...rest } = parsed.data;

  const updateData: Prisma.InstanceUpdateManyMutationInput = {
    ...rest,
    ...(config !== undefined
      ? {
          config:
            config === null
              ? Prisma.JsonNull
              : (config as Prisma.InputJsonValue),
        }
      : {}),
  };

  try {
    const result = await prisma.instance.updateMany({
      where: {
        id: idResult.id,
        userId,
      },
      data: updateData,
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

    if (instance.containerId) {
      try {
        await removeContainer(instance.containerId);
      } catch (dockerError: unknown) {
        logger.warn(
          {
            err: dockerError,
            userId,
            instanceId: instance.id,
            containerId: instance.containerId,
          },
          "Failed to remove Docker container during instance deletion",
        );
      }
    }

    // Clean up persistent storage
    try {
      await removeInstanceStorage(instance.id);
    } catch (storageError: unknown) {
      logger.warn(
        { err: storageError, instanceId: instance.id },
        "Failed to remove instance storage during deletion",
      );
    }

    const result = await prisma.instance.deleteMany({
      where: {
        id: idResult.id,
        userId,
      },
    });

    if (result.count === 0) {
      return notFound();
    }

    // Update Nginx port map
    try {
      const { updateNginxPortMap } = await import("@/lib/nginx");
      await updateNginxPortMap();
    } catch (nginxError) {
      logger.warn({ err: nginxError }, "Failed to update Nginx port map after deletion");
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
