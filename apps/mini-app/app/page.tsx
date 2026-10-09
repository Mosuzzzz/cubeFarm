"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import { Activity, ArrowLeft, Check, CloudSun, Droplets, ExternalLink, History, Leaf, Lightbulb, Search, Settings2, Sprout, Thermometer, WifiOff } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { applyPlantProfile, getHistory, getStatus, recommendPlant, setLight, setLineIDToken, setMode, water } from "@/lib/api";
import type { FarmEvent, FarmStatus, HistoryPoint, Mode, PlantRecommendation } from "@/lib/types";

type Tab = "home" | "history" | "plant" | "setup" | "settings";
type PlantSetupDraft = { plantName: string; lightMinLux: string; lightTargetLux: string; moistureMinPercent: string; moistureTargetPercent: string };

const number = new Intl.NumberFormat("th-TH");

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  return `${Math.floor(minutes / 60)} ชม. ที่แล้ว`;
}

function Gauge({ value, min, target, tone }: { value: number; min: number; target: number; tone: "sun" | "water" }) {
  const max = Math.max(target * 1.25, value * 1.1);
  const position = Math.min(100, (value / max) * 100);
  const minPosition = Math.min(100, (min / max) * 100);
  const targetPosition = Math.min(100, (target / max) * 100);
  return (
    <div className={`gauge ${tone}`} aria-label={`ค่าปัจจุบัน ${value} ค่าเริ่ม ${min} เป้าหมาย ${target}`}>
      <span className="gauge-fill" style={{ width: `${position}%` }} />
      <span className="gauge-mark" style={{ left: `${minPosition}%` }} />
      <span className="gauge-mark target" style={{ left: `${targetPosition}%` }} />
    </div>
  );
}

function Metric({ icon, label, value, unit, note, children }: { icon: React.ReactNode; label: string; value: string; unit: string; note: string; children?: React.ReactNode }) {
  return (
    <section className="metric">
      <div className="metric-label">{icon}<span>{label}</span></div>
      <div className="metric-value"><strong>{value}</strong><span>{unit}</span></div>
      {children}
      <p>{note}</p>
    </section>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("home");
  const [status, setStatus] = useState<FarmStatus | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [events, setEvents] = useState<FarmEvent[]>([]);
  const [sample, setSample] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [lineReady, setLineReady] = useState(false);
  const [setupRecommendation, setSetupRecommendation] = useState<PlantRecommendation | null>(null);
  const [setupDraft, setSetupDraft] = useState<PlantSetupDraft | null>(null);

  useEffect(() => {
    let refreshTimer: number | undefined;
    async function initialize() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (liffId) {
        const { default: liff } = await import("@line/liff");
        await liff.init({ liffId, withLoginOnExternalBrowser: true });
        if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); return; }
        setLineIDToken(liff.getIDToken());
        setLineReady(true);
      }
      const hashTabs: Record<string, Tab> = { "#overview": "home", "#watering": "home", "#grow-light": "home", "#history": "history", "#plant": "plant", "#setup": "setup", "#settings": "settings" };
      if (hashTabs[window.location.hash]) setTab(hashTabs[window.location.hash]);
      const [current, historical] = await Promise.all([getStatus(), getHistory()]);
      setStatus(current.data); setSample(current.sample); setHistory(historical.history); setEvents(historical.events);
      refreshTimer = window.setInterval(async () => {
        const latest = await getStatus();
        setStatus(latest.data); setSample(latest.sample);
      }, 5000);
    }
    initialize().catch(() => setNotice("เริ่ม LINE MINI App ไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่จาก LINE"));
    return () => { if (refreshTimer) window.clearInterval(refreshTimer); };
  }, []);

  const chartData = useMemo(() => history.map((point) => ({
    ...point,
    time: new Date(point.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
  })), [history]);

  async function act(key: string, action: () => Promise<unknown>, success: string, optimistic?: () => void) {
    setBusy(key); setNotice("");
    try { if (!sample) await action(); optimistic?.(); setNotice(success); }
    catch { setNotice("ส่งคำสั่งไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"); }
    finally { setBusy(null); }
  }

  async function handleWater() {
    const turnOn = !(status?.pumpOn ?? false);
    setBusy("water"); setNotice("");
    try {
      if (!sample) await water(turnOn);
      setStatus((current) => current ? { ...current, pumpOn: turnOn } : current);
      setNotice(turnOn ? "เปิดปั๊มแล้ว กดปุ่มอีกครั้งเพื่อปิด" : "ปิดปั๊มแล้ว");
    } catch {
      setNotice("ส่งคำสั่งไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
    } finally { setBusy(null); }
  }

  function openPlantSetup(recommendation: PlantRecommendation) {
    setSetupRecommendation(recommendation);
    setSetupDraft({
      plantName: recommendation.plantName,
      lightMinLux: String(recommendation.light.minLux),
      lightTargetLux: String(recommendation.light.targetLux),
      moistureMinPercent: String(recommendation.soil.moistureMinPercent),
      moistureTargetPercent: String(recommendation.soil.moistureTargetPercent)
    });
    setNotice("");
    setTab("setup");
  }

  function handleProfileApplied(recommendation: PlantRecommendation, version: number) {
    setStatus((current) => current ? {
      ...current,
      plantName: recommendation.plantName,
      lightMinLux: recommendation.light.minLux,
      lightTargetLux: recommendation.light.targetLux,
      moistureMinPercent: recommendation.soil.moistureMinPercent,
      moistureTargetPercent: recommendation.soil.moistureTargetPercent,
      configVersion: version
    } : current);
    setNotice(`ESP32 รับค่าดูแลพืชแล้ว · เวอร์ชัน ${version}`);
  }

  if (!status) return <main className="loading"><Sprout size={34} /><p>กำลังอ่านค่าจากแปลง…</p></main>;

  return (
    <main className="shell">
      <aside className="sidebar">
        <a className="brand" href="#main" aria-label="หน้าหลัก"><span><Image src="/logo.png" alt="Logo" width={96} height={96} priority /></span></a>
        <div className="farm-selector"><span><Sprout size={17} /></span><div><small>แปลงที่กำลังดู</small><strong>{status.farmName}</strong></div></div>
        <nav className="side-nav" aria-label="เมนูหลัก">
          {[
            ["home", Sprout, "ภาพรวม"], ["history", History, "ประวัติ"], ["plant", Leaf, "ค้นหาพืช"], ["settings", Settings2, "ตั้งค่า"]
          ].map(([key, Icon, label]) => <button key={key as string} className={tab === key || (key === "plant" && tab === "setup") ? "active" : ""} onClick={() => setTab(key as Tab)}><Icon size={19} /><span>{label as string}</span></button>)}
        </nav>
        <div className="sidebar-footer"><span className={status.online ? "device-dot online" : "device-dot"} /><div><strong>{status.online ? "ระบบพร้อมทำงาน" : "อุปกรณ์ออฟไลน์"}</strong><small>{status.deviceId}</small></div></div>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div className="breadcrumb"><Image className="topbar-logo" src="/logo.png" alt="" width={44} height={44} priority /><strong>{tab === "home" ? "ภาพรวม" : tab === "history" ? "ประวัติ" : tab === "settings" ? "ตั้งค่า" : "พืช"}</strong></div>
          <div className="topbar-actions">
            <div className={`connection ${status.online ? "online" : "offline"}`}>
              <span className="status-dot" />{status.online ? "Operational" : "Offline"}
            </div>
            {process.env.NEXT_PUBLIC_LIFF_ID && <span className="line-session" title="ยืนยันตัวตนด้วย LINE แล้ว">{lineReady ? "LINE ✓" : "LINE…"}</span>}
          </div>
        </header>

        <div id="main" className="content">
        {sample && <div className="sample-note"><Activity size={16} />โหมดตัวอย่าง — เชื่อม API แล้วข้อมูลจริงจะแทนที่อัตโนมัติ</div>}
        {!status.online && !sample && <div className="offline-note"><WifiOff size={16} />อุปกรณ์ออฟไลน์ — ปิดคำสั่งจากระบบคลาวด์ชั่วคราว แต่ AUTO บน ESP32 ยังทำงานด้วยค่าล่าสุด</div>}
        {notice && <div className="toast" role="status">{notice}</div>}

        {tab === "home" && <div className="home-view">
          <section className="farm-heading">
            <div>
              <p>{status.farmName}</p>
              <h1>{status.plantName}</h1>
              <span>อัปเดต {timeAgo(status.lastTelemetryAt)}</span>
            </div>
            <div className="mode-switch" aria-label="โหมดการทำงาน">
              {(["AUTO", "MANUAL", "SAFE"] as Mode[]).map((mode) => (
                <button key={mode} className={status.mode === mode ? "active" : ""} disabled={busy === "mode" || (!status.online && !sample)}
                  onClick={() => act("mode", () => setMode(mode), `เปลี่ยนเป็นโหมด ${mode} แล้ว`, () => setStatus({ ...status, mode }))}>{mode}</button>
              ))}
            </div>
          </section>

          <section className="environment" aria-label="สภาพแวดล้อมล่าสุด">
            <Metric icon={<Thermometer />} label="อุณหภูมิ" value={status.weatherValid ? status.temperatureC.toFixed(1) : "—"} unit={status.weatherValid ? "°C" : ""} note={status.weatherValid ? "ข้อมูลจาก ESP32" : "เซนเซอร์อากาศไม่มีข้อมูล"} />
            <Metric icon={<CloudSun />} label="ความชื้นอากาศ" value={status.weatherValid ? number.format(status.humidityPercent) : "—"} unit={status.weatherValid ? "%" : ""} note={status.weatherValid ? "ข้อมูลจาก ESP32" : "เซนเซอร์อากาศไม่มีข้อมูล"} />
            <Metric icon={<Lightbulb />} label="แสง" value={status.weatherValid ? number.format(status.lux) : "—"} unit={status.weatherValid ? "lux" : ""} note={status.weatherValid ? `เปิดที่ ${number.format(status.lightMinLux)} · เป้าหมาย ${number.format(status.lightTargetLux)}` : "เซนเซอร์แสงไม่มีข้อมูล"}>
              {status.weatherValid && <Gauge value={status.lux} min={status.lightMinLux} target={status.lightTargetLux} tone="sun" />}
            </Metric>
            <Metric icon={<Droplets />} label="ความชื้นในดิน" value={status.soilValid ? number.format(status.soilMoisturePercent) : "—"} unit={status.soilValid ? "%" : ""} note={status.soilValid ? `รดน้ำต่ำกว่า ${status.moistureMinPercent}% · เป้าหมาย ${status.moistureTargetPercent}%` : "เซนเซอร์ดินไม่พร้อม · ระงับปั๊ม AUTO"}>
              {status.soilValid && <Gauge value={status.soilMoisturePercent} min={status.moistureMinPercent} target={status.moistureTargetPercent} tone="water" />}
            </Metric>
          </section>

          <section className="control-strip">
            <div className="control-copy">
              <span>อุปกรณ์ในแปลง</span>
              <h2>ควบคุมอุปกรณ์ในโหมด MANUAL</h2>
            </div>
            <div className="actuator">
              <span className={`lamp ${status.lightOn ? "on" : ""}`}><Lightbulb /></span>
              <div><strong>ไฟปลูก</strong><small>{status.lightOn ? "กำลังเปิด" : "ปิดอยู่"}</small></div>
              <button disabled={status.mode !== "MANUAL" || busy === "light" || (!status.online && !sample)} onClick={() => act("light", () => setLight(!status.lightOn), status.lightOn ? "ปิดไฟแล้ว" : "เปิดไฟแล้ว", () => setStatus({ ...status, lightOn: !status.lightOn }))}>{status.lightOn ? "ปิด" : "เปิด"}</button>
            </div>
            <div className="actuator">
              <span className={`pump ${status.pumpOn ? "on" : ""}`}><Droplets /></span>
              <div><strong>ปั๊มน้ำ</strong><small>{status.pumpOn ? "กำลังทำงาน · กดเพื่อปิด" : "ปิดอยู่ · กดเพื่อเปิด"}</small></div>
              <button className="water-button" aria-pressed={status.pumpOn} disabled={busy === "water" || status.mode !== "MANUAL" || (!status.online && !sample)} onClick={handleWater}>{busy === "water" ? "กำลังส่งคำสั่ง…" : status.pumpOn ? "ปิดปั๊ม" : "เปิดปั๊ม"}</button>
            </div>
          </section>

          <section className="recent">
            <div className="section-title"><div><span>รายการล่าสุด</span><h2>เกิดอะไรขึ้นในแปลง</h2></div><button onClick={() => setTab("history")}>ดูทั้งหมด</button></div>
            <EventList events={events.slice(0, 3)} />
          </section>
        </div>}

        {tab === "history" && <HistoryView data={chartData} events={events} />}
        {tab === "plant" && <PlantView status={status} sample={sample} onRecommendation={openPlantSetup} />}
        {tab === "setup" && <PlantSetupView recommendation={setupRecommendation} draft={setupDraft} setDraft={setSetupDraft} status={status} sample={sample} onBack={() => setTab("plant")} onApplied={handleProfileApplied} />}
        {tab === "settings" && <SettingsView status={status} />}
        </div>
      </section>

      <nav className="bottom-nav" aria-label="เมนูหลัก">{[
        ["home", Sprout, "ภาพรวม"], ["history", History, "ประวัติ"], ["plant", Leaf, "พืช"], ["settings", Settings2, "ตั้งค่า"]
      ].map(([key, Icon, label]) => <button key={key as string} className={tab === key || (key === "plant" && tab === "setup") ? "active" : ""} onClick={() => setTab(key as Tab)}><Icon size={20} /><span>{label as string}</span></button>)}</nav>
    </main>
  );
}

function EventList({ events }: { events: FarmEvent[] }) {
  return <div className="event-list">{events.map((event) => <div className="event-row" key={event.id}>
    <span className={`event-icon ${event.actuator.toLowerCase()}`}>{event.actuator === "PUMP" ? <Droplets /> : event.actuator === "LIGHT" ? <Lightbulb /> : <Activity />}</span>
    <div><strong>{event.action}</strong><span>{event.reason}</span></div><time>{timeAgo(event.at)}</time>
  </div>)}</div>;
}

function HistoryView({ data, events }: { data: Array<HistoryPoint & { time: string }>; events: FarmEvent[] }) {
  const [metric, setMetric] = useState<"soilMoisturePercent" | "temperatureC" | "lux">("soilMoisturePercent");
  const meta = { soilMoisturePercent: ["ความชื้นในดิน", "%", "#17755a"], temperatureC: ["อุณหภูมิ", "°C", "#d56a2d"], lux: ["แสง", " lux", "#b18418"] } as const;
  return <section className="page-section"><div className="page-heading"><p>ข้อมูลย้อนหลัง 24 ชั่วโมง</p><h1>จังหวะของแปลง</h1><span>ดูแนวโน้มควบคู่กับทุกคำสั่งที่เกิดขึ้น</span></div>
    <div className="metric-tabs">{Object.entries(meta).map(([key, value]) => <button className={metric === key ? "active" : ""} key={key} onClick={() => setMetric(key as typeof metric)}>{value[0]}</button>)}</div>
    <div className="chart-wrap"><div className="chart-head"><strong>{meta[metric][0]}</strong><span>ข้อมูลตัวอย่างทุก 1 ชั่วโมง</span></div><ResponsiveContainer width="100%" height={280}><AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={meta[metric][2]} stopOpacity={0.34}/><stop offset="1" stopColor={meta[metric][2]} stopOpacity={0.02}/></linearGradient></defs><CartesianGrid strokeDasharray="2 6" vertical={false} stroke="#d8d3c5"/><XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#666b63" }}/><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#666b63" }}/><Tooltip contentStyle={{ border: 0, borderRadius: 10, boxShadow: "0 12px 30px rgba(33,45,38,.12)" }} formatter={(value) => [`${Number(value).toFixed(1)}${meta[metric][1]}`, meta[metric][0]]}/><Area type="monotone" dataKey={metric} stroke={meta[metric][2]} strokeWidth={2.5} fill="url(#chartFill)" /></AreaChart></ResponsiveContainer></div>
    <div className="section-title"><div><span>บันทึกอัตโนมัติ</span><h2>เหตุการณ์ทั้งหมด</h2></div></div><EventList events={events} />
  </section>;
}

function PlantView({ status, sample, onRecommendation }: { status: FarmStatus; sample: boolean; onRecommendation: (recommendation: PlantRecommendation) => void }) {
  const [plantName, setPlantName] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  async function searchPlant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = plantName.trim();
    if (!query) { setSearchError("กรุณากรอกชื่อพืชที่ต้องการค้นหา"); return; }
    if (sample) { setSearchError("ยังเชื่อมต่อข้อมูลสวนไม่ได้ กรุณาเปิดแอปจาก LINE แล้วลองอีกครั้ง"); return; }
    setSearching(true);
    setSearchError("");
    try {
      onRecommendation(await recommendPlant(query));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "ค้นหาพืชไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setSearching(false);
    }
  }

  return <section className="page-section"><div className="page-heading"><p>โปรไฟล์ที่ใช้งานอยู่</p><h1>{status.plantName}</h1><span>AI แนะนำค่า แต่ Owner เป็นผู้ตรวจสอบและกดใช้เสมอ</span></div>
    <div className="profile-sheet"><div className="plant-mark"><Leaf size={34}/><span>TOM</span></div><div className="profile-intro"><h2>ค่าดูแลประจำแปลง</h2><p>โปรไฟล์ตัวอย่างสำหรับการสาธิต ตรวจสอบกับสายพันธุ์ วัสดุปลูก และการสอบเทียบเซนเซอร์จริงก่อนใช้</p></div>
      <dl><div><dt>เริ่มเปิดไฟ</dt><dd>{number.format(status.lightMinLux)} lux</dd></div><div><dt>เป้าหมายแสง</dt><dd>{number.format(status.lightTargetLux)} lux</dd></div><div><dt>เริ่มรดน้ำ</dt><dd>{status.moistureMinPercent}%</dd></div><div><dt>เป้าหมายดิน</dt><dd>{status.moistureTargetPercent}%</dd></div></dl>
      <form className="plant-search" onSubmit={searchPlant} aria-busy={searching}>
        <label htmlFor="plant-search-input">ค้นหาคำแนะนำการปลูก</label>
        <p>ค้นข้อมูลจากเว็บด้วย Tavily และสรุปด้วย Groq พร้อมแสดงแหล่งอ้างอิง</p>
        <div className="plant-search-row">
          <input id="plant-search-input" value={plantName} onChange={(event) => setPlantName(event.target.value)} maxLength={100} placeholder="เช่น มะเขือเทศ, โหระพา, มอนสเตอร่า" disabled={searching} />
          <button type="submit" disabled={searching || sample || !plantName.trim()}><Search size={16}/>{searching ? "กำลังค้นหา…" : "ค้นหา"}</button>
        </div>
        <span className="plant-search-hint">เมื่อค้นหาเสร็จ ระบบจะพาไปตรวจและปรับค่าที่หน้า Setup ก่อนส่งไปยัง ESP32</span>
        {searchError && <p className="plant-search-error" role="alert">{searchError}</p>}
      </form>
      {searching && <p className="plant-search-loading" role="status">กำลังค้นหาแหล่งข้อมูลการปลูก…</p>}
      <div className="source-note"><strong>หลักการความปลอดภัย</strong><p>คำแนะนำจาก AI เป็นข้อมูลให้ Owner ตรวจสอบ และจะไม่สั่งรีเลย์โดยตรง</p></div>
    </div>
  </section>;
}

function PlantSetupView({ recommendation, draft, setDraft, status, sample, onBack, onApplied }: {
  recommendation: PlantRecommendation | null;
  draft: PlantSetupDraft | null;
  setDraft: (draft: PlantSetupDraft) => void;
  status: FarmStatus;
  sample: boolean;
  onBack: () => void;
  onApplied: (recommendation: PlantRecommendation, version: number) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recommendation || !draft) return;
    const updated: PlantRecommendation = {
      ...recommendation,
      plantName: draft.plantName.trim(),
      light: { ...recommendation.light, minLux: Number(draft.lightMinLux), targetLux: Number(draft.lightTargetLux) },
      soil: { ...recommendation.soil, moistureMinPercent: Number(draft.moistureMinPercent), moistureTargetPercent: Number(draft.moistureTargetPercent) }
    };
    if (updated.light.targetLux <= updated.light.minLux || updated.soil.moistureTargetPercent <= updated.soil.moistureMinPercent) {
      setError("ค่าเป้าหมายต้องมากกว่าค่าเริ่มต้นทั้งแสงและความชื้นดิน");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await applyPlantProfile(updated);
      onApplied(updated, result.version);
      setApplied(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "นำค่าไปใช้ไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  if (!recommendation || !draft) return <section className="page-section"><div className="page-heading"><p>ตั้งค่าพืช</p><h1>ยังไม่มีผลค้นหา</h1><span>ค้นหาพืชก่อน แล้วระบบจะเตรียมค่าแนะนำให้ตรวจทาน</span></div><button type="button" className="setup-back" onClick={onBack}><ArrowLeft size={16}/>กลับไปค้นหาพืช</button></section>;

  return <section className="page-section"><div className="page-heading setup-heading"><p>ขั้นตอนที่ 2 · ตรวจทานก่อนใช้</p><h1>ตั้งค่า {recommendation.plantName}</h1><span>ค่าด้านล่างยังไม่เปลี่ยนแปลงจนกว่า Owner จะกดยืนยัน</span></div>
    <div className="setup-card">
      <button type="button" className="setup-back" onClick={onBack}><ArrowLeft size={16}/>กลับไปค้นหาพืช</button>
      <p className="setup-summary">{recommendation.summary}</p>
      <form className="setup-form" onSubmit={submit}>
        <div className="setup-section-heading"><span>ค่าที่ ESP32 จะใช้</span><h2>เงื่อนไขควบคุมอัตโนมัติ</h2><p>ระบบควบคุมแสงและเริ่มรดน้ำตามค่าเซนเซอร์ โดยไม่เปิดรีเลย์จากคำแนะนำโดยตรง</p></div>
        <label className="setup-field setup-field-wide">ชื่อพืช<input value={draft.plantName} onChange={(event) => { setApplied(false); setDraft({ ...draft, plantName: event.target.value }); }} required maxLength={100}/></label>
        <label className="setup-field">เปิดไฟเมื่อแสงต่ำกว่า<input type="number" inputMode="numeric" min="0" max="199999" step="1" value={draft.lightMinLux} onChange={(event) => { setApplied(false); setDraft({ ...draft, lightMinLux: event.target.value }); }} required/><span>lux</span></label>
        <label className="setup-field">ปิดไฟเมื่อถึง<input type="number" inputMode="numeric" min="1" max="200000" step="1" value={draft.lightTargetLux} onChange={(event) => { setApplied(false); setDraft({ ...draft, lightTargetLux: event.target.value }); }} required/><span>lux</span></label>
        <label className="setup-field">เริ่มรดน้ำเมื่อดินต่ำกว่า<input type="number" inputMode="decimal" min="1" max="99" step="0.1" value={draft.moistureMinPercent} onChange={(event) => { setApplied(false); setDraft({ ...draft, moistureMinPercent: event.target.value }); }} required/><span>% VWC</span></label>
        <label className="setup-field">เป้าหมายความชื้นดิน<input type="number" inputMode="decimal" min="1" max="100" step="0.1" value={draft.moistureTargetPercent} onChange={(event) => { setApplied(false); setDraft({ ...draft, moistureTargetPercent: event.target.value }); }} required/><span>% VWC</span></label>
        <div className="setup-recommendations"><strong>ข้อมูลประกอบจากการค้นเว็บ</strong><div><span>รับแสง {number.format(recommendation.light.photoperiodHours)} ชม./วัน</span><span>อุณหภูมิ {number.format(recommendation.temperature.minC)}–{number.format(recommendation.temperature.maxC)} °C</span><span>ความชื้นอากาศ {number.format(recommendation.humidity.minPercent)}–{number.format(recommendation.humidity.maxPercent)}%</span></div></div>
        <div className="plant-result-notes"><strong>ข้อควรพิจารณา</strong><ul>{recommendation.careNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul><p>ค่า VWC เป็นค่าประมาณ และอาจไม่ตรงกับค่าเซนเซอร์ของคุณจนกว่าจะสอบเทียบกับวัสดุปลูกจริง</p></div>
        <div className="plant-result-sources"><strong>แหล่งอ้างอิง</strong>{recommendation.sources.length ? <ul>{recommendation.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={13}/></a></li>)}</ul> : <p>ครั้งนี้ไม่มีลิงก์อ้างอิงจากผลค้นหา</p>}</div>
        <div className="setup-safety"><strong>สถานะการเชื่อมต่อ</strong><p>{status.online && !sample ? `ESP32 ออนไลน์ · ค่าปัจจุบันเวอร์ชัน ${status.configVersion}` : "ESP32 ออฟไลน์ — เชื่อมต่ออุปกรณ์ก่อนจึงจะนำค่าไปใช้ได้"}</p><p>AUTO เริ่มรดน้ำเมื่อดินต่ำกว่าค่าเริ่มต้น แล้วใช้รอบปั๊ม 5 วินาทีเดิม · ค่าเป้าหมายดินเป็นข้อมูลประกอบ ไม่ใช่จุดหยุดปั๊ม · การยืนยันจะไม่เปิดปั๊มทันที</p></div>
        {!status.soilValid && <p className="setup-warning" role="status">ตอนนี้ ESP32 ยังไม่มีค่าความชื้นดินที่ใช้งานได้ จึงระงับปั๊ม AUTO ไว้ก่อน การตั้งค่าพืชไม่สามารถแก้การอ่านเซนเซอร์ได้</p>}
        {error && <p className="plant-search-error setup-error" role="alert">{error}</p>}
        {applied && <p className="setup-success" role="status"><Check size={16}/> ESP32 ตอบรับค่าควบคุมแล้ว</p>}
        <button type="submit" className="setup-apply" disabled={saving || sample || !status.online || applied}>{saving ? "กำลังรอ ESP32 ตอบรับ…" : applied ? "นำค่าไปใช้แล้ว" : "ยืนยันและส่งค่าไปยัง ESP32"}</button>
      </form>
    </div>
  </section>;
}

function SettingsView({ status }: { status: FarmStatus }) {
  return <section className="page-section"><div className="page-heading"><p>อุปกรณ์และความปลอดภัย</p><h1>ตั้งค่าระบบ</h1><span>ค่าที่ป้องกันความเสียหายจะบังคับใช้ซ้ำบน ESP32</span></div>
    <div className="settings-list"><div><span>รหัสอุปกรณ์</span><strong>{status.deviceId}</strong></div><div><span>ควบคุมปั๊ม MANUAL</span><strong>เปิด/ปิดด้วยปุ่ม</strong></div><div><span>รอบปั๊มอัตโนมัติ</span><strong>5 วินาทีต่อรอบ</strong></div><div><span>ช่วงพักปั๊ม</span><strong>ปิดใช้ชั่วคราว</strong></div><div><span>การเก็บข้อมูล</span><strong>ทุก 1 นาที</strong></div><div><span>Firmware</span><strong>0.1.0</strong></div></div>
    <div className="safety-box"><Settings2/><div><strong>MANUAL เปิดปั๊มค้างจนกดปิด</strong><p>ตรวจสถานะปั๊มและกด “ปิดปั๊ม” เมื่อใช้งานเสร็จ โหมด SAFE จะปิดปั๊มและไฟ</p></div></div>
  </section>;
}
