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
