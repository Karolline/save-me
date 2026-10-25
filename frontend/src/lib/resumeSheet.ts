import type {
  Resume,
  ResumeBlock,
  ResumeData,
  ResumeProject,
  ResumeSheetCareer,
  ResumeSheetEducation,
} from "@/services";

/**
 * 이력서 서류(type `resume`)의 칸 구조 도우미: 빈 구조, 이력 메뉴에서 복사해 채우기,
 * 옛 글(body)을 칸으로 바꾸기. 순수 함수만 둔다 (화면은 `ResumeSheet`).
 */

// ── 빈 구조 ──

export const blankProject = (): ResumeProject => ({ title: "", items: [""] });
export const blankBlock = (): ResumeBlock => ({ title: "", items: [""], projects: [] });
export const blankProjectBlock = (): ResumeBlock => ({ title: "", items: [], projects: [blankProject()] });
export const blankCareer = (): ResumeSheetCareer => ({
  company: "",
  from: "",
  to: "",
  type: "",
  role: "",
  blocks: [blankBlock()],
});
export const blankEducation = (): ResumeSheetEducation => ({ school: "", from: "", to: "", status: "", major: "" });

/** 새 이력서: 칸 하나씩만 있는 빈 서류. */
export const blankResume = (): ResumeData => ({
  name: "",
  phone: "",
  email: "",
  intro: "",
  careers: [blankCareer()],
  personalProjects: [blankProject()],
  educations: [blankEducation()],
  skills: [""],
});

/**
 * 저장된 구조를 화면에 올리기 좋게 다듬는다: 비어 있는 목록에는 빈 항목 하나를 두고,
 * 묶음은 줄도 프로젝트도 없으면 빈 줄 하나, 줄 목록은 비면 빈 줄 하나.
 */
export function withBlanks(data: ResumeData): ResumeData {
  const lines = (items: string[]) => (items.length ? items : [""]);
  const project = (p: ResumeProject): ResumeProject => ({ ...p, items: lines(p.items) });
  const block = (b: ResumeBlock): ResumeBlock =>
    b.projects.length ? { ...b, items: b.items, projects: b.projects.map(project) } : { ...b, items: lines(b.items) };
  const careers = data.careers.map((c) => ({ ...c, blocks: (c.blocks.length ? c.blocks : [blankBlock()]).map(block) }));
  return {
    ...data,
    careers: careers.length ? careers : [blankCareer()],
    personalProjects: data.personalProjects.length ? data.personalProjects.map(project) : [blankProject()],
    educations: data.educations.length ? data.educations : [blankEducation()],
    skills: data.skills.length ? data.skills : [""],
  };
}

const allBlank = (...values: string[]) => values.every((v) => v.trim() === "");
const blankLines = (items: string[]) => items.every((i) => i.trim() === "");
const blankProjectOf = (p: ResumeProject) => p.title.trim() === "" && blankLines(p.items);
const blankBlockOf = (b: ResumeBlock) => b.title.trim() === "" && blankLines(b.items) && b.projects.every(blankProjectOf);
const blankCareerOf = (c: ResumeSheetCareer) =>
  allBlank(c.company, c.from, c.to, c.type, c.role) && c.blocks.every(blankBlockOf);
const blankEducationOf = (e: ResumeSheetEducation) => allBlank(e.school, e.from, e.to, e.status, e.major);

// ── 이력 메뉴에서 복사 ──

/** "2021-10" -> "2021.10". */
export const dotMonth = (month: string | null): string => (month ? month.replace("-", ".") : "");

/** 쉼표로 나누되 괄호 안의 쉼표는 지킨다 ("AWS (S3, EMR)"). */
export function splitComma(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(" || ch === "（") depth++;
    if ((ch === ")" || ch === "）") && depth > 0) depth--;
    if ((ch === "," || ch === "，") && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export interface MenuFill {
  data: ResumeData;
  /** 칸을 하나라도 채웠다. */
  changed: boolean;
  /** 이력 메뉴가 통째로 비어 있다. */
  menuEmpty: boolean;
}

/**
 * [이력에서 불러오기]: 이력 메뉴의 내용을 복사해 비어 있는 칸만 채운다 (연결이 아니다).
 * 이름·전화·이메일·소개는 비어 있는 칸만, 경력·학력·스킬은 목록이 통째로 비어 있을 때만
 * (빈 항목 하나만 있는 것도 빈 것). 개인 프로젝트는 이력 메뉴에 없어서 채우지 않는다.
 */
export function fillFromMenu(current: ResumeData, resume: Resume): MenuFill {
  const { basics } = resume;
  const menuEmpty =
    allBlank(basics.name, basics.phone, basics.email, basics.summary) &&
    resume.careers.length === 0 &&
    resume.educations.length === 0 &&
    resume.skills.length === 0;
  const next: ResumeData = { ...current };
  let changed = false;

  for (const key of ["name", "phone", "email"] as const) {
    if (current[key].trim() === "" && basics[key].trim() !== "") {
      next[key] = basics[key];
      changed = true;
    }
  }
  if (current.intro.trim() === "" && basics.summary.trim() !== "") {
    next.intro = basics.summary;
    changed = true;
  }

  if (current.careers.every(blankCareerOf) && resume.careers.length) {
    next.careers = resume.careers.map((c) => ({
      company: c.company,
      from: dotMonth(c.startedOn),
      to: c.endedOn ? dotMonth(c.endedOn) : "재직중",
      type: "",
      role: c.role,
      blocks: [
        {
          title: "",
          items: c.duties.split("\n").map((l) => l.trim()).filter(Boolean),
          projects: [],
        },
      ],
    }));
    changed = true;
  }

  if (current.educations.every(blankEducationOf) && resume.educations.length) {
    next.educations = resume.educations.map((e) => ({
      school: e.school,
      from: dotMonth(e.startedOn),
      to: dotMonth(e.endedOn),
      status: e.status,
      major: e.major,
    }));
    changed = true;
  }

  if (current.skills.every((s) => s.trim() === "")) {
    const chips = [...new Set(resume.skills.flatMap((g) => splitComma(g.items)))];
    if (chips.length) {
      next.skills = chips;
      changed = true;
    }
  }

  return { data: withBlanks(next), changed, menuEmpty };
}

// ── 옛 글(body)을 칸으로 ──

const SECTION_WORDS: [section: Section, pattern: RegExp][] = [
  ["intro", /^(요약|소개|자기\s*소개|프로필|summary|about)$/i],
  ["career", /^(경력|경력\s*사항|업무\s*경력|work\s*experience|experience)$/i],
  ["skills", /^(기술\s*스택|스킬|기술|skills?|tech\s*stack)$/i],
  ["educations", /^학력(\s*[·/&,]\s*.*)?$/],
  ["personal", /^개인\s*프로젝트$/],
];

type Section = "intro" | "career" | "skills" | "educations" | "personal";

const DATE = String.raw`\d{4}\s*[.\-/]\s*\d{1,2}`;
const END = String.raw`(?:${DATE}|재직\s*중|현재|진행\s*중|present|now)`;
const RANGE = new RegExp(String.raw`(${DATE})\s*(?:[–—~\-]|부터)\s*(${END})?`, "i");
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;
const EMPLOY = /^(정규직|계약직|인턴|프리랜서|파견직?|아르바이트|병역특례)/;
const SCHOOL = /\S*(대학교|대학원|대학|고등학교|학교|university|college)/i;
const STATUS = /(졸업\s*예정|졸업|재학\s*중|재학|수료|휴학|중퇴|편입)/;

const clean = (s: string) => s.replace(/\*\*/g, "").replace(/__/g, "").trim();
const bullet = (line: string) => /^\s*[-*•]\s+/.test(line);
const stripBullet = (line: string) => clean(line.replace(/^\s*[-*•]\s+/, ""));
const numbered = (line: string) => /^\s*\d+[.)]\s+\S/.test(line);
const stripNumber = (line: string) => clean(line.replace(/^\s*\d+[.)]\s+/, ""));

function sectionOf(title: string): Section | null {
  const t = clean(title).replace(/^\d+[.)]\s*/, "");
  for (const [section, pattern] of SECTION_WORDS) if (pattern.test(t)) return section;
  return null;
}

/** 줄이 칸 구분 제목이면 [수준, 글]. `#` 제목 아니면 null. */
function headingOf(line: string): [level: number, text: string] | null {
  const m = /^(#{1,6})\s+(.*)$/.exec(line.trim());
  return m ? [m[1].length, clean(m[2])] : null;
}

/** 날짜 줄이면 { from, to, rest } (`> 2023.01 – 2025.05 · 정규직`, `2021.10 - 재직중 / 정규직 / 직무`). */
function metaOf(line: string): { from: string; to: string; parts: string[] } | null {
  const text = clean(line.replace(/^\s*>\s*/, ""));
  const m = RANGE.exec(text);
  if (!m || m.index > 12 || /[가-힣A-Za-z]/.test(text.slice(0, m.index))) return null;
  const rest = (text.slice(0, m.index) + " | " + text.slice(m.index + m[0].length)).split(/\s*[·/|,]\s*/);
  const norm = (d: string) => d.replace(/\s+/g, "");
  const to = (m[2] ?? "").trim();
  return {
    from: norm(m[1]),
    to: /재직|현재|진행|present|now/i.test(to) ? "재직중" : norm(to),
    parts: rest.map((p) => p.trim()).filter(Boolean),
  };
}

interface Draft {
  name: string;
  phone: string;
  email: string;
  intro: string[];
  leftover: string[];
  careers: ResumeSheetCareer[];
  personalProjects: ResumeProject[];
  educations: ResumeSheetEducation[];
  skills: string[];
}

function parseCareer(lines: string[], draft: Draft): void {
  // 클로저에서 바꾸는 값이라 객체 하나에 모은다 (타입 좁히기가 깨지지 않게).
  const st: { company: ResumeSheetCareer | null; block: ResumeBlock | null; project: ResumeProject | null } = {
    company: null,
    block: null,
    project: null,
  };
  const newCompany = (name: string, role = ""): ResumeSheetCareer => {
    const company: ResumeSheetCareer = { company: name, from: "", to: "", type: "", role, blocks: [] };
    draft.careers.push(company);
    st.company = company;
    st.block = null;
    st.project = null;
    return company;
  };
  const newBlock = (title: string): ResumeBlock => {
    const company = st.company ?? newCompany("");
    const block: ResumeBlock = { title, items: [], projects: [] };
    company.blocks.push(block);
    st.block = block;
    st.project = null;
    return block;
  };
  const currentBlock = (): ResumeBlock => st.block ?? newBlock("");
  const nextIsMeta = (from: number): boolean => {
    for (let i = from; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      return !bullet(lines[i]) && !headingOf(lines[i]) && metaOf(lines[i]) !== null;
    }
    return false;
  };

  const nextIsBullet = (from: number): boolean => {
    for (let i = from; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      return bullet(lines[i]);
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*(-{3,}|\*{3,})\s*$/.test(line)) continue;
    const heading = headingOf(line);
    const meta = !heading && !bullet(line) && !numbered(line) ? metaOf(line) : null;
    if (meta) {
      const c = st.company ?? newCompany("");
      c.from = meta.from;
      c.to = meta.to;
      for (const part of meta.parts) {
        // "(1년 4개월)"은 끝 날짜 칸에 붙여 둔다 (이력서 글에서 날짜 뒤에 괄호로 적는 기간).
        if (/^\(.*\)$/.test(part) && c.to) c.to = `${c.to} ${part}`;
        else if (!c.type && EMPLOY.test(part)) c.type = part;
        else if (!c.role) c.role = part;
        else draft.leftover.push(part);
      }
      continue;
    }
    if (heading) {
      const [level, text] = heading;
      if (level <= 3) {
        // 회사 제목: "회사 · 팀"이면 팀은 직무 칸으로.
        const [name, ...team] = text.split(/\s+[·|]\s+/);
        newCompany(name, team.join(" · "));
      } else newBlock(text);
      continue;
    }
    if (bullet(line)) {
      const text = stripBullet(line);
      if (st.project) st.project.items.push(text);
      else currentBlock().items.push(text);
      continue;
    }
    if (numbered(line) && !nextIsBullet(i + 1)) {
      // 아래에 `- ` 줄이 없는 번호 줄은 프로젝트 제목이 아니라 그냥 줄이다 (번호는 뗀다).
      st.project = null;
      currentBlock().items.push(stripNumber(line));
      continue;
    }
    if (numbered(line)) {
      let block = currentBlock();
      // 줄이 이미 있는 묶음 뒤의 번호 제목은 새 묶음의 프로젝트다.
      if (!block.projects.length && block.items.length) block = newBlock("");
      st.project = { title: stripNumber(line), items: [] };
      block.projects.push(st.project);
      continue;
    }
    const bold = /^\s*\*\*(.+)\*\*\s*$/.exec(line);
    if (bold) {
      newBlock(clean(bold[1]));
      continue;
    }
    // 제목 줄: 바로 아래 날짜 줄이 오면 회사 이름.
    if (nextIsMeta(i + 1)) {
      newCompany(clean(line));
      continue;
    }
    // 표시가 없는 짧은 제목 줄은 업무 묶음 제목 (아래에 줄이나 번호 프로젝트가 온다). 긴 글은 둘 곳이 없어 남긴다.
    if (clean(line).length <= 100) {
      newBlock(clean(line));
      continue;
    }
    draft.leftover.push(clean(line));
  }
}

function parseSkills(lines: string[], draft: Draft): void {
  const rows = lines.filter((l) => l.trim().startsWith("|"));
  const isSep = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
  rows.forEach((row, index) => {
    if (isSep(row)) return;
    if (rows[index + 1] && isSep(rows[index + 1])) return; // 표 머리
    const cells = row.trim().replace(/^\||\|$/g, "").split("|").map(clean);
    draft.skills.push(...splitComma(cells[cells.length - 1] ?? ""));
  });
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("|") || /^\s*-{3,}\s*$/.test(line)) continue;
    const heading = headingOf(line);
    draft.skills.push(...splitComma(heading ? heading[1] : stripBullet(line)));
  }
}

function parseEducations(lines: string[], draft: Draft): void {
  for (const raw of lines) {
    const line = stripBullet(raw.replace(/^#+\s+/, ""));
    if (!line || /^-{3,}$/.test(line)) continue;
    const parts = line.split(/\s+[·|]\s+/);
    const at = parts.findIndex((p) => SCHOOL.test(p));
    // 학교 이름 줄 바로 아래의 날짜 줄(`2013.03 - 2017.08 / 졸업 / 전공`)은 그 학교의 칸을 채운다.
    const last = draft.educations[draft.educations.length - 1];
    const meta = at < 0 && last && !last.from ? metaOf(line) : null;
    if (meta && last) {
      last.from = meta.from;
      last.to = meta.to;
      const majors: string[] = [];
      for (const part of meta.parts) {
        if (!last.status && STATUS.test(part)) last.status = STATUS.exec(part)![0];
        else majors.push(part);
      }
      last.major = majors.join(", ");
      continue;
    }
    if (at < 0) {
      draft.leftover.push(line);
      continue;
    }
    const range = RANGE.exec(line);
    const first = parts[at].replace(RANGE, "").trim();
    const m = SCHOOL.exec(first)!;
    const school = first.slice(0, m.index + m[0].length).trim();
    let major = first.slice(m.index + m[0].length).trim();
    const status = STATUS.exec(line)?.[0] ?? "";
    if (status) major = major.replace(STATUS, "").trim();
    draft.educations.push({
      school,
      from: range ? range[1].replace(/\s+/g, "") : "",
      to: range && range[2] ? range[2].replace(/\s+/g, "") : "",
      status,
      major: major.replace(/^[,/·\s]+|[,/·\s]+$/g, ""),
    });
    // 학교 말고 나머지(자격증 등)는 둘 곳이 없어서 소개 글 아래로.
    const others = parts.filter((_, i) => i !== at && !RANGE.test(parts[i]) && !STATUS.test(parts[i]));
    if (others.length) draft.leftover.push(others.join(" · "));
  }
}

function parsePersonal(lines: string[], draft: Draft): void {
  let project: ResumeProject | null = null;
  for (const line of lines) {
    if (!line.trim() || /^\s*-{3,}\s*$/.test(line)) continue;
    if (bullet(line)) {
      if (!project) {
        project = { title: "", items: [] };
        draft.personalProjects.push(project);
      }
      project.items.push(stripBullet(line));
      continue;
    }
    const heading = headingOf(line);
    project = { title: heading ? heading[1] : numbered(line) ? stripNumber(line) : clean(line), items: [] };
    draft.personalProjects.push(project);
  }
}

function convert(body: string): ResumeData {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const draft: Draft = {
    name: "",
    phone: "",
    email: "",
    intro: [],
    leftover: [],
    careers: [],
    personalProjects: [],
    educations: [],
    skills: [],
  };

  // 구간 나누기: 첫 구간은 머리 (이름·연락처·소개). `##` 제목이나 "경력"만 있는 줄이 구간을 연다.
  interface Part {
    section: Section | "header" | "unknown";
    title: string;
    lines: string[];
  }
  const parts: Part[] = [{ section: "header", title: "", lines: [] }];
  let seenName = false;
  for (const line of lines) {
    const heading = headingOf(line);
    const plain = !heading && line.trim() && line.trim().length <= 12 && !bullet(line) ? sectionOf(line) : null;
    if (heading && heading[0] === 1 && !seenName && !parts[0].lines.some((l) => l.trim())) {
      seenName = true;
      parts[0].lines.push(line);
      continue;
    }
    if (heading && heading[0] <= 2) {
      const section = sectionOf(heading[1]);
      // `##`가 아닌 줄의 `#` 제목이 구간 이름이 아니고 경력 안이면 아래 규칙이 회사로 본다.
      parts.push({ section: section ?? "unknown", title: heading[1], lines: [] });
      continue;
    }
    if (plain) {
      parts.push({ section: plain, title: clean(line), lines: [] });
      continue;
    }
    parts[parts.length - 1].lines.push(line);
  }

  for (const part of parts) {
    switch (part.section) {
      case "header": {
        const rest = part.lines.filter((l) => l.trim());
        if (!rest.length) break;
        const first = headingOf(rest[0]);
        draft.name = clean(first ? first[1] : rest[0]);
        for (const line of rest.slice(1)) {
          if (!EMAIL.test(line) && !PHONE.test(line)) {
            draft.intro.push(clean(line));
            continue;
          }
          for (const piece of clean(line).split(/\s+[·/|]\s+/)) {
            let text = piece;
            const email = EMAIL.exec(text);
            if (email) {
              if (!draft.email) draft.email = email[0];
              text = text.replace(email[0], " ");
            }
            const phone = PHONE.exec(text);
            if (phone) {
              if (!draft.phone) draft.phone = phone[0];
              text = text.replace(phone[0], " ");
            }
            text = text.replace(/\s+/g, " ").trim();
            if (text) draft.leftover.push(text);
          }
        }
        break;
      }
      case "intro":
        draft.intro.push(...part.lines.map(clean));
        break;
      case "career":
        parseCareer(part.lines, draft);
        break;
      case "skills":
        parseSkills(part.lines, draft);
        break;
      case "educations":
        parseEducations(part.lines, draft);
        break;
      case "personal":
        parsePersonal(part.lines, draft);
        break;
      default: {
        const text = part.lines.map((l) => l.trimEnd()).filter((l, i, all) => l.trim() || all[i - 1]?.trim());
        draft.leftover.push(`${part.title}`, ...text.map(clean));
      }
    }
  }

  const paragraph = (ls: string[]) => ls.join("\n").replace(/^\n+|\n+$/g, "").replace(/\n{3,}/g, "\n\n");
  const intro = [paragraph(draft.intro), paragraph(draft.leftover)].filter(Boolean).join("\n\n");
  const dedupe = [...new Set(draft.skills)];
  return withBlanks({
    name: draft.name,
    phone: draft.phone,
    email: draft.email,
    intro,
    careers: draft.careers,
    personalProjects: draft.personalProjects,
    educations: draft.educations,
    skills: dedupe,
  });
}

/**
 * 옛 이력서 글(body)을 칸으로 바꾼다 (최선을 다하는 변환). 열기만 하고 저장하지는 않는다.
 * 알아보지 못한 글은 버리지 않고 소개 글 아래에 이어 붙인다. 읽다가 오류가 나면 전체를 소개 글에 넣는다.
 */
export function bodyToResumeData(body: string): ResumeData {
  if (!body.trim()) return blankResume();
  try {
    return convert(body);
  } catch {
    return { ...blankResume(), intro: body };
  }
}
