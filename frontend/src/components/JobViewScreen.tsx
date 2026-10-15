import { useEffect, useState, type ReactNode } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONDITIONS,
  GRADE_CLASS,
  JOB_STATUS,
  LEVELS,
  gradeLabel,
  mustSummary,
} from "@/lib/jobs";
import { RESULTS, useService, type Job, type LevelCounts, type RequirementLevel } from "@/services";
import { ConfirmDialog, useEscape, useToast } from "./feedback";
import { icons } from "./icons";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

/** 내 해당도 기호와 이름. 미평가는 "–". */
export function LevelMark({ level }: { level: RequirementLevel }) {
  const m = LEVELS[level];
  return (
    <span className={`mk ${m.className}`}>
      {m.symbol} {m.label}
    </span>
  );
}

/** 섹션 머리의 ●◐○ 수. 미평가는 있을 때만 "– d". */
export function CountTag({ counts }: { counts: LevelCounts }) {
  return (
    <span className="mcount" aria-label="해당도별 수">
      <span className="m-full">● {counts.full}</span>
      <span className="m-part">◐ {counts.part}</span>
      <span className="m-none">○ {counts.none}</span>
      {counts.unrated > 0 && <span className="m-unrated">– {counts.unrated}</span>}
    </span>
  );
}

/** 근거 경험 태그. 경험(다음 단계)이 생기기 전까지는 링크 없는 글자다. */
export function EvidenceTag({ text }: { text: string }) {
  return <span className="ev">{text}</span>;
}

interface Section {
  id: string;
  title: string;
  extra?: ReactNode;
  body: ReactNode;
  empty: boolean;
}

const List = ({ items }: { items: string[] }) => (
  <ul className="jlist">
    {items.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ul>
);

/**
 * 공고 분석 상세 (기획안 S2 10번, 목업 job): 요약 카드 3개, 한 줄 결론, 섹션 칩,
 * 공고 문장마다 내 해당도, 표와 목록 섹션, 기타 메모, 공고 원문, 연결된 지원.
 * 빈 섹션은 숨기고 이름만 알려 준다. 다른 분석을 열 때는 `key={id}`로 그린다.
 */
export function JobViewScreen({
  id,
  fromDetail,
  onBack,
  onEdit,
  onOpenApplication,
  onDeleted,
  onHome,
}: {
  id: number;
  /** 지원 상세에서 열었다 (돌아가기 문구가 바뀐다). */
  fromDetail: boolean;
  /** 온 곳으로. 지원 상세에서 왔으면 연결된 지원 건 id (없으면 null). */
  onBack: (applicationId: number | null) => void;
  onEdit: () => void;
  onOpenApplication: (applicationId: number) => void;
  /** 지운 뒤 온 곳으로 (지운 분석에 연결되어 있던 지원 건 id). */
  onDeleted: (applicationId: number | null) => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  useEscape(() => setMenuOpen(false));

  useEffect(() => {
    let live = true;
    service
      .getJob(id)
      .then((found) => live && setJob(found))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, id, handleSessionError]);

  async function remove() {
    if (!job) return;
    setBusy(true);
    try {
      await service.deleteJob(job.id);
      toast("분석을 삭제했어요");
      onDeleted(job.applicationId);
    } catch (error) {
      setBusy(false);
      if (!handleSessionError(error)) toast("삭제하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (job === null) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }

  const app = job.application;
  const st = JOB_STATUS[job.status];
  const grade = gradeLabel(job.cultureGrade, job.cultureScore);
  const hasUnrated = CATEGORIES.some((c) => job.counts[c].unrated > 0);
  const cultureEmpty = !(
    job.cultureItems.length ||
    job.culturePoints ||
    job.cultureRisks.length ||
    job.cultureReadBetween
  );

  const reqSection = (category: (typeof CATEGORIES)[number]): Section => {
    const rows = job.requirements.filter((r) => r.category === category);
    return {
      id: category,
      title: CATEGORY_LABELS[category],
      extra: rows.length ? <CountTag counts={job.counts[category]} /> : null,
      empty: !rows.length,
      body: (
        <div className="reqs">
          <div className="req-colh" aria-hidden="true">
            <span>공고 원문</span>
            <span>내 해당도 · 근거 경험</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="reqv">
              <div className="src">{r.text}</div>
              <div className="ana">
                <LevelMark level={r.level} />
                {r.description && <p>{r.description}</p>}
                {r.evidence.length > 0 && (
                  <div className="evs">
                    {r.evidence.map((e, k) => (
                      <EvidenceTag key={k} text={e} />
                    ))}
                  </div>
                )}
                {r.noEvidence && <p className="nodb">근거 없음 · {r.noEvidence}</p>}
                {r.caution && <p className="jwarn">주의 · {r.caution}</p>}
              </div>
            </div>
          ))}
        </div>
      ),
    };
  };

  const sections: Section[] = [
    ...CATEGORIES.map(reqSection),
    {
      id: "fit",
      title: "핏 평가",
      extra: job.fit ? <span className="pill fit">핏 {job.fit}</span> : null,
      empty: !job.fitNotes.length,
      body: job.fitNotes.map((p, i) => (
        <p key={i} className="para">
          {p}
        </p>
      )),
    },
    {
      id: "culture",
      title: "성향 적합도",
      extra: grade ? <span className={`pill ${GRADE_CLASS[job.cultureGrade]}`}>{grade}</span> : null,
      empty: cultureEmpty,
      body: (
        <>
          {job.cultureItems.length > 0 && (
            <div className="tscroll flush">
              <table className="jtable">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>점수</th>
                    <th>공고 근거 (인용)</th>
                  </tr>
                </thead>
                <tbody>
                  {job.cultureItems.map((it, i) => (
                    <tr key={i}>
                      <td>{it.name}</td>
                      <td className="mono nowrap">
                        {it.score ?? "–"} / {it.max ?? "–"}
                      </td>
                      <td className="hint">{it.quote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {job.culturePoints && (
            <p className="para">
              <b>잘 맞는 점</b> {job.culturePoints}
            </p>
          )}
          {job.cultureRisks.length > 0 && (
            <div>
              <b className="sub-h">Risk · Red Flag 체크</b>
              <List items={job.cultureRisks} />
            </div>
          )}
          {job.cultureReadBetween && (
            <p className="para">
              <b>공고 행간 읽기 (실제 역할 추정)</b> {job.cultureReadBetween}
            </p>
          )}
        </>
      ),
    },
    {
      id: "highlight",
      title: "부각할 경험",
      extra: <span className="hint">서류 기준 순위</span>,
      empty: !(job.highlight.length || job.excluded.length),
      body: (
        <>
          {job.highlight.length > 0 && (
            <div className="tscroll flush">
              <table className="jtable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>경험</th>
                    <th>대응하는 공고 요구</th>
                    <th>이유 · 주의</th>
                  </tr>
                </thead>
                <tbody>
                  {job.highlight.map((h, i) => (
                    <tr key={i}>
                      <td className="mono">{i + 1}</td>
                      <td>
                        <EvidenceTag text={h.exp} />
                      </td>
                      <td>{h.maps}</td>
                      <td className="hint">{h.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {job.excluded.length > 0 && (
            <div>
              <b className="sub-h">서류에서 뺀 경험과 쓸 곳</b>
              <ul className="jlist">
                {job.excluded.map((x, i) => (
                  <li key={i}>
                    <EvidenceTag text={x.exp} /> {x.where}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ),
    },
    {
      id: "questions",
      title: "약한 부분 · 면접 예상 질문",
      empty: !job.questions.length,
      body: (
        <div className="tscroll flush">
          <table className="jtable">
            <thead>
              <tr>
                <th>예상 질문</th>
                <th>가장 가까운 경험 → 말하는 방식</th>
              </tr>
            </thead>
            <tbody>
              {job.questions.map((q, i) => (
                <tr key={i}>
                  <td>{q.question}</td>
                  <td className="hint">{q.answer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: "toWrite",
      title: "작성 권장",
      extra: <span className="hint">이력서엔 있지만 경험으로 아직 안 적은 것</span>,
      empty: !job.toWrite.length,
      body: <List items={job.toWrite} />,
    },
    {
      id: "gaps",
      title: "갭",
      extra: <span className="hint">경험에 근거 없음</span>,
      empty: !job.gaps.length,
      body: <List items={job.gaps} />,
    },
    {
      id: "expSuggestions",
      title: "경험 보완 제안",
      extra: <span className="hint">이 공고에서 강조할 가치가 있는 것만</span>,
      empty: !job.expSuggestions.length,
      body: <List items={job.expSuggestions} />,
    },
    { id: "askBack", title: "면접 역질문", empty: !job.askBack.length, body: <List items={job.askBack} /> },
    { id: "checks", title: "확인 필요", empty: !job.checks.length, body: <List items={job.checks} /> },
    {
      id: "notes",
      title: "기타 메모",
      empty: !job.notes.trim(),
      body: <p className="para pre">{job.notes}</p>,
    },
    {
      id: "raw",
      title: "공고 원문",
      extra: <span className="hint">붙여 넣은 그대로</span>,
      empty: !job.rawText.trim(),
      body: (
        <details className="rawd">
          <summary>원문 전체 보기</summary>
          <pre className="raw">{job.rawText}</pre>
        </details>
      ),
    },
  ];
  const filled = sections.filter((s) => !s.empty);
  const emptyOnes = sections.filter((s) => s.empty);
  const result = app ? RESULTS[app.result] : null;
  const back = fromDetail && app ? `← ${app.company} 지원 상세로` : "← 공고분석 목록으로";

  return (
    <div className="rp jp">
      <button type="button" className="link back" onClick={() => onBack(app?.id ?? null)}>
        {back}
      </button>
      <div className="ph">
        <div>
          <div className="eyebrow">
            {job.company}
            {job.team && ` · ${job.team}`}
          </div>
          <h1>{job.title || "직무 미입력"}</h1>
        </div>
        <div className="rev-tools">
          <button type="button" className="btn" onClick={onEdit}>
            편집
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="분석 메뉴"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {icons.more}
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                삭제
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="card jmeta">
        <div>
          <span className="k">사람 확인</span>
          <span
            className={`pill ${job.verified ? "checked" : "unchecked"}`}
            title={job.verified ? "편집해 저장한 분석" : "가져온 뒤 아직 편집하지 않은 분석"}
          >
            {job.verified ? "Y" : "N"}
          </span>
        </div>
        <div>
          <span className="k">분석일</span>
          <span className="mono">{job.analyzedAt}</span>
        </div>
        <div>
          <span className="k">마감일</span>
          <span className="mono">{job.deadline || "공고에 없음"}</span>
        </div>
        <div>
          <span className="k">지원 여부</span>
          <span className={`pill ${st.className}`}>{st.label}</span>
        </div>
        <div>
          <span className="k">공고 원문</span>
          {job.url ? (
            <a className="link" href={job.url} target="_blank" rel="noopener noreferrer">
              공고 링크 ↗
            </a>
          ) : (
            "–"
          )}
        </div>
      </div>
      <div className="jcards">
        <section className="card jcard" aria-label="기술 핏 요약">
          <span className="k">기술 핏</span>
          <b className="jbig">{job.fit || "–"}</b>
          <p>{mustSummary(job.counts.must)}</p>
        </section>
        <section className="card jcard" aria-label="성향 적합도 요약">
          <span className="k">성향 적합도</span>
          <b className={`jbig ${GRADE_CLASS[job.cultureGrade]}`}>{gradeLabel(job.cultureGrade, job.cultureScore, "점") || "–"}</b>
          <p>{job.cultureType || "아직 평가하지 않았어요"}</p>
        </section>
        <section className="card jcard" aria-label="지원 조건 요약">
          <span className="k">지원 조건</span>
          {job.conditions.length ? (
            <ul className="conds">
              {job.conditions.map((c, i) => (
                <li key={i}>
                  <span className={`mk ${CONDITIONS[c.state].className}`} title={CONDITIONS[c.state].label}>
                    {CONDITIONS[c.state].symbol}
                  </span>
                  <span>
                    <b>{c.label}</b> {c.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>아직 적지 않았어요</p>
          )}
        </section>
      </div>
      {job.conclusion && (
        <div className="conclusion">
          <b>한 줄 결론</b> {job.conclusion}
        </div>
      )}
      {filled.length > 0 && (
        <nav className="toc" aria-label="이 분석의 섹션">
          {filled.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => document.getElementById(`js-${s.id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
            >
              {s.title}
            </button>
          ))}
        </nav>
      )}
      <p className="legend-m">
        <span className="m-full">● 충족</span>
        <span className="m-part">◐ 부분·인접</span>
        <span className="m-none">○ 없음 (경험에 근거 없음)</span>
        {hasUnrated && <span className="m-unrated">– 미평가</span>}
      </p>
      {filled.map((s) => (
        <section key={s.id} className="card jsec" id={`js-${s.id}`} aria-label={s.title}>
          <div className="jsec-h">
            <h2>{s.title}</h2>
            {s.extra}
          </div>
          {s.body}
        </section>
      ))}
      {emptyOnes.length > 0 && (
        <p className="hint">비어 있는 섹션: {emptyOnes.map((s) => s.title).join(" · ")} — [편집]에서 채울 수 있어요.</p>
      )}
      <section className="card jsec" aria-label="연결된 지원">
        <div className="jsec-h">
          <h2>연결된 지원</h2>
        </div>
        {app && result ? (
          <button type="button" className="rrow" onClick={() => onOpenApplication(app.id)}>
            <span className="mono rdate">{app.appliedAt}</span>
            <span className="rmain">
              <b>
                {app.company}
                {app.sub && ` ${app.sub}`}
              </b>
              <span className="hint">서류 제출 {app.appliedAt}</span>
            </span>
            <span className="rmeta">
              <span className={result.className}>
                {result.symbol} {app.resultText || result.label}
              </span>
            </span>
          </button>
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            아직 지원 기록과 연결되지 않았어요. 지원했다면 [편집]에서 연결해 주세요.
          </p>
        )}
      </section>
      {confirmDelete && (
        <ConfirmDialog
          title="공고 분석을 삭제할까요?"
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>
            ‘{job.company}
            {job.title && ` · ${job.title}`}’ 분석이 삭제돼요. 연결된 지원 기록은 그대로 남아요.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
