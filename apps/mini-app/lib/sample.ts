import type { FarmEvent, FarmStatus, HistoryPoint } from "./types";

export const sampleStatus: FarmStatus = {
  farmId: "demo-farm",
  deviceId: "farm-001",
  farmName: "สวนหลังบ้าน",
  plantName: "มะเขือเทศเชอร์รี",
  online: true,
  mode: "AUTO",
  temperatureC: 29.4,
  humidityPercent: 68,
  lux: 18450,
  soilMoisturePercent: 42,
  weatherValid: true,
  soilValid: true,
  lightOn: true,
  pumpOn: false,
  lightMinLux: 15000,
  lightTargetLux: 22000,
  moistureMinPercent: 35,
  moistureTargetPercent: 50,
  configVersion: 1,
  lastTelemetryAt: new Date().toISOString()
};

export const sampleHistory: HistoryPoint[] = Array.from({ length: 12 }, (_, index) => ({
  at: new Date(Date.now() - (11 - index) * 60 * 60 * 1000).toISOString(),
  temperatureC: 27 + Math.sin(index / 2) * 2.4,
  humidityPercent: 69 - Math.sin(index / 2) * 7,
  lux: Math.max(900, Math.round(22000 * Math.sin((index / 11) * Math.PI))),
  soilMoisturePercent: 52 - index * 1.4 + (index === 8 ? 7 : 0)
}));

export const sampleEvents: FarmEvent[] = [
  { id: "e1", at: new Date(Date.now() - 18 * 60000).toISOString(), actuator: "LIGHT", action: "เปิดไฟ", reason: "แสงต่ำกว่าเกณฑ์" },
  { id: "e2", at: new Date(Date.now() - 3 * 3600000).toISOString(), actuator: "PUMP", action: "รดน้ำ 5 วินาที", reason: "ความชื้นในดินต่ำ" },
  { id: "e3", at: new Date(Date.now() - 7 * 3600000).toISOString(), actuator: "SYSTEM", action: "ใช้ค่าตั้งต้นใหม่", reason: "Owner ยืนยันโปรไฟล์พืช" }
];
