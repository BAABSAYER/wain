"use client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const KEY = "wain.admin.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(KEY);
}

export function isAuthed(): boolean {
  return !!getToken();
}

export async function login(password: string): Promise<void> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? "Login failed");
  }
  const data = await res.json();
  setToken(data.token);
}

export function logout() {
  clearToken();
  if (typeof window !== "undefined") window.location.href = "/login";
}
