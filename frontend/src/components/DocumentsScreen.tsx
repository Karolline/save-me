import { useEffect, useState } from "react";
import { useService, type DocumentGroupSummary } from "@/services";
import { DocumentGroupDialog } from "./DocumentGroupDialog";
import { useSessionErrors } from "./session";

/**
 * 지원서류 목록 (완료분 기획안 S2 13번, 목업 docs): 묶음마다 한 줄, 회사와 작성날짜만. 최근 날짜가 위.
 * [+ 새 묶음]은 공고분석에서 고르거나 회사·날짜를 적는다.
 */
export function DocumentsScreen({ onOpen }: { onOpen: (groupId: number) => void }) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const [groups, setGroups] = useState<DocumentGroupSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    service
      .listDocumentGroups()
      .then((list) => live && setGroups(list))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, handleSessionError]);

  const add = (
    <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
      + 새 묶음
    </button>
  );

  return (
    <>
      <div className="ph">
        <div>
          <h1>지원서류</h1>
          <p>회사마다 그날 쓴 이력서·경력기술서·포트폴리오를 한 묶음으로 모아 둬요.</p>
        </div>
        {add}
      </div>
      {failed ? (
        <div className="card err" role="alert">
          <h2>불러오지 못했어요</h2>
          <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
        </div>
      ) : !groups ? (
        <div className="card skel" aria-label="불러오는 중" aria-busy="true">
          <div style={{ width: "50%" }} />
          <div style={{ width: "70%" }} />
        </div>
      ) : groups.length === 0 ? (
        <div className="card empty">
          <h2>아직 만든 지원서류가 없어요</h2>
          <p>지원할 회사를 고르면 그 회사용 서류 묶음이 생겨요.</p>
          {add}
        </div>
      ) : (
        <div className="card rlist big">
          {groups.map((g) => (
            <button type="button" key={g.id} className="rrow dgrow" onClick={() => onOpen(g.id)}>
              <span className="rmain">
                <b>{g.company}</b>
              </span>
              <span className="mono rdate">{g.writtenOn}</span>
            </button>
          ))}
        </div>
      )}
      {adding && (
        <DocumentGroupDialog
          onSaved={(group) => {
            setAdding(false);
            onOpen(group.id);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </>
  );
}
