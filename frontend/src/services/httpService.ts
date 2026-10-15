import { ApiError } from "./errors";
import type {
  Application,
  ApplicationInput,
  ApplicationList,
  AuthConfig,
  FavoriteQuestion,
  Question,
  Review,
  ReviewInput,
  ReviewList,
  SaveMeService,
  StatusFilter,
  User,
} from "./types";

/**
 * HTTP 구현. 같은 origin의 FastAPI 백엔드와 이야기한다. 약속은 저장소 맨 위의
 * `openapi.yaml`이다. 세션은 브라우저가 알아서 보내는 HttpOnly 쿠키이고, 쓰기
 * 요청에는 백엔드가 요구하는 CSRF 헤더를 붙인다.
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
      // 오류 본문이 JSON이 아니면 상태 문구를 그대로 쓴다.
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
  const reviewPath = (id: number) => `/reviews/${encodeURIComponent(String(id))}`;

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

    async listReviews(applicationId?: number) {
      const qs = applicationId === undefined ? "" : `?applicationId=${encodeURIComponent(String(applicationId))}`;
      return json<ReviewList>(await request(`/reviews${qs}`));
    },

    async listFavoriteQuestions() {
      return json<FavoriteQuestion[]>(await request("/reviews/favorites"));
    },

    async getReview(id: number) {
      const response = await request(reviewPath(id));
      if (response.status === 404) return null;
      return json<Review>(response);
    },

    async createReview(input: ReviewInput) {
      return json<Review>(await request("/reviews", send("POST", input)));
    },

    async updateReview(id: number, input: ReviewInput) {
      return json<Review>(await request(reviewPath(id), send("PUT", input)));
    },

    async setQuestionFavorite(reviewId: number, questionId: number, isFavorite: boolean) {
      const path = `${reviewPath(reviewId)}/questions/${encodeURIComponent(String(questionId))}/favorite`;
      return json<Question>(await request(path, send("PUT", { isFavorite })));
    },

    async setReviewVerified(id: number, verified: boolean) {
      return json<Review>(await request(`${reviewPath(id)}/verified`, send("PUT", { verified })));
    },

    async deleteReview(id: number) {
      await empty(await request(reviewPath(id), send("DELETE")));
    },
  };
}
