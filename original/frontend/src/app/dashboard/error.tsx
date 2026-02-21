'use client';

import { DashboardLayout } from "@/components/layout";
import { Button, Card } from "@/components/ui";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardLayout>
      <div className="flex min-h-[400px] items-center justify-center">
        <Card
          title="Something went wrong"
          description={error.message || "An unexpected error occurred."}
        >
          <div className="mt-4 flex gap-4">
            <Button onClick={reset}>Try Again</Button>
            <Button variant="ghost" onClick={() => (window.location.href = "/")}>
              Back to Home
            </Button>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
