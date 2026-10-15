import { useEffect, useState } from "react";
import { useService, type AuthConfig } from "@/services";
import { icons } from "./icons";

/**
 * The login screen (tech plan S2 1번). Kakao login comes with deployment;
 * locally the server offers the fake login, "이 PC에서 바로 시작".
 */
export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const service = useService();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    service
      .getAuthConfig()
      .then((c) => live && setConfig(c))
      .catch(() => live && setError("서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요."));
    return () => {
      live = false;
    };
  }, [service]);

  async function devLogin() {
    setBusy(true);
    setError("");
    try {
      await service.devLogin();
      onLoggedIn();
    } catch {
      setError("로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <div className="solo">
      <div className="card solo-card">
        <div>
          <div className="brand">SaveMe</div>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            지원현황, 공고와 분석, 경험, 면접후기까지 한곳에서 정리해요
          </p>
        </div>
        {config?.devLogin && (
          <button type="button" className="btn btn-primary" style={{ height: 48 }} onClick={devLogin} disabled={busy}>
            이 PC에서 바로 시작
          </button>
        )}
        <button
          type="button"
          className="kakao-btn"
          disabled
          aria-describedby="kakao-later"
          style={{ opacity: 0.55, cursor: "not-allowed" }}
        >
          {icons.kakao}카카오 로그인
        </button>
        <p className="fine" id="kakao-later" style={{ margin: 0 }}>
          카카오 로그인은 서비스를 배포할 때 열려요.
        </p>
        {error && (
          <p className="hint-err" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
