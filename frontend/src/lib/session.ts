const SESSION_ID_KEY = "mockcortex_session_id";
let sessionSecret: string | null = null;

export interface AnonymousSession {
  sessionId: string;
  sessionSecret: string;
}

function createSessionSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function ensureAnonymousSession(): AnonymousSession {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }

  if (!sessionSecret || !/^[0-9a-f]{64}$/i.test(sessionSecret)) {
    sessionSecret = createSessionSecret();
  }

  return { sessionId, sessionSecret };
}

export function getAnonymousSession(): AnonymousSession {
  return ensureAnonymousSession();
}
