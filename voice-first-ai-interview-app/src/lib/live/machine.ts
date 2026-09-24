/**
 * Connection state machine:
 *   idle → connecting → connected → reconnecting → error → fallback
 *
 *  idle        --CONNECT-->        connecting
 *  connecting  --OPEN-->           connected
 *  connecting  --FAIL(r<2)-->      reconnecting   (retries++)
 *  connected   --FAIL(r<2)-->      reconnecting   (retries++)
 *  reconnecting--OPEN-->           connected      (retries kept for the session)
 *  reconnecting--FAIL(r<2)-->      reconnecting   (retries++)
 *  *           --FAIL(r>=2)-->     error          (then auto → fallback)
 *  *           --FATAL-->          error          (mic blocked / no key: skip retries)
 *  error       --FALLBACK-->       fallback       (session stays alive in text)
 *  fallback    --CONNECT-->        connecting     (manual "try voice again", retries reset)
 */
export type ConnState = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "fallback";
export type ConnEvent =
  | { type: "CONNECT" }
  | { type: "OPEN" }
  | { type: "FAIL" }
  | { type: "FATAL" }
  | { type: "FALLBACK" }
  | { type: "GOAWAY" };

export const MAX_RETRIES = 2;

export type Machine = { state: ConnState; retries: number };

export function transition(m: Machine, e: ConnEvent): Machine {
  switch (e.type) {
    case "CONNECT":
      if (m.state === "idle") return { state: "connecting", retries: 0 };
      if (m.state === "fallback" || m.state === "error") return { state: "connecting", retries: 0 };
      return m;
    case "OPEN":
      if (m.state === "connecting" || m.state === "reconnecting") return { ...m, state: "connected" };
      return m;
    case "GOAWAY":
      // Server-requested rotation: reconnect without consuming a retry.
      if (m.state === "connected") return { ...m, state: "reconnecting" };
      return m;
    case "FAIL":
      if (m.state === "fallback" || m.state === "idle") return m;
      if (m.retries < MAX_RETRIES) return { state: "reconnecting", retries: m.retries + 1 };
      return { ...m, state: "error" };
    case "FATAL":
      if (m.state === "fallback") return m;
      return { ...m, state: "error" };
    case "FALLBACK":
      return { ...m, state: "fallback" };
  }
}
