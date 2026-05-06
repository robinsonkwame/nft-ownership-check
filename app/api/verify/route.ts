import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { redis } from "@/lib/redis";
import {
  EVM_NETWORKS,
  countSolanaNfts,
  getEvmAlchemy,
} from "@/lib/alchemy";
import {
  extractNonce,
  verifyEvmSignature,
  verifySolanaSignature,
} from "@/lib/verification";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z.object({
  prolific_id: z.string().min(1).max(64),
  address: z.string().min(1).max(128),
  chain: z.enum(["evm", "solana"]),
  message: z.string().min(1).max(4096),
  signature: z.string().min(1).max(512),
});

type CountsByChain = {
  ethereum?: number;
  polygon?: number;
  base?: number;
  solana?: number;
};

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { prolific_id, address, chain, message, signature } = parsed;

  const nonce = extractNonce(message);
  if (!nonce) {
    return NextResponse.json({ error: "Missing nonce in message" }, { status: 400 });
  }

  const consumed = await redis.getdel(`nonce:${nonce}`);
  if (!consumed) {
    return NextResponse.json(
      { error: "Nonce is invalid or expired. Please retry." },
      { status: 400 },
    );
  }

  let signatureValid = false;
  if (chain === "evm") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Malformed EVM address" }, { status: 400 });
    }
    const sig = signature.startsWith("0x") ? signature : `0x${signature}`;
    signatureValid = await verifyEvmSignature({
      message,
      signature: sig as `0x${string}`,
      address: address as `0x${string}`,
    });
  } else {
    signatureValid = verifySolanaSignature({ message, signature, address });
  }

  if (!signatureValid) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  const bypassId = process.env.TEST_BYPASS_PROLIFIC_ID;
  const isBypass = Boolean(bypassId) && prolific_id === bypassId;

  let counts: CountsByChain = {};
  let total = 0;

  if (isBypass) {
    console.warn("[verify] TEST BYPASS MODE: skipping Alchemy lookup", {
      prolific_id,
      address,
    });
    counts = { ethereum: 1 };
    total = 1;
  } else {
    try {
      if (chain === "evm") {
        const [eth, poly, base] = await Promise.all(
          EVM_NETWORKS.map((n) =>
            getEvmAlchemy(n)
              .nft.getNftsForOwner(address, { omitMetadata: true, pageSize: 1 })
              .then((r) => r.totalCount ?? 0),
          ),
        );
        counts = { ethereum: eth, polygon: poly, base: base };
        total = eth + poly + base;
      } else {
        const sol = await countSolanaNfts(address);
        counts = { solana: sol };
        total = sol;
      }
    } catch (e) {
      console.error("[verify] Alchemy lookup failed", { prolific_id, error: e });
      return NextResponse.json(
        { error: "NFT data lookup failed. Please try again later." },
        { status: 502 },
      );
    }
  }

  const eligible = total > 0;
  const completionUrl = process.env.PROLIFIC_COMPLETION_URL;
  const screenedOutUrl = process.env.PROLIFIC_SCREENED_OUT_URL;
  if (!completionUrl || !screenedOutUrl) {
    const missing = [
      !completionUrl && "PROLIFIC_COMPLETION_URL",
      !screenedOutUrl && "PROLIFIC_SCREENED_OUT_URL",
    ]
      .filter(Boolean)
      .join(", ");
    console.error("[verify] Missing env var(s)", { prolific_id, missing });
    return NextResponse.json(
      { error: "Server misconfiguration. Please contact the researchers." },
      { status: 500 },
    );
  }
  const redirect_url = eligible ? completionUrl : screenedOutUrl;

  const record = {
    prolific_id,
    address,
    chain,
    eligible,
    counts_by_chain: counts,
    timestamp_iso: new Date().toISOString(),
    ...(isBypass && { test_bypass: true }),
  };

  try {
    await redis.set(`prolific:${prolific_id}`, JSON.stringify(record));
  } catch (e) {
    console.error("[verify] Redis write failed", { prolific_id, error: e });
    // Don't block the redirect on log failure; participant has already been
    // legitimately verified. The research team will be notified via logs.
  }

  return NextResponse.json({ eligible, redirect_url });
}
