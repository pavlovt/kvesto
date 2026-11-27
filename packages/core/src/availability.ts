/**
 * Whether a survey takes responses right now: its `opensAt` / `closesAt`
 * window, `maxResponses`, `oneResponsePer` and `requireRespondent` settings.
 * The runner checks what it can know (the clock, and whether this browser has
 * answered); the server checks everything.
 */
import type { Survey } from "@kvesto/schema";

/** Why a survey takes no responses: before `opensAt`, after `closesAt`, full, already answered, or sign-in needed. */
export type ClosedReason = "not-open" | "closed" | "full" | "answered" | "sign-in";

export interface AvailabilityContext {
  /** Default: now. */
  now?: Date;
  /** How many complete responses there are, for `maxResponses`. Unknown when left out. */
  completeResponses?: number;
  /** This browser or respondent has answered already (for `oneResponsePer`). */
  answered?: boolean;
  /** Whether the respondent is identified, for `requireRespondent`. Unknown when left out. */
  identified?: boolean;
}

export function surveyAvailability(survey: Pick<Survey, "settings">, ctx: AvailabilityContext = {}): { open: true } | { open: false; reason: ClosedReason } {
  const s = survey.settings ?? {};
  const now = (ctx.now ?? new Date()).getTime();
  if (s.opensAt && now < Date.parse(s.opensAt)) return { open: false, reason: "not-open" };
  if (s.closesAt && now >= Date.parse(s.closesAt)) return { open: false, reason: "closed" };
  if (ctx.identified === false && (s.requireRespondent || s.oneResponsePer === "respondent")) return { open: false, reason: "sign-in" };
  if (s.maxResponses !== undefined && ctx.completeResponses !== undefined && ctx.completeResponses >= s.maxResponses) {
    return { open: false, reason: "full" };
  }
  if (s.oneResponsePer && ctx.answered) return { open: false, reason: "answered" };
  return { open: true };
}

const CLOSED_REASONS: readonly string[] = ["not-open", "closed", "full", "answered", "sign-in"];
/** The reason in a server's refusal (`{ reason }` in the error body), if it is one of these. */
export function closedReasonOf(err: unknown): ClosedReason | null {
  const body = err && typeof err === "object" && "body" in err ? (err as { body: unknown }).body : null;
  const reason = body && typeof body === "object" && "reason" in body ? (body as { reason: unknown }).reason : null;
  return typeof reason === "string" && CLOSED_REASONS.includes(reason) ? (reason as ClosedReason) : null;
}

const store = (): Storage | null => {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
};

/** Whether this browser has submitted the survey (remembered for `oneResponsePer: "browser"`). */
export function answeredInBrowser(surveyId: string): boolean {
  try {
    return store()?.getItem(`kvesto:answered:${surveyId}`) === "1";
  } catch {
    return false;
  }
}

export function rememberAnswered(surveyId: string): void {
  try {
    store()?.setItem(`kvesto:answered:${surveyId}`, "1");
  } catch {
    // Storage may be full or blocked; the server still enforces the limit.
  }
}

/** A random id for this browser, kept in localStorage, that the server hashes to enforce one response per browser. */
export function browserId(): string | undefined {
  try {
    const s = store();
    if (!s) return undefined;
    let id = s.getItem("kvesto:browser");
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      s.setItem("kvesto:browser", id);
    }
    return id;
  } catch {
    return undefined;
  }
}
