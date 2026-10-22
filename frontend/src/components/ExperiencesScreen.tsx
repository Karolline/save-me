import { useEffect, useState, type ReactNode } from "react";
import { useService, type ExperienceList as ExperienceListData, type ExperienceView } from "@/services";
import { ExperienceCalendar } from "./ExperienceCalendar";
import { VerifiedPill } from "./reviewParts";
import { useSessionErrors } from "./session";

const VIEWS: [ExperienceView, string][] = [
  ["all", "전체"],
  ["unv", "미확인"],
  ["need", "보완 필요"],
];

export type ExperiencesMode = "list" | "calendar";

/**
 * 경험 화면 (완료분 기획안 S2 11번, 목업 expHead): 머리 아래 [목록] [경험 캘린더] 전환.
 * 목록은 보기·검색이 있는 게시판, 캘린더는 `ExperienceCalendar`.
 */
export function ExperiencesScreen({
  mode,
  onModeChange,
  ...list
}: {
  mode: ExperiencesMode;
  onModeChange: (mode: ExperiencesMode) => void;
  view: ExperienceView;
  q: string;
  onViewChange: (view: ExperienceView) => void;
  onQueryChange: (q: string) => void;
  onOpen: (experienceId: number) => void;
  onAdd: () => void;
}) {
  const calendar = mode === "calendar";
  const top = (
    <>
      <div className="ph">
        <div>
          <h1>경험</h1>
          <p>
            {calendar
              ? "모든 경험을 연월 위에 늘어놓고, 이력의 재직 기간과 흐름이 맞는지 점검해요."
              : "서류와 면접의 근거가 되는 경험을 모아 둬요. 줄을 누르면 상황·과제·행동·결과까지 자세히 볼 수 있어요."}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={list.onAdd}>
          + 경험 추가
        </button>
      </div>
      <div className="seg viewseg" role="group" aria-label="보기 방식">
        <button type="button" aria-pressed={!calendar} onClick={() => calendar && onModeChange("list")}>
          목록
        </button>
        <button type="button" aria-pressed={calendar} onClick={() => !calendar && onModeChange("calendar")}>
          경험 캘린더
        </button>
      </div>
    </>
  );
  return calendar ? (
    <ExperienceCalendar top={top} onOpen={list.onOpen} onAdd={list.onAdd} />
  ) : (
    <ExperienceList top={top} {...list} />
  );
}

/**
 * 경험 목록 (완료분 기획안 S2 11번, 목업 exps): 게시판형, 최근에 시작한 순. 보기·검색·수와
 * "보완할 것"은 서버가 준다. 검색어는 바로 바뀌고, 목록은 받는 대로 바꾼다.
 */
function ExperienceList({
  top,
  view,
  q,
  onViewChange,
  onQueryChange,
  onOpen,
  onAdd,
}: {
  top: ReactNode;
  view: ExperienceView;
  q: string;
  onViewChange: (view: ExperienceView) => void;
  onQueryChange: (q: string) => void;
  onOpen: (experienceId: number) => void;
  onAdd: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const [data, setData] = useState<{ view: ExperienceView; list: ExperienceListData } | null>(null);
  const [query, setQuery] = useState(q);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    service
      .listExperiences(view, q)
      .then((list) => live && setData({ view, list }))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, view, q, attempt, handleSessionError]);

  const counts = data?.list.counts;
  const head = (
    <>
      {top}
      <div className="toolbar">
        <div className="seg" role="group" aria-label="보기">
          {VIEWS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => onViewChange(key)}>
              {label}
              <span className="n">{counts ? counts[key] : ""}</span>
            </button>
          ))}
        </div>
        <input
          className="input xq-in"
          type="search"
          value={query}
          placeholder="제목·요약·태그로 찾기"
          aria-label="경험 검색"
          onChange={(e) => {
            setQuery(e.target.value);
            onQueryChange(e.target.value);
          }}
        />
      </div>
    </>
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
  // 보기를 바꾸면 새 목록이 올 때까지 기다리고, 검색어만 바뀌면 앞 목록을 그대로 둔다.
  if (!data || data.view !== view) {
    return (
      <>
        {head}
        <div className="card skel" aria-label="불러오는 중" aria-busy="true">
          <div style={{ width: "70%" }} />
          <div style={{ width: "50%" }} />
          <div style={{ width: "60%" }} />
        </div>
      </>
    );
  }
  if (!data.list.counts.all) {
    return (
      <>
        {head}
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
  if (!data.list.items.length) {
    return (
      <>
        {head}
        <div className="card empty">
          <h2>조건에 맞는 경험이 없어요</h2>
          <p>검색어나 보기를 바꿔 보세요.</p>
        </div>
      </>
    );
  }
  return (
    <>
      {head}
      <div className="card rlist big" aria-label="경험 목록">
        {data.list.items.map((x) => (
          <button key={x.id} type="button" className="rrow xrow" onClick={() => onOpen(x.id)}>
            <span className="rmain">
              <b>{x.name}</b>
              <span className="xsum">{x.summary || <span className="hint">요약 없음</span>}</span>
            </span>
            <span className="rmeta">
              <VerifiedPill verified={x.verified} />
              {x.needs.map((n) => (
                <span key={n.label} className="pill gap">
                  {n.label}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
      <p className="hint">
        미확인 = AI가 만들거나 고친 뒤 아직 내가 읽지 않은 경험. 보완 필요 = 결과 수치, 빈 항목, 답변이 비어 있는 경험.
      </p>
    </>
  );
}
