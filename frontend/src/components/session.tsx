import { createContext, useCallback, useContext } from "react";
import { isUnauthorized, type User } from "@/services";

export interface Session {
  user: User;
  /** The server said 401: tell the user and go to the login screen. */
  expire: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside a logged-in layout");
  return session;
}

/**
 * Returns a handler for failed calls: a 401 ends the session (true is
 * returned), anything else is left to the caller (false).
 */
export function useSessionErrors(): (error: unknown) => boolean {
  const { expire } = useSession();
  return useCallback(
    (error: unknown) => {
      if (!isUnauthorized(error)) return false;
      expire();
      return true;
    },
    [expire],
  );
}

export const SESSION_EXPIRED = "로그인이 만료됐어요. 다시 로그인해 주세요.";
