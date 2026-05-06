import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

type EligibilityRecord = {
  prolific_id: string;
  address: string;
  chain: "evm" | "solana";
  eligible: boolean;
  counts_by_chain: Record<string, number>;
  timestamp_iso: string;
};

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="admin", charset="UTF-8"',
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
  const password = decoded.slice(idx + 1);
  return password === expected;
}

function toCsv(records: EligibilityRecord[]): string {
  const header = [
    "prolific_id",
    "address",
    "chain",
    "eligible",
    "counts_by_chain",
    "timestamp_iso",
  ].join(",");
  const rows = records.map((r) =>
    [
      JSON.stringify(r.prolific_id),
      JSON.stringify(r.address),
      JSON.stringify(r.chain),
      String(r.eligible),
      JSON.stringify(JSON.stringify(r.counts_by_chain)),
      JSON.stringify(r.timestamp_iso),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const keys: string[] = [];
  let cursor = "0";
  do {
    const result: [string, string[]] = await redis.scan(cursor, {
      match: "prolific:*",
      count: 200,
    });
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== "0");

  if (keys.length === 0) {
    const url = new URL(req.url);
    if (url.searchParams.get("format") === "csv") {
      return new NextResponse(
        "prolific_id,address,chain,eligible,counts_by_chain,timestamp_iso\n",
        {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="eligibility.csv"',
          },
        },
      );
    }
    return NextResponse.json([]);
  }

  const raw = await redis.mget<(EligibilityRecord | string | null)[]>(...keys);
  const records: EligibilityRecord[] = [];
  for (const item of raw) {
    if (item == null) continue;
    if (typeof item === "string") {
      try {
        records.push(JSON.parse(item) as EligibilityRecord);
      } catch {
        // Skip malformed entries.
      }
    } else {
      records.push(item as EligibilityRecord);
    }
  }
  records.sort((a, b) => (a.timestamp_iso < b.timestamp_iso ? 1 : -1));

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "csv") {
    return new NextResponse(toCsv(records), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="eligibility.csv"',
      },
    });
  }

  return NextResponse.json(records);
}
