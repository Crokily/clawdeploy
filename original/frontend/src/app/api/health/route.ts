import { NextResponse } from "next/server";
import { pingDocker } from "@/lib/docker";

export const runtime = "nodejs";

type HealthResponse = {
  status: "ok";
  timestamp: string;
  docker: "connected" | "disconnected";
};

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const dockerConnected = await pingDocker();

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    docker: dockerConnected ? "connected" : "disconnected",
  });
}
