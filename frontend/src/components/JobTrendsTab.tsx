import type { ReactNode } from "react";
import { NO_DATA, TREND_SECTIONS, hasTrends, isOldSource, isWebUrl, trendRows } from "@/lib/jobs";
import type { Job, TrendSource } from "@/services";
import { Inline } from "./ExperienceViewScreen";

/** 출처 칩: "이름 날짜 ↗". http(s) 주소만 새 탭 링크, 오래된 자료는 노란 "⚠ … · 오래된 자료". */
function SourceChip({ source, old }: { source: TrendSource; old: boolean }) {
  const link = isWebUrl(source.url);
  const body = (
    <>
      {old && "⚠ "}
      {source.name}
      {source.date && (
        <>
          {" "}
          <span className="d">{source.date}</span>
        </>
      )}
      {old && " · 오래된 자료"}
      {link && " ↗"}
    </>
  );
  const className = `src${old ? " old" : ""}`;
  const title = old ? "조사일보다 1년 넘게 오래된 자료" : undefined;
  return link ? (
    <a className={className} href={source.url.trim()} target="_blank" rel="noopener noreferrer" title={title}>
      {body}
    </a>
  ) : (
    <span className={className} title={title}>
      {body}
    </span>
  );
}

interface TrendSection {
  id: string;
  title: string;
  /** 섹션 칩과 "비어 있는 섹션"의 이름. */
  chip: string;
  empty: boolean;
  body: ReactNode;
}

/**
 * 공고분석 상세의 [회사 동향] 탭 (2026-10-16 추가): 조사일과 조사 메모, 섹션 칩,
 * 돈을 쓰는 곳·경쟁사·사용자 반응의 동향 줄, 회사가 가는 방향, 어필 포인트.
 * 빈 섹션은 숨기고 이름만 알려 준다. 근거 경험 태그는 상세가 그려 준다.
 */
export function JobTrendsTab({ job, evidence }: { job: Job; evidence: (text: string, key: number) => ReactNode }) {
  if (!hasTrends(job)) {
    return (
      <div className="card tr-empty">
        아직 회사 동향이 없어요.
        <br />
        [편집]의 "회사 동향" 섹션에서 적을 수 있어요.
      </div>
    );
  }

  const old = (s: TrendSource) => isOldSource(s.date, job.trendsCheckedOn, job.analyzedAt);
  const sections: TrendSection[] = [
    ...TREND_SECTIONS.map(({ kind, title }) => {
      const rows = trendRows(job.trends, kind);
      return {
        id: kind,
        title,
        chip: title,
        empty: !rows.length,
        body: (
          <div className="tr-rows">
            {rows.map(({ item, cont }, i) => (
              <div key={i} className={`trow${cont ? " cont" : ""}`}>
                <div className="tl">{cont ? "" : item.label}</div>
                <div className="tb">
                  {item.text.trim() === NO_DATA ? (
                    <span className="nodata">{NO_DATA}</span>
                  ) : (
                    item.text && (
                      <span>
                        <Inline text={item.text} />
                      </span>
                    )
                  )}
                  {item.sources.length > 0 && (
                    <span className="srcs">
                      {item.sources.map((s, k) => (
                        <SourceChip key={k} source={s} old={old(s)} />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ),
      };
    }),
    {
      id: "direction",
      title: "회사가 가는 방향 — 이 포지션을 왜 지금 뽑는가",
      chip: "회사가 가는 방향",
      empty: !(job.directionQuotes.length || job.directionReading.trim()),
      body: (
        <>
          {job.directionQuotes.length > 0 && (
            <ul className="quotes">
              {job.directionQuotes.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          )}
          {job.directionReading.trim() && (
            <div className="reading">
              <b>해석 (추정)</b>
              <Inline text={job.directionReading} />
            </div>
          )}
        </>
      ),
    },
    {
      id: "appeal",
      title: "어필 포인트 — \"내가 필요하다\"",
      chip: "어필 포인트",
      empty: !(job.appeals.length || job.appealGaps.length),
      body: (
        <>
          {job.appeals.length > 0 && (
            <div className="appeal">
              {job.appeals.map((a, i) => (
                <div key={i} className="apc" aria-label={`어필 포인트 ${i + 1}`}>
                  <span className="no">{i + 1}</span>
                  <dl>
                    <dt>회사 상황</dt>
                    <dd>
                      <Inline text={a.situation} />
                    </dd>
                    <dt>내 기여</dt>
                    <dd>
                      <Inline text={a.contribution} />
                    </dd>
                    <dt>근거 경험</dt>
                    <dd className="evs">{a.evidence.map((e, k) => evidence(e, k))}</dd>
                  </dl>
                </div>
              ))}
            </div>
          )}
          {job.appealGaps.length > 0 && (
            <>
              <p className="unused-h">어필 포인트로 쓰지 않은 것 (갭)</p>
              <ul className="jlist unused">
                {job.appealGaps.map((g, i) => (
                  <li key={i}>
                    <Inline text={g} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ),
    },
  ];
  const filled = sections.filter((s) => !s.empty);
  const emptyOnes = sections.filter((s) => s.empty);
  const note = job.trendsNote.trim();

  return (
    <>
      {(job.trendsCheckedOn || note) && (
        <div className="card tr-intro" aria-label="조사">
          {job.trendsCheckedOn && (
            <>
              <span className="k">조사일</span>
              <span className="mono">{job.trendsCheckedOn}</span>
            </>
          )}
          {note && <p>{note}</p>}
        </div>
      )}
      {filled.length > 0 && (
        <nav className="toc" aria-label="회사 동향 섹션">
          {filled.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => document.getElementById(`jt-${s.id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
            >
              {s.chip}
            </button>
          ))}
        </nav>
      )}
      {filled.map((s) => (
        <section key={s.id} className="card jsec" id={`jt-${s.id}`} aria-label={s.chip}>
          <div className="jsec-h">
            <h2>{s.title}</h2>
          </div>
          {s.body}
        </section>
      ))}
      {emptyOnes.length > 0 && (
        <p className="hint">비어 있는 섹션: {emptyOnes.map((s) => s.chip).join(" · ")} — [편집]에서 채울 수 있어요.</p>
      )}
    </>
  );
}
