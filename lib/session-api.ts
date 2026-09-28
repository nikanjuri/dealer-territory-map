import type { AppSession, SalespersonAccount } from "@/lib/access-contract";
import type { DealerSummary } from "@/lib/dealer-summary";
import type {
  CommerceAccount,
  CommerceCategory,
  CommerceOrder,
  CommerceProduct,
  CommerceStats,
} from "@/lib/commerce-contract";

export type CommerceWorkspaceBootstrap = {
  products: CommerceProduct[];
  categories: CommerceCategory[];
  orders: CommerceOrder[];
  stats: CommerceStats;
  accounts: CommerceAccount[];
};

export type ShopWorkspaceBootstrap = {
  products: CommerceProduct[];
  orders: CommerceOrder[];
};

export type WorkspaceBootstrap = {
  session: AppSession;
  dealers: DealerSummary[];
  salespeople: SalespersonAccount[];
  access: {
    field: boolean;
    commerce: boolean;
    shop: boolean;
  };
  pendingDealerReviewCount: number;
};

type ApiError = { error?: string };

export class ApiRequestError extends Error {
  readonly status: number;
  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
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

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("The request could not be completed.");
}

export async function signInWithUsername(username: string, password: string) {
  invalidateWorkspaceBootstraps();
  const result = await readJson<{ session: AppSession }>(
    await fetch("/api/session/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
    "Sign-in could not be completed. Please try again.",
  );
  invalidateWorkspaceBootstraps();
  return result;
}

export async function fetchAppSession() {
  return readJson<{ session: AppSession }>(
    await fetch("/api/session", { cache: "no-store" }),
    "Your workspace session could not be loaded.",
  );
}

type BootstrapKind = "workspace" | "commerce" | "shop";
const inFlight = new Map<BootstrapKind, Promise<unknown>>();

// Only concurrent requests share work. A settled response must never become an
// indefinitely stale snapshot, particularly after an account or dealer change.
export function invalidateWorkspaceBootstraps() {
  inFlight.clear();
}

function fetchBootstrap<T>(kind: BootstrapKind, path: string, message: string): Promise<T> {
  const current = inFlight.get(kind);
  if (current) return current as Promise<T>;
  const request = getWithTransientRetry(path).then((response) => readJson<T>(response, message));
  inFlight.set(kind, request);
  void request.finally(() => {
    if (inFlight.get(kind) === request) inFlight.delete(kind);
  }).catch(() => {});
  return request;
}

export function fetchWorkspaceBootstrap() {
  return fetchBootstrap<WorkspaceBootstrap>("workspace", "/api/workspace", "The workspace could not be loaded. Please refresh and try again.");
}

export function fetchCommerceWorkspaceBootstrap() {
  return fetchBootstrap<CommerceWorkspaceBootstrap>("commerce", "/api/workspace/commerce", "Commerce operations could not be loaded.");
}

export function fetchShopWorkspaceBootstrap() {
  return fetchBootstrap<ShopWorkspaceBootstrap>("shop", "/api/workspace/shop", "The shop could not be loaded.");
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

export async function deleteSalespersonLogin(salespersonId: number) {
  return readJson<{
    salesperson: SalespersonAccount;
    accounts: CommerceAccount[];
    warning?: string;
  }>(
    await fetch(`/api/salespeople/${salespersonId}/account`, {
      method: "DELETE",
    }),
    "The salesperson login could not be deleted.",
  );
}
