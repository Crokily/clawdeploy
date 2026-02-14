"use client";

import { useUser } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InstanceActions } from "@/components/InstanceActions";
import { WebTerminal } from "@/components/WebTerminalLoader";
import { DashboardLayout } from "@/components/layout";
import { Badge, Button, Card, LoadingSpinner } from "@/components/ui";

type Instance = {
  id: string;
  name: string;
  model: string;
  channel: string;
  status: string;
  containerId: string | null;
  port: number | null;
  gatewayToken: string | null;
  createdAt: string;
  updatedAt: string;
};

type InstanceResponse = {
  instance: Instance;
};

type LogsResponse = {
  logs: string;
};

type ErrorResponse = {
  error?: unknown;
};

function getStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "default" {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === "running") {
    return "success";
  }

  if (
    normalizedStatus === "pending" ||
    normalizedStatus === "creating" ||
    normalizedStatus === "updating"
  ) {
    return "warning";
  }

  if (normalizedStatus === "error") {
    return "danger";
  }

  return "default";
}

function formatStatus(status: string): string {
  const normalizedStatus = status.trim().toLowerCase();

  if (!normalizedStatus) {
    return "Unknown";
  }

  return normalizedStatus[0].toUpperCase() + normalizedStatus.slice(1);
}

function formatTimestamp(value: string, formatter: Intl.DateTimeFormat): string {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown";
  }

  return formatter.format(parsedDate);
}

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as ErrorResponse;

    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Ignore non-JSON error payloads.
  }

  return null;
}

export default function InstanceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string | string[] }>();
  const { isLoaded, isSignedIn } = useUser();
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );

  const rawInstanceId = params.id;
  const instanceId = Array.isArray(rawInstanceId)
    ? rawInstanceId[0]
    : rawInstanceId;

  const [instance, setInstance] = useState<Instance | null>(null);
  const [logs, setLogs] = useState("");
  const [isFetching, setIsFetching] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

  const dashboardUrl = instance
    ? `https://${instance.id}.claw.a2a.ing`
    : null;

  const loadInstanceDetails = useCallback(
    async (signal?: AbortSignal) => {
      if (!isLoaded || !isSignedIn) {
        return;
      }

      setIsFetching(true);
      setErrorMessage("");
      setIsNotFound(false);
      setInstance(null);
      setLogs("");

      if (!instanceId) {
        if (!signal?.aborted) {
          setIsNotFound(true);
          setIsFetching(false);
        }
        return;
      }

      const encodedId = encodeURIComponent(instanceId);

      try {
        const instanceResponse = await fetch(`/api/instances/${encodedId}`, {
          cache: "no-store",
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        if (instanceResponse.status === 404) {
          setIsNotFound(true);
          return;
        }

        if (!instanceResponse.ok) {
          const message = await readErrorMessage(instanceResponse);
          throw new Error(
            message ?? "Failed to load instance details. Please try again.",
          );
        }

        const instanceResult =
          (await instanceResponse.json()) as InstanceResponse;
        if (!instanceResult.instance) {
          throw new Error(
            "Failed to load instance details. Please try again.",
          );
        }

        if (!signal?.aborted) {
          setInstance(instanceResult.instance);
        }

        const logsResponse = await fetch(
          `/api/instances/${encodedId}/logs`,
          {
            cache: "no-store",
            signal,
          },
        );

        if (signal?.aborted) {
          return;
        }

        if (logsResponse.status === 404) {
          setIsNotFound(true);
          setInstance(null);
          return;
        }

        if (!logsResponse.ok) {
          const message = await readErrorMessage(logsResponse);

          if (
            logsResponse.status === 400 &&
            message === "Instance has no container"
          ) {
            setLogs("");
            return;
          }

          throw new Error(
            message ?? "Failed to load container logs. Please try again.",
          );
        }

        const logsResult = (await logsResponse.json()) as LogsResponse;
        setLogs(typeof logsResult.logs === "string" ? logsResult.logs : "");
      } catch (error: unknown) {
        if (signal?.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load instance details. Please try again.",
        );
      } finally {
        if (!signal?.aborted) {
          setIsFetching(false);
        }
      }
    },
    [instanceId, isLoaded, isSignedIn],
  );

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    const controller = new AbortController();
    void loadInstanceDetails(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isLoaded, isSignedIn, loadInstanceDetails]);

  const handleStatusChange = useCallback(() => {
    void loadInstanceDetails();
  }, [loadInstanceDetails]);

  const handleCopyToken = useCallback(() => {
    if (instance?.gatewayToken) {
      void navigator.clipboard.writeText(instance.gatewayToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  }, [instance?.gatewayToken]);

  if (!isLoaded) {
    return (
      <DashboardLayout>
        <Card
          title="Instance Details"
          description="Preparing your workspace..."
          variant="default"
        >
          <div className="flex items-center gap-2 text-sm text-secondary-600">
            <LoadingSpinner size="sm" />
            <span>Loading account details</span>
          </div>
        </Card>
      </DashboardLayout>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  const hasLogs = logs.trim().length > 0;
  const containerIdPreview = instance?.containerId
    ? instance.containerId.slice(0, 12)
    : "Not assigned";
  const isRunning = instance?.status?.toLowerCase() === "running";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
          className="h-auto px-0 py-0 text-primary-700 hover:bg-transparent hover:text-primary-800"
        >
          ← Back to Dashboard
        </Button>

        {isFetching ? (
          <Card
            title="Loading instance details"
            description="Fetching current status and logs..."
            variant="default"
          >
            <div className="flex items-center gap-2 text-sm text-secondary-600">
              <LoadingSpinner size="sm" />
              <span>Loading instance details</span>
            </div>
          </Card>
        ) : null}

        {!isFetching && isNotFound ? (
          <Card title="Instance Details" variant="elevated">
            <p className="text-sm text-secondary-700">Instance not found</p>
          </Card>
        ) : null}

        {!isFetching && errorMessage ? (
          <div
            role="alert"
            className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
          >
            {errorMessage}
          </div>
        ) : null}

        {!isFetching && !isNotFound && instance ? (
          <>
            <Card title={instance.name} variant="elevated">
              <div className="space-y-5">
                <Badge variant={getStatusVariant(instance.status)}>
                  {formatStatus(instance.status)}
                </Badge>

                {/* Dashboard Access — shown when running */}
                {isRunning && dashboardUrl ? (
                  <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                      OpenClaw Dashboard
                    </p>

                    <div>
                      <p className="text-sm text-secondary-600 mb-1">
                        Dashboard URL
                      </p>
                      <a
                        href={dashboardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800 underline underline-offset-2"
                      >
                        {dashboardUrl}
                        <span className="text-xs">↗</span>
                      </a>
                    </div>

                    {instance.gatewayToken ? (
                      <div>
                        <p className="text-sm text-secondary-600 mb-1">
                          Gateway Token
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded-lg bg-white px-3 py-1.5 font-mono text-xs text-secondary-800 border border-secondary-200 break-all">
                            {showToken
                              ? instance.gatewayToken
                              : "•".repeat(32)}
                          </code>
                          <button
                            type="button"
                            onClick={() => setShowToken((v) => !v)}
                            className="rounded-lg border border-secondary-200 px-2 py-1.5 text-xs text-secondary-600 hover:bg-secondary-100 transition-colors"
                          >
                            {showToken ? "Hide" : "Show"}
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyToken}
                            className="rounded-lg border border-secondary-200 px-2 py-1.5 text-xs text-secondary-600 hover:bg-secondary-100 transition-colors"
                          >
                            {tokenCopied ? "Copied!" : "Copy"}
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs text-secondary-500">
                          Use this token to log into your OpenClaw Dashboard
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500">
                      Model
                    </dt>
                    <dd className="mt-1 text-sm text-secondary-800">
                      {instance.model}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500">
                      Channel
                    </dt>
                    <dd className="mt-1 text-sm text-secondary-800">
                      {instance.channel || "Not configured"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500">
                      Container ID
                    </dt>
                    <dd className="mt-1 font-mono text-sm text-secondary-800">
                      {containerIdPreview}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500">
                      Created
                    </dt>
                    <dd className="mt-1 text-sm text-secondary-800">
                      {formatTimestamp(instance.createdAt, dateTimeFormatter)}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary-500">
                      Updated
                    </dt>
                    <dd className="mt-1 text-sm text-secondary-800">
                      {formatTimestamp(instance.updatedAt, dateTimeFormatter)}
                    </dd>
                  </div>
                </dl>

                <div className="rounded-xl border border-secondary-200 bg-secondary-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-secondary-500">
                    Actions
                  </p>
                  <div className="mt-3">
                    <InstanceActions
                      instanceId={instance.id}
                      status={instance.status}
                      containerId={instance.containerId}
                      onStatusChange={handleStatusChange}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Web Terminal */}
            {isRunning ? (
              <Card
                title="Web Terminal"
                description="Access your instance CLI directly in the browser"
                variant="elevated"
              >
                {showTerminal ? (
                  <div style={{ height: "400px" }}>
                    <WebTerminal
                      instanceId={instance.id}
                      userId={instance.id} // Simplified for MVP — actual auth via Clerk
                      onClose={() => setShowTerminal(false)}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <p className="text-sm text-secondary-600">
                      Open a terminal to run commands like{" "}
                      <code className="rounded bg-secondary-100 px-1.5 py-0.5 font-mono text-xs">
                        openclaw configure
                      </code>
                      ,{" "}
                      <code className="rounded bg-secondary-100 px-1.5 py-0.5 font-mono text-xs">
                        openclaw channels add
                      </code>
                      , or{" "}
                      <code className="rounded bg-secondary-100 px-1.5 py-0.5 font-mono text-xs">
                        openclaw doctor
                      </code>
                    </p>
                    <Button
                      type="button"
                      onClick={() => setShowTerminal(true)}
                    >
                      🖥️ Open Terminal
                    </Button>
                  </div>
                )}
              </Card>
            ) : null}

            <Card title="Container Logs" variant="elevated">
              {hasLogs ? (
                <pre className="max-h-[400px] overflow-y-auto rounded-xl bg-secondary-900 p-4 font-mono text-xs leading-relaxed text-secondary-100 whitespace-pre-wrap">
                  {logs}
                </pre>
              ) : (
                <p className="text-sm text-secondary-600">
                  No logs available
                </p>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
