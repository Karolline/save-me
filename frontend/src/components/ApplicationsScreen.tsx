import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import {
  monthsOf,
  placeLabel,
  rangeTitle,
  rowLayout,
  stageChain,
  type LabelPlacement,
  type Month,
} from "@/lib/timeline";
import {
  RESULTS,
  STAGE_KIND_LABELS,
  useService,
  type Application,
  type ApplicationList,
  type StageKind,
  type StatusFilter,
} from "@/services";
import { icons } from "./icons";
import { useSessionErrors } from "./session";

const FILTERS: [StatusFilter, string][] = [
  ["all", "전체"],
  ["ing", "진행 중"],
  ["done", "종료"],
];

const STATS: [keyof ApplicationList["stats"], string][] = [
  ["all", "전체"],
  ["ing", "진행 중"],
  ["doc", "서류 탈락"],
  ["test", "코테·과제 탈락"],
  ["itv", "면접 탈락"],
  ["etc", "기타"],
];

const KINDS: StageKind[] = [1, 2, 3, 4];

/**
 * 지원현황 (기획안 S1 1번, 완료분 기획안 S2 5·9번): 통계, 범례, 필터, 타임라인과 표.
 * 처음엔 "진행 중" 필터로 연다 (2026-10-15 사용자 결정).
 * 다른 곳에서 지원 건을 저장하면 `version`이 바뀌고, 목록을 다시 불러온다.
 */
export function ApplicationsScreen({
  version = 0,
  onOpen,
  onAdd,
}: {
  version?: number;
  onOpen: (id: number) => void;
  onAdd: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const [filter, setFilter] = useState<StatusFilter>("ing");
  const [list, setList] = useState<ApplicationList | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    service
      .listApplications(filter)
      .then((result) => {
        if (!live) return;
        setList(result);
      })
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, filter, version, attempt, handleSessionError]);

  const stats = list?.stats;
  // 제목의 기간은 지금 보이는 막대들의 기간이다 (필터를 바꾸면 차트 축과 같이 바뀐다).
  const title = list ? rangeTitle(list.items) : "";

  const head = (
    <div className="ph">
      <div>
        <h1>
          지원 현황 {title && <span className="mono">{title}</span>}
        </h1>
        <p>막대는 지원부터 마지막 전형까지의 기간, 막대 색은 도달한 단계, 오른쪽 문구는 진행 순서와 결과입니다.</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={onAdd}>
        + 지원 추가
      </button>
    </div>
  );

  const statRow = (
    <div className="card stats" aria-label="통계">
      {STATS.map(([key, label], i) => (
        <span key={key} className={`stat${i === 0 ? " first" : ""}`}>
          <b>{stats && !failed ? stats[key] : "–"}</b>
          {label}
        </span>
      ))}
    </div>
  );

  if (failed) {
    return (
      <>
        {head}
        {statRow}
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

  if (!list) {
    return (
      <>
        {head}
        {statRow}
        <div className="card skel" aria-label="불러오는 중" aria-busy="true">
          {[62, 48, 75, 40, 66, 55].map((w) => (
            <div key={w} style={{ width: `${w}%` }} />
          ))}
        </div>
      </>
    );
  }

  if (list.counts.all === 0) {
    return (
      <>
        {head}
        {statRow}
        <div className="card empty">
          {icons.empty}
          <h2>아직 기록한 지원이 없어요</h2>
          <p>지원한 회사와 전형 단계를 적으면 여기에 타임라인으로 쌓여요.</p>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            + 지원 추가
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      {statRow}
      <div className="toolbar">
        <div className="legend">
          <span className="grp">
            {KINDS.map((k) => (
              <span key={k} className="sw">
                <i style={{ background: `var(--d${k})` }} />
                {STAGE_KIND_LABELS[k]}
              </span>
            ))}
          </span>
          <span className="sep" />
          <span className="grp">
            <span className="r-fail">✕ 탈락</span>
            <span className="r-etc">◇ 기타</span>
            <span className="r-ing">▶ 진행 중</span>
          </span>
        </div>
        <div className="seg" role="group" aria-label="필터">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
              <span className="n">{list.counts[key]}</span>
            </button>
          ))}
        </div>
      </div>
      {list.items.length ? (
        <Timeline items={list.items} onOpen={onOpen} />
      ) : (
        <div className="card empty">
          <h2>해당하는 지원이 없어요</h2>
          <p>필터를 바꿔 보세요.</p>
        </div>
      )}
    </>
  );
}

function ResultText({ a }: { a: Application }) {
  const r = RESULTS[a.result];
  return (
    <span className={`res ${r.className}`}>
      {r.symbol} {a.resultText || r.label}
    </span>
  );
}

function Timeline({ items, onOpen }: { items: Application[]; onOpen: (id: number) => void }) {
  const months = monthsOf(items);
  const columns = { gridTemplateColumns: `repeat(${months.length}, 1fr)` };
  const [tableOpen, setTableOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ a: Application; x: number; y: number } | null>(null);

  function moveTip(e: MouseEvent, a: Application) {
    const box = card.current!.getBoundingClientRect();
    const width = 300;
    let x = e.clientX - box.left + 14;
    if (x + width > box.width - 8) x = e.clientX - box.left - width - 14;
    setTip({ a, x: Math.max(8, x), y: e.clientY - box.top + 16 });
  }

  return (
    <div className="card chart-card" ref={card} onMouseLeave={() => setTip(null)}>
      <div className="swipe">옆으로 밀어서 보기 →</div>
      <div className="chart-scroll">
        <div className="chart">
          <div className="chead">
            <span />
            <div className="months" style={columns}>
              {months.map(([y, m], i) => (
                <div key={`${y}-${m}`}>
                  {(i === 0 || m === 1) && <small>{y}</small>}
                  {String(m).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>
          <div className="cbody">
            <div className="gridlines" style={columns}>
              {months.map(([y, m]) => (
                <div key={`${y}-${m}`} />
              ))}
            </div>
            {items.map((a) => (
              <TimelineRow
                key={a.id}
                a={a}
                months={months}
                onOpen={onOpen}
                onMouseMove={(e) => moveTip(e, a)}
              />
            ))}
          </div>
        </div>
      </div>
      <details className="tbl-wrap" open={tableOpen} onToggle={(e) => setTableOpen(e.currentTarget.open)}>
        <summary>표로 보기</summary>
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th>시기</th>
                <th>기업</th>
                <th>진행 단계</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.period}</td>
                  <td>
                    <button type="button" className="link" onClick={() => onOpen(a.id)}>
                      {a.company}
                    </button>
                    {a.sub && <span className="hint"> {a.sub}</span>}
                  </td>
                  <td>{stageChain(a)}</td>
                  <td>
                    <ResultText a={a} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {tip && (
        <div className="tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
          <b>
            {tip.a.company}
            {tip.a.sub && ` · ${tip.a.sub}`}
          </b>{" "}
          <span className="mono">{tip.a.period}</span>
          <br />
          {stageChain(tip.a)}
          <br />
          {RESULTS[tip.a.result].symbol} {tip.a.resultText || RESULTS[tip.a.result].label}
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  a,
  months,
  onOpen,
  onMouseMove,
}: {
  a: Application;
  months: Month[];
  onOpen: (id: number) => void;
  onMouseMove: (e: MouseEvent) => void;
}) {
  const layout = rowLayout(a, months);
  const color = `var(--d${a.depth})`;
  const track = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  // 문구의 실제 너비로 정한 자리. 재기 전(또는 너비를 못 재는 테스트 환경)에는
  // rowLayout의 기본 쪽에 퍼센트로 둔다.
  const [placed, setPlaced] = useState<LabelPlacement | null>(null);
  const { left, width } = layout;
  const preferred = layout.label.side;
  useLayoutEffect(() => {
    const trackEl = track.current;
    const textEl = text.current;
    if (!trackEl || !textEl) return;
    const measure = () => {
      const w = trackEl.clientWidth;
      if (!w) return;
      setPlaced(
        placeLabel({
          barLeft: (left / 100) * w,
          barRight: ((left + width) / 100) * w,
          trackWidth: w,
          labelWidth: textEl.scrollWidth,
          preferred,
        }),
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(trackEl);
    return () => observer.disconnect();
  }, [left, width, preferred, a.stages, a.result, a.resultText]);
  const label = placed
    ? placed.side === "right"
      ? { left: placed.x }
      : placed.side === "left"
        ? { right: `calc(100% - ${placed.x}px)` }
        : { left: placed.x }
    : layout.label.side === "right"
      ? { left: `calc(${layout.label.at}% + 10px)` }
      : { right: `calc(${100 - layout.label.at}% + 10px)` };
  const below = placed?.side === "below";
  return (
    <div className={`crow${below ? " lbl-below" : ""}`} data-testid="timeline-row" onMouseMove={onMouseMove}>
      <button type="button" className="cname" onClick={() => onOpen(a.id)}>
        <span>{a.company}</span>
        {a.sub && <small>{a.sub}</small>}
      </button>
      <div className="ctrack" ref={track}>
        <span className="seg-bar" style={{ left: `${layout.left}%`, width: `${layout.width}%`, background: color }} />
        {layout.dots.map((at, i) => (
          <span key={i} className="dot" style={{ left: `${at}%`, background: color }} />
        ))}
        <span className={`lbl${below ? " below" : ""}`} style={label} ref={text}>
          {a.stages.map((s) => s.name).join(" → ")} → <ResultText a={a} />
        </span>
      </div>
    </div>
  );
}
