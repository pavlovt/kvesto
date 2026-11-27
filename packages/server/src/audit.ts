/**
 * The audit log: one entry per admin request, append-only, each entry
 * hashed together with the one before it so a changed or deleted entry
 * breaks the chain.
 */
import { createHash } from "node:crypto";
import type { Context } from "hono";

export interface AuditEntry {
  /** Position in the log, from 1. */
  seq: number;
  at: string;
  /** Who: `token:<id>`, `user:<sub>`, `api-key`, or what your `authorize` set with `setActor`. */
  actor: string;
  action: string;
  method: string;
  path: string;
  surveyId: string | null;
  /** The HTTP status of the reply (403 when refused). */
  status: number;
  ip: string;
  requestId: string;
  /** SHA-256 of the previous entry's hash and this entry's fields. */
  hash: string;
}

export type AuditInput = Omit<AuditEntry, "seq" | "hash">;

export interface AuditFilter {
  actor?: string;
  action?: string;
  surveyId?: string;
  from?: string;
  to?: string;
  /** Entries after this `seq`. */
  after?: number;
  limit?: number;
}

export interface AuditStore {
  /** The last entry's hash (or null for an empty log) and the next seq. */
  auditTail(): Promise<{ hash: string | null; seq: number }>;
  appendAudit(entry: AuditEntry): Promise<void>;
  listAudit(filter: AuditFilter): Promise<AuditEntry[]>;
}

const fieldsOf = (e: AuditInput & { seq: number }) =>
  JSON.stringify([e.seq, e.at, e.actor, e.action, e.method, e.path, e.surveyId, e.status, e.ip, e.requestId]);

export function chainHash(previous: string | null, entry: AuditInput & { seq: number }): string {
  return createHash("sha256").update(`${previous ?? ""}\n${fieldsOf(entry)}`).digest("hex");
}

/** Checks the chain over entries in order from the first. Returns where it breaks, if it does. */
export function verifyAuditChain(entries: readonly AuditEntry[]): { ok: true } | { ok: false; seq: number } {
  let previous: string | null = null;
  let expectedSeq = 1;
  for (const e of entries) {
    if (e.seq !== expectedSeq || chainHash(previous, e) !== e.hash) return { ok: false, seq: e.seq };
    previous = e.hash;
    expectedSeq++;
  }
  return { ok: true };
}

const ACTOR = "kvestoActor";
/** Record who made a request, for the audit log. Call it from your `authorize`. */
export function setActor(c: Context, actor: string): void {
  (c as unknown as { set(key: string, value: unknown): void }).set(ACTOR, actor);
}
export function actorOf(c: Context): string | undefined {
  return (c as unknown as { get(key: string): unknown }).get(ACTOR) as string | undefined;
}

/** Appends entries one at a time, so the chain stays in order. */
export function createAuditLog(store: AuditStore, onAudit?: (entry: AuditEntry) => void | Promise<void>) {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    write(input: AuditInput): Promise<AuditEntry> {
      const run = queue.then(async () => {
        const tail = await store.auditTail();
        const entry = { ...input, seq: tail.seq, hash: "" };
        entry.hash = chainHash(tail.hash, entry);
        await store.appendAudit(entry);
        try {
          await onAudit?.(entry);
        } catch (e) {
          console.error("[kvesto] onAudit failed", e);
        }
        return entry;
      });
      queue = run.catch(() => undefined);
      return run;
    },
    /** Wait for the entries being written. */
    flush: () => queue,
    /** Check the whole chain. */
    async verify() {
      const all: AuditEntry[] = [];
      for (let after = 0; ; ) {
        const page = await store.listAudit({ after, limit: 1000 });
        all.push(...page);
        if (page.length < 1000) break;
        after = page.at(-1)!.seq;
      }
      return verifyAuditChain(all);
    },
  };
}
