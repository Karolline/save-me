import { NEW_ROW, TREND_SECTIONS, type AppealDraft, type JobDraft, type TrendDraft, type TrendSourceDraft } from "@/lib/jobs";
import type { TrendKind } from "@/services";
import { Choice, Field, type ChoiceOption } from "./JobEditScreen";

const KIND_OPTIONS: ChoiceOption[] = TREND_SECTIONS.map((s) => ({ value: s.kind, text: s.button }));

/**
 * 공고 분석 편집의 "회사 동향" 섹션 몸통 (2026-10-16 추가): 조사일, 조사 메모, 동향 카드
 * (구분·분류·내용·출처 줄), 회사가 가는 방향, 어필 포인트 카드, 쓰지 않은 것.
 * 카드는 적은 순서대로 저장되고, 상세는 구분별로 묶어 보인다.
 */
export function JobTrendsEditor({
  d,
  update,
  focus,
}: {
  d: JobDraft;
  /** 초안을 바꾼다. */
  update: (change: (d: JobDraft) => JobDraft) => void;
  /** 다음에 그린 뒤 이 id의 칸으로 초점을 옮긴다. */
  focus: (id: string) => void;
}) {
  const setTrend = (key: number, patch: Partial<TrendDraft>) =>
    update((x) => ({ ...x, trends: x.trends.map((t) => (t.key === key ? { ...t, ...patch } : t)) }));
  const setSources = (key: number, change: (sources: TrendSourceDraft[]) => TrendSourceDraft[]) =>
    update((x) => ({ ...x, trends: x.trends.map((t) => (t.key === key ? { ...t, sources: change(t.sources) } : t)) }));
  const setAppeal = (key: number, patch: Partial<AppealDraft>) =>
    update((x) => ({ ...x, appeals: x.appeals.map((a) => (a.key === key ? { ...a, ...patch } : a)) }));

  function addTrend() {
    const row = NEW_ROW.trends();
    update((x) => ({ ...x, trends: [...x.trends, row] }));
    focus(`jtr-${row.key}-label`);
  }
  function addSource(key: number) {
    const source = NEW_ROW.sources();
    setSources(key, (sources) => [...sources, source]);
    focus(`jts-${source.key}-name`);
  }
  function addAppeal() {
    const row = NEW_ROW.appeals();
    update((x) => ({ ...x, appeals: [...x.appeals, row] }));
    focus(`jap-${row.key}-situation`);
  }

  return (
    <>
      <div className="row-fields">
        <Field id="j-trends-on" label="조사일" help="회사 동향을 조사한 날. 탭 맨 위에 보여요.">
          <input
            className="input mono"
            type="date"
            id="j-trends-on"
            value={d.trendsCheckedOn}
            onChange={(e) => update((x) => ({ ...x, trendsCheckedOn: e.target.value }))}
          />
        </Field>
        <Field id="j-trends-note" label="조사 메모" help="어떤 자료로 조사했는지. 조사일 옆에 보여요." wide>
          <textarea
            className="textarea sm"
            id="j-trends-note"
            value={d.trendsNote}
            onChange={(e) => update((x) => ({ ...x, trendsNote: e.target.value }))}
          />
        </Field>
      </div>

      <div className="rows-ed">
        {d.trends.map((t, i) => {
          const id = (k: string) => `jtr-${t.key}-${k}`;
          return (
            <div key={t.key} className="row-card" aria-label={`동향 ${i + 1}`}>
              <div className="row-card-h">
                <b>동향 {i + 1}</b>
                <button
                  type="button"
                  className="btn btn-text danger btn-sm"
                  onClick={() => update((x) => ({ ...x, trends: x.trends.filter((r) => r.key !== t.key) }))}
                >
                  삭제
                </button>
              </div>
              <div className="row-fields">
                <Choice
                  label="구분"
                  name={id("kind")}
                  options={KIND_OPTIONS}
                  value={t.kind}
                  onChange={(v) => setTrend(t.key, { kind: v as TrendKind })}
                />
                <Field
                  id={id("label")}
                  label="분류"
                  help="왼쪽 칸에 굵게 (예: 실적, 물류, 경쟁사 이름). 바로 위 줄과 같으면 한 번만 보여요."
                >
                  <input
                    className="input"
                    id={id("label")}
                    value={t.label}
                    onChange={(e) => setTrend(t.key, { label: e.target.value })}
                  />
                </Field>
                <Field id={id("text")} label="내용" help='**굵게** 쓸 수 있어요. 자료가 없으면 "자료 없음".' wide>
                  <textarea
                    className="textarea sm"
                    id={id("text")}
                    value={t.text}
                    onChange={(e) => setTrend(t.key, { text: e.target.value })}
                  />
                </Field>
                <div className="fl wide" role="group" aria-label="출처">
                  <span className="fl-k">
                    출처
                    <span className="fl-h">
                      이름 · 날짜 · 링크. 조사일보다 1년 넘게 오래된 자료는 "⚠ 오래된 자료"로 보여요.
                    </span>
                  </span>
                  {t.sources.map((s, k) => {
                    const sid = (f: string) => `jts-${s.key}-${f}`;
                    const change = (patch: Partial<TrendSourceDraft>) =>
                      setSources(t.key, (sources) => sources.map((x) => (x.key === s.key ? { ...x, ...patch } : x)));
                    return (
                      <div key={s.key} className="tsrc-ed" aria-label={`출처 ${k + 1}`}>
                        <input
                          className="input"
                          id={sid("name")}
                          aria-label="출처 이름"
                          placeholder="이름"
                          value={s.name}
                          onChange={(e) => change({ name: e.target.value })}
                        />
                        <input
                          className="input mono"
                          type="date"
                          id={sid("date")}
                          aria-label="출처 날짜"
                          value={s.date}
                          onChange={(e) => change({ date: e.target.value })}
                        />
                        <input
                          className="input"
                          id={sid("url")}
                          aria-label="출처 링크"
                          placeholder="https://"
                          inputMode="url"
                          value={s.url}
                          onChange={(e) => change({ url: e.target.value })}
                        />
                        <button
                          type="button"
                          className="btn btn-text danger btn-sm"
                          aria-label="출처 삭제"
                          onClick={() => setSources(t.key, (sources) => sources.filter((x) => x.key !== s.key))}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <div>
                    <button type="button" className="btn btn-sm" onClick={() => addSource(t.key)}>
                      + 출처 추가
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div>
          <button type="button" className="btn btn-sm" onClick={addTrend}>
            + 동향 추가
          </button>
        </div>
      </div>

      <div className="row-fields">
        <Field
          id="j-dir-quotes"
          label="회사가 가는 방향 · 공고 문구"
          help="한 줄에 하나. 공고에서 방향이 보이는 문장을 그대로."
          wide
        >
          <textarea
            className="textarea sm"
            id="j-dir-quotes"
            value={d.directionQuotes}
            onChange={(e) => update((x) => ({ ...x, directionQuotes: e.target.value }))}
          />
        </Field>
        <Field id="j-dir-reading" label="회사가 가는 방향 · 해석" help="왜 지금 이 포지션을 뽑는지 추정." wide>
          <textarea
            className="textarea sm"
            id="j-dir-reading"
            value={d.directionReading}
            onChange={(e) => update((x) => ({ ...x, directionReading: e.target.value }))}
          />
        </Field>
      </div>

      <div className="rows-ed">
        {d.appeals.map((a, i) => {
          const id = (k: string) => `jap-${a.key}-${k}`;
          return (
            <div key={a.key} className="row-card" aria-label={`어필 포인트 ${i + 1}`}>
              <div className="row-card-h">
                <b>어필 포인트 {i + 1}</b>
                <button
                  type="button"
                  className="btn btn-text danger btn-sm"
                  onClick={() => update((x) => ({ ...x, appeals: x.appeals.filter((r) => r.key !== a.key) }))}
                >
                  삭제
                </button>
              </div>
              <div className="row-fields">
                <Field id={id("situation")} label="회사 상황" wide>
                  <textarea
                    className="textarea sm"
                    id={id("situation")}
                    value={a.situation}
                    onChange={(e) => setAppeal(a.key, { situation: e.target.value })}
                  />
                </Field>
                <Field id={id("contribution")} label="내 기여" wide>
                  <textarea
                    className="textarea sm"
                    id={id("contribution")}
                    value={a.contribution}
                    onChange={(e) => setAppeal(a.key, { contribution: e.target.value })}
                  />
                </Field>
                <Field id={id("evidence")} label="근거 경험" help="쉼표로 구분. 경험과 이어지면 ↗ 링크." wide>
                  <input
                    className="input"
                    id={id("evidence")}
                    value={a.evidence}
                    onChange={(e) => setAppeal(a.key, { evidence: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          );
        })}
        <div>
          <button type="button" className="btn btn-sm" onClick={addAppeal}>
            + 어필 포인트 추가
          </button>
        </div>
      </div>

      <Field id="j-appeal-gaps" label="어필 포인트로 쓰지 않은 것" help="한 줄에 하나. 회사 상황은 있는데 내 근거가 없는 것.">
        <textarea
          className="textarea sm"
          id="j-appeal-gaps"
          value={d.appealGaps}
          onChange={(e) => update((x) => ({ ...x, appealGaps: e.target.value }))}
        />
      </Field>
    </>
  );
}
