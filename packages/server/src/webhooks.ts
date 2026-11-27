/**
 * Webhook deliveries: each event becomes a stored delivery, sent with an
 * HMAC-SHA256 signature and retried with growing delays until it succeeds or
 * runs out of attempts. The delivery log is what the deliveries route shows.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Survey, SurveyResponse } from "@kvesto/core";
import { guardOutboundUrl, OutboundUrlError, type OutboundOptions } from "./outbound.js";
import type { SurveyRepository } from "./repository.js";

export const WEBHOOK_EVENTS = ["response.completed", "response.updated"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookOptions {
  /** How requests are sent. Default `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Delays before each retry, in milliseconds. Default 10 s, 1 min, 5 min, 30 min, 2 h. */
  retryDelays?: number[];
  /** Give up on one attempt after this long. Default 10 s. */
  timeoutMs?: number;
  /** Which URLs may be called. Default: public https only. */
  outbound?: OutboundOptions;
}

/** A new signing secret for a webhook. */
export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

/** The `Kvesto-Signature` value for a body: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`. */
export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/**
 * Check a delivery's `Kvesto-Signature` header on the receiving side: the
 * HMAC must match and the timestamp be at most `toleranceSeconds` old (it
 * stops replays). Use the raw request body, before any JSON parsing.
 */
export function verifyWebhook(secret: string, header: string | null | undefined, body: string, toleranceSeconds = 300, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSeconds || !parts.v1) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export interface WebhookDispatcher {
  /** Queue an event for the survey's webhooks and start sending. */
  emit(survey: Survey, event: WebhookEvent, response: SurveyResponse): Promise<void>;
  /** Send everything that is due now, until nothing is (for tests and shutdown). */
  flush(): Promise<void>;
  /** Stop the retry timers. */
  stop(): void;
}

const DEFAULT_DELAYS = [10_000, 60_000, 300_000, 1_800_000, 7_200_000];

export function createWebhookDispatcher(repo: SurveyRepository, options: WebhookOptions = {}): WebhookDispatcher {
  const delays = options.retryDelays ?? DEFAULT_DELAYS;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  let running: Promise<void> | null = null;
  let again = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      void kick();
    }, ms);
    // Retries never keep the process alive on their own.
    (t as { unref?: () => void }).unref?.();
    timers.add(t);
  };

  async function attempt(d: Awaited<ReturnType<SurveyRepository["dueDeliveries"]>>[number]) {
    const attempts = d.attempts + 1;
    let statusCode: number | null = null;
    let error: string | null = null;
    let retry = true;
    try {
      // Checked again on every attempt, so a host that now resolves to a private address is caught.
      const url = await guardOutboundUrl(d.url, options.outbound);
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Kvesto-Webhooks/1",
          "kvesto-event": d.event,
          "kvesto-delivery": d.id,
          "kvesto-signature": signWebhook(d.secret, d.payload),
        },
        body: d.payload,
        // A redirect could point anywhere, so none are followed.
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      statusCode = res.status;
      if (res.status >= 200 && res.status < 300) {
        await repo.updateDelivery(d.id, { status: "succeeded", attempts, lastStatusCode: statusCode, lastError: null, nextAttemptAt: null });
        return;
      }
      error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (e instanceof OutboundUrlError) retry = false;
    }
    const delay = delays[attempts - 1];
    if (!retry || delay === undefined) {
      await repo.updateDelivery(d.id, { status: "failed", attempts, lastStatusCode: statusCode, lastError: error, nextAttemptAt: null });
      return;
    }
    await repo.updateDelivery(d.id, {
      attempts,
      lastStatusCode: statusCode,
      lastError: error,
      nextAttemptAt: new Date(Date.now() + delay).toISOString(),
    });
    later(delay);
  }

  async function run() {
    for (;;) {
      const due = await repo.dueDeliveries(new Date().toISOString(), 20);
      if (!due.length) return;
      await Promise.all(due.map(attempt));
    }
  }

  /** One run at a time; a kick during a run makes it go round once more. */
  function kick(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await run();
      } while (again);
    })().finally(() => (running = null));
    return running;
  }

  return {
    async emit(survey, event, response) {
      const hooks = (await repo.listWebhooks(survey.id)).filter((h) => h.events.includes(event));
      if (!hooks.length) return;
      const payload = JSON.stringify({ event, surveyId: survey.id, sentAt: new Date().toISOString(), response });
      for (const h of hooks) await repo.createDelivery({ webhookId: h.id, event, payload });
      void kick();
    },
    async flush() {
      await kick();
      while (running) await running;
    },
    stop() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
