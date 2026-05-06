import { randomBytes } from "node:crypto";
import { SiweMessage } from "siwe";
import { verifyMessage } from "viem";
import nacl from "tweetnacl";
import bs58 from "bs58";

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export function buildSiweMessage(args: {
  domain: string;
  address: `0x${string}`;
  uri: string;
  chainId: number;
  nonce: string;
  prolificId: string;
}): string {
  const msg = new SiweMessage({
    domain: args.domain,
    address: args.address,
    statement: `Sign to verify wallet ownership for the Wayne State NFT pricing study (Prolific ID: ${args.prolificId}).`,
    uri: args.uri,
    version: "1",
    chainId: args.chainId,
    nonce: args.nonce,
    issuedAt: new Date().toISOString(),
  });
  return msg.prepareMessage();
}

export function buildSolanaMessage(args: {
  address: string;
  nonce: string;
  prolificId: string;
  domain: string;
}): string {
  return [
    `${args.domain} requests wallet verification for the Wayne State NFT pricing study.`,
    "",
    `Address: ${args.address}`,
    `Prolific ID: ${args.prolificId}`,
    `Nonce: ${args.nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

export function extractNonce(message: string): string | null {
  const m = message.match(/Nonce:\s*([0-9a-fA-F]{32})/);
  return m ? m[1] : null;
}

export async function verifyEvmSignature(args: {
  message: string;
  signature: `0x${string}`;
  address: `0x${string}`;
}): Promise<boolean> {
  try {
    return await verifyMessage({
      address: args.address,
      message: args.message,
      signature: args.signature,
    });
  } catch {
    return false;
  }
}

export function verifySolanaSignature(args: {
  message: string;
  signature: string;
  address: string;
}): boolean {
  try {
    const sig =
      args.signature.startsWith("0x") || /^[0-9a-f]+$/i.test(args.signature)
        ? Buffer.from(args.signature.replace(/^0x/, ""), "hex")
        : bs58.decode(args.signature);
    const pub = bs58.decode(args.address);
    const msg = new TextEncoder().encode(args.message);
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch {
    return false;
  }
}
