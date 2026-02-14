"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { Badge, Button, Card, EmptyState, LoadingSpinner } from "@/components/ui";

type Instance = {
  id: string;
  name: string;
  model: string;
  channel: string;
  status: string;
  createdAt: string;
};

type ListInstancesResponse = {
  instances: Instance[];
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

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    let isCancelled = false;

    const loadInstances = async () => {
      setIsFetchingInstances(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/instances", {
          cache: "no-store",
        });

        if (!response.ok) {
          let message = "Failed to load instances. Please try again.";

          try {
            const error = (await response.json()) as ErrorResponse;
            if (typeof error.error === "string" && error.error.trim()) {
              message = error.error;
            }
          } catch {
            // Use the default error message when the response is not JSON.
          }

          throw new Error(message);
        }

        const result = (await response.json()) as ListInstancesResponse;

        if (!isCancelled) {
          setInstances(Array.isArray(result.instances) ? result.instances : []);
        }
      } catch (error: unknown) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load instances. Please try again.",
          );
          setInstances([]);
        }
      } finally {
        if (!isCancelled) {
          setIsFetchingInstances(false);
        }
      }
    };

    void loadInstances();

    return () => {
      isCancelled = true;
    };
  }, [isLoaded, isSignedIn]);

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
              <Link
                key={instance.id}
                href={`/dashboard/instances/${instance.id}`}
                className="block"
              >
                <Card
                  title={instance.name}
                  description={`${instance.model} · ${instance.channel}`}
                  variant="elevated"
                  className="h-full cursor-pointer"
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
                </Card>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
