export type Mode = "AUTO" | "MANUAL" | "SAFE";

export interface FarmStatus {
  farmId: string;
  deviceId: string;
  farmName: string;
  plantName: string;
  online: boolean;
  mode: Mode;
  temperatureC: number;
  humidityPercent: number;
  lux: number;
  soilMoisturePercent: number;
  weatherValid: boolean;
  soilValid: boolean;
  lightOn: boolean;
  pumpOn: boolean;
  lightMinLux: number;
  lightTargetLux: number;
  moistureMinPercent: number;
  moistureTargetPercent: number;
  configVersion: number;
  lastTelemetryAt: string;
}

export interface HistoryPoint {
  at: string;
  temperatureC: number;
  humidityPercent: number;
  lux: number;
  soilMoisturePercent: number;
}

export interface FarmEvent {
  id: string;
  at: string;
  actuator: "LIGHT" | "PUMP" | "SYSTEM";
  action: string;
  reason: string;
}

export interface PlantRecommendation {
  plantName: string;
  summary: string;
  light: { minLux: number; targetLux: number; photoperiodHours: number };
  soil: { moistureMinPercent: number; moistureTargetPercent: number };
  temperature: { minC: number; maxC: number };
  humidity: { minPercent: number; maxPercent: number };
  careNotes: string[];
  sources: { title: string; url: string }[];
}
