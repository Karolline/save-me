import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatAppVersion } from "@/lib/appVersion";
import type { User } from "@/services";
import { useEscape } from "./feedback";
import { icons } from "./icons";
import { MENU, currentMenu } from "./menu";

/**
 * The layout around every logged-in screen (tech plan S2 4번): the sidebar
 * on PC, the top bar and bottom tab bar on mobile, and the account menu.
 */
export function Shell({
  pathname,
  user,
  onNavigate,
  onLogout,
  children,
}: {
  pathname: string;
  user: User;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  // Which account button opened the menu: the sidebar's (PC) or the top bar's (mobile).
  const [menuAt, setMenuAt] = useState<"side" | "top" | null>(null);
  const toggle = (at: "side" | "top") => setMenuAt((open) => (open === at ? null : at));
  const active = currentMenu(pathname)?.path;
  const initial = user.nickname.trim().slice(0, 1) || "?";
  const go = (path: string) => {
    setMenuAt(null);
    onNavigate(path);
  };

  const accountMenu = (
    <AccountMenu
      onClose={() => setMenuAt(null)}
      onSettings={() => go("/settings")}
      onLogout={() => {
        setMenuAt(null);
        onLogout();
      }}
    />
  );

  return (
    <>
      <div className="shell">
        <aside className="side">
          <div className="brand-sm">SaveMe</div>
          <nav className="nav" aria-label="메뉴">
            {MENU.map((m, i) => (
              <MenuEntry key={m.path} divider={i > 0 && m.group !== MENU[i - 1].group}>
                {m.on ? (
                  <button
                    type="button"
                    className={active === m.path ? "on" : ""}
                    aria-current={active === m.path ? "page" : undefined}
                    onClick={() => go(m.path)}
                  >
                    {icons[m.icon]}
                    {m.name}
                  </button>
                ) : (
                  <button type="button" className="off" aria-disabled="true">
                    {icons[m.icon]}
                    {m.name}
                    <span className="pill">준비 중</span>
                  </button>
                )}
              </MenuEntry>
            ))}
          </nav>
          <div className="side-foot">
            {menuAt === "side" && accountMenu}
            <button
              type="button"
              className="acct"
              aria-haspopup="menu"
              aria-expanded={menuAt === "side"}
              onClick={() => toggle("side")}
            >
              <span className="avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="acct-name">{user.nickname}</span>
            </button>
            <span className="ver">{formatAppVersion(__APP_VERSION__, __APP_COMMIT__)}</span>
          </div>
        </aside>
        <div className="col">
          <header className="topm">
            <span className="brand-sm">SaveMe</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="계정 메뉴"
              aria-haspopup="menu"
              aria-expanded={menuAt === "top"}
              onClick={() => toggle("top")}
            >
              <span className="avatar">{initial}</span>
            </button>
            {menuAt === "top" && accountMenu}
          </header>
          <main className="main">
            {/* 서류 상세(/documents/:묶음/:종류)는 세로 3분할이라 폭을 다 쓴다. */}
            <div className={`main-inner${/^\/documents\/[^/]+\/[^/]+$/.test(pathname) ? " wide" : ""}`}>{children}</div>
          </main>
        </div>
      </div>
      <nav className="tabbar show" style={{ gridTemplateColumns: `repeat(${MENU.length}, 1fr)` }} aria-label="메뉴">
        {MENU.map((m) =>
          m.on ? (
            <button
              type="button"
              key={m.path}
              className={active === m.path ? "on" : ""}
              aria-current={active === m.path ? "page" : undefined}
              onClick={() => go(m.path)}
            >
              {icons[m.icon]}
              {m.name}
            </button>
          ) : (
            <button type="button" key={m.path} className="off" aria-disabled="true" title="준비 중">
              {icons[m.icon]}
              {m.name}
            </button>
          ),
        )}
      </nav>
    </>
  );
}

function MenuEntry({ divider, children }: { divider: boolean; children: ReactNode }) {
  return (
    <>
      {divider && <span className="nav-sep">내 재료</span>}
      {children}
    </>
  );
}

function AccountMenu({
  onClose,
  onSettings,
  onLogout,
}: {
  onClose: () => void;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => {
    // A click anywhere else closes the menu. The toggle buttons stop on their
    // own, because they live outside this element and flip the state.
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!ref.current?.contains(target) && !target.closest("[aria-haspopup='menu']")) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div className="menu" role="menu" ref={ref}>
      <button type="button" role="menuitem" onClick={onSettings}>
        계정 설정
      </button>
      <button type="button" role="menuitem" onClick={onLogout}>
        로그아웃
      </button>
    </div>
  );
}
