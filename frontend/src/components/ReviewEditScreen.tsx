import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type TextareaHTMLAttributes,
} from "react";
import { shortDay } from "@/lib/timeline";
import {
  ADDABLE_KINDS,
  BUBBLES,
  answerStep,
  dropGroup,
  applicationsOf,
  companiesNewestFirst,
  interviewStages,
  moveAnswer,
  moveGroup,
  nextRound,
  reviewMarkdown,
} from "@/lib/reviews";
import { useService, type AnswerKind, type Application, type Review, type ReviewInput } from "@/services";
import { ConfirmDialog, useToast } from "./feedback";
import { icons } from "./icons";
import { BubbleLabel, MarkdownDialog, StarButton } from "./reviewParts";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

/**
 * 면접 후기 추가·편집 페이지 (기획안 S2 7번, 목업 review-edit, review-add).
 * 위쪽에서 회사 → 서류 제출일 → 면접 차수를 고르고, 아래에서 질문 말풍선을
 * 쓴다. 손잡이를 끌거나(마우스·터치) 손잡이에 초점을 두고 ↑↓로 순서를 바꾼다.
 * 패널이 아니라 페이지라서 Escape로 닫지 않는다. 다른 후기를 열 때는
 * `key`를 바꿔 새로 시작한다.
 */

interface DraftAnswer {
  key: number;
  kind: AnswerKind;
  body: string;
}

interface DraftGroup {
  key: number;
  question: string;
  isFavorite: boolean;
  answers: DraftAnswer[];
}

interface Meta {
  company: string;
  applicationId: number | null;
  round: string;
  /** 면접 차수를 목록에서 고르지 않고 직접 적는다. */
  custom: boolean;
  interviewedAt: string;
  extra: string;
  summary: string;
}

const CUSTOM = "__custom";
const EMPTY_META: Meta = {
  company: "",
  applicationId: null,
  round: "",
  custom: false,
  interviewedAt: "",
  extra: "",
  summary: "",
};

let nextKey = 1;
const newKey = () => nextKey++;
const emptyGroup = (): DraftGroup => ({ key: newKey(), question: "", isFavorite: false, answers: [] });

function saveHint(meta: Meta): string {
  if (!meta.company) return "어느 회사 면접인지 골라 주세요";
  if (!meta.applicationId) return "서류 제출일을 골라 주세요";
  if (!meta.round.trim()) return meta.custom ? "면접 차수를 적어 주세요" : "면접 차수를 골라 주세요";
  return "";
}

/** 저장된 후기를 편집할 초안으로. */
function draftOf(review: Review, apps: Application[]): { meta: Meta; groups: DraftGroup[] } {
  const app = apps.find((a) => a.id === review.applicationId);
  return {
    meta: {
      company: review.company,
      applicationId: review.applicationId,
      round: review.round,
      custom: !interviewStages(app).some((s) => s.name === review.round),
      interviewedAt: review.interviewedAt ?? "",
      extra: review.extra,
      summary: review.summary,
    },
    groups: review.questions.map((q) => ({
      key: newKey(),
      question: q.question,
      isFavorite: q.isFavorite,
      answers: q.answers.map((a) => ({ key: newKey(), kind: a.kind, body: a.body })),
    })),
  };
}

/** 내용만큼 늘어나는 textarea. */
function GrowArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}

export function ReviewEditScreen({
  reviewId,
  applicationId,
  onSaved,
  onCancel,
  onHome,
}: {
  /** 고칠 후기. 없으면 새 후기. */
  reviewId?: number;
  /** 지원 상세에서 새 후기를 열었을 때 그 지원 건 (회사와 지원 건이 미리 골라진다). */
  applicationId?: number;
  onSaved: (reviewId: number) => void;
  onCancel: () => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  /** 고른 지원 건에서 다른 후기가 이미 쓴 차수 이름. */
  const [taken, setTaken] = useState<string[]>([]);
  const [groups, setGroups] = useState<DraftGroup[]>(() => (reviewId === undefined ? [emptyGroup()] : []));
  const [active, setActive] = useState<number | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<DraftGroup | null>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [presetCompany, setPresetCompany] = useState("");

  const isNew = reviewId === undefined;
  // 창 전체의 pointer 이벤트 처리기가 지금 질문 목록을 읽는다.
  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  });

  // 회사·지원 건을 고를 때마다 늘린다. 늦게 온 이전 선택의 응답은 버린다.
  const choice = useRef(0);

  /**
   * 지원 건을 고르면 그 지원 건의 다른 후기 차수를 불러오고 (편집 중인 이 후기는
   * 빼고), `pick`이면 다음 차수를 고른다.
   */
  const chooseApplication = useCallback(
    async (app: Application | undefined, pick: boolean) => {
      const mine = ++choice.current;
      let rounds: string[] = [];
      if (app) {
        const list = await service.listReviews(app.id);
        rounds = list.groups.flatMap((g) => g.reviews).filter((r) => r.id !== reviewId).map((r) => r.round);
      }
      if (mine !== choice.current) return;
      setTaken(rounds);
      if (!pick) return;
      const stage = nextRound(app, rounds);
      setMeta((m) => ({
        ...m,
        applicationId: app?.id ?? null,
        ...(stage
          ? { round: stage.name, custom: false, interviewedAt: stage.at }
          : { round: "", custom: !!app, interviewedAt: "" }),
      }));
    },
    [service, reviewId],
  );

  // 컴포넌트는 key로 새로 그려지므로, 아래 값들은 사실상 처음 한 번만 불러온다.
  useEffect(() => {
    let live = true;
    (async () => {
      const [list, review] = await Promise.all([
        service.listApplications(),
        reviewId === undefined ? Promise.resolve(undefined) : service.getReview(reviewId),
      ]);
      if (!live) return;
      const apps = list.items;
      if (review === null) {
        setMissing(true);
        return;
      }
      setApplications(apps);
      if (review) {
        const draft = draftOf(review, apps);
        setMeta(draft.meta);
        setGroups(draft.groups);
        await chooseApplication(apps.find((a) => a.id === review.applicationId), false);
      } else if (applicationId !== undefined) {
        const app = apps.find((a) => a.id === applicationId);
        if (!app) {
          setMissing(true);
          return;
        }
        setMeta((m) => ({ ...m, company: app.company }));
        setPresetCompany(app.company);
        focusNext(`q-${groupsRef.current[0]?.key}`);
        await chooseApplication(app, true);
      } else {
        focusNext("rd-company");
      }
    })().catch((error) => {
      if (live && !handleSessionError(error)) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [service, reviewId, applicationId, chooseApplication, handleSessionError]);

  // 새로 생긴 칸이나 옮긴 손잡이로, 다음에 그린 뒤 초점을 옮긴다.
  const focusTarget = useRef<string | null>(null);
  function focusNext(id: string) {
    focusTarget.current = id;
  }
  useEffect(() => {
    const id = focusTarget.current;
    if (!id) return;
    const el = document.getElementById(id) ?? document.querySelector<HTMLElement>(`[data-grip="${id}"]`);
    if (!el) return;
    el.focus();
    focusTarget.current = null;
  });

  // ── 메타 ──

  const app = applications?.find((a) => a.id === meta.applicationId);
  const stages = interviewStages(app);

  function setCompany(company: string) {
    choice.current++;
    setMeta((m) => ({ ...m, company, applicationId: null, round: "", custom: false, interviewedAt: "" }));
    setTaken([]);
    const list = applications ? applicationsOf(applications, company) : [];
    if (list.length === 1) chooseApplication(list[0], true).catch(handleSessionError);
  }

  function setApplication(value: string) {
    const chosen = applications?.find((a) => String(a.id) === value);
    if (!chosen) {
      choice.current++;
      setMeta((m) => ({ ...m, applicationId: null, round: "", custom: false, interviewedAt: "" }));
      setTaken([]);
      return;
    }
    chooseApplication(chosen, true).catch(handleSessionError);
  }

  function setRound(value: string) {
    if (value === CUSTOM) {
      setMeta((m) => ({ ...m, custom: true, round: "" }));
      focusNext("rd-custom");
    } else if (!value) {
      setMeta((m) => ({ ...m, custom: false, round: "" }));
    } else {
      const stage = stages.find((s) => s.name === value);
      setMeta((m) => ({ ...m, custom: false, round: value, interviewedAt: stage?.at ?? m.interviewedAt }));
    }
  }

  // ── 질문과 말풍선 ──

  function updateGroup(key: number, change: (g: DraftGroup) => DraftGroup) {
    setGroups((gs) => gs.map((g) => (g.key === key ? change(g) : g)));
  }

  function addGroup() {
    const g = emptyGroup();
    setGroups((gs) => [...gs, g]);
    setActive(g.key);
    focusNext(`q-${g.key}`);
  }

  function addAnswer(groupKey: number, kind: AnswerKind) {
    const a = { key: newKey(), kind, body: "" };
    updateGroup(groupKey, (g) => ({ ...g, answers: [...g.answers, a] }));
    setActive(groupKey);
    focusNext(`a-${a.key}`);
  }

  function removeGroup(key: number) {
    setGroups((gs) => gs.filter((g) => g.key !== key));
    setActive(null);
    setConfirmGroup(null);
  }

  function askRemoveGroup(g: DraftGroup) {
    if (g.answers.length) setConfirmGroup(g);
    else removeGroup(g.key);
  }

  function findAnswer(gs: DraftGroup[], key: number): [number, number] {
    for (let gi = 0; gi < gs.length; gi++) {
      const ki = gs[gi].answers.findIndex((a) => a.key === key);
      if (ki >= 0) return [gi, ki];
    }
    return [-1, -1];
  }

  /** 키보드: 손잡이에 초점을 두고 ↑↓. */
  function onGripKey(e: ReactKeyboardEvent, type: "g" | "k", key: number) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const up = e.key === "ArrowUp";
    const gs = groups;
    if (type === "g") {
      const from = gs.findIndex((g) => g.key === key);
      const to = from + (up ? -1 : 1);
      if (to < 0 || to >= gs.length) return;
      setGroups(moveGroup(gs, from, to));
      setActive(key);
    } else {
      const [gi, ki] = findAnswer(gs, key);
      const step = answerStep(
        gs.map((g) => g.answers.length),
        gi,
        ki,
        up,
      );
      if (!step) return;
      setGroups(moveAnswer(gs, gi, ki, step[0], step[1]));
      setActive(gs[step[0]].key);
    }
    focusNext(`${type}-${key}`);
  }

  // ── 끌어서 옮기기 (마우스·터치, pointer 이벤트) ──

  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ type: "g" | "k"; key: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  function onGripDown(e: ReactPointerEvent, type: "g" | "k", key: number) {
    if (e.button > 0) return;
    e.preventDefault();
    drag.current = { type, key };
    setDragging(key);
    document.body.classList.add("is-dragging");
  }

  useEffect(() => {
    const middle = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    };
    function move(e: PointerEvent) {
      const d = drag.current;
      const list = listRef.current;
      if (!d || !list) return;
      const y = e.clientY;
      const gs = groupsRef.current;
      const groupEls = [...list.querySelectorAll<HTMLElement>(":scope > .qgroup")];
      if (d.type === "g") {
        const from = gs.findIndex((g) => g.key === d.key);
        const others = groupEls.filter((el) => el.dataset.key !== String(d.key));
        let to = others.findIndex((el) => y < middle(el));
        if (to < 0) to = others.length;
        if (to !== from) setGroups(moveGroup(gs, from, to));
      } else {
        const [gi, ki] = findAnswer(gs, d.key);
        // 카드 사이 틈에서는 더 가까운 카드 (같은 거리면 지금 질문)에 둔다.
        const target = dropGroup(
          groupEls.map((el) => el.getBoundingClientRect()),
          y,
          gi,
        );
        if (target < 0) return;
        const kids = [...groupEls[target].querySelectorAll<HTMLElement>(".kid")].filter(
          (el) => el.dataset.key !== String(d.key),
        );
        let index = kids.findIndex((el) => y < middle(el));
        if (index < 0) index = kids.length;
        if (target !== gi || index !== ki) {
          setGroups(moveAnswer(gs, gi, ki, target, index));
          setActive(gs[target].key);
        }
      }
      // 끄는 동안 위·아래 끝에 가까우면 화면을 굴린다.
      const col = list.closest(".col");
      if (col) {
        const r = col.getBoundingClientRect();
        if (y < r.top + 48) col.scrollTop -= 12;
        else if (y > r.bottom - 72) col.scrollTop += 12;
      }
    }
    function end() {
      if (!drag.current) return;
      drag.current = null;
      setDragging(null);
      document.body.classList.remove("is-dragging");
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.classList.remove("is-dragging");
    };
  }, []);

  // ── 저장 ──

  const hint = saveHint(meta);

  async function save() {
    if (hint || meta.applicationId === null) return;
    const input: ReviewInput = {
      applicationId: meta.applicationId,
      round: meta.round.trim(),
      extra: meta.extra.trim(),
      interviewedAt: meta.interviewedAt || null,
      summary: meta.summary,
      questions: groups.map((g) => ({
        question: g.question,
        isFavorite: g.isFavorite,
        answers: g.answers.map((a) => ({ kind: a.kind, body: a.body })),
      })),
    };
    setSaving(true);
    try {
      const saved = reviewId === undefined ? await service.createReview(input) : await service.updateReview(reviewId, input);
      toast("저장했어요");
      onSaved(saved.id);
    } catch (error) {
      setSaving(false);
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (missing) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }

  const back = !isNew
    ? "← 후기 보기로"
    : presetCompany
      ? `← ${presetCompany} 지원 상세로`
      : "← 면접 후기 목록으로";

  return (
    <div className="rp">
      <button type="button" className="link back" onClick={onCancel}>
        {back}
      </button>
      <div className="ph">
        <div>
          <h1>{isNew ? "면접 후기 추가" : "면접 후기 편집"}</h1>
          <p>
            질문 말풍선을 누르면 그 질문에 꼬리질문·면접관·내 답·다시 답한다면·메모를 붙일 수 있어요. 왼쪽 손잡이를 끌어
            순서를 바꿔요. 질문을 옮기면 딸린 말풍선이 함께 움직여요.
          </p>
        </div>
      </div>

      <div className="card rp-meta">
        <label className="field">
          <span>
            회사<em>*</em>
          </span>
          <select
            className="select"
            id="rd-company"
            value={meta.company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={!applications}
          >
            <option value="">회사 선택</option>
            {applications &&
              companiesNewestFirst(applications).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>
            서류 제출일<em>*</em>
          </span>
          <select
            className="select mono"
            id="rd-app"
            value={meta.applicationId ?? ""}
            onChange={(e) => setApplication(e.target.value)}
            disabled={!meta.company}
          >
            <option value="">{meta.company ? "제출일 선택" : "회사를 먼저 골라 주세요"}</option>
            {meta.company &&
              applications &&
              applicationsOf(applications, meta.company).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.appliedAt}
                  {a.sub ? ` (${a.sub})` : ""}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>
            면접 차수<em>*</em>
          </span>
          <select
            className="select"
            id="rd-round"
            value={meta.custom ? CUSTOM : meta.round}
            onChange={(e) => setRound(e.target.value)}
            disabled={!app}
          >
            <option value="">{app ? "차수 선택" : "회사를 먼저 골라 주세요"}</option>
            {stages.map((s) => (
              <option key={`${s.name}-${s.at}`} value={s.name}>
                {s.name} · {shortDay(s.at)}
                {taken.includes(s.name) ? " (후기 있음)" : ""}
              </option>
            ))}
            {app && <option value={CUSTOM}>직접 입력</option>}
          </select>
        </label>
        {meta.custom && (
          <label className="field">
            <span>
              차수 이름<em>*</em>
            </span>
            <input
              className="input"
              id="rd-custom"
              value={meta.round}
              onChange={(e) => setMeta((m) => ({ ...m, round: e.target.value }))}
              placeholder="예: 임원 면접"
            />
          </label>
        )}
        <label className="field">
          <span>면접일</span>
          <input
            className="input mono"
            type="date"
            id="rd-date"
            value={meta.interviewedAt}
            onChange={(e) => setMeta((m) => ({ ...m, interviewedAt: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>부가 설명</span>
          <input
            className="input"
            id="rd-extra"
            value={meta.extra}
            onChange={(e) => setMeta((m) => ({ ...m, extra: e.target.value }))}
            placeholder="예: 실무진, 화상"
          />
        </label>
        {app && !stages.length && (
          <p className="hint rp-meta-note">
            이 지원 건에는 면접 단계가 없어요. 차수를 직접 적거나, 지원 건 수정에서 면접 단계를 추가해 주세요.
          </p>
        )}
        <label className="field rp-summary">
          <span>개요</span>
          <GrowArea
            className="textarea"
            id="rd-summary"
            value={meta.summary}
            onChange={(e) => setMeta((m) => ({ ...m, summary: e.target.value }))}
            placeholder="면접 형식, 분위기, 전체 느낌"
          />
        </label>
      </div>

      <div className="qlist" id="qlist" ref={listRef}>
        {groups.length ? (
          groups.map((g, gi) => (
            <section
              key={g.key}
              data-key={g.key}
              className={`qgroup${active === g.key ? " active" : ""}${dragging === g.key ? " dragging" : ""}`}
              aria-label={`질문 ${gi + 1}`}
              onFocus={() => setActive(g.key)}
            >
              <div className="bub bub-q">
                <div className="bub-h">
                  <button
                    type="button"
                    className="grip"
                    data-grip={`g-${g.key}`}
                    aria-label={`질문 ${gi + 1} 옮기기 (위아래 화살표)`}
                    onPointerDown={(e) => onGripDown(e, "g", g.key)}
                    onKeyDown={(e) => onGripKey(e, "g", g.key)}
                  >
                    {icons.grip}
                  </button>
                  <span className="bub-label">
                    질문 {gi + 1}
                    {g.answers.length > 0 && <em> · 하위 {g.answers.length}개</em>}
                  </span>
                  <StarButton
                    on={g.isFavorite}
                    onToggle={() => updateGroup(g.key, (x) => ({ ...x, isFavorite: !x.isFavorite }))}
                  />
                  <button
                    type="button"
                    className="bub-x"
                    aria-label={`질문 ${gi + 1} 삭제`}
                    onClick={() => askRemoveGroup(g)}
                  >
                    {icons.close}
                  </button>
                </div>
                <GrowArea
                  className="bub-in"
                  id={`q-${g.key}`}
                  rows={1}
                  value={g.question}
                  placeholder="면접관이 한 질문"
                  aria-label={`질문 ${gi + 1}`}
                  onChange={(e) => {
                    const question = e.target.value;
                    updateGroup(g.key, (x) => ({ ...x, question }));
                  }}
                />
              </div>
              <div className="kids">
                {g.answers.map((a) => (
                  <div
                    key={a.key}
                    data-key={a.key}
                    className={`bub bub-${a.kind} kid${dragging === a.key ? " dragging" : ""}`}
                  >
                    <div className="bub-h">
                      <button
                        type="button"
                        className="grip"
                        data-grip={`k-${a.key}`}
                        aria-label={`${BUBBLES[a.kind].label} 옮기기 (위아래 화살표)`}
                        onPointerDown={(e) => onGripDown(e, "k", a.key)}
                        onKeyDown={(e) => onGripKey(e, "k", a.key)}
                      >
                        {icons.grip}
                      </button>
                      <BubbleLabel kind={a.kind} />
                      <button
                        type="button"
                        className="bub-x"
                        aria-label={`${BUBBLES[a.kind].label} 삭제`}
                        onClick={() =>
                          updateGroup(g.key, (x) => ({ ...x, answers: x.answers.filter((y) => y.key !== a.key) }))
                        }
                      >
                        {icons.close}
                      </button>
                    </div>
                    <GrowArea
                      className="bub-in"
                      id={`a-${a.key}`}
                      rows={2}
                      value={a.body}
                      placeholder={BUBBLES[a.kind].placeholder}
                      aria-label={BUBBLES[a.kind].label}
                      onChange={(e) => {
                        const body = e.target.value;
                        updateGroup(g.key, (x) => ({
                          ...x,
                          answers: x.answers.map((y) => (y.key === a.key ? { ...y, body } : y)),
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
              {active === g.key && (
                <div className="kid-add">
                  {ADDABLE_KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={`btn btn-sm add-${kind}`}
                      onClick={() => addAnswer(g.key, kind)}
                    >
                      + {BUBBLES[kind].label}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))
        ) : (
          <p className="hint qempty">[+ 질문]으로 첫 질문을 추가해 주세요.</p>
        )}
      </div>
      <div className="q-add">
        <button type="button" className="btn add-q" onClick={addGroup}>
          + 질문
        </button>
      </div>
      <div className="rp-foot">
        <button type="button" className="btn" onClick={() => setShowMarkdown(true)}>
          마크다운으로 보기
        </button>
        <span className="spacer" />
        {hint && (
          <span className="hint" id="rv-save-hint">
            {hint}
          </span>
        )}
        <button type="button" className="btn" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!!hint || saving || !applications}>
          저장
        </button>
      </div>

      {showMarkdown && (
        <MarkdownDialog
          text={reviewMarkdown({ summary: meta.summary, questions: groups })}
          onClose={() => setShowMarkdown(false)}
        />
      )}
      {confirmGroup && (
        <ConfirmDialog
          title="질문을 삭제할까요?"
          confirmLabel="삭제"
          danger
          onConfirm={() => removeGroup(confirmGroup.key)}
          onCancel={() => setConfirmGroup(null)}
        >
          <p>
            ‘{confirmGroup.question || "제목 없는 질문"}’과 딸린 말풍선 {confirmGroup.answers.length}개가 함께 삭제돼요.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
