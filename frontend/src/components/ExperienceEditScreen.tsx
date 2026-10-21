import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  NEW_EXPERIENCE_ROW,
  experienceSaveHint,
  fromExperienceDraft,
  relatedOptions,
  reviewOptionLabel,
  toExperienceDraft,
  whereFromReview,
  type ExperienceDraft,
} from "@/lib/experiences";
import { useService, type ExperienceGroup, type ReviewSummary } from "@/services";
import { ConfirmDialog, useToast } from "./feedback";
import { Field } from "./JobEditScreen";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

// ── 번호 카드 (행동, 받은 질문, 예상 질문, 관련 경험) ──

type CardPath = "actions" | "asked" | "qas" | "related";
type Card = { key: number } & Record<string, string | number>;

interface Column {
  k: string;
  label: string;
  help?: string;
  ph?: string;
  area?: boolean;
  wide?: boolean;
  /** 고르는 칸: [값, 글]. */
  options?: [string, string][];
}

function CardsEditor({
  path,
  rows,
  cols,
  unit,
  addLabel,
  onChange,
  onAdd,
  onRemove,
}: {
  path: CardPath;
  rows: Card[];
  cols: Column[];
  unit: string;
  addLabel: string;
  onChange: (key: number, k: string, value: string) => void;
  onAdd: () => void;
  onRemove: (key: number) => void;
}) {
  return (
    <div className="rows-ed">
      {rows.map((r, i) => (
        <div key={r.key} className="row-card" aria-label={`${unit} ${i + 1}`}>
          <div className="row-card-h">
            <b>
              {unit} {i + 1}
            </b>
            <button type="button" className="btn btn-text danger btn-sm" onClick={() => onRemove(r.key)}>
              이 {unit} 삭제
            </button>
          </div>
          <div className="row-fields">
            {cols.map((c) => {
              const id = `xr-${path}-${r.key}-${c.k}`;
              const value = String(r[c.k] ?? "");
              return (
                <Field key={c.k} id={id} label={c.label} help={c.help} wide={c.wide}>
                  {c.options ? (
                    <select className="select" id={id} value={value} onChange={(e) => onChange(r.key, c.k, e.target.value)}>
                      <option value="">고르기</option>
                      {c.options.map(([v, text]) => (
                        <option key={v} value={v}>
                          {text}
                        </option>
                      ))}
                    </select>
                  ) : c.area ? (
                    <textarea
                      className="textarea sm"
                      id={id}
                      value={value}
                      placeholder={c.ph}
                      onChange={(e) => onChange(r.key, c.k, e.target.value)}
                    />
                  ) : (
                    <input
                      className="input"
                      id={id}
                      value={value}
                      placeholder={c.ph}
                      onChange={(e) => onChange(r.key, c.k, e.target.value)}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-sm" onClick={onAdd}>
          + {addLabel}
        </button>
      </div>
    </div>
  );
}

type TextPath = Exclude<keyof ExperienceDraft, CardPath>;

/**
 * 경험 추가·편집 (기획안 S2 11번, 목업 exp-edit): 상세의 모든 섹션을 칸별로 고친다.
 * 제목만 필수. 저장하면 확인됨이 된다. 빈 카드는 저장할 때 버린다.
 * 다른 경험을 열 때는 `key`로 새로 그린다.
 */
export function ExperienceEditScreen({
  experienceId,
  onSaved,
  onCancel,
  onDeleted,
  onHome,
}: {
  /** 고칠 경험. 없으면 새 경험. */
  experienceId?: number;
  onSaved: (experienceId: number) => void;
  onCancel: () => void;
  onDeleted: () => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const isNew = experienceId === undefined;
  const [draft, setDraft] = useState<ExperienceDraft | null>(null);
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [relatedChoices, setRelatedChoices] = useState<[string, string][]>([]);
  const [groups, setGroups] = useState<ExperienceGroup[]>([]);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      service.listReviews(),
      service.listExperiences(),
      service.listExperienceGroups(),
      experienceId === undefined ? Promise.resolve(null) : service.getExperience(experienceId),
    ])
      .then(([reviewList, experienceList, groupList, x]) => {
        if (!live) return;
        if (experienceId !== undefined && !x) {
          setMissing(true);
          return;
        }
        setReviews(reviewList.groups.flatMap((g) => g.reviews));
        setGroups(groupList);
        setRelatedChoices(relatedOptions(experienceList.items, experienceId));
        setDraft(toExperienceDraft(x));
      })
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, experienceId, handleSessionError]);

  // 새 카드를 더하면 그 카드의 첫 칸으로 초점을 옮긴다.
  const focusTarget = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = focusTarget.current;
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.focus();
    focusTarget.current = null;
  });
  // 새 경험은 제목부터.
  const focusedFirst = useRef(false);
  useLayoutEffect(() => {
    if (!draft || focusedFirst.current || !isNew) return;
    focusedFirst.current = true;
    document.getElementById("x-name")?.focus();
  }, [draft, isNew]);

  if (missing) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }
  const d = draft;

  const set = (k: TextPath, value: string) => setDraft((x) => x && { ...x, [k]: value });

  function setCard(path: CardPath, key: number, k: string, value: string) {
    setDraft((x) => {
      if (!x) return x;
      const rows = (x[path] as unknown as Card[]).map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, [k]: value };
        // 면접후기를 고르면 비어 있는 "어디서"를 채운다.
        if (path === "asked" && k === "reviewId" && value && !String(r.where).trim()) {
          const review = reviews.find((rv) => String(rv.id) === value);
          if (review) next.where = whereFromReview(review);
        }
        return next;
      });
      return { ...x, [path]: rows };
    });
  }
  function addCard(path: CardPath, firstField: string) {
    const row = NEW_EXPERIENCE_ROW[path]();
    setDraft((x) => x && { ...x, [path]: [...(x[path] as unknown as Card[]), row] });
    focusTarget.current = `xr-${path}-${row.key}-${firstField}`;
  }
  function removeCard(path: CardPath, key: number) {
    setDraft((x) => x && { ...x, [path]: (x[path] as unknown as Card[]).filter((r) => r.key !== key) });
  }
  const cards = (path: CardPath, unit: string, cols: Column[], addLabel: string) => (
    <CardsEditor
      path={path}
      rows={d[path] as unknown as Card[]}
      cols={cols}
      unit={unit}
      addLabel={addLabel}
      onChange={(key, k, v) => setCard(path, key, k, v)}
      onAdd={() => addCard(path, cols[0].k)}
      onRemove={(key) => removeCard(path, key)}
    />
  );

  const hint = experienceSaveHint(d);
  async function save() {
    if (hint) return;
    setSaving(true);
    try {
      const input = fromExperienceDraft(d);
      const saved =
        experienceId === undefined
          ? await service.createExperience(input)
          : await service.updateExperience(experienceId, input);
      toast("저장했어요");
      onSaved(saved.id);
    } catch (error) {
      setSaving(false);
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function remove() {
    if (experienceId === undefined) return;
    setBusy(true);
    try {
      await service.deleteExperience(experienceId);
      toast("경험을 삭제했어요");
      onDeleted();
    } catch (error) {
      setBusy(false);
      if (!handleSessionError(error)) toast("삭제하지 못했어요. 다시 시도해 주세요.");
    }
  }

  // ── 칸 ── (id는 목업과 같이 "x-" + 칸 이름)
  const fid = (path: string) => `x-${path}`;
  const field = (
    path: TextPath,
    label: string,
    help: string,
    ph = "",
    o: { req?: boolean; wide?: boolean; area?: boolean; sm?: boolean; month?: boolean } = {},
  ) => (
    <Field id={fid(path)} label={label} help={help || undefined} required={o.req} wide={o.wide}>
      {o.area ? (
        <textarea
          className={`textarea${o.sm ? " sm" : ""}`}
          id={fid(path)}
          value={d[path]}
          placeholder={ph}
          onChange={(e) => set(path, e.target.value)}
        />
      ) : (
        <input
          className={`input${o.month ? " mono" : ""}`}
          type={o.month ? "month" : undefined}
          id={fid(path)}
          value={d[path]}
          placeholder={ph}
          onChange={(e) => set(path, e.target.value)}
        />
      )}
    </Field>
  );
  const listField = (path: TextPath, label: string, help: string, ph: string) =>
    field(path, label, `${help ? `${help} · ` : ""}한 줄에 하나씩`, ph, { area: true, wide: true });

  const toc: { id: string; title: string }[] = [];
  const section = (id: string, title: string, intro: string, body: ReactNode) => {
    toc.push({ id, title });
    return (
      <section key={id} className="card jsec" id={`xe-${id}`} aria-label={title}>
        <div className="jsec-h">
          <h2>{title}</h2>
        </div>
        {intro && <p className="sec-intro">{intro}</p>}
        {body}
      </section>
    );
  };

  const body = [
    section(
      "basic",
      "기본 정보",
      "목록과 상세 화면 위쪽에 보여요.",
      <div className="row-fields">
        {field("name", "제목", "목록에 보이는 이름", "예: 주문 이벤트 스트림 재설계", { req: true, wide: true })}
        {field("project", "상위 프로젝트", "이 경험이 속한 큰 프로젝트. 없으면 비워 둬요", "예: 사내 하둡 → AWS 데이터 플랫폼 전환", {
          wide: true,
        })}
        {field("startedOn", "시작", "", "", { month: true })}
        {field("endedOn", "끝", "진행 중이면 비워 둬요", "", { month: true })}
        {field("org", "소속", "회사 · 팀, 또는 개인 프로젝트", "예: 미담플랫폼 · 데이터플랫폼팀")}
        {field("role", "역할", "내가 맡은 범위를 짧게", "예: 설계·구현 주도")}
        {field("tags", "태그", "쉼표로 구분. 검색에 써요", "예: 스트리밍, Kafka, 장애 대응", { wide: true })}
        <Field
          id={fid("groupId")}
          label="그룹"
          help="비슷한 경험끼리 묶어 경험 캘린더에서 붙여 보여요. 새 그룹은 캘린더의 [비슷한 경험 묶기]에서 만들어요"
          wide
        >
          <select className="select" id={fid("groupId")} value={d.groupId} onChange={(e) => set("groupId", e.target.value)}>
            <option value="">그룹 없음</option>
            {groups.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        {field(
          "linkKey",
          "공고분석 연결 이름",
          "공고분석의 근거 경험 태그에 이 글자가 들어 있으면 이 경험으로 연결돼요",
          "예: 주문이벤트-스트림재설계",
          { wide: true },
        )}
      </div>,
    ),
    section(
      "summary",
      "한 줄 요약",
      "목록과 상세 맨 위 상자에 보여요.",
      field("summary", "한 줄 요약", "무엇을 해서 무엇이 달라졌는지 한두 문장", "", { area: true, sm: true, wide: true }),
    ),
    section(
      "situation",
      "상황 · 과제",
      "면접에서 이 순서로 말하게 돼요. **굵게**로 강조할 수 있어요.",
      <div className="row-fields">
        {field("situation", "상황", "어떤 문제가 있었나. 규모를 숫자로", "", { area: true, wide: true })}
        {field(
          "scope",
          "본인 담당 범위",
          "큰 프로젝트라면 그중 내가 맡은 부분. 상황 아래 상자로 보여요",
          "예: 로그 수집 경로 이관 파트",
          { area: true, sm: true, wide: true },
        )}
        {field("task", "과제", "내가 해내야 했던 것", "", { area: true, wide: true })}
      </div>,
    ),
    section(
      "action",
      "행동",
      "내가 실제로 한 일을 번호 항목으로 나눠요. 항목마다 제목, 세부 내용, 회고·메모, 출처(면접 답변에서 추가 등)를 적어요.",
      <>
        {field("actionsIntro", "행동 머리말", "항목들이 어떻게 나뉘는지 한 줄 (선택)", "예: 1~2는 설계 단계, 3~4는 진행하면서 한 일", {
          area: true,
          sm: true,
          wide: true,
        })}
        {cards(
          "actions",
          "행동",
          [
            { k: "title", label: "제목", wide: true, ph: "예: 옛 경로와 새 경로를 2주 동안 같이 돌리기" },
            { k: "points", label: "세부 내용", help: "한 줄에 하나씩", area: true, wide: true },
            { k: "note", label: "회고 · 메모", help: "하지 않은 것, 다시 한다면 등. 상세에서 회색 상자로 보여요", area: true },
            { k: "source", label: "출처", help: "나중에 추가한 경우 어디서 나왔는지", ph: "예: ○○ 1차 면접 답변" },
          ],
          "행동 항목 추가",
        )}
      </>,
    ),
    section(
      "result",
      "결과",
      "내가 한 일의 결과와 팀 전체 성과를 나눠 적어요. 팀 성과를 내 것처럼 말하지 않게 도와줘요.",
      <div className="row-fields">
        {listField("resultMine", "내 기여 결과", "", "예: 이관 기간 동안 로그 유실 0건")}
        {listField("resultTeam", "팀 단위 성과", "", "예: 전체 이관을 일정 안에 끝냄")}
        {field("numbers", "수치", "숫자로 말할 수 있는 결과. 비워 두면 \"결과 수치 없음\"으로 표시돼요", "예: 최대 랙 6시간 → 15분", {
          wide: true,
        })}
      </div>,
    ),
    section(
      "appeal",
      "어필 포인트",
      "이 경험을 어떤 질문에 쓸지 정해 둬요.",
      <div className="row-fields">
        {field("appealMainUse", "주 용도", "이 경험을 대표로 쓸 질문", "예: 가장 자랑스러운 프로젝트")}
        {listField("appealQuestions", "이런 질문에 쓸 수 있어요", "", "예: 대규모 플랫폼 이관 경험")}
        {field("appealStrength", "강점 한 줄", "다른 경험보다 이게 나은 이유", "", { area: true, sm: true, wide: true })}
      </div>,
    ),
    section(
      "framing",
      "프레이밍 주의",
      "말할 때 조심할 것. 상세에서 주황 상자로 보여요.",
      listField("framing", "프레이밍 주의", "", "예: 비용 절감은 팀 성과다. 내 담당은 로그 수집 파트로 한정해서 말한다"),
    ),
    section(
      "asked",
      "면접에서 실제로 받은 질문",
      "이 경험으로 답했던 실제 질문이에요. 면접후기를 고르면 상세에서 그 후기로 바로 갈 수 있어요.",
      cards(
        "asked",
        "질문",
        [
          { k: "question", label: "질문", wide: true },
          {
            k: "reviewId",
            label: "면접후기",
            help: "고르면 회사·차수가 채워져요",
            options: reviews.map((r) => [String(r.id), reviewOptionLabel(r)]),
          },
          { k: "where", label: "어디서", help: "후기가 없으면 직접 적어요", ph: "예: ○○ 1차 면접" },
        ],
        "질문 추가",
      ),
    ),
    section(
      "qa",
      "예상 질문과 답변",
      "면접 대비용 예시예요. 답을 비워 두면 \"답변 작성 필요\"로 표시돼요.",
      cards(
        "qas",
        "질문",
        [
          { k: "question", label: "예상 질문", wide: true },
          { k: "answer", label: "답하는 방식", area: true, wide: true },
          { k: "caution", label: "주의", help: "이 답을 할 때 조심할 점", wide: true },
        ],
        "질문 추가",
      ),
    ),
    section(
      "related",
      "관련 경험",
      "이어지는 다른 경험이에요. 상세에서 바로 갈 수 있어요.",
      cards(
        "related",
        "관련 경험",
        [
          { k: "experienceId", label: "경험", options: relatedChoices },
          { k: "note", label: "어떻게 이어지나", wide: true },
        ],
        "관련 경험 추가",
      ),
    ),
    section(
      "missing",
      "보완 필요",
      "아직 기록이 없는 것을 적어 두면 목록에 \"보완 필요\"로 표시돼요.",
      listField("missing", "보완 필요", "", "예: 공통 모듈로 줄어든 팀 공수 (수치)"),
    ),
  ];

  return (
    <div className="rp jp">
      <button type="button" className="link back" onClick={onCancel}>
        ← {isNew ? "경험 목록으로" : "경험 상세로"}
      </button>
      <div className="ph">
        <div>
          <h1>{isNew ? "경험 추가" : "경험 편집"}</h1>
          <p>내가 직접 저장하면 "확인됨"이 돼요. 칸마다 상세 화면 어디에 보이는지 적어 뒀어요.</p>
        </div>
      </div>
      <nav className="toc" aria-label="편집할 섹션">
        {toc.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(`xe-${s.id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
          >
            {s.title}
          </button>
        ))}
      </nav>
      {body}
      <div className="rp-foot">
        {!isNew && (
          <button type="button" className="btn btn-text danger" onClick={() => setConfirmDelete(true)}>
            경험 삭제
          </button>
        )}
        <span className="spacer" />
        {hint && (
          <span className="hint" id="exp-save-hint">
            {hint}
          </span>
        )}
        <button type="button" className="btn" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!!hint || saving}>
          저장
        </button>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="경험을 삭제할까요?"
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>‘{d.name}’ 경험이 삭제돼요. 이 경험을 근거로 쓴 공고분석의 태그는 남지만 더는 연결되지 않아요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
