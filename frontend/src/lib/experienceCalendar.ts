/**
 * 경험 캘린더 (완료분 기획안 S2 11번, 목업 viewExpCalendar·expIssues·calendarUnits): 연·월 축 계산,
 * 소속 회사 색, 흐름 점검, 줄 순서. 순수 함수만 둔다. "이번 달"은 늘 받아서 쓴다 (시계를 읽지 않는다).
 */
import type { Career, ExperienceGroup } from "@/services/types";

/** 한 달의 폭 (px). */
export const MONTH_WIDTH = 15;
/** 막대 안에 이름을 넣는 최소 폭 (px). 좁으면 막대 오른쪽에 쓴다. */
export const LABEL_INSIDE_MIN = 120;

/** 캘린더가 쓰는 경험의 칸 (목록 줄 ExperienceSummary나 바로 고치는 중인 값). */
export interface CalendarExperience {
  id: number;
  name: string;
  startedOn: string | null;
  endedOn: string | null;
  org: string;
  groupId: number | null;
}

/** "2026-10" → 달 번호 (해 × 12 + 달 - 1). */
export const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
/** "2026-10" → "2026.10". */
const dot = (ym: string) => ym.replace("-", ".");

// ── 소속 회사와 색 ──

/** 소속의 회사: "회사 · 팀"의 "·" 앞 (앞뒤 빈칸 없이). */
export const orgCompany = (org: string) => (org || "").split("·")[0].trim();

/** 개인 프로젝트인지: 회사가 비었거나 "개인"이 들어 있다 (목업과 같음). */
const isPersonal = (company: string) => !company || company.includes("개인");

/** 경력을 입사가 이른 순으로 (입사가 없으면 맨 뒤, 같으면 받은 순서). 색과 범례가 이 순서다. */
export function careersByStart(careers: Career[]): Career[] {
  // 경력 날짜는 일까지 올 수 있다: 캘린더는 달 단위라 앞 7글자(YYYY-MM)만 쓴다.
  const month = (v: string | null) => (v ? v.slice(0, 7) : null);
  return careers
    .map((c) => ({
      ...c,
      startedOn: month(c.startedOn),
      endedOn: month(c.endedOn),
      leaveStartedOn: month(c.leaveStartedOn),
      leaveEndedOn: month(c.leaveEndedOn),
    }))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      if (!a.c.startedOn || !b.c.startedOn) return (a.c.startedOn ? 0 : 1) - (b.c.startedOn ? 0 : 1) || a.i - b.i;
      return a.c.startedOn.localeCompare(b.c.startedOn) || a.i - b.i;
    })
    .map(({ c }) => c);
}

/** 경력 순서(careersByStart)의 k번째 색: oc-0..oc-3을 돌려 쓴다. */
export const careerColor = (k: number) => `oc-${k % 4}`;

/** 회사 이름이 꼭 같은 경력 (입사가 이른 것부터 찾는다). */
export function careerOf(org: string, careers: Career[]): Career | null {
  const company = orgCompany(org);
  return careersByStart(careers).find((c) => c.company === company) ?? null;
}

/** 경험 막대의 색: 개인 프로젝트, 이력의 회사(경력 순서의 색), 이력에 없는 회사. */
export function orgColor(org: string, careers: Career[]): string {
  const company = orgCompany(org);
  if (isPersonal(company)) return "oc-personal";
  const k = careersByStart(careers).findIndex((c) => c.company === company);
  return k < 0 ? "oc-unknown" : careerColor(k);
}

/** 바로 고치기의 소속 목록: "회사 · 부서" (부서가 없으면 회사만), 끝에 "개인 프로젝트". 겹치면 하나만. */
export function orgOptions(careers: Career[]): string[] {
  const options = careersByStart(careers).map((c) => (c.team ? `${c.company} · ${c.team}` : c.company));
  return [...new Set([...options, "개인 프로젝트"])];
}

// ── 흐름 점검 ──

/** 재직 기간 글: "2020.03 – 2022.12", 재직 중이면 "2023.01 – 재직 중". */
function careerSpan(c: Career): string {
  return `${c.startedOn ? `${dot(c.startedOn)} ` : ""}– ${c.endedOn ? dot(c.endedOn) : "재직 중"}`;
}

/**
 * 흐름 점검: 경험의 기간과 소속이 이력과 맞는지 (목업 expIssues + 휴직). 순서대로:
 * 시작 없음(여기서 끝), 끝이 시작보다 빠름, 재직 기간 밖, 진행 중인데 퇴사함, 휴직 기간과 겹침,
 * 이력에 없는 소속. 끝이 비면 이번 달까지 이어진 것으로 본다.
 */
export function experienceIssues(x: Pick<CalendarExperience, "startedOn" | "endedOn" | "org">, careers: Career[], today: string): string[] {
  const out: string[] = [];
  const from = x.startedOn;
  const to = x.endedOn;
  if (!from) return ["시작 연월이 없어요"];
  if (to && to < from) out.push("끝이 시작보다 빨라요");
  const company = orgCompany(x.org);
  const career = careerOf(x.org, careers);
  if (career) {
    const before = career.startedOn !== null && from < career.startedOn;
    const after = !!to && career.endedOn !== null && to > career.endedOn;
    if (before || after) out.push(`${company} 재직 기간(${careerSpan(career)}) 밖이에요`);
    if (!to && career.endedOn) {
      out.push(`끝이 비어 있어 "진행 중"으로 보이는데, ${company}에서 ${dot(career.endedOn)}에 퇴사했어요`);
    }
    const leaveFrom = career.leaveStartedOn;
    if (leaveFrom) {
      const leaveTo = career.leaveEndedOn;
      const end = to || today;
      if (end >= leaveFrom && (!leaveTo || from <= leaveTo)) {
        out.push(`휴직 기간(${dot(leaveFrom)} –${leaveTo ? ` ${dot(leaveTo)}` : ""})과 겹쳐요`);
      }
    }
  } else if (!isPersonal(company)) {
    out.push(`이력에 없는 소속이에요 (${company})`);
  }
  return out;
}

// ── 연·월 축 ──

export interface CalendarAxis {
  /** 첫 해 1월의 달 번호. */
  first: number;
  /** 달 수 (해 수 × 12). */
  months: number;
  /** 축 전체 폭 (px). */
  width: number;
  years: number[];
}

/**
 * 축: 경험·경력·휴직의 시작 중 가장 이른 해 1월부터, 이번 달·경력 끝·휴직 끝(과 경험의 시작·끝) 중
 * 가장 늦은 해 12월까지. 아무것도 없으면 올해 한 해.
 */
export function calendarAxis(experiences: CalendarExperience[], careers: Career[], today: string): CalendarAxis {
  const starts = [
    ...experiences.map((x) => x.startedOn),
    ...careers.flatMap((c) => [c.startedOn, c.leaveStartedOn]),
  ].filter((m): m is string => !!m);
  const ends = [
    today,
    ...experiences.flatMap((x) => [x.startedOn, x.endedOn]),
    ...careers.flatMap((c) => [c.startedOn, c.endedOn, c.leaveEndedOn]),
  ].filter((m): m is string => !!m);
  const year = (ym: string) => Number(ym.slice(0, 4));
  const y0 = Math.min(year(today), ...starts.map(year));
  const y1 = Math.max(...ends.map(year));
  const years = Array.from({ length: y1 - y0 + 1 }, (_, k) => y0 + k);
  const months = years.length * 12;
  return { first: y0 * 12, months, width: months * MONTH_WIDTH, years };
}

/** 달의 왼쪽 끝 (px). */
export const monthLeft = (axis: CalendarAxis, ym: string) => (monthIndex(ym) - axis.first) * MONTH_WIDTH;

/** from부터 to(없으면 이번 달)까지의 폭, 양 끝 포함, 적어도 한 달 (끝이 시작보다 빨라도). */
export function spanWidth(from: string, to: string | null, today: string): number {
  return Math.max(MONTH_WIDTH, (monthIndex(to || today) - monthIndex(from) + 1) * MONTH_WIDTH);
}

export interface Box {
  left: number;
  width: number;
}

/** 경험 막대. 시작이 없으면 null ("기간 없음"). 이름은 폭이 넉넉할 때만 막대 안에. */
export function experienceBar(
  x: Pick<CalendarExperience, "startedOn" | "endedOn">,
  axis: CalendarAxis,
  today: string,
): (Box & { open: boolean; labelInside: boolean }) | null {
  if (!x.startedOn) return null;
  const width = spanWidth(x.startedOn, x.endedOn, today);
  return { left: monthLeft(axis, x.startedOn), width, open: !x.endedOn, labelInside: width > LABEL_INSIDE_MIN };
}

export interface CareerBand extends Box {
  company: string;
  color: string;
  /** 띠 안의 휴직 구간 (축 기준 위치)과 제목. */
  leave: (Box & { title: string }) | null;
}

/**
 * 재직 기간 띠: 경력마다 하나 (입사가 없으면 없음), 입사가 이른 순의 색. 퇴사가 없으면 이번 달까지,
 * 휴직 끝이 이번 달 뒤면 휴직 끝까지. 휴직은 휴직 시작부터 휴직 끝(없으면 띠 끝)까지, 띠 안으로 자른다.
 */
export function careerBands(careers: Career[], axis: CalendarAxis, today: string): CareerBand[] {
  return careersByStart(careers).flatMap((c, k) => {
    if (!c.startedOn) return [];
    const plannedLeaveEnd = !c.endedOn && c.leaveStartedOn && c.leaveEndedOn && c.leaveEndedOn > today ? c.leaveEndedOn : null;
    const end = c.endedOn ?? plannedLeaveEnd ?? today;
    const band: CareerBand = {
      company: c.company,
      color: careerColor(k),
      left: monthLeft(axis, c.startedOn),
      width: spanWidth(c.startedOn, end, today),
      leave: null,
    };
    if (c.leaveStartedOn) {
      const from = c.leaveStartedOn < c.startedOn ? c.startedOn : c.leaveStartedOn;
      const to = c.leaveEndedOn && c.leaveEndedOn < end ? c.leaveEndedOn : end;
      if (monthIndex(to) >= monthIndex(from)) {
        band.leave = {
          left: monthLeft(axis, from),
          width: spanWidth(from, to, today),
          title: `휴직 ${dot(c.leaveStartedOn)} –${c.leaveEndedOn ? ` ${dot(c.leaveEndedOn)}` : ""}`,
        };
      }
    }
    return [band];
  });
}

// ── 줄 순서 ──

export interface CalendarUnit<T extends CalendarExperience> {
  /** 그룹이면 그 그룹, 아니면 null (경험 하나). */
  group: ExperienceGroup | null;
  items: T[];
}

const startKey = (x: CalendarExperience) => x.startedOn || "9999";

/**
 * 캘린더 줄 순서 (목업 calendarUnits): 같은 그룹은 한 덩어리로, 덩어리끼리는 가장 이른 시작 순.
 * 덩어리 안은 시작 순, 시작이 없으면 맨 뒤. 같으면 id 순. 없는 그룹을 가리키면 그룹이 없는 것처럼.
 */
export function calendarUnits<T extends CalendarExperience>(experiences: T[], groups: ExperienceGroup[]): CalendarUnit<T>[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const units: CalendarUnit<T>[] = [];
  const byGroup = new Map<number, CalendarUnit<T>>();
  const ordered = [...experiences].sort((a, b) => startKey(a).localeCompare(startKey(b)) || a.id - b.id);
  for (const x of ordered) {
    const group = x.groupId !== null ? byId.get(x.groupId) : undefined;
    if (!group) {
      units.push({ group: null, items: [x] });
      continue;
    }
    let unit = byGroup.get(group.id);
    if (!unit) {
      unit = { group, items: [] };
      byGroup.set(group.id, unit);
      units.push(unit);
    }
    unit.items.push(x);
  }
  // 경험을 시작 순으로 훑으며 덩어리를 만들었으므로, 덩어리는 이미 가장 이른 시작 순이다.
  return units;
}

/**
 * 그룹 머리 줄의 점선: 가장 이른 시작부터 가장 늦은 끝까지 (끝이 없으면 이번 달). 시작이 있는
 * 경험이 없으면 null.
 */
export function groupSpan(items: CalendarExperience[], axis: CalendarAxis, today: string): Box | null {
  const dated = items.filter((x) => x.startedOn);
  if (!dated.length) return null;
  const start = dated.map((x) => x.startedOn!).sort()[0];
  const end = Math.max(...dated.map((x) => monthIndex(x.endedOn || today)), monthIndex(start));
  return { left: monthLeft(axis, start), width: (end - monthIndex(start) + 1) * MONTH_WIDTH };
}
