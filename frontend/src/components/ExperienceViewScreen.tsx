import { useEffect, useState, type ReactNode } from "react";
import { experiencePeriod, inlineParts } from "@/lib/experiences";
import { useService, type Experience, type ExperienceGroup } from "@/services";
import { ConfirmDialog, useEscape, useToast } from "./feedback";
import { icons } from "./icons";
import { VerifiedPill } from "./reviewParts";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

/** 짧은 마크다운(`**굵게**`, `` `코드` ``)을 그린다. HTML은 쓰지 않는다. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((p, i) =>
        p.kind === "bold" ? <strong key={i}>{p.text}</strong> : p.kind === "code" ? <code key={i}>{p.text}</code> : p.text,
      )}
    </>
  );
}

const List = ({ items }: { items: string[] }) => (
  <ul className="jlist">
    {items.map((x, i) => (
      <li key={i}>
        <Inline text={x} />
      </li>
    ))}
  </ul>
);

const Empty = ({ text }: { text: string }) => (
  <p className="hint" style={{ margin: 0 }}>
    {text}
  </p>
);

interface Section {
  id: string;
  /** 섹션 칩의 이름. */
  title: string;
  /** 섹션 머리 (영어 이름이 붙는 것도 있다). */
  heading: ReactNode;
  show: boolean;
  className?: string;
  extra?: ReactNode;
  body: ReactNode;
}

const star = (ko: string, en: string) => (
  <>
    {ko} <span className="hint">{en}</span>
  </>
);

/**
 * 경험 상세 (기획안 S2 11번, 목업 exp, exp-unverified): 모든 섹션을 한 줄로 쌓는다.
 * 상황·과제·행동·결과는 늘 보이고 (빈 칸 안내), 나머지는 비어 있으면 숨긴다.
 * 다른 경험을 열 때는 `key={id}`로 그린다.
 */
export function ExperienceViewScreen({
  id,
  fromJob,
  onBack,
  onEdit,
  onOpenReview,
  onOpenExperience,
  onDeleted,
  onHome,
}: {
  id: number;
  /** 공고분석에서 열었다 (돌아가기 문구가 바뀐다). */
  fromJob: boolean;
  onBack: () => void;
  onEdit: () => void;
  onOpenReview: (reviewId: number) => void;
  onOpenExperience: (experienceId: number) => void;
  onDeleted: () => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [x, setX] = useState<Experience | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  useEscape(() => setMenuOpen(false));

  useEffect(() => {
    let live = true;
    service
      .getExperience(id)
      .then((found) => live && setX(found))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, id, handleSessionError]);

  // 그룹 이름: 못 받아도 경험은 보이고 그룹은 "–" (세션이 끝났으면 로그인으로).
  const groupId = x?.groupId ?? null;
  const [groups, setGroups] = useState<ExperienceGroup[]>([]);
  useEffect(() => {
    if (groupId === null) return;
    let live = true;
    service
      .listExperienceGroups()
      .then((list) => live && setGroups(list))
      .catch((error) => {
        if (live) handleSessionError(error);
      });
    return () => {
      live = false;
    };
  }, [service, groupId, handleSessionError]);
  const groupName = groups.find((g) => g.id === groupId)?.name ?? null;

  async function remove() {
    if (!x) return;
    setBusy(true);
    try {
      await service.deleteExperience(x.id);
      toast("경험을 삭제했어요");
      onDeleted();
    } catch (error) {
      setBusy(false);
      if (!handleSessionError(error)) toast("삭제하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function markVerified() {
    if (!x) return;
    try {
      const saved = await service.setExperienceVerified(x.id, true);
      setX((v) => v && { ...v, verified: saved.verified });
      toast("확인됨으로 바꿨어요");
    } catch (error) {
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (x === null) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!x) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }

  const sections: Section[] = [
    {
      id: "situation",
      title: "상황",
      heading: star("상황", "Situation"),
      show: true,
      body: (
        <>
          {x.situation ? (
            <p className="para">
              <Inline text={x.situation} />
            </p>
          ) : (
            <Empty text="비어 있어요. [편집]에서 채울 수 있어요." />
          )}
          {x.scope && (
            <div className="scope">
              <b>본인 담당 범위</b>
              <p>
                <Inline text={x.scope} />
              </p>
            </div>
          )}
        </>
      ),
    },
    {
      id: "task",
      title: "과제",
      heading: star("과제", "Task"),
      show: true,
      body: x.task ? (
        <p className="para">
          <Inline text={x.task} />
        </p>
      ) : (
        <Empty text="비어 있어요." />
      ),
    },
    {
      id: "action",
      title: "행동",
      heading: star("행동", "Action"),
      show: true,
      body: (
        <>
          {x.actionsIntro && (
            <p className="para hint">
              <Inline text={x.actionsIntro} />
            </p>
          )}
          {x.actions.length ? (
            <ol className="acts">
              {x.actions.map((a, i) => (
                <li key={i} className="act">
                  <div className="act-h">
                    <b>{a.title}</b>
                    {a.source && <span className="pill">출처: {a.source}</span>}
                  </div>
                  {a.points.length > 0 && <List items={a.points} />}
                  {a.note && (
                    <p className="act-note">
                      <Inline text={a.note} />
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <Empty text="비어 있어요." />
          )}
        </>
      ),
    },
    {
      id: "result",
      title: "결과",
      heading: star("결과", "Result"),
      show: true,
      body: (
        <>
          <div className="res-grid">
            <div>
              <span className="k">내 기여</span>
              {x.resultMine.length ? <List items={x.resultMine} /> : <Empty text="없음" />}
            </div>
            <div>
              <span className="k">팀 단위 성과</span>
              {x.resultTeam.length ? <List items={x.resultTeam} /> : <Empty text="없음" />}
            </div>
          </div>
          <div className={`res-num${x.numbers ? "" : " none"}`}>
            <span className="k">수치</span>
            {x.numbers || "미기재 — 공수 절감률, 시간 단축폭 같은 숫자가 있으면 적어 주세요"}
          </div>
        </>
      ),
    },
    {
      id: "appeal",
      title: "어필 포인트",
      heading: "어필 포인트",
      show: !!(x.appealMainUse || x.appealQuestions.length || x.appealStrength),
      body: (
        <>
          {x.appealMainUse && (
            <p className="para">
              <span className="pill st-und">주 용도</span> {x.appealMainUse}
            </p>
          )}
          {x.appealQuestions.length > 0 && (
            <div>
              <span className="k">이런 질문에 쓸 수 있어요</span>
              <List items={x.appealQuestions} />
            </div>
          )}
          {x.appealStrength && (
            <p className="para">
              <Inline text={x.appealStrength} />
            </p>
          )}
        </>
      ),
    },
    {
      id: "framing",
      title: "프레이밍 주의",
      heading: "프레이밍 주의",
      show: x.framing.length > 0,
      className: "framing",
      body: (
        <>
          <Empty text="말할 때 조심할 것. 부풀리거나 내 것이 아닌 걸 내 것처럼 말하지 않기." />
          <List items={x.framing} />
        </>
      ),
    },
    {
      id: "asked",
      title: "면접에서 실제로 받은 질문",
      heading: "면접에서 실제로 받은 질문",
      show: x.asked.length > 0,
      extra: <span className="hint">면접후기와 연결</span>,
      body: (
        <div className="tscroll flush">
          <table className="jtable">
            <thead>
              <tr>
                <th>질문</th>
                <th>어디서</th>
              </tr>
            </thead>
            <tbody>
              {x.asked.map((a, i) => (
                <tr key={i}>
                  <td>{a.question}</td>
                  <td className="nowrap">
                    {a.interviewReviewId !== null ? (
                      <button type="button" className="link" onClick={() => onOpenReview(a.interviewReviewId!)}>
                        {a.where || "면접후기"} ↗
                      </button>
                    ) : (
                      a.where
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: "qa",
      title: "예상 질문과 답변",
      heading: "예상 질문과 답변",
      show: x.qas.length > 0,
      body: (
        <>
          <Empty text="면접 대비용 예시예요. 서류 근거로 쓰지 않아요." />
          <div className="xqa-list">
            {x.qas.map((q, i) => (
              <div key={i} className="xqa-item">
                <b>Q. {q.question}</b>
                {q.answer ? (
                  <p>
                    <Inline text={q.answer} />
                  </p>
                ) : (
                  <p className="need">답변 작성 필요</p>
                )}
                {q.caution && <p className="jwarn">주의 · {q.caution}</p>}
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      id: "related",
      title: "관련 경험",
      heading: "관련 경험",
      show: x.related.length > 0,
      body: (
        <div className="rlist">
          {x.related.map((r, i) => (
            <button key={i} type="button" className="rrow" onClick={() => onOpenExperience(r.experienceId)}>
              <span className="mono rdate">{experiencePeriod(r)}</span>
              <span className="rmain">
                <b>{r.name}</b>
                <span className="hint">{r.note}</span>
              </span>
              <span className="rmeta">
                <VerifiedPill verified={r.verified} />
              </span>
            </button>
          ))}
        </div>
      ),
    },
  ];
  const shown = sections.filter((s) => s.show);

  return (
    <div className="rp jp">
      <button type="button" className="link back" onClick={onBack}>
        {fromJob ? "← 공고분석으로" : "← 경험 목록으로"}
      </button>
      {!x.verified && (
        <div className="unv-bar" role="note">
          <span>
            <b>아직 확인하지 않은 경험이에요.</b> AI가 만들거나 고친 내용이 있어요. 읽어 보고 맞으면 확인을 눌러 주세요.
          </span>
          <button type="button" className="btn btn-sm" onClick={markVerified}>
            읽고 확인했어요
          </button>
        </div>
      )}
      <div className="ph">
        <div>
          <div className="eyebrow">
            <span className="mono">{experiencePeriod(x)}</span>
            {x.project && ` · ${x.project}`}
          </div>
          <h1>{x.name}</h1>
        </div>
        <div className="rev-tools">
          <button type="button" className="btn" onClick={onEdit}>
            편집
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="경험 메뉴"
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
          <span className="k">소속</span>
          <span>{x.org || "–"}</span>
        </div>
        <div>
          <span className="k">역할</span>
          <span>{x.role || "–"}</span>
        </div>
        <div>
          <span className="k">확인 상태</span>
          <VerifiedPill verified={x.verified} />
        </div>
        <div>
          <span className="k">그룹</span>
          {groupName ? <span className="pill grp">{groupName}</span> : "–"}
        </div>
        <div className="wide">
          <span className="k">태그</span>
          <span className="xchips">
            {x.tags.length
              ? x.tags.map((t, i) => (
                  <span key={i} className="tag sm">
                    {t}
                  </span>
                ))
              : "–"}
          </span>
        </div>
      </div>
      {x.needs.length > 0 && (
        <div className="needs">
          <b>보완하면 좋은 것</b>
          <ul>
            {x.needs.map((n) => (
              <li key={n.label}>
                <span className="pill gap">{n.label}</span> {n.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      {x.summary && (
        <div className="conclusion">
          <b>한 줄 요약</b> <Inline text={x.summary} />
        </div>
      )}
      <nav className="toc" aria-label="이 경험의 섹션">
        {shown.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(`xs-${s.id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
          >
            {s.title}
          </button>
        ))}
      </nav>
      {shown.map((s) => (
        <section key={s.id} className={`card jsec${s.className ? ` ${s.className}` : ""}`} id={`xs-${s.id}`} aria-label={s.title}>
          <div className="jsec-h">
            <h2>{s.heading}</h2>
            {s.extra}
          </div>
          {s.body}
        </section>
      ))}
      {confirmDelete && (
        <ConfirmDialog
          title="경험을 삭제할까요?"
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>‘{x.name}’ 경험이 삭제돼요. 이 경험을 근거로 쓴 공고분석의 태그는 남지만 더는 연결되지 않아요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
