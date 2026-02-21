import { DashboardLayout } from "@/components/layout";
import { LoadingSpinner } from "@/components/ui";

export default function DashboardLoading() {
  return (
    <DashboardLayout>
      <div className="flex min-h-[400px] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    </DashboardLayout>
  );
}
