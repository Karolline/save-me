import type { User } from "@/services";
import { icons } from "./icons";

/**
 * 계정 설정 (tech plan S2 8번). Withdrawal comes with Kakao login, since it
 * also unlinks the Kakao account.
 */
export function SettingsScreen({
  user,
  onLogout,
  onLogoutAll,
}: {
  user: User;
  onLogout: () => void;
  onLogoutAll: () => void;
}) {
  const kakao = user.provider === "kakao";
  return (
    <>
      <div className="ph">
        <div>
          <h1>계정 설정</h1>
        </div>
      </div>
      <div className="settings">
        <section className="card scard">
          <h2>로그인 정보</h2>
          <div className="who">
            {kakao ? (
              <span className="kk">{icons.kakao}</span>
            ) : (
              <span className="avatar" style={{ width: 36, height: 36, borderRadius: 10 }} aria-hidden="true">
                {user.nickname.slice(0, 1)}
              </span>
            )}
            <div>
              <div style={{ fontWeight: 600 }}>{user.nickname}</div>
              <div className="hint">{kakao ? "카카오로 로그인 중" : "이 PC 전용 로그인 중"}</div>
            </div>
          </div>
        </section>
        <section className="card scard">
          <h2>로그아웃</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={onLogout}>
              로그아웃
            </button>
            <button type="button" className="btn" onClick={onLogoutAll}>
              모든 기기에서 로그아웃
            </button>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            다른 기기에서 로그인했던 기록까지 모두 끊으려면 "모든 기기에서 로그아웃"을 누르세요.
          </p>
        </section>
      </div>
    </>
  );
}

export function NotFoundScreen({ onHome }: { onHome: () => void }) {
  return (
    <div className="card nf">
      <span className="mono">404</span>
      <h1>페이지를 찾을 수 없어요</h1>
      <p>주소가 바뀌었거나 삭제된 페이지예요.</p>
      <button type="button" className="btn btn-primary" onClick={onHome}>
        지원현황으로
      </button>
    </div>
  );
}
