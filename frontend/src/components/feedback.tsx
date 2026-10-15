import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Toasts: a short message bottom right ("저장했어요") or top center (session expired). */

interface Toast {
  text: string;
  position: "br" | "top";
}

type ShowToast = (text: string, position?: Toast["position"]) => void;

const ToastContext = createContext<ShowToast>(() => {});

export const TOAST_MS = 2400;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback<ShowToast>((text, position = "br") => {
    setToast({ text, position });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.position}`} role="status">
          {toast.text}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

/** A centered confirmation dialog. Escape or the backdrop cancels. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscape(onCancel);
  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onCancel} />
      <div className="card modal" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <div className="row-end">
          <button type="button" className="btn" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Calls `onEscape` when Escape is pressed. */
export function useEscape(onEscape: () => void) {
  const latest = useRef(onEscape);
  useEffect(() => {
    latest.current = onEscape;
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
