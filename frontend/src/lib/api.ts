import { ensureAnonymousSession } from "@/lib/session";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const ACTIONS_REQUIRING_PROOF: Record<string, string> = {
  "/api/ask-question": "ask-question",
  "/api/parse-resume": "parse-resume",
  "/api/generate-questions": "generate-questions",
  "/api/get-feedback": "get-feedback",
  "/api/neural-engagement": "neural-engagement",
  "/api/clone-voice": "clone-voice",
  "/api/clone-voice-youtube": "clone-voice-youtube",
};

let bootstrapPromise: Promise<void> | null = null;
let authTokenProvider: null | (() => Promise<string | null>) = null;

export function registerApiAuthTokenProvider(provider: (() => Promise<string | null>) | null) {
  authTokenProvider = provider;
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function solveProofOfWork(challengeId: string, nonce: string, difficulty: number) {
  const prefix = "0".repeat(difficulty);
  for (let solution = 0; solution < 1_000_000_000_000; solution += 1) {
    const digest = await sha256Hex(`${challengeId}:${nonce}:${solution}`);
    if (digest.startsWith(prefix)) {
      return String(solution);
    }
  }
  throw new Error("Unable to solve proof-of-work challenge");
}

async function bootstrapAnonymousApiSession() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const session = ensureAnonymousSession();
      const challengeResponse = await fetch(`${API_BASE}/api/session/challenge`, {
        credentials: "include",
      });
      if (!challengeResponse.ok) {
        throw new Error("Failed to fetch API session challenge");
      }

      const challenge = (await challengeResponse.json()) as {
        challengeId: string;
        nonce: string;
        difficulty: number;
      };
      const solution = await solveProofOfWork(challenge.challengeId, challenge.nonce, challenge.difficulty);

      const bootstrapResponse = await fetch(`${API_BASE}/api/session/bootstrap`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          sessionSecret: session.sessionSecret,
          challengeId: challenge.challengeId,
          nonce: challenge.nonce,
          solution,
        }),
      });
      if (!bootstrapResponse.ok) {
        throw new Error("Failed to establish API session");
      }
    })().finally(() => {
      bootstrapPromise = null;
    });
  }

  return bootstrapPromise;
}

async function getRequestProofHeaders(action: string) {
  const response = await fetch(`${API_BASE}/api/request-proof?action=${encodeURIComponent(action)}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch request proof challenge");
  }

  const challenge = (await response.json()) as {
    proofId: string;
    nonce: string;
    difficulty: number;
  };
  const solution = await solveProofOfWork(challenge.proofId, challenge.nonce, challenge.difficulty);
  return {
    "X-MockCortex-Proof-Id": challenge.proofId,
    "X-MockCortex-Proof-Nonce": challenge.nonce,
    "X-MockCortex-Proof-Solution": solution,
  };
}

async function ensureApiSession() {
  await bootstrapAnonymousApiSession();
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const action = ACTIONS_REQUIRING_PROOF[input];

  const request = async () => {
    const headers = new Headers(init.headers ?? {});
    if (authTokenProvider) {
      const token = await authTokenProvider();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }
    if (action) {
      const proofHeaders = await getRequestProofHeaders(action);
      for (const [key, value] of Object.entries(proofHeaders)) {
        headers.set(key, value);
      }
    }

    return fetch(`${API_BASE}${input}`, {
      ...init,
      credentials: "include",
      headers,
    });
  };

  let response = await request().catch(async (error) => {
    if (action && /request proof challenge/i.test(String(error))) {
      await ensureApiSession();
      return request();
    }
    throw error;
  });

  if (response.status === 401 && response.headers.get("x-mockcortex-bootstrap-required") === "1") {
    await ensureApiSession();
    response = await request();
  }

  if (response.status === 428 && action) {
    response = await request();
  }

  return response;
}
