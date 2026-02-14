"use client";

import { useUser } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InstanceActions } from "@/components/InstanceActions";
import { DashboardLayout } from "@/components/layout";
import { Badge, Button, Card, LoadingSpinner } from "@/components/ui";

type Instance = {
  id: string;
  name: string;
  model: string;
  channel: string;
  status: string;
  containerId: string | null;
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

  if (normalizedStatus === "pending" || normalizedStatus === "creating") {
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

        const instanceResult = (await instanceResponse.json()) as InstanceResponse;
        if (!instanceResult.instance) {
          throw new Error("Failed to load instance details. Please try again.");
        }

        if (!signal?.aborted) {
          setInstance(instanceResult.instance);
        }

        const logsResponse = await fetch(`/api/instances/${encodedId}/logs`, {
          cache: "no-store",
          signal,
        });

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

          if (logsResponse.status === 400 && message === "Instance has no container") {
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
                      {instance.channel}
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

            <Card title="Container Logs" variant="elevated">
              {hasLogs ? (
                <pre className="max-h-[400px] overflow-y-auto rounded-xl bg-secondary-900 p-4 font-mono text-xs leading-relaxed text-secondary-100 whitespace-pre-wrap">
                  {logs}
                </pre>
              ) : (
                <p className="text-sm text-secondary-600">No logs available</p>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
