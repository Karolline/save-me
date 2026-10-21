import { useEffect, useState } from "react";
import { useService, type DocumentType } from "@/services";
import { DocumentPages, type PageLayout } from "./documentPages";

/**
 * 서버가 PDF를 만들 때 헤드리스 Chromium으로 여는 인쇄용 화면 (`/print/documents/:groupId/:type`).
 * 사이드바 없이 쪽만, 미리보기와 같은 `DocumentPages`가 그린다. 로그인한 세션(쿠키)으로만 열린다.
 * 쪽과 글꼴이 다 준비되면 `data-print-ready="true"`, 못 열면 `data-print-error="true"`가 붙는다
 * (서버가 이것을 기다린다).
 */
export function DocumentPrintScreen({ groupId, type }: { groupId: number; type: DocumentType }) {
  const service = useService();
  const [body, setBody] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState<PageLayout | null>(null);

  useEffect(() => {
    let live = true;
    service
      .getDocument(groupId, type)
      .then((found) => live && setBody(found ? found.body : null))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [service, groupId, type]);

  if (failed || body === null) {
    return (
      <div className="print-msg" data-print-error="true">
        서류를 열지 못했어요.
      </div>
    );
  }
  if (body === undefined) return <div className="print-msg">불러오는 중</div>;
  return (
    <div className="print-root" data-print-ready={layout?.settled ? "true" : "false"} data-page-count={layout?.pageCount}>
      <DocumentPages body={body} onLayout={setLayout} />
    </div>
  );
}
