import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

const BodySchema = z.object({
  prolific_id: z.string().min(1).max(64),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const { prolific_id } = parsed;

  const screenedOutUrl = process.env.PROLIFIC_SCREENED_OUT_URL;
  if (!screenedOutUrl) {
    console.error("[no-wallet] Missing PROLIFIC_SCREENED_OUT_URL", {
      prolific_id,
    });
    return NextResponse.json(
      { error: "Server misconfiguration. Please contact the researchers." },
      { status: 500 },
    );
  }

  const record = {
    prolific_id,
    address: null,
    chain: null,
    eligible: false,
    no_wallet: true,
    counts_by_chain: {},
    timestamp_iso: new Date().toISOString(),
  };

  try {
    await redis.set(`prolific:${prolific_id}`, JSON.stringify(record));
  } catch (e) {
    console.error("[no-wallet] Redis write failed", { prolific_id, error: e });
    // Don't block the redirect on log failure.
  }

  return NextResponse.json({ redirect_url: screenedOutUrl });
}
