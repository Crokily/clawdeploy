"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
} from "react";
import { DashboardLayout } from "@/components/layout";
import { Button, Card, Input, LoadingSpinner, Select } from "@/components/ui";

type CreateInstanceFormState = {
  name: string;
  model: string;
  channel: string;
  botToken: string;
  apiKey: string;
};

type FieldErrors = Partial<
  Record<"name" | "model" | "channel", string>
>;

const modelOptions = [
  { value: "", label: "Select an AI model" },
  { value: "claude-opus-4.5", label: "Claude Opus 4.5" },
  { value: "gpt-5.2", label: "GPT-5.2" },
  { value: "gemini-3-flash", label: "Gemini 3 Flash" },
];

const channelOptions = [
  { value: "", label: "Select a channel" },
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
  { value: "whatsapp", label: "WhatsApp" },
];

const initialFormState: CreateInstanceFormState = {
  name: "",
  model: "",
  channel: "",
  botToken: "",
  apiKey: "",
};

function validateForm(values: CreateInstanceFormState): FieldErrors {
  const nextErrors: FieldErrors = {};

  if (!values.name.trim()) {
    nextErrors.name = "Instance name is required";
  }

  if (!values.model) {
    nextErrors.model = "AI model is required";
  }

  if (!values.channel) {
    nextErrors.channel = "Channel is required";
  }

  return nextErrors;
}

export default function NewInstancePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();

  const [formValues, setFormValues] =
    useState<CreateInstanceFormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  const handleFieldChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;

    setFormValues((previous) => ({ ...previous, [name]: value }));
    setErrorMessage("");

    if (name === "name" || name === "model" || name === "channel") {
      setFieldErrors((previous) => ({ ...previous, [name]: undefined }));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationErrors = validateForm(formValues);
    setFieldErrors(validationErrors);
    setErrorMessage("");

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formValues.name.trim(),
          model: formValues.model,
          channel: formValues.channel,
          botToken: formValues.botToken || undefined,
          apiKey: formValues.apiKey || undefined,
        }),
      });

      if (!response.ok) {
        let message = "Failed to create instance. Please try again.";

        try {
          const result = (await response.json()) as {
            error?: unknown;
          };

          if (typeof result.error === "string" && result.error.trim()) {
            message = result.error;
          }
        } catch {
          // Keep default error message when response body is not JSON.
        }

        throw new Error(message);
      }

      router.push("/dashboard");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to create instance. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) {
    return (
      <DashboardLayout>
        <Card
          title="Create New Instance"
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
      <Card
        title="Create New Instance"
        description="Configure your OpenClaw instance and deploy it in one step."
        variant="elevated"
      >
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Input
            label="Instance Name"
            name="name"
            value={formValues.name}
            onChange={handleFieldChange}
            error={fieldErrors.name}
            placeholder="My OpenClaw Assistant"
            required
          />

          <Select
            label="AI Model"
            name="model"
            value={formValues.model}
            onChange={handleFieldChange}
            error={fieldErrors.model}
            options={modelOptions}
            required
          />

          <Select
            label="Channel"
            name="channel"
            value={formValues.channel}
            onChange={handleFieldChange}
            error={fieldErrors.channel}
            options={channelOptions}
            required
          />

          <Input
            label="Bot Token"
            name="botToken"
            type="password"
            value={formValues.botToken}
            onChange={handleFieldChange}
            placeholder="Optional"
            autoComplete="off"
          />

          <Input
            label="API Key"
            name="apiKey"
            type="password"
            value={formValues.apiKey}
            onChange={handleFieldChange}
            placeholder="Optional"
            autoComplete="off"
          />

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/dashboard")}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {isSubmitting ? "Creating Instance..." : "Create Instance"}
            </Button>
          </div>
        </form>
      </Card>
    </DashboardLayout>
  );
}
