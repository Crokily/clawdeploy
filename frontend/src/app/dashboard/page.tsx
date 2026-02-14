"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InstanceActions } from "@/components/InstanceActions";
import { DashboardLayout } from "@/components/layout";
import { Badge, Button, Card, EmptyState, LoadingSpinner } from "@/components/ui";

type Instance = {
  id: string;
  name: string;
  model: string;
  channel: string;
  status: string;
  containerId: string | null;
  createdAt: string;
};

type ListInstancesResponse = {
  instances: Instance[];
};

type ErrorResponse = {
  error?: unknown;
};

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const error = (await response.json()) as ErrorResponse;

    if (typeof error.error === "string" && error.error.trim()) {
      return error.error;
    }
  } catch {
    // Use the default error message when the response is not JSON.
  }

  return null;
}

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

function formatCreatedAt(
  value: string,
  formatter: Intl.DateTimeFormat,
): string {
  const createdAt = new Date(value);

  if (Number.isNaN(createdAt.getTime())) {
    return "Unknown";
  }

  return formatter.format(createdAt);
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.5 5L12.5 10L7.5 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const createdAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );

  const [instances, setInstances] = useState<Instance[]>([]);
  const [isFetchingInstances, setIsFetchingInstances] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadInstances = useCallback(async (signal?: AbortSignal) => {
    setIsFetchingInstances(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/instances", {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message ?? "Failed to load instances. Please try again.");
      }

      const result = (await response.json()) as ListInstancesResponse;

      if (!signal?.aborted) {
        setInstances(Array.isArray(result.instances) ? result.instances : []);
      }
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
          : "Failed to load instances. Please try again.",
      );
      setInstances([]);
    } finally {
      if (!signal?.aborted) {
        setIsFetchingInstances(false);
      }
    }
  }, []);

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
    void loadInstances(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isLoaded, isSignedIn, loadInstances]);

  const handleStatusChange = useCallback(() => {
    void loadInstances();
  }, [loadInstances]);

  if (!isLoaded) {
    return (
      <DashboardLayout>
        <Card
          title="Dashboard"
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-secondary-900">
              Instances
            </h1>
            <p className="text-sm text-secondary-600">
              Manage your OpenClaw runtime and deployment resources from one
              place.
            </p>
          </div>

          <form action="/dashboard/new">
            <Button type="submit" rightIcon={<ArrowRightIcon />}>
              Create New Instance
            </Button>
          </form>
        </div>

        {isFetchingInstances ? (
          <Card
            title="Loading instances"
            description="Fetching your deployments..."
            variant="default"
          >
            <div className="flex items-center gap-2 text-sm text-secondary-600">
              <LoadingSpinner size="sm" />
              <span>Loading instances</span>
            </div>
          </Card>
        ) : null}

        {!isFetchingInstances && errorMessage ? (
          <div
            role="alert"
            className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
          >
            {errorMessage}
          </div>
        ) : null}

        {!isFetchingInstances && !errorMessage && instances.length === 0 ? (
          <Card
            title="Instances"
            description="Create your first deployment to start using your personal assistant."
            variant="elevated"
          >
            <EmptyState
              title="No instances yet"
              description="Spin up your first instance in under a minute. You can manage status, logs and updates from this dashboard."
            />

            <div className="mt-6">
              <form action="/dashboard/new">
                <Button type="submit" rightIcon={<ArrowRightIcon />}>
                  Create New Instance
                </Button>
              </form>
            </div>
          </Card>
        ) : null}

        {!isFetchingInstances && !errorMessage && instances.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {instances.map((instance) => (
              <Card
                key={instance.id}
                title={instance.name}
                description={`${instance.model} · ${instance.channel}`}
                variant="elevated"
                className="h-full"
              >
                <div className="space-y-4">
                  <Link
                    href={`/dashboard/instances/${instance.id}`}
                    className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Badge variant={getStatusVariant(instance.status)}>
                        {formatStatus(instance.status)}
                      </Badge>
                      <p className="text-xs text-secondary-500">
                        Created{" "}
                        {formatCreatedAt(
                          instance.createdAt,
                          createdAtFormatter,
                        )}
                      </p>
                    </div>
                  </Link>

                  <InstanceActions
                    instanceId={instance.id}
                    status={instance.status}
                    containerId={instance.containerId}
                    onStatusChange={handleStatusChange}
                  />
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
