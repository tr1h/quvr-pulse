import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Strict EVM address check: 0x + 40 hex chars, and a valid EIP-55 checksum when mixed-case. */
export function isEvmAddress(value: unknown): value is string {
  if (typeof value !== "string" || !HEX_ADDRESS.test(value)) return false;
  const body = value.slice(2);
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
  return mixed ? isAddress(value, { strict: true }) : true;
}

/** Canonical storage form: lowercase. Throws on invalid input. */
export function normalizeAddress(value: string): string {
  const trimmed = value.trim();
  if (!isEvmAddress(trimmed)) throw new Error("Invalid EVM address");
  return trimmed.toLowerCase();
}

/** Display form: EIP-55 checksum. */
export function toChecksum(value: string): `0x${string}` {
  return getAddress(value.toLowerCase());
}

export function shortAddress(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export const addressSchema = z
  .string()
  .trim()
  .refine((v) => isEvmAddress(v), { message: "Invalid EVM address" })
  .transform((v) => v.toLowerCase());

/** Topic (32 bytes) → address (last 20 bytes), lowercase. */
export function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/** EIP-7702: an EOA delegating to a contract has code 0xef0100 ‖ delegate (23 bytes). */
export function isDelegatedEoaCode(code: string | null | undefined): boolean {
  return typeof code === "string" && /^0xef0100[0-9a-fA-F]{40}$/.test(code);
}

/** True only for real contract code (empty code and EIP-7702 delegations are wallets). */
export function isContractCode(code: string | null | undefined): boolean {
  return typeof code === "string" && code !== "0x" && !isDelegatedEoaCode(code);
}

// ------------------------------------------------------------------ Solana

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Solana public key: base58 that decodes to exactly 32 bytes (case-sensitive, never lowercased). */
export function isSolanaAddress(value: unknown): value is string {
  if (typeof value !== "string" || !BASE58.test(value)) return false;
  try {
    return base58.decode(value).length === 32;
  } catch {
    return false;
  }
}

/**
 * Program-derived addresses (PDAs) are off the ed25519 curve: they belong to programs
 * (pool vaults, bonding curves), never to a private key. Regular wallets are on-curve.
 */
export function isOnCurve(value: string): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(base58.decode(value));
    return true;
  } catch {
    return false;
  }
}

export type TokenRef = { chain: "robinhood" | "solana"; address: string };

/** Detects the chain from the address format: 0x… → Robinhood Chain, base58 → Solana. */
export function parseTokenRef(raw: string): TokenRef | null {
  const v = raw.trim();
  if (isEvmAddress(v)) return { chain: "robinhood", address: v.toLowerCase() };
  if (isSolanaAddress(v)) return { chain: "solana", address: v };
  return null;
}

export const tokenRefSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const r = parseTokenRef(v);
    if (!r) {
      ctx.addIssue({ code: "custom", message: "Invalid token address (0x… or Solana base58)" });
      return z.NEVER;
    }
    return r;
  });

/** Canonical storage form for any supported chain (EVM lowercase, Solana as-is). */
export function normalizeTokenAddress(raw: string): string {
  const r = parseTokenRef(raw);
  if (!r) throw new Error("Invalid token address");
  return r.address;
}

/** Display form: checksum for EVM, unchanged for Solana. */
export function displayAddress(value: string): string {
  return value.startsWith("0x") ? toChecksum(value) : value;
}
