# CubeFarm / Smart Farm 🌱 (ภาษาไทย)

[![Go Version](https://img.shields.io/badge/Go-1.24+-00ADD8?style=flat&logo=go)](https://golang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black?style=flat&logo=next.js)](https://nextjs.org)
[![ESP32](https://img.shields.io/badge/Hardware-ESP32-E7352C?style=flat&logo=espressif)](https://espressif.com)
[![Protocol](https://img.shields.io/badge/Protocol-MQTT%20%7C%20Modbus%20RTU-green?style=flat)](https://mqtt.org)
[![LINE](https://img.shields.io/badge/LINE-MINI%20App%20(LIFF)-00C300?style=flat&logo=line)](https://line.me)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker)](https://www.docker.com)

> 🌐 **เลือกภาษา / Select Language**:  
> [English](README.md) | **[ภาษาไทย](README.th.md)**

---

## 1. บทนำและแนวคิดการออกแบบ (Overview & Design Philosophy)

**CubeFarm (Smart Farm)** คือระบบฟาร์มอัจฉริยะในร่ม (Smart Indoor Farm) ระดับอุตสาหกรรมที่ให้ความสำคัญกับ **ความปลอดภัยของแปลงปลูกเป็นอันดับแรก (Safety-First)** ควบคุมด้วยไมโครคอนโทรลเลอร์ **ESP32** ตรวจวัดค่าสภาพแวดล้อมอย่างแม่นยำด้วยเซนเซอร์อุตสาหกรรม **RS485 Modbus RTU** และควบคุมโหลดไฟฟ้ากำลัง (ไฟปลูกพืช Grow Light และปั๊มน้ำรดน้ำ) ผ่านบอร์ดรีเลย์ I2C แบบแยกสัญญาณ

ระบบเชื่อมโยงเข้ากับแพลตฟอร์ม **LINE** เพื่อให้ผู้ใช้งานสามารถมอนิเตอร์และสั่งการได้ง่ายที่สุดผ่านมือถือ ประกอบด้วย **LINE MINI App (LIFF)** และ **LINE Official Account (Rich Menu + Chatbot)** พร้อมทั้งประยุกต์ใช้โมเดลภาษาขนาดใหญ่ **AI (Groq LLM + Tavily Web Search Grounding)** ในการค้นคว้าและแนะนำค่าสภาพแวดล้อมที่เหมาะสมสำหรับพืชแต่ละชนิด

### ปรัชญาการออกแบบที่สำคัญ
1. **ทำงานอัตโนมัติได้อย่างปลอดภัยแม้ไม่มีอินเทอร์เน็ต (Local-First Autonomy)**: ลอจิกการตัดสินใจในโหมดอัตโนมัติ (AUTO) ทำงานอยู่บนชิป ESP32 โดยตรง ไม่ต้องพึ่งพาเซิร์ฟเวอร์หรือสัญญาณอินเทอร์เน็ต หากเน็ตหลุด เซิร์ฟเวอร์ล่ม หรือ Wi-Fi ขาดหาย ฟาร์มจะยังคงรดน้ำและคุมแสงตามเกณฑ์ที่ตั้งไว้ได้อย่างปลอดภัย
2. **แยก AI ออกจากการคุมรีเลย์กายภาพ (AI Boundary)**: AI มีหน้าที่ค้นคว้าทางวิชาการและเสนอค่าเกณฑ์แนะนำเท่านั้น AI **ไม่มีสิทธิ์**ส่งคำสั่งเปิด-ปิดรีเลย์โดยตรง เจ้าของฟาร์มต้องเป็นผู้ตรวจสอบและกดยืนยัน (Human-in-the-loop) ก่อนระบบจะส่งค่าคอนฟิกไปบันทึกบนบอร์ด
3. **ระบบป้องกันความเสียหายระดับฮาร์ดแวร์ (Fail-Safe Mechanisms)**: ปั๊มน้ำถูกจำกัดเวลาทำงานสูงสุดด้วยฮาร์ดแวร์ Watchdog มีช่วงหน่วงเวลาซึมน้ำของดิน (Cooldown) และระบบจะหยุดการรดน้ำอัตโนมัติทันทีหากเซนเซอร์ความชื้นในดินชำรุดหรืออ่านค่าไม่ได้

---

## 2. แผนผังสถาปัตยกรรมระบบ (System Architecture)

```mermaid
flowchart TB
    subgraph EdgeDevice["ฮาร์ดแวร์ปลายทาง (ESP32 Controller)"]
        Sensors["เซนเซอร์ RS485 Modbus RTU\n- อุณหภูมิและความชื้นอากาศ (SHT31) ID:247\n- ความเข้มแสง (BH1750) ID:247\n- ความชื้นในดิน (Soil VWC) ID:1"]
        Relays["โมดูลรีเลย์ I2C PCF8574A (0x38)\n- รีเลย์ 1: ไฟปลูกพืช (Grow Light)\n- รีเลย์ 2: ปั๊มน้ำรดน้ำ (Water Pump)"]
        ESP32["ESP32 Firmware\n(ระบบควบคุมอัตโนมัติ + Watchdog ป้องกันค้าง)"]
        Sensors -->|UART2 RS485| ESP32
        ESP32 -->|I2C Active-LOW| Relays
    end

    subgraph MessagingBroker["ตัวกลางรับส่งข้อมูล (Local Network)"]
        MQTT["Eclipse Mosquitto (MQTT:1883)\nหัวข้อ: telemetry, command, config, status"]
    end

    subgraph BackendServer["ระบบหลังบ้านและฐานข้อมูล (Backend Stack)"]
        API["Go Gin API Server (:8080)\n- MQTT Bridge เชื่อมโยงอุปกรณ์\n- ตรวจสอบลายเซ็น LINE Webhook\n- ตรวจสอบสิทธิ์ผู้ใช้ด้วย LIFF Token\n- มอนิเตอร์สถานะอุปกรณ์และเซนเซอร์"]
        DB[(PostgreSQL 18)\n- ประวัติข้อมูลเซนเซอร์\n- บันทึกการทำงานของรีเลย์\n- โปรไฟล์พืชและการตั้งค่า\n- ประวัติการแจ้งเตือน]
        API <--> DB
    end

    subgraph AI["ระบบประมวลผล AI"]
        Groq["Groq LLM (Qwen / LLaMA)"]
        Tavily["Tavily Web Search Grounding"]
        API <--> Groq
        API <--> Tavily
    end

    subgraph ReverseProxy["เกตเวย์ความปลอดภัย (Ingress)"]
        Nginx["Nginx Reverse Proxy (:8088)"]
        Tunnel["Cloudflare Quick Tunnel\n(HTTPS สาธารณะ)"]
        Tunnel --> Nginx
        Nginx -->|/api/ และ /webhooks/| API
        Nginx -->|/| WebApp
    end

    subgraph Client["ส่วนติดต่อผู้ใช้ (LINE Interface)"]
        WebApp["Next.js 16 MINI App\n(แดชบอร์ดมือถือผ่าน LIFF)"]
        LINE["LINE Official Account\n(Rich Menu + แจ้งเตือน + แชตบอต)"]
        Owner["ผู้ใช้งาน / เจ้าของฟาร์ม"]
        Owner --> LINE
        Owner --> WebApp
    end

    ESP32 <-->|MQTT ผ่าน Wi-Fi| MQTT
    MQTT <--> API
    LINE -->|ส่ง Webhook Events| Tunnel
    WebApp -->|เรียก REST API| Nginx
```

---

## 3. ฟีเจอร์หลักของระบบ (Key Features)

### 📊 การตรวจวัดสภาพแวดล้อม (Smart Monitoring)
- **อุณหภูมิ (°C) และความชื้นสัมพัทธ์ในอากาศ (%RH)** จากเซนเซอร์ Sensirion SHT31
- **ความเข้มแสง (Lux)** จากเซนเซอร์ BH1750
- **เปอร์เซ็นต์ความชื้นในดิน (% VWC)** ที่ผ่านการสอบเทียบเชิงปริมาตรจากเซนเซอร์ดินอุตสาหกรรม
- ตรวจสอบสถานะการเชื่อมต่อ (ออนไลน์/ออฟไลน์) ด้วยกลไก MQTT Last Will and Testament (LWT)

### ⚙️ โหมดการควบคุมและความปลอดภัย (Operation Modes)
- **AUTO**: ระบบตัดสินใจเปิด-ปิดไฟตามเกณฑ์แสง และสั่งรดน้ำอัตโนมัติเมื่อดินแห้ง พร้อมระบบนับเวลาถอยหลังและหน่วงเวลาซึมน้ำ
- **MANUAL**: ผู้ใช้สามารถสั่งเปิดไฟหรือสั่งรดน้ำจากมือถือได้ โดยปั๊มน้ำจะถูกบังคับตัดเวลาไม่เกิน 10 วินาทีเสมอ
- **SAFE**: สั่งตัดการทำงานของไฟและปั๊มน้ำทั้งหมดเพื่อความปลอดภัยในกรณีฉุกเฉิน

### 📱 การเชื่อมต่อกับ LINE เต็มรูปแบบ
- **LINE MINI App (LIFF v2)**: หน้าแดชบอร์ดบนมือถือที่แสดงผลเกจ์วัดระดับ กราฟประวัติย้อนหลัง 24 ชั่วโมง และประวัติการทำงานของอุปกรณ์
- **LINE Rich Menu**: เมนูปุ่มลัด 6 ช่องบนหน้าแชต สั่งดูสถานะฟาร์ม, สั่งรดน้ำด่วน, สั่งเปิดไฟ, หรือสลับโหมดได้ทันที
- **LINE Push Notifications**: แจ้งเตือนข้อความเข้า LINE ทันทีเมื่อเซนเซอร์อ่านค่าผิดพลาด หรืออุปกรณ์ตัดการเชื่อมต่อ

### 🌿 ระบบค้นหาโปรไฟล์พืชอัจฉริยะ (AI Plant Profiling)
- ผู้ใช้ระบุชื่อพืชที่ต้องการปลูก (เช่น มะเขือเทศเชอร์รี, ผักเคล, กะเพรา, เมล่อน)
- ระบบส่งคำสั่งให้ AI ค้นหาข้อมูลเชิงวิจัยผ่านเว็บแบบเรียลไทม์ และสรุปเป็นค่าเกณฑ์แสงและค่าความชื้นในดินที่เหมาะสม
- เจ้าของฟาร์มสามารถดูแหล่งอ้างอิง ปรับแต่งค่า และกดซิงก์ลงบอร์ด ESP32 ได้โดยตรง

---

## 4. ข้อมูลจำเพาะทางฮาร์ดแวร์และการต่อวงจร (Hardware Pinout)

| ส่วนประกอบ | การเชื่อมต่อ / โปรโตคอล | ขาเชื่อมต่อ (Pin) / แอดเดรส | รายละเอียด |
|---|---|---|---|
| **บอร์ดประมวลผล** | ESP32 Dev Module | — | บอร์ด ET-SMART FARM V1 หรือ ET ESP32 RS485 V3 |
| **บัส RS485** | HardwareSerial UART2 | RX: `GPIO 26`, TX: `GPIO 27`, DE/RE: `GPIO 25` | อัตราเร็ว 9600 Baud, 8N1 |
| **เซนเซอร์อากาศ** | Modbus RTU | Slave ID: `247` (`0xF7`) | วัดอุณหภูมิ, ความชื้นอากาศ (SHT31) และแสง (BH1750) |
| **เซนเซอร์วัดดิน** | Modbus RTU | Slave ID: `1` (`0x01`) | วัดค่าความชื้นในดิน (Volumetric Water Content) |
| **วงจรขับรีเลย์** | I2C (`Wire`) | Address: `0x38` (PCF8574A) | ควบคุมแบบ Active-LOW (ตรรกะแบบลบ) |
| **รีเลย์ช่อง 1** | ขาเอาต์พุต PCF8574A | Bit Mask: `0x01` | ไฟปลูกพืช (Grow Light) |
| **รีเลย์ช่อง 2** | ขาเอาต์พุต PCF8574A | Bit Mask: `0x04` | ปั๊มน้ำ (Water Pump พร้อมระบบตัดเวลา) |

---

## 5. โครงสร้างโฟลเดอร์ของโปรเจกต์ (Project Structure)

```text
cubeFarm/
├── apps/
│   └── mini-app/             # Next.js 16 + React 19 + Tailwind CSS (LINE MINI App)
│       ├── app/              # หน้าแอป Layout และสไตล์
│       ├── lib/              # ฟังก์ชันเรียก API, ตัวเชื่อมโยง LIFF SDK, Types
│       └── Dockerfile        # คอนเทนเนอร์สำหรับรัน Web Dashboard
├── services/
│   └── api/                  # เซิร์ฟเวอร์ API ภาษา Go (Gin Framework)
│       ├── cmd/api/          # จุดเริ่มต้นการทำงานหลัก (main.go)
│       ├── internal/app/     # ลอจิกการทำงาน, ตัวเชื่อมโยง MQTT, ระบบ LINE, AI
│       ├── migrations/       # สคริปต์โครงสร้างฐานข้อมูล PostgreSQL (001_init.sql)
│       └── Dockerfile        # คอนเทนเนอร์สำหรับบิลด์และรัน Go API
├── firmware/
│   └── esp32/                # ซอร์สโค้ดเฟิร์มแวร์ ESP32 (PlatformIO C++)
│       ├── include/          # ไฟล์คอนฟิกและ secrets.example.h
│       ├── src/main.cpp      # โค้ดอ่านเซนเซอร์ Modbus และคุมรีเลย์
│       └── platformio.ini    # กำหนดค่าบอร์ดและไลบรารีที่ใช้
├── infra/
│   ├── cloudflare/           # สคริปต์เปิด Cloudflare Tunnel สำหรับเทสต์ภายนอก
│   ├── line/                 # เทมเพลต Rich Menu และสคริปต์เชื่อมต่อ LINE Webhook
│   ├── mosquitto/            # ไฟล์คอนฟิกของ Mosquitto MQTT Broker
│   ├── nginx/                # ไฟล์คอนฟิก Reverse Proxy สำหรับส่งต่อทราฟฟิก
│   └── docker-compose.yml    # รวมการทำงานของคอนเทนเนอร์ทั้งหมดในคำสั่งเดียว
├── docs/                     # คู่มือ SRS, ดาต้าชีตอุปกรณ์ และไดอะแกรม
├── .env.example              # ตัวอย่างไฟล์กำหนดตัวแปรสภาพแวดล้อม
├── README.md                 # เอกสารหลัก (ภาษาอังกฤษ)
└── README.th.md              # เอกสารฉบับนี้ (ภาษาไทย)
```

---

## 6. คู่มือการติดตั้งและเริ่มต้นใช้งาน (Quick Start Guide)

### สิ่งที่ต้องเตรียมก่อนเริ่มติดตั้ง
- [Docker](https://www.docker.com/) และ Docker Compose (v2.20 ขึ้นไป)
- [Node.js](https://nodejs.org/) v20+ (หากต้องการรันเฉพาะหน้าเว็บ)
- [Go](https://golang.org/) v1.24+ (หากต้องการพัฒนาระบบหลังบ้านแบบ Local)
- [VS Code พร้อมส่วนเสริม PlatformIO](https://platformio.org/) (สำหรับแฟลชบอร์ด ESP32)

---

### วิธีที่ 1: รันระบบทั้งหมดด้วย Docker Compose (แนะนำที่สุด)

1. **โคลนโปรเจกต์และสร้างไฟล์ `.env`**:
   ```bash
   git clone https://github.com/Mosuzzzz/cubeFarm.git
   cd cubeFarm
   cp .env.example .env
   ```

2. **แก้ไขการตั้งค่าในไฟล์ `.env`**:
   ```ini
   POSTGRES_DB=smartfarm
   POSTGRES_USER=smartfarm
   POSTGRES_PASSWORD=รหัสผ่านฐานข้อมูลที่ปลอดภัย
   MQTT_BROKER_URL=tcp://mosquitto:1883
   MQTT_USERNAME=smartfarm
   MQTT_PASSWORD=รหัสผ่าน_mqtt_ที่ปลอดภัย

   # การตั้งค่า AI (ใส่เมื่อต้องการใช้ฟีเจอร์ค้นหาโปรไฟล์พืชและแชตบอต)
   GROQ_API_KEY=gsk_...
   GROQ_MODEL=qwen/qwen3.8-27b
   TAVILY_API_KEY=tvly-...

   # การตั้งค่า LINE (ใส่เมื่อต้องการต่อกับ LINE MINI App และ Bot)
   LIFF_ID=1234567890-abcdefgh
   LINE_CHANNEL_SECRET=รหัส_channel_secret_ของคุณ
   LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=รหัส_access_token_ของคุณ
   ```

3. **สั่งเริ่มการทำงานของระบบทั้งหมด**:
   ```bash
   docker compose --env-file .env -f infra/docker-compose.yml up --build -d
   ```

4. **ตรวจสอบสถานะการทำงาน**:
   - หน้าเว็บแดชบอร์ด: `http://localhost:8088`
   - จุดตรวจสอบสถานะ API (Health Check): `http://localhost:8088/healthz` (ควรได้คำตอบ `{"status":"ok"}`)
   - MQTT Broker: เปิดพอร์ตที่ `localhost:1883`

---

### วิธีที่ 2: รันเฉพาะหน้าเว็บแดชบอร์ด (Frontend Standalone)

หน้าเว็บ Next.js มาพร้อมกับ **ระบบจำลองข้อมูลอัตโนมัติ (Sample Data Fallback)** หากไม่สามารถเชื่อมต่อกับ API หรือบอร์ด ESP32 ได้ หน้าจอจะสลับไปแสดงข้อมูลตัวอย่างทันทีเพื่อความสะดวกในการเดโม:

```bash
cd apps/mini-app
npm install
npm run dev
```
เปิดใช้งานที่ `http://localhost:3000` (แนะนำให้เปิด Developer Tools ปรับขนาดหน้าจอเป็นจอมือถือ)

---

### วิธีที่ 3: คอมไพล์และอัปโหลดโค้ดลงบอร์ด ESP32

1. เข้าไปที่โฟลเดอร์ `firmware/esp32`
2. สร้างไฟล์ `include/secrets.h` โดยคัดลอกจาก `include/secrets.example.h`:
   ```cpp
   #pragma once
   constexpr char WIFI_SSID[] = "ชื่อไวไฟของคุณ";
   constexpr char WIFI_PASSWORD[] = "รหัสผ่านไวไฟ";
   constexpr char MQTT_HOST[] = "192.168.1.100"; // IP ของเครื่องที่รัน Mosquitto ในวง LAN
   constexpr int  MQTT_PORT = 1883;
   constexpr char MQTT_USER[] = "smartfarm";
   constexpr char MQTT_PASS[] = "รหัสผ่าน_mqtt_ที่กำหนดใน_env";
   ```
3. ต่อบอร์ด ESP32 เข้ากับคอมพิวเตอร์ผ่านสาย USB แล้วสั่งอัปโหลด:
   ```bash
   pio run --target upload
   pio device monitor --baud 115200
   ```

---

## 7. ขั้นตอนการตั้งค่าเชื่อมต่อกับ LINE (LINE Setup)

1. **สร้างโดเมน HTTPS สาธารณะสำหรับการทดสอบ**:
   รันสคริปต์ Cloudflare Quick Tunnel เพื่อสร้าง URL ชั่วคราวที่เชื่อมเข้าสู่เครื่องของคุณ:
   ```bash
   sh infra/cloudflare/quick-tunnel.sh
   ```
   *คัดลอก URL ที่ได้ เช่น `https://xxxx.trycloudflare.com`*

2. **นำไปกรอกในระบบ LINE Developers Console**:
   - ไปที่เมนู **Messaging API**: ใส่ Webhook URL เป็น `https://xxxx.trycloudflare.com/webhooks/line` แล้วกด **Verify**
   - ไปที่เมนู **LIFF**: ใส่ Endpoint URL เป็น `https://xxxx.trycloudflare.com/`

3. **ติดตั้ง Rich Menu เข้าสู่บัญชี LINE Official Account**:
   ```bash
   export PUBLIC_BASE_URL=https://xxxx.trycloudflare.com
   export RICH_MENU_IMAGE=infra/line/richmenu.jpg
   set -a; . ./.env; set +a
   sh infra/line/connect.sh
   ```

---

## 8. สรุปหัวข้อ MQTT และ REST API Reference

### หัวข้อการสื่อสาร MQTT (Topics)

| หัวข้อ (Topic) | ทิศทาง | ผู้ส่ง | รายละเอียด |
|---|---|---|---|
| `smartfarm/{deviceId}/telemetry` | Publish | ESP32 | ส่งค่าเซนเซอร์แบบเรียลไทม์ (Temp, Lux, Soil, สถานะรีเลย์) |
| `smartfarm/{deviceId}/status` | Publish (LWT) | ESP32 | แจ้งสถานะเชื่อมต่อ (`online` หรือ `offline`) |
| `smartfarm/{deviceId}/command` | Subscribe | Go API | ส่งคำสั่งคุมรีเลย์ (`light`, `water`, `mode`) |
| `smartfarm/{deviceId}/config` | Subscribe | Go API | ส่งเกณฑ์แสงและความชื้นใหม่ไปยังอุปกรณ์ |
| `smartfarm/{deviceId}/config/ack` | Publish | ESP32 | ตอบรับยืนยันว่าบันทึกค่าลงหน่วยความจำถาวรสำเร็จ |

### รายการ REST API Endpoints

- `GET /healthz` — ตรวจสอบความพร้อมของเซิร์ฟเวอร์
- `GET /api/v1/farms/:farmId/status` — ดึงค่าเซนเซอร์ล่าสุดและสถานะฟาร์ม
- `GET /api/v1/farms/:farmId/history` — ดึงข้อมูลกราฟเซนเซอร์ย้อนหลัง
- `GET /api/v1/farms/:farmId/events` — ดึงบันทึกประวัติการสั่งงานและเหตุการณ์แจ้งเตือน
- `POST /api/v1/farms/:farmId/mode` — เปลี่ยนโหมดการทำงาน (`AUTO`, `MANUAL`, `SAFE`)
- `POST /api/v1/farms/:farmId/light` — เปิดหรือปิดไฟปลูกพืช (เฉพาะโหมด MANUAL)
- `POST /api/v1/farms/:farmId/water` — สั่งรดน้ำแบบจับเวลา (เฉพาะโหมด MANUAL สูงสุด 10 วินาที)
- `POST /api/v1/plants/recommend` — ส่งชื่อพืชให้ AI ค้นคว้าและแนะนำค่าเกณฑ์ที่เหมาะสม
- `POST /api/v1/farms/:farmId/plant-profile/apply` — ยืนยันการนำโปรไฟล์พืชไปใช้งานและส่งลงบอร์ด
- `POST /webhooks/line` — จุดรับสัญญาณ Webhook สำหรับตอบกลับข้อความและคำสั่งใน LINE

---

## 9. ระบบป้องกันความปลอดภัย (Safety & Guardrails)

1. **ระบบ Watchdog ตัดเวลาปั๊มน้ำ (Failsafe Cutoff)**: ในระดับเฟิร์มแวร์ ESP32 คำสั่งเปิดปั๊มน้ำทุกคำสั่งจะมีเวลาปิดอัตโนมัติกำกับไว้เสมอ และจำกัดเวลาสูงสุดไม่เกิน 10 วินาที ป้องกันไฟไหม้ปั๊มหรือน้ำท่วมแปลงปลูก
2. **ระบบตรวจจับเซนเซอร์ค้าง/เสีย (Sensor Staleness & Validity Guard)**: หากอ่านค่าจากเซนเซอร์ไม่ได้ต่อเนื่อง หรือข้อมูลไม่อัปเดตนานเกิน 15 วินาที ระบบจะระงับการรดน้ำอัตโนมัติทันที พร้อมส่งแจ้งเตือนเข้า LINE
3. **การตรวจสอบสิทธิ์ความปลอดภัยสองชั้น (Security & Authentication)**:
   - ตรวจสอบลายเซ็น `X-Line-Signature` ด้วย HMAC-SHA256 ในทุกคำขอ Webhook จาก LINE ป้องกันคำสั่งปลอมแปลง
   - ตรวจสอบ LIFF ID Token กับเซิร์ฟเวอร์ LINE Login ก่อนอนุญาตให้เข้าถึง API

---

## 10. ใบอนุญาตและการมีส่วนร่วม (License & Contributing)

โครงการนี้พัฒนาขึ้นเพื่อการศึกษา วิจัย และการประยุกต์ใช้งานในแปลงปลูกอัจฉริยะระบบปิด 
หากพบปัญหาหรือต้องการเสนอแนะฟีเจอร์ สามารถเปิด Issue หรือส่ง Pull Request ได้ทางคลังเก็บโค้ดของโครงการ
