import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

const VARS = [
  "ALCHEMY_API_KEY",
  "NEXT_PUBLIC_REOWN_PROJECT_ID",
  "PROLIFIC_COMPLETION_URL",
  "PROLIFIC_SCREENED_OUT_URL",
  "ADMIN_PASSWORD",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "TEST_BYPASS_PROLIFIC_ID",
] as const;

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="health", charset="UTF-8"',
    },
  });
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  return decoded.slice(idx + 1) === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const env_status = Object.fromEntries(
    VARS.map((v) => [v, Boolean(process.env[v])]),
  );

  let redis_ok = false;
  let redis_error: string | null = null;
  try {
    await redis.ping();
    redis_ok = true;
  } catch (e) {
    redis_error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    vercel_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercel_deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    vercel_env: process.env.VERCEL_ENV ?? null,
    env_status,
    redis_ok,
    redis_error,
  });
}
