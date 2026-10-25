import { ApiError } from "./errors";
import type {
  Application,
  ApplicationInput,
  ApplicationList,
  AuthConfig,
  Career,
  Certificate,
  DocumentGroup,
  DocumentGroupInput,
  DocumentGroupSummary,
  DocumentReviewInput,
  CoverLetter,
  CoverLetterItem,
  DocumentType,
  Education,
  Experience,
  ExperienceGroup,
  ExperienceInput,
  ExperienceLinkKey,
  ExperienceList,
  ExperiencePlacement,
  ExperienceView,
  FavoriteQuestion,
  Job,
  JobInput,
  JobList,
  JobStatusFilter,
  PersonalityAnswer,
  Question,
  Resume,
  ResumeBasics,
  Review,
  ReviewInput,
  ReviewList,
  DocumentContent,
  SavedDocument,
  SaveMeService,
  SkillGroup,
  StatusFilter,
  User,
} from "./types";

/**
 * HTTP 구현. 같은 origin의 FastAPI 백엔드와 이야기한다. 약속은 백엔드의
 * Pydantic 모델(`backend/app/models.py`)이다. 세션은 브라우저가 알아서 보내는 HttpOnly 쿠키이고, 쓰기
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
  const jobPath = (id: number) => `/jobs/${encodeURIComponent(String(id))}`;
  const experiencePath = (id: number) => `/experiences/${encodeURIComponent(String(id))}`;
  const groupPath = (id: number) => `/experience-groups/${encodeURIComponent(String(id))}`;
  const documentGroupPath = (id: number) => `/document-groups/${encodeURIComponent(String(id))}`;
  const documentPath = (groupId: number, type: DocumentType) => `${documentGroupPath(groupId)}/documents/${type}`;

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

    async listJobs(status: JobStatusFilter = "all") {
      const qs = status === "all" ? "" : `?status=${status}`;
      return json<JobList>(await request(`/jobs${qs}`));
    },

    async getJob(id: number) {
      const response = await request(jobPath(id));
      if (response.status === 404) return null;
      return json<Job>(response);
    },

    async createJob(input: JobInput) {
      return json<Job>(await request("/jobs", send("POST", input)));
    },

    async updateJob(id: number, input: JobInput) {
      return json<Job>(await request(jobPath(id), send("PUT", input)));
    },

    async setJobVerified(id: number, verified: boolean) {
      return json<Job>(await request(`${jobPath(id)}/verified`, send("PUT", { verified })));
    },

    async deleteJob(id: number) {
      await empty(await request(jobPath(id), send("DELETE")));
    },

    async listExperiences(view: ExperienceView = "all", q = "") {
      const params = new URLSearchParams();
      if (view !== "all") params.set("view", view);
      if (q.trim()) params.set("q", q.trim());
      const qs = params.toString();
      return json<ExperienceList>(await request(`/experiences${qs ? `?${qs}` : ""}`));
    },

    async listExperienceLinks() {
      return json<ExperienceLinkKey[]>(await request("/experiences/links"));
    },

    async getExperience(id: number) {
      const response = await request(experiencePath(id));
      if (response.status === 404) return null;
      return json<Experience>(response);
    },

    async createExperience(input: ExperienceInput) {
      return json<Experience>(await request("/experiences", send("POST", input)));
    },

    async updateExperience(id: number, input: ExperienceInput) {
      return json<Experience>(await request(experiencePath(id), send("PUT", input)));
    },

    async setExperienceVerified(id: number, verified: boolean) {
      return json<Experience>(await request(`${experiencePath(id)}/verified`, send("PUT", { verified })));
    },

    async deleteExperience(id: number) {
      await empty(await request(experiencePath(id), send("DELETE")));
    },

    async setExperiencePlacement(id: number, placement: ExperiencePlacement) {
      return json<Experience>(await request(`${experiencePath(id)}/placement`, send("PUT", placement)));
    },

    async listExperienceGroups() {
      return json<ExperienceGroup[]>(await request("/experience-groups"));
    },

    async createExperienceGroup(name: string, experienceIds: number[]) {
      return json<ExperienceGroup>(await request("/experience-groups", send("POST", { name, experienceIds })));
    },

    async renameExperienceGroup(id: number, name: string) {
      return json<ExperienceGroup>(await request(groupPath(id), send("PUT", { name })));
    },

    async deleteExperienceGroup(id: number) {
      await empty(await request(groupPath(id), send("DELETE")));
    },

    async getResume() {
      return json<Resume>(await request("/resume"));
    },

    async saveResumeBasics(basics: ResumeBasics) {
      return json<Resume>(await request("/resume/basics", send("PUT", basics)));
    },

    async saveResumeDirection(direction: string) {
      return json<Resume>(await request("/resume/direction", send("PUT", { direction })));
    },

    async saveCareers(careers: Career[]) {
      return json<Resume>(await request("/resume/careers", send("PUT", careers)));
    },

    async saveEducations(educations: Education[]) {
      return json<Resume>(await request("/resume/educations", send("PUT", educations)));
    },

    async saveCertificates(certificates: Certificate[]) {
      return json<Resume>(await request("/resume/certificates", send("PUT", certificates)));
    },

    async saveSkills(skills: SkillGroup[]) {
      return json<Resume>(await request("/resume/skills", send("PUT", skills)));
    },

    async savePersonality(personality: PersonalityAnswer[]) {
      return json<Resume>(await request("/resume/personality", send("PUT", personality)));
    },

    async listDocumentGroups() {
      return json<DocumentGroupSummary[]>(await request("/document-groups"));
    },

    async getDocumentGroup(id: number) {
      const response = await request(documentGroupPath(id));
      if (response.status === 404) return null;
      return json<DocumentGroup>(response);
    },

    async createDocumentGroup(input: DocumentGroupInput) {
      return json<DocumentGroup>(await request("/document-groups", send("POST", input)));
    },

    async updateDocumentGroup(id: number, input: DocumentGroupInput) {
      return json<DocumentGroup>(await request(documentGroupPath(id), send("PUT", input)));
    },

    async deleteDocumentGroup(id: number) {
      await empty(await request(documentGroupPath(id), send("DELETE")));
    },

    async createDocument(groupId: number, type: DocumentType, content: DocumentContent) {
      return json<SavedDocument>(await request(`${documentGroupPath(groupId)}/documents`, send("POST", { type, ...(typeof content === "string" ? { body: content } : content) })));
    },

    async getDocument(groupId: number, type: DocumentType) {
      const response = await request(documentPath(groupId, type));
      if (response.status === 404) return null;
      return json<SavedDocument>(response);
    },

    async saveDocument(groupId: number, type: DocumentType, content: DocumentContent) {
      return json<SavedDocument>(await request(documentPath(groupId, type), send("PUT", typeof content === "string" ? { body: content } : content)));
    },

    async getCoverLetter(groupId: number) {
      const response = await request(`${documentGroupPath(groupId)}/cover-letter`);
      if (response.status === 404) return null;
      return json<CoverLetter>(response);
    },

    async saveCoverLetter(groupId: number, items: CoverLetterItem[]) {
      return json<CoverLetter>(await request(`${documentGroupPath(groupId)}/cover-letter`, send("PUT", { items })));
    },

    async deleteDocument(groupId: number, type: DocumentType) {
      await empty(await request(documentPath(groupId, type), send("DELETE")));
    },

    async saveDocumentReview(groupId: number, input: DocumentReviewInput) {
      return json<DocumentGroup>(await request(`${documentGroupPath(groupId)}/reviews`, send("POST", input)));
    },

    async setReviewItemDone(groupId: number, itemId: number, done: boolean) {
      const path = `${documentGroupPath(groupId)}/review-items/${encodeURIComponent(String(itemId))}/done`;
      return json<DocumentGroup>(await request(path, send("PUT", { done })));
    },

    async downloadDocumentPdf(groupId: number, type: DocumentType) {
      const response = await request(`${documentPath(groupId, type)}/pdf`, { headers: { Accept: "application/pdf" } });
      if (!response.ok) return fail(response);
      return response.blob();
    },
  };
}
