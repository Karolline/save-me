import type { IconName } from "./icons";

export interface MenuItem {
  name: string;
  /** 메뉴가 여는 경로. */
  path: string;
  icon: IconName;
  /** 꺼져 있으면 기능을 만들 때까지 흐리게 "준비 중"으로 보인다. */
  on: boolean;
  /** 묶음이 바뀌는 곳에 "내 재료" 구분선이 들어간다 (기획안 3.2). */
  group: "flow" | "base";
}

/** 사이드바와 모바일 탭 바가 함께 쓰는 메뉴 목록 하나. */
export const MENU: MenuItem[] = [
  { name: "지원현황", path: "/applications", icon: "chart", on: true, group: "flow" },
  { name: "공고분석", path: "/jobs", icon: "search", on: true, group: "flow" },
  { name: "지원서류", path: "/documents", icon: "file", on: false, group: "flow" },
  { name: "면접후기", path: "/reviews", icon: "chat", on: true, group: "flow" },
  { name: "빈출질문", path: "/questions", icon: "question", on: false, group: "flow" },
  { name: "경험", path: "/experiences", icon: "star", on: false, group: "base" },
  { name: "이력", path: "/resume", icon: "user", on: false, group: "base" },
];

/** 경로가 속한 메뉴 (예: /applications/3/edit는 지원현황). */
export function currentMenu(pathname: string): MenuItem | undefined {
  return MENU.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`));
}
