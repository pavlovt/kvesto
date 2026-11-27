/**
 * The one gate for every request the server makes to a URL someone else
 * chose (webhooks today, remote choice lists later). It stops server-side
 * request forgery: only http(s), HTTPS by default, and never an address
 * inside the network the server runs in (loopback, private, link-local,
 * cloud metadata), checked after DNS resolution and again before each
 * request, so a name that later resolves elsewhere (DNS rebinding) is caught.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface OutboundOptions {
  /** Allow plain http URLs. Default false. */
  allowHttp?: boolean;
  /** Allow private, loopback and link-local addresses (local development and tests only). Default false. */
  allowPrivate?: boolean;
  /** Resolves a host name to addresses. Default: the system resolver. */
  resolve?: (host: string) => Promise<string[]>;
}

export class OutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundUrlError";
  }
}

const v4 = (ip: string) => ip.split(".").map(Number) as [number, number, number, number];

/** Is this IPv4 or IPv6 address one the server must never call? */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b] = v4(ip);
    return (
      a === 0 || // "this" network
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast and reserved
    );
  }
  if (family === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (s === "::" || s === "::1") return true;
    // IPv4-mapped (::ffff:10.0.0.1) and the like: check the IPv4 part.
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8");
  }
  return true;
}

const systemResolve = async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/**
 * Check a URL before calling it. Throws an `OutboundUrlError` saying why it
 * is refused; returns the parsed URL otherwise.
 */
export async function guardOutboundUrl(raw: string, options: OutboundOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundUrlError("Not a URL");
  }
  if (url.protocol !== "https:" && !(options.allowHttp && url.protocol === "http:")) {
    throw new OutboundUrlError(options.allowHttp ? "Only http and https URLs are allowed" : "Only https URLs are allowed");
  }
  if (url.username || url.password) throw new OutboundUrlError("URLs with credentials are not allowed");
  if (options.allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new OutboundUrlError("That host is not reachable from outside");
  }
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await (options.resolve ?? systemResolve)(host);
  } catch {
    throw new OutboundUrlError(`Could not resolve ${host}`);
  }
  if (!addresses.length) throw new OutboundUrlError(`Could not resolve ${host}`);
  // Every address must be public: a name with one private address could be steered to it.
  if (addresses.some(isPrivateAddress)) throw new OutboundUrlError("That address is inside a private network");
  return url;
}
