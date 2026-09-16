import type { AppSession, SalespersonAccount } from "@/lib/access-contract";
import type { Dealer } from "@/app/dealers";

type ApiError = { error?: string };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new ApiRequestError(body.error ?? fallback, response.status);
  }
  return body;
}

async function getWithTransientRetry(path: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(path, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status < 500 || attempt === 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("The request could not be completed.");
}

export async function signInWithUsername(username: string, password: string) {
  return readJson<{ session: AppSession }>(
    await fetch("/api/session/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
    "Sign-in could not be completed. Please try again.",
  );
}

export async function fetchAppSession() {
  return readJson<{ session: AppSession }>(
    await fetch("/api/session", { cache: "no-store" }),
    "Your workspace session could not be loaded.",
  );
}

export async function fetchWorkspaceBootstrap() {
  return readJson<{
    session: AppSession;
    dealers: Dealer[];
    salespeople: SalespersonAccount[];
  }>(
    await getWithTransientRetry("/api/workspace"),
    "The workspace could not be loaded. Please refresh and try again.",
  );
}

export async function fetchSalespeople() {
  return readJson<{ salespeople: SalespersonAccount[] }>(
    await fetch("/api/salespeople", { cache: "no-store" }),
    "The salespeople list could not be loaded.",
  );
}

export async function createSalespersonAccount(input: {
  username: string;
  password: string;
  displayName: string;
}) {
  return readJson<{ salesperson: SalespersonAccount }>(
    await fetch("/api/salespeople", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    "The salesperson account could not be created.",
  );
}

export async function setSalespersonCredentials(
  salespersonId: number,
  input: { username?: string; password: string },
) {
  return readJson<{ salesperson: SalespersonAccount; passwordReset: boolean }>(
    await fetch(`/api/salespeople/${salespersonId}/account`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    "The salesperson login could not be updated.",
  );
}
