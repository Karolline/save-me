import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  careerPeriod,
  careerTotalText,
  dotMonth,
  fromRowDrafts,
  groupPersonality,
  joinParts,
  leaveLine,
  lines,
  newRowDraft,
  periodText,
  rowHints,
  seoulMonth,
  skillTags,
  toRowDrafts,
  type RowDraft,
} from "@/lib/resume";
import {
  useService,
  type Career,
  type Certificate,
  type Education,
  type PersonalityAnswer,
  type Resume,
  type ResumeBasics,
  type ResumeListCard,
  type SkillGroup,
} from "@/services";
import { useToast } from "./feedback";
import { Field } from "./JobEditScreen";
import { useSessionErrors } from "./session";

type CardKey = "basics" | "direction" | ResumeListCard;

interface Column {
  k: string;
  label: string;
  help?: string;
  month?: boolean;
  /** 경력 날짜: 글 칸 (`2023-03-15`, 일 생략 가능). */
  date?: boolean;
  area?: boolean;
  wide?: boolean;
}

/** 카드 이름과 머리말, 목록 카드의 단위와 칸 (목업 RCARDS + 바뀐 곳). */
const RCARDS: Record<CardKey, { title: string; intro?: string; unit?: string; cols?: Column[] }> = {
  basics: { title: "기본 정보", intro: "서류에 들어가는 연락처와 지금 상태예요." },
  careers: {
    title: "경력",
    intro: "최근 회사가 위에 와요. 주요 업무는 한 줄에 하나씩.",
    unit: "회사",
    cols: [
      { k: "company", label: "회사", help: "경험의 소속과 같은 이름으로 적어요 (캘린더에서 비교)" },
      { k: "team", label: "부서" },
      { k: "role", label: "직무·직급" },
      { k: "startedOn", label: "입사", date: true },
      { k: "endedOn", label: "퇴사", date: true, help: "재직 중이면 비워 둬요" },
      { k: "leaveStartedOn", label: "휴직 시작", date: true, help: "없으면 비워 둬요" },
      { k: "leaveEndedOn", label: "휴직 끝", date: true, help: "복직 예정일" },
      { k: "duties", label: "주요 업무", area: true, wide: true, help: "한 줄에 하나" },
    ],
  },
  educations: {
    title: "학력",
    unit: "학교",
    cols: [
      { k: "school", label: "학교" },
      { k: "major", label: "전공" },
      { k: "startedOn", label: "입학", month: true },
      { k: "endedOn", label: "졸업", month: true },
      { k: "status", label: "상태", help: "졸업·재학·수료 등" },
    ],
  },
  certificates: {
    title: "자격증",
    unit: "자격증",
    cols: [
      { k: "name", label: "자격증" },
      { k: "acquiredOn", label: "취득", month: true },
      { k: "issuer", label: "발급 기관" },
      { k: "number", label: "자격번호" },
    ],
  },
  skills: {
    title: "기술 스택",
    intro: "분류마다 기술을 쉼표로 적어요.",
    unit: "분류",
    cols: [
      { k: "category", label: "분류", help: "예: 언어, 클라우드" },
      { k: "items", label: "기술", help: "쉼표로 구분", wide: true },
      { k: "memo", label: "메모", help: "근거나 숙련도. 태그 아래 작은 글씨로 보여요", area: true, wide: true },
    ],
  },
  direction: { title: "커리어 방향", intro: "어떤 일을 하고 싶은지. 공고분석의 성향 적합도를 볼 때 기준이 돼요." },
  personality: {
    title: "인성 답변",
    intro: "인성 면접에서 실제로 한 답과 거기서 배운 것을 쌓아 둬요.",
    unit: "답변",
    cols: [
      { k: "topic", label: "주제", help: "같은 주제끼리 묶여 보여요. 예: 이직 사유", wide: true },
      { k: "question", label: "질문", wide: true },
      { k: "answer", label: "실제로 한 답", help: '비우면 "답변 작성 필요"로 보여요', area: true, wide: true },
      { k: "lesson", label: "교훈", help: "다음엔 어떻게 말할지", area: true, wide: true },
    ],
  },
};

const ORDER: CardKey[] = ["basics", "careers", "educations", "certificates", "skills", "direction", "personality"];

const BASICS_COLS: [keyof ResumeBasics, string, string?, boolean?][] = [
  ["name", "이름"],
  ["status", "현재 상태", "구직 중·재직 중·휴직 중 등"],
  ["email", "이메일"],
  ["phone", "전화번호"],
  ["want", "희망 직무", undefined, true],
];

type Editing =
  | { key: "basics"; basics: ResumeBasics }
  | { key: "direction"; direction: string }
  | { key: ResumeListCard; rows: RowDraft[] };

const empty = (text: string) => <p className="hint">{text}</p>;

/**
 * 이력 (완료분 기획안 S2 12번, 목업 resume·resume-edit): 카드 한 페이지. 카드마다 [편집]을 누르면
 * 그 카드만 그 자리에서 편집 모드가 되고, 그동안 다른 카드의 [편집]은 막힌다.
 * 총 경력과 휴직 줄은 서울 기준 이번 달(`today`)로 계산한다.
 */
export function ResumeScreen({ today: given }: { /** 테스트에서 정하는 이번 달 `YYYY-MM`. */ today?: string }) {
  // 화면을 연 때의 이번 달 (그리는 동안 시계를 다시 읽지 않는다).
  const [opened] = useState(() => seoulMonth(new Date()));
  const today = given ?? opened;
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [resume, setResume] = useState<Resume | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    service
      .getResume()
      .then((r) => live && setResume(r))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, attempt, handleSessionError]);

  // 새 카드를 더하면 그 카드의 첫 칸으로 초점을 옮긴다.
  const focusTarget = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = focusTarget.current;
    if (!id) return;
    document.getElementById(id)?.focus();
    focusTarget.current = null;
  });

  const head = (
    <div className="ph">
      <div>
        <h1>이력</h1>
        <p>이력서에 들어가는 정보를 한곳에 모아 둬요. 카드마다 [편집]을 누르면 그 자리에서 고쳐요.</p>
      </div>
    </div>
  );

  if (failed) {
    return (
      <>
        {head}
        <div className="card err" role="alert">
          <h2>불러오지 못했어요</h2>
          <p>네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
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
      </>
    );
  }
  if (!resume) {
    return (
      <>
        {head}
        <div className="card skel" aria-label="불러오는 중" aria-busy="true">
          <div style={{ width: "50%" }} />
          <div style={{ width: "70%" }} />
          <div style={{ width: "60%" }} />
        </div>
      </>
    );
  }
  const r = resume;

  function startEdit(key: CardKey) {
    if (key === "basics") setEditing({ key, basics: { ...r.basics } });
    else if (key === "direction") setEditing({ key, direction: r.direction });
    else setEditing({ key, rows: toRowDrafts(key, r[key]) });
  }

  // ── 편집 ──

  const listHints = editing && "rows" in editing ? editing.rows.map((row) => rowHints(editing.key, row)) : [];
  const blocked = listHints.some((h) => Object.keys(h).length > 0);

  async function save() {
    if (!editing || blocked) return;
    setSaving(true);
    try {
      let next: Resume;
      if (editing.key === "basics") next = await service.saveResumeBasics(editing.basics);
      else if (editing.key === "direction") next = await service.saveResumeDirection(editing.direction);
      else {
        // 카드마다 초안을 그 카드의 타입으로 바꿔 서비스 메서드를 부른다.
        const savers: Record<ResumeListCard, (rows: RowDraft[]) => Promise<Resume>> = {
          careers: (rows) => service.saveCareers(fromRowDrafts<Career>("careers", rows)),
          educations: (rows) => service.saveEducations(fromRowDrafts<Education>("educations", rows)),
          certificates: (rows) => service.saveCertificates(fromRowDrafts<Certificate>("certificates", rows)),
          skills: (rows) => service.saveSkills(fromRowDrafts<SkillGroup>("skills", rows)),
          personality: (rows) => service.savePersonality(fromRowDrafts<PersonalityAnswer>("personality", rows)),
        };
        next = await savers[editing.key](editing.rows);
      }
      setResume(next);
      setEditing(null);
      toast("저장했어요");
    } catch (error) {
      // 고치던 값은 그대로 두고 편집 모드에 남는다.
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  function setRow(key: number, k: string, value: string) {
    setEditing((e) =>
      e && "rows" in e ? { ...e, rows: e.rows.map((row) => (row.key === key ? { ...row, v: { ...row.v, [k]: value } } : row)) } : e,
    );
  }

  function editor(e: Editing): ReactNode {
    if (e.key === "basics") {
      const b = e.basics;
      const set = (k: keyof ResumeBasics, value: string) =>
        setEditing((x) => (x?.key === "basics" ? { ...x, basics: { ...x.basics, [k]: value } } : x));
      return (
        <div className="row-fields">
          {BASICS_COLS.map(([k, label, help, wide]) => (
            <Field key={k} id={`rb-${k}`} label={label} help={help} wide={wide}>
              <input className="input" id={`rb-${k}`} value={b[k]} onChange={(ev) => set(k, ev.target.value)} />
            </Field>
          ))}
          <Field id="rb-summary" label="이력서 요약문" help="서류 맨 위에 쓰는 소개 글. 기본 정보 카드 아래에 보여요" wide>
            <textarea className="textarea sm" id="rb-summary" value={b.summary} onChange={(ev) => set("summary", ev.target.value)} />
          </Field>
        </div>
      );
    }
    if (e.key === "direction") {
      return (
        <Field id="rd-dir" label="커리어 방향">
          <textarea
            className="textarea raw-ed"
            id="rd-dir"
            value={e.direction}
            onChange={(ev) => setEditing((x) => (x?.key === "direction" ? { ...x, direction: ev.target.value } : x))}
          />
        </Field>
      );
    }
    const card = e.key;
    const c = RCARDS[card];
    const cols = c.cols!;
    return (
      <div className="rows-ed">
        {e.rows.map((row, i) => {
          const hints = listHints[i] ?? {};
          return (
            <div key={row.key} className="row-card" aria-label={`${c.unit} ${i + 1}`}>
              <div className="row-card-h">
                <b>
                  {c.unit} {i + 1}
                </b>
                <button
                  type="button"
                  className="btn btn-text danger btn-sm"
                  onClick={() => setEditing({ key: card, rows: e.rows.filter((x) => x.key !== row.key) })}
                >
                  이 {c.unit} 삭제
                </button>
              </div>
              <div className="row-fields">
                {cols.map((col) => {
                  const id = `rr-${row.key}-${col.k}`;
                  const hint = hints[col.k];
                  return (
                    <Field key={col.k} id={id} label={col.label} help={col.help} wide={col.wide}>
                      {col.area ? (
                        <textarea
                          className="textarea sm"
                          id={id}
                          value={row.v[col.k]}
                          onChange={(ev) => setRow(row.key, col.k, ev.target.value)}
                        />
                      ) : (
                        <input
                          className={`input${col.month || col.date ? " mono" : ""}${hint ? " invalid" : ""}`}
                          type={col.month ? "month" : undefined}
                          placeholder={col.date ? "2023-03-15" : undefined}
                          id={id}
                          value={row.v[col.k]}
                          aria-invalid={hint ? true : undefined}
                          aria-describedby={hint ? `${id}-hint` : undefined}
                          onChange={(ev) => setRow(row.key, col.k, ev.target.value)}
                        />
                      )}
                      {hint && (
                        <span className="hint-err" id={`${id}-hint`}>
                          {hint}
                        </span>
                      )}
                    </Field>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const row = newRowDraft(card);
              setEditing({ key: card, rows: [...e.rows, row] });
              focusTarget.current = `rr-${row.key}-${cols[0].k}`;
            }}
          >
            + {c.unit} 추가
          </button>
        </div>
      </div>
    );
  }

  // ── 보기 ──

  function basicsView(): ReactNode {
    const b = r.basics;
    if (![b.name, b.email, b.phone, b.status, b.want, b.summary].some((x) => x.trim())) {
      return empty("아직 적은 기본 정보가 없어요.");
    }
    const contact = joinParts([b.email, b.phone]);
    const hasCareer = r.careers.some((c) => c.startedOn);
    const total = careerTotalText(r.careers, today);
    const pills = b.status || b.want || hasCareer;
    return (
      <>
        <div className="rbasic">
          {b.name && <div className="avatar lg">{Array.from(b.name)[0]}</div>}
          <div>
            {b.name && <b className="rname">{b.name}</b>}
            {contact && <div className="hint">{contact}</div>}
            {pills && (
              <div className="rtags">
                {b.status && <span className="pill st-und">{b.status}</span>}
                {b.want && <span className="pill">희망: {b.want}</span>}
                {hasCareer && (
                  <span className="pill fit">
                    {total.total}
                    {total.leave && <span className="nw">{total.leave}</span>}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {b.summary.trim() && (
          <div className="rsum">
            <span className="k">이력서 요약문</span>
            <p className="para pre">{b.summary}</p>
          </div>
        )}
      </>
    );
  }

  function careersView(): ReactNode {
    if (!r.careers.length) return empty("아직 적은 경력이 없어요.");
    return (
      <ol className="rtimeline">
        {r.careers.map((c, i) => {
          const period = careerPeriod(c, today);
          const sub = joinParts([c.team, c.role]);
          const leave = leaveLine(c, today);
          const duties = lines(c.duties);
          return (
            <li key={i}>
              <div className="rt-h">
                <b>{c.company}</b>
                {period && <span className="mono hint">{period}</span>}
              </div>
              {sub && <div className="hint">{sub}</div>}
              {leave && (
                <div>
                  <span className="leave">{leave}</span>
                </div>
              )}
              {duties.length > 0 && (
                <ul className="jlist">
                  {duties.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  function educationsView(): ReactNode {
    if (!r.educations.length) return empty("비어 있음");
    return (
      <div>
        {r.educations.map((e, i) => (
          <div key={i} className="rline">
            <b>{e.school}</b>
            <span>{e.major}</span>
            <span className="mono hint">{joinParts([periodText(e.startedOn, e.endedOn), e.status])}</span>
          </div>
        ))}
      </div>
    );
  }

  function certificatesView(): ReactNode {
    if (!r.certificates.length) return empty("비어 있음");
    return (
      <div>
        {r.certificates.map((c, i) => (
          <div key={i} className="rline">
            <b>{c.name}</b>
            <span className="hint">{joinParts([c.issuer, c.number && `자격번호 ${c.number}`])}</span>
            <span className="mono hint">{c.acquiredOn ? dotMonth(c.acquiredOn) : ""}</span>
          </div>
        ))}
      </div>
    );
  }

  function skillsView(): ReactNode {
    if (!r.skills.length) return empty("비어 있음");
    return (
      <div>
        {r.skills.map((s, i) => (
          <div key={i} className="rskill">
            <span className="k">{s.category}</span>
            <span>
              <span className="xchips">
                {skillTags(s.items).map((t, j) => (
                  <span key={j} className="tag sm">
                    {t}
                  </span>
                ))}
              </span>
              {s.memo.trim() && <span className="smemo">{s.memo}</span>}
            </span>
          </div>
        ))}
      </div>
    );
  }

  function personalityView(): ReactNode {
    if (!r.personality.length) return empty("비어 있음");
    // 묶음 순서는 그리는 동안 바뀌지 않으므로 자리를 key로 쓴다 (주제 글자는 "-" 같은 값과 겹칠 수 있다).
    return groupPersonality(r.personality).map((g, gi) => (
      <div key={gi} className="pgroup">
        {g.topic && <div className="ptopic">{g.topic}</div>}
        {g.items.map(({ index, answer: p }) => (
          <details key={index} className="racc">
            <summary>
              {p.question}
              {!p.answer.trim() && <span className="need">답변 작성 필요</span>}
            </summary>
            <div className="racc-b">
              <div>
                <span className="k">실제로 한 답</span>
                {p.answer.trim() ? <p className="pre">{p.answer}</p> : <p className="need">아직 적지 않았어요</p>}
              </div>
              <div>
                <span className="k">교훈</span>
                {p.lesson.trim() ? <p className="pre">{p.lesson}</p> : <p className="hint">비어 있음</p>}
              </div>
            </div>
          </details>
        ))}
      </div>
    ));
  }

  const views: Record<CardKey, () => ReactNode> = {
    basics: basicsView,
    careers: careersView,
    educations: educationsView,
    certificates: certificatesView,
    skills: skillsView,
    direction: () => (r.direction.trim() ? <p className="para pre">{r.direction}</p> : empty("비어 있음")),
    personality: personalityView,
  };

  return (
    <>
      {head}
      <div className="rgrid">
        {ORDER.map((key) => {
          const c = RCARDS[key];
          const mine = editing?.key === key ? editing : null;
          return (
            <section key={key} className={`card rcard${mine ? " editing" : ""}`} id={`rc-${key}`} aria-label={c.title}>
              <div className="jsec-h">
                <h2>{c.title}</h2>
                {!mine && (
                  <button type="button" className="btn btn-sm" disabled={editing !== null} onClick={() => startEdit(key)}>
                    편집
                  </button>
                )}
              </div>
              {mine ? (
                <>
                  {c.intro && <p className="sec-intro">{c.intro}</p>}
                  {editor(mine)}
                  <div className="row-end">
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
                      취소
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={blocked || saving}
                      onClick={save}
                    >
                      저장
                    </button>
                  </div>
                </>
              ) : (
                views[key]()
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
