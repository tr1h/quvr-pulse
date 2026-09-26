import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const PREFIX = "quvr-gzip-v1:";
const replacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? { __big: value.toString() } : value;
const reviver = (_key: string, value: unknown) =>
  value && typeof value === "object" && "__big" in value
    ? BigInt((value as { __big: string }).__big)
    : value;

/** Backward-compatible compact storage for large histories and reports. */
export async function encodeCache(value: unknown): Promise<string> {
  const json = JSON.stringify(value, replacer);
  if (Buffer.byteLength(json) < 16_384) return json;
  const packed = PREFIX + (await compress(json, { level: 1 })).toString("base64");
  return Buffer.byteLength(packed) < Buffer.byteLength(json) ? packed : json;
}

export async function decodeCache<T>(raw: string): Promise<T> {
  const json = raw.startsWith(PREFIX)
    ? (
        await decompress(Buffer.from(raw.slice(PREFIX.length), "base64"), {
          maxOutputLength: 64 * 1024 * 1024,
        })
      ).toString("utf8")
    : raw;
  return JSON.parse(json, reviver) as T;
}
