# Smart Farm

Smart Farm is a safety-first ESP32 farm controller with a LINE-ready mobile dashboard. The ESP32 keeps AUTO control local; the server stores history and relays authenticated commands over MQTT.

## Run the web demo

```bash
cd apps/mini-app
npm install
npm run dev
```

Open `http://localhost:3000`. If the API is unavailable, the dashboard explicitly switches to sample data so the interface remains demonstrable.

## Run the complete stack

```bash
cp .env.example .env
docker compose --env-file .env -f infra/docker-compose.yml up --build
```

Open `http://localhost:8088`. Before production, change every default password, configure Mosquitto authentication/ACLs, provide LINE, Groq, and Tavily credentials, and put the Nginx endpoint behind HTTPS.

## Project layout

- `apps/mini-app` — Next.js mobile-first dashboard
- `services/api` — Go API, MQTT bridge, LINE signature verification
- `services/api/migrations` — PostgreSQL schema
- `firmware/esp32` — PlatformIO firmware with local safety logic
- `infra` — Docker Compose, Nginx, Mosquitto
- `docs` — project overview and SRS

## Firmware

Copy `firmware/esp32/include/secrets.example.h` to `secrets.h`, update Wi-Fi/MQTT values, then upload with PlatformIO. The firmware preserves the existing ET-SMART FARM V1 mapping: UART2 RS485 on GPIO 26/27 with direction GPIO 25, weather sensor Modbus ID 247, soil VWC sensor ID 1, and active-LOW relays through PCF8574A address `0x38`. The pump initializes OFF, every activation is time-limited, and invalid soil readings stop automatic watering.

## Connect LINE

Set `LIFF_ID`, `LINE_CHANNEL_ID`, `LIFF_ALLOWED_USER_ID`, `LINE_CHANNEL_SECRET`, and `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` in `.env`. The legacy variable names are supported. `LINE_CHANNEL_SECRET` is still mandatory for webhook verification.

Expose this stack on a public HTTPS URL and set the same URL as the LIFF endpoint. Then provision the webhook and default Rich Menu:

```bash
export PUBLIC_BASE_URL=https://your-public-host.example
export RICH_MENU_IMAGE=/absolute/path/to/richmenu.jpg
set -a; . ./.env; set +a
sh infra/line/connect.sh
```

The API verifies raw webhook signatures, accepts webhook events from every LINE user, verifies LIFF ID tokens against LINE Login, and provides a Groq-powered LINE chatbot grounded in current farm telemetry. It also understands `status`, `auto`, `water`, and `light` commands. Remote actuator commands require MANUAL mode. Automatic device and sensor fault alerts use LINE broadcast and are delivered to every user who is a friend of the LINE Official Account.

For a temporary development URL, run the stack and a Cloudflare Quick Tunnel in separate terminals:

```bash
docker compose --env-file .env -f infra/docker-compose.yml up --build
sh infra/cloudflare/quick-tunnel.sh
```

Use the printed `https://...trycloudflare.com` address as `PUBLIC_BASE_URL` and as the LIFF endpoint URL. The address changes whenever the Quick Tunnel restarts, so it is suitable for testing only.

## Current MVP boundary

The dashboard, safe control API, MQTT telemetry/commands, schema, LINE webhook signature check, infrastructure, firmware automation, and Groq + Tavily grounded plant search are implemented. Production LIFF token validation and LINE reply/rich-menu provisioning require project credentials and remain behind explicit configuration boundaries.
