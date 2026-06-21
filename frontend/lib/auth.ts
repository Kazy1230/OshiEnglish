export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("yt_token");
}
export function setToken(token: string) {
  localStorage.setItem("yt_token", token);
}
export function clearToken() {
  localStorage.removeItem("yt_token");
}
export function isLoggedIn(): boolean {
  return !!getToken();
}

export type Role = "learner" | "creator" | "admin";

/** roleが許可ロール一覧に含まれるかを判定する（学習者/クリエイター/管理者のロールベースガード用） */
export function hasRole(role: string | undefined | null, allowed: Role[]): boolean {
  return !!role && (allowed as string[]).includes(role);
}

/** role='creator' または 'admin' であればクリエイターダッシュボード/スタジオ系画面にアクセス可能 */
export function isCreatorOrAbove(role: string | undefined | null): boolean {
  return hasRole(role, ["creator", "admin"]);
}
