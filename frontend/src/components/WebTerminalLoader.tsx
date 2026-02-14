"use client";

import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/components/ui";

const WebTerminal = dynamic(
  () =>
    import("@/components/WebTerminal").then((mod) => ({
      default: mod.WebTerminal,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[300px] bg-[#1a1b26] rounded-xl">
        <div className="flex items-center gap-2 text-[#a9b1d6]">
          <LoadingSpinner size="sm" />
          <span className="text-sm font-mono">Loading terminal...</span>
        </div>
      </div>
    ),
  },
);

export { WebTerminal };
