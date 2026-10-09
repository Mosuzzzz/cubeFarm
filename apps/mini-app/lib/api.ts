import { sampleEvents, sampleHistory, sampleStatus } from "./sample";
import type { FarmEvent, FarmStatus, HistoryPoint, Mode, PlantRecommendation } from "./types";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const statusCacheKey = "smartfarm:last-status";
let lineIDToken: string | null = null;

export function setLineIDToken(token: string | null) { lineIDToken = token; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(lineIDToken ? { Authorization: `Bearer ${lineIDToken}` } : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `API ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getStatus(): Promise<{ data: FarmStatus; sample: boolean }> {
  try {
    const data = await request<FarmStatus>("/api/v1/farms/demo-farm/status");
    if (typeof window !== "undefined") localStorage.setItem(statusCacheKey, JSON.stringify(data));
    return { data, sample: false };
  } catch {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(statusCacheKey);
        if (cached) return { data: { ...JSON.parse(cached) as FarmStatus, online: false }, sample: true };
      } catch { /* Ignore an invalid cache and use the bundled demo below. */ }
    }
    return { data: sampleStatus, sample: true };
  }
}

export async function getHistory(): Promise<{ history: HistoryPoint[]; events: FarmEvent[] }> {
  try {
    const [history, events] = await Promise.all([
      request<HistoryPoint[]>("/api/v1/farms/demo-farm/history?range=24h"),
      request<FarmEvent[]>("/api/v1/farms/demo-farm/events?range=24h")
    ]);
    return { history, events };
  } catch { return { history: sampleHistory, events: sampleEvents }; }
}

export const setMode = (mode: Mode) => request("/api/v1/farms/demo-farm/mode", { method: "POST", body: JSON.stringify({ mode }) });
export const setLight = (on: boolean) => request("/api/v1/farms/demo-farm/light", { method: "POST", body: JSON.stringify({ on }) });
export const water = (on: boolean) => request("/api/v1/farms/demo-farm/water", { method: "POST", body: JSON.stringify({ on }) });
export const recommendPlant = (plantName: string) => request<PlantRecommendation>("/api/v1/plants/recommend", { method: "POST", body: JSON.stringify({ plantName }) });
export const applyPlantProfile = (recommendation: PlantRecommendation) => request<{ accepted: boolean; version: number }>("/api/v1/farms/demo-farm/plant-profile/apply", { method: "POST", body: JSON.stringify(recommendation) });
