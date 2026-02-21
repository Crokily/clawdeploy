import { NextResponse } from "next/server";
import { requireAuth, isAuthErrorResponse } from "@/lib/auth";
import { getContainerLogs } from "@/lib/docker";
import { instanceIdSchema } from "@/lib/instance-schema";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ALL_TAIL = "all" as const;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ErrorResponse = {
  error: string;
  details?: unknown;
};

type LogsResponse = {
  logs: string;
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

function getValidatedTail(request: Request):
  | { ok: true; tail: number | typeof ALL_TAIL }
  | { ok: false; response: NextResponse<ErrorResponse> } {
  const { searchParams } = new URL(request.url);
  const tailParam = searchParams.get("tail");

  if (tailParam === null || tailParam.trim() === "") {
    return { ok: true, tail: ALL_TAIL };
  }

  if (tailParam === ALL_TAIL) {
    return { ok: true, tail: ALL_TAIL };
  }

  const parsedTail = Number.parseInt(tailParam, 10);

  if (!Number.isInteger(parsedTail) || parsedTail < 1) {
    return {
      ok: false,
      response: invalidInput([
        {
          path: ["tail"],
          message: "tail must be a positive integer or 'all'",
        },
      ]),
    };
  }

  return { ok: true, tail: parsedTail };
}

export async function GET(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse<LogsResponse | ErrorResponse>> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;
  const idResult = await getValidatedId(params);
  if (!idResult.ok) {
    return idResult.response;
  }

  const tailResult = getValidatedTail(request);
  if (!tailResult.ok) {
    return tailResult.response;
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

    const logs = await getContainerLogs(instance.containerId, tailResult.tail);

    return NextResponse.json({ logs });
  } catch (error: unknown) {
    logger.error(
      { err: error, userId, instanceId: idResult.id },
      "Failed to fetch instance logs",
    );
    return internalServerError();
  }
}
