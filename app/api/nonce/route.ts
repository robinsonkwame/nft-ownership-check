import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { generateNonce } from "@/lib/verification";

export const runtime = "nodejs";

export async function POST() {
  const nonce = generateNonce();
  await redis.set(`nonce:${nonce}`, "1", { ex: 600 });
  return NextResponse.json({ nonce });
}
