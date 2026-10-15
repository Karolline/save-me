import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApplicationDetailPanel } from "@/components/ApplicationDetailPanel";
import { ApplicationFormPanel } from "@/components/ApplicationFormPanel";
import { ApplicationsScreen } from "@/components/ApplicationsScreen";
import { JobEditScreen } from "@/components/JobEditScreen";
import { JobsScreen } from "@/components/JobsScreen";
import { JobViewScreen } from "@/components/JobViewScreen";
import { ReviewEditScreen } from "@/components/ReviewEditScreen";
import { ReviewsScreen } from "@/components/ReviewsScreen";
import { ReviewViewScreen } from "@/components/ReviewViewScreen";
import { ToastProvider, useToast } from "@/components/feedback";
import { LoginScreen } from "@/components/LoginScreen";
import { SESSION_EXPIRED, SessionContext, useSession } from "@/components/session";
import { NotFoundScreen, SettingsScreen } from "@/components/SettingsScreen";
import { Shell } from "@/components/Shell";
import { useService, type JobStatusFilter, type User } from "@/services";

// 이동은 라우트 컴포넌트가 맡고, 화면은 콜백만 받는다.
// 그래서 화면은 라우터 없이 테스트할 수 있다.

const rootRoute = createRootRoute({
  component: () => (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: function LoginPage() {
    const navigate = useNavigate();
    return <LoginScreen onLoggedIn={() => navigate({ to: "/applications" })} />;
  },
});

/** 로그인 뒤의 모든 화면: 세션을 확인한 뒤 셸을 그린다. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: function AppLayout() {
    const service = useService();
    const navigate = useNavigate();
    const toast = useToast();
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const [user, setUser] = useState<User | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
      let live = true;
      service
        .getMe()
        .then((me) => {
          if (!live) return;
          if (me) setUser(me);
          else navigate({ to: "/login", replace: true });
        })
        .catch(() => live && setFailed(true));
      return () => {
        live = false;
      };
    }, [service, navigate, attempt]);

    const expire = useCallback(() => {
      toast(SESSION_EXPIRED, "top");
      setUser(null);
      navigate({ to: "/login" });
    }, [toast, navigate]);
    const session = useMemo(() => (user ? { user, expire } : null), [user, expire]);

    if (failed) {
      return (
        <div className="solo">
          <div className="card err" role="alert">
            <h2>불러오지 못했어요</h2>
            <p>서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      );
    }
    if (!session) return null;
    return (
      <SessionContext.Provider value={session}>
        <Shell
          pathname={pathname}
          user={session.user}
          onNavigate={(to) => navigate({ to })}
          onLogout={async () => {
            await service.logout().catch(() => {});
            navigate({ to: "/login" });
          }}
        >
          <Outlet />
        </Shell>
      </SessionContext.Provider>
    );
  },
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/applications", replace: true });
  },
});

/** 패널에서 지원 건을 저장하거나 지웠다고 목록에 알린다. */
const ApplicationsChanged = createContext<() => void>(() => {});

const applicationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/applications",
  component: function ApplicationsPage() {
    const navigate = useNavigate();
    const [version, setVersion] = useState(0);
    const changed = useCallback(() => setVersion((v) => v + 1), []);
    return (
      <>
        <ApplicationsScreen
          version={version}
          onOpen={(id) => navigate({ to: "/applications/$id", params: { id: String(id) } })}
          onAdd={() => navigate({ to: "/applications/new" })}
        />
        <ApplicationsChanged.Provider value={changed}>
          <Outlet />
        </ApplicationsChanged.Provider>
      </>
    );
  },
});

/** 정수가 아닌 경로 id는 있을 수 없다. -1이면 화면이 없다고 알려 준다. */
const toId = (param: string) => (/^\d+$/.test(param) ? Number(param) : -1);

const newApplicationRoute = createRoute({
  getParentRoute: () => applicationsRoute,
  path: "new",
  component: function NewApplicationPage() {
    const navigate = useNavigate();
    const changed = useContext(ApplicationsChanged);
    const close = () => navigate({ to: "/applications" });
    return (
      <ApplicationFormPanel
        onSaved={() => {
          changed();
          close();
        }}
        onCancel={close}
        onDeleted={close}
      />
    );
  },
});

const applicationRoute = createRoute({
  getParentRoute: () => applicationsRoute,
  path: "$id",
  component: function ApplicationPage() {
    const { id } = applicationRoute.useParams();
    const navigate = useNavigate();
    return (
      <ApplicationDetailPanel
        key={id}
        id={toId(id)}
        onClose={() => navigate({ to: "/applications" })}
        onEdit={() => navigate({ to: "/applications/$id/edit", params: { id } })}
        onAddReview={() => navigate({ to: "/applications/$id/reviews/new", params: { id } })}
        onOpenReview={(reviewId) =>
          navigate({ to: "/reviews/$reviewId", params: { reviewId: String(reviewId) }, search: { from: "detail" } })
        }
        onOpenJob={(jobId) =>
          navigate({ to: "/jobs/$jobId", params: { jobId: String(jobId) }, search: { from: "detail" } })
        }
        onAddJob={() => navigate({ to: "/jobs/new", search: { applicationId: toId(id) } })}
      />
    );
  },
});

const editApplicationRoute = createRoute({
  getParentRoute: () => applicationsRoute,
  path: "$id/edit",
  component: function EditApplicationPage() {
    const { id } = editApplicationRoute.useParams();
    const navigate = useNavigate();
    const changed = useContext(ApplicationsChanged);
    const close = () => navigate({ to: "/applications" });
    return (
      <ApplicationFormPanel
        key={id}
        id={toId(id)}
        onSaved={() => {
          changed();
          close();
        }}
        onCancel={() => navigate({ to: "/applications/$id", params: { id } })}
        onDeleted={() => {
          changed();
          close();
        }}
      />
    );
  },
});

// ── 면접 후기 (기획안 S2 7번) ──

const reviewsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/reviews",
  validateSearch: (search: Record<string, unknown>): { view?: "fav" } =>
    search.view === "fav" ? { view: "fav" } : {},
  component: function ReviewsPage() {
    const { view } = reviewsRoute.useSearch();
    const navigate = useNavigate();
    return (
      <ReviewsScreen
        view={view === "fav" ? "fav" : "all"}
        onViewChange={(next) => navigate({ to: "/reviews", search: next === "fav" ? { view: "fav" } : {}, replace: true })}
        onOpen={(reviewId, q) =>
          navigate({ to: "/reviews/$reviewId", params: { reviewId: String(reviewId) }, search: q === undefined ? {} : { q } })
        }
        onAdd={() => navigate({ to: "/reviews/new" })}
      />
    );
  },
});

/** 후기를 어디서 열었는지 (`from=detail`: 지원 상세), 강조할 질문 (`q`). */
interface ReviewSearch {
  from?: "detail";
  q?: number;
}

function parseReviewSearch(search: Record<string, unknown>): ReviewSearch {
  const out: ReviewSearch = {};
  if (search.from === "detail") out.from = "detail";
  const q = Number(search.q);
  if (search.q !== undefined && Number.isInteger(q)) out.q = q;
  return out;
}

const newReviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/reviews/new",
  component: function NewReviewPage() {
    const navigate = useNavigate();
    return (
      <ReviewEditScreen
        onSaved={(reviewId) => navigate({ to: "/reviews/$reviewId", params: { reviewId: String(reviewId) } })}
        onCancel={() => navigate({ to: "/reviews" })}
        onHome={() => navigate({ to: "/applications" })}
      />
    );
  },
});

const newApplicationReviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/applications/$id/reviews/new",
  component: function NewApplicationReviewPage() {
    const { id } = newApplicationReviewRoute.useParams();
    const navigate = useNavigate();
    return (
      <ReviewEditScreen
        key={id}
        applicationId={toId(id)}
        onSaved={(reviewId) =>
          navigate({ to: "/reviews/$reviewId", params: { reviewId: String(reviewId) }, search: { from: "detail" } })
        }
        onCancel={() => navigate({ to: "/applications/$id", params: { id } })}
        onHome={() => navigate({ to: "/applications" })}
      />
    );
  },
});

const reviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/reviews/$reviewId",
  validateSearch: parseReviewSearch,
  component: function ReviewPage() {
    const { reviewId } = reviewRoute.useParams();
    const { from, q } = reviewRoute.useSearch();
    const navigate = useNavigate();
    const back = (applicationId: number) =>
      from === "detail"
        ? navigate({ to: "/applications/$id", params: { id: String(applicationId) } })
        : navigate({ to: "/reviews" });
    return (
      <ReviewViewScreen
        key={reviewId}
        id={toId(reviewId)}
        fromDetail={from === "detail"}
        focusQuestion={q}
        onBack={back}
        onDeleted={back}
        onEdit={() => navigate({ to: "/reviews/$reviewId/edit", params: { reviewId }, search: from ? { from } : {} })}
        onOpenApplication={(applicationId) =>
          navigate({ to: "/applications/$id", params: { id: String(applicationId) } })
        }
        onHome={() => navigate({ to: "/applications" })}
      />
    );
  },
});

const editReviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/reviews/$reviewId/edit",
  validateSearch: parseReviewSearch,
  component: function EditReviewPage() {
    const { reviewId } = editReviewRoute.useParams();
    const { from } = editReviewRoute.useSearch();
    const navigate = useNavigate();
    const toView = (id: string) =>
      navigate({ to: "/reviews/$reviewId", params: { reviewId: id }, search: from ? { from } : {} });
    return (
      <ReviewEditScreen
        key={reviewId}
        reviewId={toId(reviewId)}
        onSaved={(saved) => toView(String(saved))}
        onCancel={() => toView(reviewId)}
        onHome={() => navigate({ to: "/applications" })}
      />
    );
  },
});

// ── 공고분석 (기획안 S2 10번) ──

const JOB_FILTERS: JobStatusFilter[] = ["undecided", "applied", "skipped"];

const jobsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/jobs",
  validateSearch: (search: Record<string, unknown>): { status?: JobStatusFilter } =>
    JOB_FILTERS.includes(search.status as JobStatusFilter) ? { status: search.status as JobStatusFilter } : {},
  component: function JobsPage() {
    const { status } = jobsRoute.useSearch();
    const navigate = useNavigate();
    return (
      <JobsScreen
        status={status ?? "all"}
        onStatusChange={(next) => navigate({ to: "/jobs", search: next === "all" ? {} : { status: next }, replace: true })}
        onOpen={(jobId) => navigate({ to: "/jobs/$jobId", params: { jobId: String(jobId) } })}
        onAdd={() => navigate({ to: "/jobs/new" })}
      />
    );
  },
});

/** 분석을 어디서 열었는지 (`from=detail`: 지원 상세). */
const parseJobSearch = (search: Record<string, unknown>): { from?: "detail" } =>
  search.from === "detail" ? { from: "detail" } : {};

/** 분석에서 돌아갈 곳: 지원 상세에서 왔고 연결된 지원 건이 있으면 그 상세, 아니면 목록. */
function useJobBack(from: "detail" | undefined) {
  const navigate = useNavigate();
  return (applicationId: number | null) =>
    from === "detail" && applicationId !== null
      ? navigate({ to: "/applications/$id", params: { id: String(applicationId) } })
      : navigate({ to: "/jobs" });
}

const newJobRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/jobs/new",
  validateSearch: (search: Record<string, unknown>): { applicationId?: number } => {
    const id = Number(search.applicationId);
    return search.applicationId !== undefined && Number.isInteger(id) ? { applicationId: id } : {};
  },
  component: function NewJobPage() {
    const { applicationId } = newJobRoute.useSearch();
    const navigate = useNavigate();
    const fromDetail = applicationId !== undefined;
    return (
      <JobEditScreen
        key={applicationId ?? "new"}
        applicationId={applicationId}
        onSaved={(jobId) =>
          navigate({ to: "/jobs/$jobId", params: { jobId: String(jobId) }, search: fromDetail ? { from: "detail" } : {} })
        }
        onCancel={() =>
          fromDetail
            ? navigate({ to: "/applications/$id", params: { id: String(applicationId) } })
            : navigate({ to: "/jobs" })
        }
        onDeleted={() => navigate({ to: "/jobs" })}
        onHome={() => navigate({ to: "/applications" })}
      />
    );
  },
});

const jobRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/jobs/$jobId",
  validateSearch: parseJobSearch,
  component: function JobPage() {
    const { jobId } = jobRoute.useParams();
    const { from } = jobRoute.useSearch();
    const navigate = useNavigate();
    const back = useJobBack(from);
    return (
      <JobViewScreen
        key={jobId}
        id={toId(jobId)}
        fromDetail={from === "detail"}
        onBack={back}
        onDeleted={back}
        onEdit={() => navigate({ to: "/jobs/$jobId/edit", params: { jobId }, search: from ? { from } : {} })}
        onOpenApplication={(applicationId) =>
          navigate({ to: "/applications/$id", params: { id: String(applicationId) } })
        }
        onHome={() => navigate({ to: "/applications" })}
      />
    );
  },
});

const editJobRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/jobs/$jobId/edit",
  validateSearch: parseJobSearch,
  component: function EditJobPage() {
    const { jobId } = editJobRoute.useParams();
    const { from } = editJobRoute.useSearch();
    const navigate = useNavigate();
    const back = useJobBack(from);
    const toView = () => navigate({ to: "/jobs/$jobId", params: { jobId }, search: from ? { from } : {} });
    return (
      <JobEditScreen
        key={jobId}
        jobId={toId(jobId)}
        onSaved={toView}
        onCancel={toView}
        onDeleted={back}
        onHome={() => navigate({ to: "/applications" })}
      />
    );
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: function SettingsPage() {
    const service = useService();
    const navigate = useNavigate();
    const { user } = useSession();
    const toLogin = () => navigate({ to: "/login" });
    return (
      <SettingsScreen
        user={user}
        onLogout={() => service.logout().catch(() => {}).then(toLogin)}
        onLogoutAll={() => service.logoutAll().catch(() => {}).then(toLogin)}
      />
    );
  },
});

/** 그 밖의 주소, 셸 안에서. */
const notFoundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "$",
  component: function NotFoundPage() {
    const navigate = useNavigate();
    return <NotFoundScreen onHome={() => navigate({ to: "/applications" })} />;
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    indexRoute,
    applicationsRoute.addChildren([newApplicationRoute, applicationRoute, editApplicationRoute]),
    newApplicationReviewRoute,
    reviewsRoute,
    newReviewRoute,
    reviewRoute,
    editReviewRoute,
    jobsRoute,
    newJobRoute,
    jobRoute,
    editJobRoute,
    settingsRoute,
    notFoundRoute,
  ]),
]);

export const router = createRouter({ routeTree, scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
