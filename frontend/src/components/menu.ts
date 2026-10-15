import type { IconName } from "./icons";

export interface MenuItem {
  name: string;
  /** The route the menu opens. */
  path: string;
  icon: IconName;
  /** Off: shown greyed out with "준비 중" until the feature is built. */
  on: boolean;
  /** A divider labeled "내 재료" goes where the group changes (tech plan 3.2). */
  group: "flow" | "base";
}

/** The one list both the sidebar and the mobile tab bar are drawn from. */
export const MENU: MenuItem[] = [
  { name: "지원현황", path: "/applications", icon: "chart", on: true, group: "flow" },
  { name: "공고분석", path: "/jobs", icon: "search", on: false, group: "flow" },
  { name: "지원서류", path: "/documents", icon: "file", on: false, group: "flow" },
  { name: "면접후기", path: "/reviews", icon: "chat", on: false, group: "flow" },
  { name: "경험", path: "/experiences", icon: "star", on: false, group: "base" },
  { name: "이력", path: "/resume", icon: "user", on: false, group: "base" },
];

/** The menu a path belongs to (e.g. /applications/3/edit is 지원현황). */
export function currentMenu(pathname: string): MenuItem | undefined {
  return MENU.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`));
}
