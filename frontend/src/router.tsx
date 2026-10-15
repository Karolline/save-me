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
import { ToastProvider, useToast } from "@/components/feedback";
import { LoginScreen } from "@/components/LoginScreen";
import { SESSION_EXPIRED, SessionContext, useSession } from "@/components/session";
import { NotFoundScreen, SettingsScreen } from "@/components/SettingsScreen";
import { Shell } from "@/components/Shell";
import { useService, type User } from "@/services";

// Route components own navigation; screens only receive callbacks,
// which keeps them testable without a router.

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

/** Everything behind login: checks the session, then draws the shell. */
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

/** Tells the list that an application was saved or deleted in a panel. */
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

/** A route id that isn't a whole number can't exist; -1 makes the panel say so. */
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

/** Any other address, inside the shell. */
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
