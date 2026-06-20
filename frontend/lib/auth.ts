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

export type Role = "learner" | "instructor" | "admin";

/** roleが許可ロール一覧に含まれるかを判定する（学習者/講師/管理者のロールベースガード用） */
export function hasRole(role: string | undefined | null, allowed: Role[]): boolean {
  return !!role && (allowed as string[]).includes(role);
}

/** role='instructor' または 'admin' であれば講師ダッシュボード/スタジオ系画面にアクセス可能 */
export function isInstructorOrAbove(role: string | undefined | null): boolean {
  return hasRole(role, ["instructor", "admin"]);
}
