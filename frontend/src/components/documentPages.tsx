import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { paginate, parseDocument, type DocBlock, type Measured, type Pagination, type Span } from "@/lib/documents";

/**
 * 서류 글을 595×842 쪽으로 그린다. 편집기 옆 미리보기와 서버 PDF의 인쇄용 화면이 같은 이 컴포넌트를
 * 쓰므로 쪽 나눔이 같다. 블록 높이는 숨은 곳에서 재고, 쪽 채우기는 순수 함수(`paginate`)가 한다.
 */

export function Spans({ spans }: { spans: Span[] }): ReactNode {
  return spans.map((s, i) => {
    if (s.kind === "bold") return <strong key={i}>{s.text}</strong>;
    if (s.kind === "link") {
      return (
        <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">
          {s.text}
        </a>
      );
    }
    return s.text;
  });
}

/** 블록 하나. 늘 요소 하나를 돌려준다 (높이를 요소마다 잰다). */
export function BlockView({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "h1":
      return <h1><Spans spans={block.spans} /></h1>;
    case "h2":
      return <h2><Spans spans={block.spans} /></h2>;
    case "h3":
      return <h3><Spans spans={block.spans} /></h3>;
    case "p":
      return <p><Spans spans={block.spans} /></p>;
    case "note":
      return (
        <p className="note">
          {block.lines.map((line, i) => (
            <span key={i}>
              {i > 0 && <br />}
              <Spans spans={line} />
            </span>
          ))}
        </p>
      );
    case "li":
      return block.ordered ? (
        <ol start={block.number}>
          <li><Spans spans={block.spans} /></li>
        </ol>
      ) : (
        <ul>
          <li><Spans spans={block.spans} /></li>
        </ul>
      );
    case "table":
      return (
        <table>
          <thead>
            <tr>
              {block.header.map((cell, i) => (
                <th key={i}><Spans spans={cell} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i}><Spans spans={cell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "break":
      return <div hidden />;
  }
}

function outerHeight(el: Element): number {
  const style = getComputedStyle(el);
  return el.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
}

export interface PageLayout {
  pageCount: number;
  /** 한 쪽보다 높은 블록 수. */
  oversize: number;
  /** 글꼴이 다 불러와진 뒤의 값이다 (그 전에는 글꼴이 바뀌면 쪽 나눔도 바뀔 수 있다). */
  settled: boolean;
}

export function DocumentPages({
  body,
  fit = false,
  warn = false,
  onLayout,
}: {
  body: string;
  /** 부모 폭에 맞춰 줄인다 (미리보기). 인쇄용 화면은 실제 크기. */
  fit?: boolean;
  /** 한 쪽보다 긴 블록이 있으면 위에 경고를 보인다. */
  warn?: boolean;
  onLayout?: (layout: PageLayout) => void;
}) {
  const blocks = useMemo(() => parseDocument(body), [body]);
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // 쪽 나눔은 잰 때의 블록과 함께 들고 있는다: 글이 바뀐 직후 새 블록으로 옛 쪽 나눔을 그리지 않게.
  const [layout, setLayout] = useState<{ blocks: DocBlock[]; pagination: Pagination } | null>(null);
  const [settled, setSettled] = useState(typeof document === "undefined" || !document.fonts);
  const [zoom, setZoom] = useState(1);

  const measure = useCallback(() => {
    const root = measureRef.current;
    // 인쇄 모드에서는 숨겨 둔 곳이라 잴 수 없다: 이미 잰 쪽 나눔을 지킨다.
    if (!root || getComputedStyle(root).display === "none") return;
    const items: Measured[] = blocks.map((block, i) =>
      block.kind === "break"
        ? { height: 0, isBreak: true }
        : {
            height: outerHeight(root.children[i]),
            keepWithNext: block.kind === "h1" || block.kind === "h2" || block.kind === "h3",
          },
    );
    setLayout({ blocks, pagination: paginate(items) });
  }, [blocks]);

  useLayoutEffect(measure, [measure]);

  // 글꼴이 불러와지면 글자 폭이 바뀌어 줄 수가 달라질 수 있으니 다시 잰다.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let live = true;
    // 이 글에 쓰는 글자의 글꼴 조각을 직접 불러와 기다린다 (그냥 `fonts.ready`만 기다리면 글꼴 요청이 시작되기
    // 전에 이미 끝난 것으로 보일 수 있다). 글꼴이 없거나 못 받아도 끝나는 것은 같다.
    const loads = [400, 700].map((weight) => document.fonts.load(`${weight} 10px "IBM Plex Sans KR"`, body).catch(() => []));
    Promise.all(loads)
      .then(() => document.fonts.ready)
      .then(() => {
        if (!live) return;
        measure();
        setSettled(true);
      });
    const again = () => measure();
    document.fonts.addEventListener?.("loadingdone", again);
    return () => {
      live = false;
      document.fonts.removeEventListener?.("loadingdone", again);
    };
  }, [measure, body]);

  useEffect(() => {
    if (!fit) return;
    const parent = hostRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const width = parent.clientWidth - 24;
      setZoom(width > 0 ? Math.min(1, width / 595) : 1);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [fit]);

  const pagination = layout?.pagination ?? null;
  const pageCount = pagination?.pages.length ?? 0;
  const oversize = pagination?.oversize.length ?? 0;
  // 부모가 onLayout을 매번 새로 만들어도 다시 부르지 않게 ref로 들고 있는다.
  const latest = useRef(onLayout);
  useEffect(() => {
    latest.current = onLayout;
  });
  useEffect(() => {
    if (pagination) latest.current?.({ pageCount, oversize, settled });
  }, [pagination, pageCount, oversize, settled]);

  return (
    <div ref={hostRef}>
      {warn && oversize > 0 && (
        <p className="pv-warn" role="alert">
          이 문단이 한 쪽보다 길어요. 나눠 쓰면 좋아요
        </p>
      )}
      {/* 높이를 재는 숨은 곳: 쪽 안과 같은 폭과 같은 스타일. */}
      <div className="pg-in pg-measure" ref={measureRef} aria-hidden="true">
        {blocks.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </div>
      <div className="pv" data-pages={pageCount || undefined} style={fit ? ({ zoom } as React.CSSProperties) : undefined}>
        {pagination?.pages.map((indexes, p) => (
          <div className="pg" key={p} data-page={p + 1}>
            <div className="pg-in">
              {indexes.map((i) => (
                <BlockView key={i} block={layout!.blocks[i]} />
              ))}
            </div>
            <span className="pg-no">
              {p + 1} / {pageCount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
