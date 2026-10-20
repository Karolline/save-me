import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  calendarAxis,
  calendarUnits,
  careerBands,
  careerColor,
  careersByStart,
  experienceBar,
  experienceIssues,
  groupSpan,
  MONTH_WIDTH,
  monthLeft,
  orgColor,
  orgOptions,
  type CalendarAxis,
} from "@/lib/experienceCalendar";
import { experiencePeriod } from "@/lib/experiences";
import { seoulMonth } from "@/lib/resume";
import { useService, type Career, type ExperienceGroup, type ExperienceSummary } from "@/services";
import { useEscape, useToast } from "./feedback";
import { icons } from "./icons";
import { VerifiedPill } from "./reviewParts";
import { useSessionErrors } from "./session";

interface CalendarData {
  experiences: ExperienceSummary[];
  groups: ExperienceGroup[];
  careers: Career[];
}

/** 바로 고치기 패널에서 고치는 값 (달은 `YYYY-MM`, 비면 ""). */
interface QuickDraft {
  id: number;
  startedOn: string;
  endedOn: string;
  org: string;
  groupId: string;
}

/** 그룹 이름 대화상자: 새로 묶기, 또는 이름 바꾸기. */
type NameModal = { mode: "new"; name: string } | { mode: "rename"; id: number; name: string };

const SAVE_FAILED = "저장하지 못했어요. 다시 시도해 주세요.";

/**
 * 경험 캘린더 (기획안 S2 11번, 목업 exp-cal, exp-cal-group, exp-cal-fix): 연·월 축 위에 이력의
 * 재직 기간 띠(휴직은 빗금)와 경험 막대(소속 회사 색), 흐름 점검, 바로 고치기 패널, 그룹 묶기.
 * 축·색·점검·줄 순서는 `lib/experienceCalendar.ts`의 순수 함수가 정한다. 이번 달은 서울 기준으로
 * 화면을 열 때 한 번 정한다.
 */
export function ExperienceCalendar({
  top,
  onOpen,
  onAdd,
}: {
  /** 머리와 [목록] [경험 캘린더] 전환. */
  top: ReactNode;
  onOpen: (experienceId: number) => void;
  onAdd: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [today] = useState(() => seoulMonth(new Date()));
  const [data, setData] = useState<CalendarData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<number[] | null>(null);
  const [quick, setQuick] = useState<QuickDraft | null>(null);
  const [modal, setModal] = useState<NameModal | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([service.listExperiences("all"), service.listExperienceGroups(), service.getResume()]).then(
        ([list, groups, resume]) => ({ experiences: list.items, groups, careers: resume.careers }),
      ),
    [service],
  );

  useEffect(() => {
    let live = true;
    load()
      .then((loaded) => live && setData(loaded))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [load, attempt, handleSessionError]);

  /** 바꾼 뒤 다시 읽는다. 못 읽으면 앞 화면을 그대로 둔다. */
  async function refresh() {
    try {
      setData(await load());
    } catch (error) {
      handleSessionError(error);
    }
  }

  if (failed) {
    return (
      <>
        {top}
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
  if (!data) {
    return (
      <>
        {top}
        <div className="card skel" aria-label="불러오는 중" aria-busy="true">
          <div style={{ width: "70%" }} />
          <div style={{ width: "50%" }} />
          <div style={{ width: "60%" }} />
        </div>
      </>
    );
  }
  if (!data.experiences.length) {
    return (
      <>
        {top}
        <div className="card empty">
          <h2>아직 정리한 경험이 없어요</h2>
          <p>프로젝트 하나를 골라 상황·과제·행동·결과로 적어 보세요.</p>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            + 경험 추가
          </button>
        </div>
      </>
    );
  }

  const { experiences, groups, careers } = data;
  const issuesOf = (x: Pick<ExperienceSummary, "startedOn" | "endedOn" | "org">) => experienceIssues(x, careers, today);
  const units = calendarUnits(experiences, groups);
  // 흐름 점검과 대화상자의 이름은 캘린더 줄 순서로.
  const inOrder = units.flatMap((u) => u.items);
  const flagged = inOrder.map((x) => ({ x, list: issuesOf(x) })).filter((v) => v.list.length);
  const axis = calendarAxis(experiences, careers, today);
  const W = axis.width;
  const ordered = careersByStart(careers);

  const openQuick = (x: ExperienceSummary) =>
    setQuick({
      id: x.id,
      startedOn: x.startedOn ?? "",
      endedOn: x.endedOn ?? "",
      org: x.org,
      groupId: x.groupId === null ? "" : String(x.groupId),
    });

  async function saveQuick(draft: QuickDraft) {
    setBusy(true);
    try {
      const saved = await service.setExperiencePlacement(draft.id, {
        startedOn: draft.startedOn || null,
        endedOn: draft.endedOn || null,
        org: draft.org.trim(),
        groupId: draft.groupId ? Number(draft.groupId) : null,
      });
      setQuick(null);
      toast(issuesOf(saved).length ? "저장했어요. 아직 점검할 곳이 남았어요" : "저장했어요");
      await refresh();
    } catch (error) {
      if (!handleSessionError(error)) toast(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function saveName(m: NameModal) {
    const name = m.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (m.mode === "new") {
        await service.createExperienceGroup(name, selected ?? []);
        setSelected(null);
        toast(`'${name}' 그룹으로 묶었어요`);
      } else {
        await service.renameExperienceGroup(m.id, name);
        toast("그룹 이름을 바꿨어요");
      }
      setModal(null);
      await refresh();
    } catch (error) {
      if (!handleSessionError(error)) toast(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function ungroup(g: ExperienceGroup) {
    try {
      await service.deleteExperienceGroup(g.id);
      toast(`'${g.name}' 묶음을 풀었어요`);
      await refresh();
    } catch (error) {
      if (!handleSessionError(error)) toast(SAVE_FAILED);
    }
  }

  const toggle = (id: number) =>
    setSelected((sel) => (sel === null ? sel : sel.includes(id) ? sel.filter((v) => v !== id) : [...sel, id]));

  const row = (x: ExperienceSummary) => {
    const bad = issuesOf(x);
    return (
      <div key={x.id} className={`cal-row${bad.length ? " has-bad" : ""}`}>
        <div className="cal-lab">
          {selected && (
            <input
              type="checkbox"
              className="cal-chk"
              aria-label={`${x.name} 고르기`}
              checked={selected.includes(x.id)}
              onChange={() => toggle(x.id)}
            />
          )}
          <button type="button" className="cal-name" onClick={() => openQuick(x)}>
            <b>{x.name}</b>
            <span className="mono">{experiencePeriod(x)}</span>
          </button>
          {bad.length > 0 && (
            <span className="cal-flag" title={bad.join(" / ")} aria-label={`점검: ${bad.join(" / ")}`}>
              !
            </span>
          )}
        </div>
        <div className="cal-track" style={{ width: W }}>
          <Bar x={x} axis={axis} today={today} color={orgColor(x.org, careers)} bad={bad.length > 0} onOpen={() => openQuick(x)} />
        </div>
      </div>
    );
  };

  const body = units.map((u) => {
    if (!u.group) return row(u.items[0]);
    const g = u.group;
    const span = groupSpan(u.items, axis, today);
    return (
      <div key={`g${g.id}`} className="cal-group" role="group" aria-label={`그룹 ${g.name}`}>
        <div className="cal-row cal-gh">
          <div className="cal-lab">
            <span className="cal-gname">{g.name}</span>
            <span className="hint">{u.items.length}개</span>
            <span className="cal-gact">
              <button type="button" className="link sm" onClick={() => setModal({ mode: "rename", id: g.id, name: g.name })}>
                이름 바꾸기
              </button>
              <button type="button" className="link sm" onClick={() => ungroup(g)}>
                묶음 풀기
              </button>
            </span>
          </div>
          <div className="cal-track" style={{ width: W }}>
            {span && <span className="cal-gspan" style={{ left: span.left, width: span.width }} />}
          </div>
        </div>
        {u.items.map(row)}
      </div>
    );
  });

  const quickX = quick ? experiences.find((x) => x.id === quick.id) : undefined;
  const picked =
    modal?.mode === "new"
      ? inOrder.filter((x) => selected?.includes(x.id))
      : modal
        ? inOrder.filter((x) => x.groupId === modal.id)
        : [];

  return (
    <>
      {top}
      {flagged.length ? (
        <div className="needs">
          <b>흐름 점검: 고쳐야 할 수 있는 곳 {flagged.length}개</b>
          <ul>
            {flagged.map(({ x, list }) => (
              <li key={x.id}>
                <button type="button" className="link" onClick={() => openQuick(x)}>
                  {x.name}
                </button>{" "}
                — {list.join(" / ")}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="needs ok">
          <b>흐름 점검: 이력의 재직 기간과 어긋나는 경험이 없어요.</b>
        </div>
      )}
      <div className="toolbar">
        <div className="legend">
          {ordered.map((c, k) => (
            <span key={k} className="sw">
              <i className={careerColor(k)} />
              {c.company}
            </span>
          ))}
          <span className="sw">
            <i className="oc-personal" />
            개인 프로젝트
          </span>
          <span className="sw">
            <i className="sw-open" />끝 날짜 없음
          </span>
          <span className="sw">
            <i className="sw-leave" />
            휴직
          </span>
        </div>
        {selected ? (
          <span className="row-end">
            <span className="hint">묶을 경험 {selected.length}개 골랐어요</span>
            <button type="button" className="btn btn-sm" onClick={() => setSelected(null)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={selected.length < 2}
              onClick={() => setModal({ mode: "new", name: "" })}
            >
              그룹으로 묶기
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => setSelected([])}>
            비슷한 경험 묶기
          </button>
        )}
      </div>
      <div className="card cal">
        <div className="cal-scroll">
          <div className="cal-inner" style={{ width: `calc(var(--cal-lab) + ${W}px)` }}>
            <div className="cal-row cal-head">
              <div className="cal-lab" />
              <div className="cal-track" style={{ width: W }}>
                {axis.years.map((y) => (
                  <span key={y} className="cal-y" style={{ width: 12 * MONTH_WIDTH }}>
                    {y}
                  </span>
                ))}
              </div>
            </div>
            <div className="cal-row cal-head sub">
              <div className="cal-lab" />
              <div className="cal-track" style={{ width: W }}>
                {axis.years.flatMap((y) =>
                  ["01", "04", "07", "10"].map((m) => (
                    <span key={`${y}-${m}`} className="cal-m" style={{ width: 3 * MONTH_WIDTH }}>
                      {m}
                    </span>
                  )),
                )}
              </div>
            </div>
            <div className="cal-body">
              <div className="cal-grid" style={{ width: W }}>
                {axis.years.map((y) => (
                  <i key={y} style={{ width: 12 * MONTH_WIDTH }} />
                ))}
              </div>
              <div className="cal-now" style={{ left: monthLeft(axis, today) + MONTH_WIDTH }} title="지금" />
              <div className="cal-row cal-car">
                <div className="cal-lab">
                  <b>재직 기간</b>
                  <span className="hint">이력에서</span>
                </div>
                <div className="cal-track" style={{ width: W }}>
                  {careerBands(careers, axis, today).map((b, k) => (
                    <span key={k}>
                      <span className={`cal-cbar ${b.color}`} style={{ left: b.left, width: b.width }}>
                        {b.company}
                      </span>
                      {b.leave && (
                        <span
                          className={`cal-leave ${b.color}`}
                          style={{ left: b.leave.left, width: b.leave.width }}
                          title={b.leave.title}
                          aria-label={b.leave.title}
                        />
                      )}
                    </span>
                  ))}
                </div>
              </div>
              {body}
            </div>
          </div>
        </div>
      </div>
      <p className="hint">막대나 이름을 누르면 옆에서 기간·소속·그룹을 바로 고칠 수 있어요. 같은 그룹은 한 상자로 붙어서 보여요.</p>
      {quick && quickX && (
        <QuickPanel
          x={quickX}
          draft={quick}
          careers={careers}
          groups={groups}
          today={today}
          busy={busy}
          onChange={setQuick}
          onSave={() => saveQuick(quick)}
          onClose={() => setQuick(null)}
          onOpen={() => onOpen(quickX.id)}
        />
      )}
      {modal && (
        <GroupNameModal
          modal={modal}
          names={picked.map((x) => x.name)}
          busy={busy}
          onChange={(name) => setModal({ ...modal, name })}
          onSave={() => saveName(modal)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

/** 경험 막대 하나. 시작이 없으면 "기간 없음", 좁으면 이름은 막대 오른쪽에. */
function Bar({
  x,
  axis,
  today,
  color,
  bad,
  onOpen,
}: {
  x: ExperienceSummary;
  axis: CalendarAxis;
  today: string;
  color: string;
  bad: boolean;
  onOpen: () => void;
}) {
  const bar = experienceBar(x, axis, today);
  if (!bar) return <span className="cal-nodate">기간 없음</span>;
  return (
    <>
      <button
        type="button"
        className={`cal-bar ${color}${bar.open ? " open" : ""}${bad ? " bad" : ""}`}
        style={{ left: bar.left, width: bar.width }}
        title={`${x.name} · ${experiencePeriod(x)}`}
        aria-label={`${x.name} · ${experiencePeriod(x)}`}
        onClick={onOpen}
      >
        {bar.labelInside && <span>{x.name}</span>}
      </button>
      {!bar.labelInside && (
        <span className="cal-out" style={{ left: bar.left + bar.width + 6 }} aria-hidden="true">
          {x.name}
        </span>
      )}
    </>
  );
}

/** 바로 고치기 (목업 viewExpQuick): 시작·끝·소속·그룹. 점검은 고치는 동안 바로 다시 계산한다. */
function QuickPanel({
  x,
  draft,
  careers,
  groups,
  today,
  busy,
  onChange,
  onSave,
  onClose,
  onOpen,
}: {
  x: ExperienceSummary;
  draft: QuickDraft;
  careers: Career[];
  groups: ExperienceGroup[];
  today: string;
  busy: boolean;
  onChange: (draft: QuickDraft) => void;
  onSave: () => void;
  onClose: () => void;
  onOpen: () => void;
}) {
  useEscape(onClose);
  const issues = experienceIssues(
    { startedOn: draft.startedOn || null, endedOn: draft.endedOn || null, org: draft.org },
    careers,
    today,
  );
  const set = (k: keyof Omit<QuickDraft, "id">) => (e: { target: { value: string } }) =>
    onChange({ ...draft, [k]: e.target.value });
  return (
    <>
      <div className="scrim under-panel" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label={`${x.name} 기간 고치기`}>
        <div className="panel-head">
          <div className="grow">
            <h2>{x.name}</h2>
            <div className="sub">
              <VerifiedPill verified={x.verified} />
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            {icons.close}
          </button>
        </div>
        <div className="panel-body">
          <div className="form">
            {issues.length ? (
              <div className="needs" aria-live="polite">
                <b>점검</b>
                <ul>
                  {issues.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="needs ok" aria-live="polite">
                <b>이력과 어긋나는 곳이 없어요.</b>
              </div>
            )}
            <div className="row-fields">
              <div className="fl">
                <label className="fl-k" htmlFor="eq-from">
                  시작
                </label>
                <input className="input mono" type="month" id="eq-from" value={draft.startedOn} onChange={set("startedOn")} />
              </div>
              <div className="fl">
                <label className="fl-k" htmlFor="eq-to">
                  끝<span className="fl-h">진행 중이면 비워 둬요</span>
                </label>
                <input className="input mono" type="month" id="eq-to" value={draft.endedOn} onChange={set("endedOn")} />
              </div>
              <div className="fl wide">
                <label className="fl-k" htmlFor="eq-org">
                  소속<span className="fl-h">회사 · 팀. 회사 이름이 이력과 같아야 재직 기간과 비교돼요</span>
                </label>
                <input className="input" id="eq-org" value={draft.org} onChange={set("org")} list="eq-orgs" />
                <datalist id="eq-orgs">
                  {orgOptions(careers).map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
              <div className="fl wide">
                <label className="fl-k" htmlFor="eq-group">
                  그룹<span className="fl-h">비슷한 경험끼리 묶어 캘린더에서 붙여 보여요</span>
                </label>
                <select className="select" id="eq-group" value={draft.groupId} onChange={set("groupId")}>
                  <option value="">그룹 없음</option>
                  {groups.map((g) => (
                    <option key={g.id} value={String(g.id)}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {x.summary && (
              <p className="hint" style={{ margin: 0 }}>
                {x.summary}
              </p>
            )}
          </div>
        </div>
        <div className="panel-foot">
          <button type="button" className="btn btn-text" onClick={onOpen}>
            경험 상세 열기
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
            저장
          </button>
        </div>
      </aside>
    </>
  );
}

/** 그룹 이름 대화상자 (목업 xg-name): 새로 묶기([묶기]) 또는 이름 바꾸기([바꾸기]). */
function GroupNameModal({
  modal,
  names,
  busy,
  onChange,
  onSave,
  onClose,
}: {
  modal: NameModal;
  names: string[];
  busy: boolean;
  onChange: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const title = modal.mode === "new" ? "그룹으로 묶기" : "그룹 이름 바꾸기";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (modal.name.trim() && !busy) onSave();
  };
  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onClose} />
      <form className="card modal" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <h2>{title}</h2>
        <p className="hint">{names.join(" · ")}</p>
        <div className="fl">
          <label className="fl-k" htmlFor="xg-name">
            그룹 이름<span className="fl-h">예: 데이터 품질·모니터링, 클라우드 이전</span>
          </label>
          <input className="input" id="xg-name" value={modal.name} onChange={(e) => onChange(e.target.value)} autoFocus />
        </div>
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={!modal.name.trim() || busy}>
            {modal.mode === "new" ? "묶기" : "바꾸기"}
          </button>
        </div>
      </form>
    </div>
  );
}
