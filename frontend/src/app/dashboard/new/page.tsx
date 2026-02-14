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
};

type FieldErrors = Partial<
  Record<"name" | "model" | "channel" | "botToken", string>
>;

const modelOptions = [
  { value: "claude-opus-4.5", label: "Claude Opus 4.5" },
  { value: "gpt-5.2", label: "GPT-5.2" },
  { value: "gemini-3-flash", label: "Gemini 3 Flash" },
];

const channelOptions = [
  { value: "", label: "Skip — configure later" },
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
];

const initialFormState: CreateInstanceFormState = {
  name: "",
  model: "claude-opus-4.5",
  channel: "",
  botToken: "",
};

function validateForm(values: CreateInstanceFormState): FieldErrors {
  const nextErrors: FieldErrors = {};

  if (!values.name.trim()) {
    nextErrors.name = "Instance name is required";
  }

  if (values.channel && !values.botToken.trim()) {
    nextErrors.botToken = "Bot token is required when a channel is selected";
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

    if (name in fieldErrors) {
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
          channel: formValues.channel || undefined,
          botToken: formValues.channel ? formValues.botToken || undefined : undefined,
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
        description="Pick a name, model, and optional channel. Finish onboarding in the Web Terminal."
        variant="elevated"
      >
        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          {/* Basic Config */}
          <div className="space-y-4">
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
              options={modelOptions}
            />
          </div>

          {/* Channel Config */}
          <div className="space-y-3">
            <div className="border-t border-secondary-200 pt-4">
              <h3 className="text-sm font-medium text-secondary-900">
                Channel Configuration
              </h3>
              <p className="mt-1 text-xs text-secondary-500">
                Connect a messaging platform. You can always configure this later
                via the Dashboard.
              </p>
            </div>

            <Select
              label="Channel"
              name="channel"
              value={formValues.channel}
              onChange={handleFieldChange}
              options={channelOptions}
            />

            {formValues.channel ? (
              <div className="space-y-2">
                <Input
                  label="Bot Token"
                  name="botToken"
                  type="password"
                  value={formValues.botToken}
                  onChange={handleFieldChange}
                  error={fieldErrors.botToken}
                  placeholder={
                    formValues.channel === "telegram"
                      ? "123456:ABC-DEF..."
                      : "MTI3NDU2Nzg5MDEy..."
                  }
                  autoComplete="off"
                  required
                />
                <p className="text-xs text-secondary-500">
                  {formValues.channel === "telegram"
                    ? "Get your token from @BotFather on Telegram"
                    : "Get your token from Discord Developer Portal → Bot → Reset Token"}
                </p>
              </div>
            ) : null}
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-secondary-200 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/dashboard")}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {isSubmitting ? "Deploying Instance..." : "Deploy Instance"}
            </Button>
          </div>
        </form>
      </Card>
    </DashboardLayout>
  );
}
