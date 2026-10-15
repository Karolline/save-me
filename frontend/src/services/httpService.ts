import { ApiError } from "./errors";
import type {
  Application,
  ApplicationInput,
  ApplicationList,
  AuthConfig,
  SaveMeService,
  StatusFilter,
  User,
} from "./types";

/**
 * HTTP implementation, talking to the FastAPI backend on the same origin.
 * The contract is `openapi.yaml` at the repo root. The session is an HttpOnly
 * cookie the browser sends by itself; writes add the CSRF header the backend
 * requires.
 */

type FetchFn = typeof fetch;

export const CSRF_HEADER = { "X-Requested-With": "SaveMe" };

export function createHttpService(
  baseUrl: string,
  fetchFn: FetchFn = (...args) => fetch(...args),
): SaveMeService {
  const root = baseUrl.replace(/\/+$/, "");

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const write = init?.method && init.method !== "GET";
    return fetchFn(`${root}${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(write ? CSRF_HEADER : {}),
        ...init?.headers,
      },
    });
  }

  async function fail(response: Response): Promise<never> {
    let detail = response.statusText;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "detail" in body) {
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // Non-JSON error body: keep the status text.
    }
    throw new ApiError(response.status, `Request failed (${response.status}): ${detail}`);
  }

  async function json<T>(response: Response): Promise<T> {
    if (!response.ok) return fail(response);
    return (await response.json()) as T;
  }

  async function empty(response: Response): Promise<void> {
    if (!response.ok) await fail(response);
  }

  const send = (method: string, body?: unknown): RequestInit => ({
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const appPath = (id: number) => `/applications/${encodeURIComponent(String(id))}`;

  return {
    async getAuthConfig() {
      return json<AuthConfig>(await request("/auth/config"));
    },

    async getMe() {
      const response = await request("/auth/me");
      if (response.status === 401) return null;
      return json<User>(response);
    },

    async devLogin() {
      return json<User>(await request("/auth/dev-login", send("POST")));
    },

    async logout() {
      await empty(await request("/auth/logout", send("POST")));
    },

    async logoutAll() {
      await empty(await request("/auth/logout-all", send("POST")));
    },

    async listApplications(status: StatusFilter = "all") {
      const qs = status === "all" ? "" : `?status=${status}`;
      return json<ApplicationList>(await request(`/applications${qs}`));
    },

    async getApplication(id: number) {
      const response = await request(appPath(id));
      if (response.status === 404) return null;
      return json<Application>(response);
    },

    async createApplication(input: ApplicationInput) {
      return json<Application>(await request("/applications", send("POST", input)));
    },

    async updateApplication(id: number, input: ApplicationInput) {
      return json<Application>(await request(appPath(id), send("PUT", input)));
    },

    async setApplicationNote(id: number, note: string) {
      return json<Application>(await request(`${appPath(id)}/note`, send("PUT", { note })));
    },

    async deleteApplication(id: number) {
      await empty(await request(appPath(id), send("DELETE")));
    },
  };
}
