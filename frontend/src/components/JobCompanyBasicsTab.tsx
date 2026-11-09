import { useRef, useState } from "react";
import { useService, type CompanyQna, type Job } from "@/services";
import { useToast } from "./feedback";
import { Field } from "./JobEditScreen";
import { useSessionErrors } from "./session";

interface Row {
  key: number;
  question: string;
  answer: string;
}

/**
 * 공고분석 상세의 [회사 기본] 탭: 직접 조사한 글과 궁금한 점(질문과 답)을 탭 안에서 바로 적고 고친다.
 * 분석 한 건마다 따로 저장되고 사람 확인은 바꾸지 않는다. 다른 탭으로 가면 편집 중인 것은 버려진다.
 */
export function JobCompanyBasicsTab({ job, onSaved }: { job: Job; onSaved: (job: Job) => void }) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [missing, setMissing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(1);
  const questionInputs = useRef(new Map<number, HTMLInputElement>());
  // 새로 더한 줄의 질문 칸이 그려질 때 포커스를 준다.
  const focusOnMount = useRef<number | null>(null);

  const empty = !job.companyNote.trim() && job.companyQna.length === 0;

  function start() {
    setNote(job.companyNote);
    setRows(job.companyQna.map((q) => ({ key: nextKey.current++, ...q })));
    setMissing(null);
    setEditing(true);
  }

  function change(key: number, changes: Partial<Row>) {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...changes } : r)));
    if (missing === key && changes.question?.trim()) setMissing(null);
  }

  function add() {
    const key = nextKey.current++;
    focusOnMount.current = key;
    setRows((all) => [...all, { key, question: "", answer: "" }]);
  }

  async function save() {
    const kept: CompanyQna[] = [];
    for (const r of rows) {
      const question = r.question.trim();
      if (!question) {
        if (r.answer.trim()) {
          setMissing(r.key);
          questionInputs.current.get(r.key)?.focus();
          return;
        }
        continue;
      }
      kept.push({ question, answer: r.answer });
    }
    setSaving(true);
    try {
      const saved = await service.setJobCompanyBasics(job.id, {
        companyNote: note.trim() ? note : "",
        companyQna: kept,
      });
      onSaved(saved);
      setEditing(false);
      toast("회사 기본을 저장했어요");
    } catch (error) {
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form
        className="cb-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <section className="card jsec" aria-label="조사 글 입력">
          <Field id="cb-note" label="조사한 내용" help="회사 구조, 사업, 역사처럼 조사한 것을 자유롭게 적어요.">
            <textarea className="textarea cb-note" id="cb-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </section>
        <section className="card jsec" aria-label="질문 입력">
          <div className="jsec-h">
            <h2>궁금한 점</h2>
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className="cb-row" role="group" aria-label={`질문 ${i + 1} 편집`}>
              <div className="cb-row-h">
                <span className="qno mono">Q{i + 1}</span>
                <input
                  className="input"
                  aria-label={`질문 ${i + 1}`}
                  aria-invalid={missing === r.key}
                  placeholder="궁금한 점"
                  value={r.question}
                  ref={(el) => {
                    if (el) {
                      questionInputs.current.set(r.key, el);
                      if (focusOnMount.current === r.key) {
                        focusOnMount.current = null;
                        el.focus();
                      }
                    }
                    else questionInputs.current.delete(r.key);
                  }}
                  onChange={(e) => change(r.key, { question: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-text danger"
                  aria-label={`질문 ${i + 1} 삭제`}
                  onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
                >
                  삭제
                </button>
              </div>
              {missing === r.key && (
                <p className="cb-err" role="alert">
                  질문을 적어 주세요
                </p>
              )}
              <textarea
                className="textarea sm"
                aria-label={`답 ${i + 1}`}
                placeholder="아직 모르면 비워 두세요"
                value={r.answer}
                onChange={(e) => change(r.key, { answer: e.target.value })}
              />
            </div>
          ))}
          <div>
            <button type="button" className="btn btn-sm" onClick={add}>
              + 질문 추가
            </button>
          </div>
        </section>
        <div className="cb-actions">
          <button type="button" className="btn" disabled={saving} onClick={() => setEditing(false)}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            저장
          </button>
        </div>
      </form>
    );
  }

  if (empty) {
    return (
      <div className="card tr-empty">
        아직 회사 기본을 적지 않았어요.
        <br />
        회사에 대해 조사한 내용과 궁금한 점을 적어 두세요.
        <div className="cb-empty-act">
          <button type="button" className="btn btn-primary" onClick={start}>
            적기
          </button>
        </div>
      </div>
    );
  }

  const answered = job.companyQna.filter((q) => q.answer.trim()).length;
  return (
    <>
      <div className="cb-bar">
        <button type="button" className="btn" onClick={start}>
          편집
        </button>
      </div>
      {job.companyNote.trim() && (
        <section className="card jsec" aria-label="조사한 내용">
          <div className="jsec-h">
            <h2>조사한 내용</h2>
          </div>
          <p className="para pre">{job.companyNote}</p>
        </section>
      )}
      {job.companyQna.length > 0 && (
        <section className="card jsec" aria-label="궁금한 점">
          <div className="jsec-h">
            <h2>궁금한 점</h2>
            <span className="hint">
              답 {answered} / 전체 {job.companyQna.length}
            </span>
          </div>
          <div className="qlist">
            {job.companyQna.map((q, i) => (
              <section key={i} className="qgroup view" aria-label={`질문 ${i + 1}`}>
                <div className="qv-h">
                  <span className="qno mono">Q{i + 1}</span>
                  <b className="qv-q">{q.question}</b>
                </div>
                {q.answer.trim() ? (
                  <p className="ro-text cb-a">{q.answer}</p>
                ) : (
                  <p className="hint cb-a">아직 답을 못 찾았어요</p>
                )}
              </section>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
