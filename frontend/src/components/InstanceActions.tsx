"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@/components/ui";

export interface InstanceActionsProps {
  instanceId: string;
  status: string;
  containerId: string | null;
  onStatusChange?: () => void;
}

type ActionType = "start" | "stop" | "delete" | "update" | null;

type ErrorResponse = {
  error?: unknown;
};

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

type RunActionParams = {
  action: Exclude<ActionType, null>;
  request: () => Promise<Response>;
  fallbackMessage: string;
  shouldRedirectOnSuccess?: boolean;
};

export function InstanceActions({
  instanceId,
  status,
  containerId,
  onStatusChange,
}: InstanceActionsProps) {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const encodedId = encodeURIComponent(instanceId);
  const normalizedStatus = status.trim().toLowerCase();
  const hasContainer = Boolean(containerId);
  const isMutating = activeAction !== null;

  const isStartDisabled =
    isMutating ||
    normalizedStatus === "running" ||
    normalizedStatus === "creating" ||
    !hasContainer;
  const isStopDisabled =
    isMutating ||
    normalizedStatus === "stopped" ||
    normalizedStatus === "pending" ||
    !hasContainer;
  const isDeleteDisabled = isMutating;

  const swallowClick = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const closeDeleteModal = () => {
    if (activeAction === "delete") {
      return;
    }

    setIsDeleteModalOpen(false);
  };

  const runAction = async ({
    action,
    request,
    fallbackMessage,
    shouldRedirectOnSuccess = false,
  }: RunActionParams) => {
    setActiveAction(action);
    setErrorMessage("");

    try {
      const response = await request();

      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message ?? fallbackMessage);
      }

      if (action === "delete") {
        setIsDeleteModalOpen(false);
      }

      if (onStatusChange) {
        onStatusChange();
      } else if (shouldRedirectOnSuccess) {
        router.push("/dashboard");
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : fallbackMessage,
      );
    } finally {
      setActiveAction(null);
    }
  };

  const handleStart = async (event: MouseEvent<HTMLButtonElement>) => {
    swallowClick(event);
    await runAction({
      action: "start",
      request: () =>
        fetch(`/api/instances/${encodedId}/start`, {
          method: "POST",
        }),
      fallbackMessage: "Failed to start instance. Please try again.",
    });
  };

  const handleStop = async (event: MouseEvent<HTMLButtonElement>) => {
    swallowClick(event);
    await runAction({
      action: "stop",
      request: () =>
        fetch(`/api/instances/${encodedId}/stop`, {
          method: "POST",
        }),
      fallbackMessage: "Failed to stop instance. Please try again.",
    });
  };

  const handleUpdate = async (event: MouseEvent<HTMLButtonElement>) => {
    swallowClick(event);
    await runAction({
      action: "update",
      request: () =>
        fetch(`/api/instances/${encodedId}/update`, {
          method: "POST",
        }),
      fallbackMessage: "Failed to update instance. Please try again.",
    });
  };

  const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
    swallowClick(event);
    setErrorMessage("");
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    swallowClick(event);
    await runAction({
      action: "delete",
      request: () =>
        fetch(`/api/instances/${encodedId}`, {
          method: "DELETE",
        }),
      fallbackMessage: "Failed to delete instance. Please try again.",
      shouldRedirectOnSuccess: true,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleStart}
          disabled={isStartDisabled}
          isLoading={activeAction === "start"}
        >
          Start
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleStop}
          disabled={isStopDisabled}
          isLoading={activeAction === "stop"}
        >
          Stop
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleUpdate}
          disabled={isMutating || normalizedStatus !== "running"}
          isLoading={activeAction === "update"}
        >
          Update
        </Button>

        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleteDisabled}
          isLoading={activeAction === "delete"}
        >
          Delete
        </Button>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700"
        >
          {errorMessage}
        </p>
      ) : null}

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        title="Delete instance"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={closeDeleteModal}
              disabled={activeAction === "delete"}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDeleteConfirm}
              isLoading={activeAction === "delete"}
              disabled={activeAction === "delete"}
            >
              Delete
            </Button>
          </div>
        }
      >
        Are you sure you want to delete this instance? This action cannot be
        undone.
      </Modal>
    </div>
  );
}
