package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Status struct {
	FarmID                string    `json:"farmId"`
	DeviceID              string    `json:"deviceId"`
	FarmName              string    `json:"farmName"`
	PlantName             string    `json:"plantName"`
	Online                bool      `json:"online"`
	Mode                  string    `json:"mode"`
	TemperatureC          float64   `json:"temperatureC"`
	HumidityPercent       float64   `json:"humidityPercent"`
	Lux                   float64   `json:"lux"`
	SoilMoisturePercent   float64   `json:"soilMoisturePercent"`
	WeatherValid          bool      `json:"weatherValid"`
	SoilValid             bool      `json:"soilValid"`
	LightOn               bool      `json:"lightOn"`
	PumpOn                bool      `json:"pumpOn"`
	LightMinLux           int       `json:"lightMinLux"`
	LightTargetLux        int       `json:"lightTargetLux"`
	MoistureMinPercent    float64   `json:"moistureMinPercent"`
	MoistureTargetPercent float64   `json:"moistureTargetPercent"`
	ConfigVersion         uint32    `json:"configVersion"`
	LastTelemetryAt       time.Time `json:"lastTelemetryAt"`
}

type App struct {
	mu              sync.RWMutex
	configMu        sync.Mutex
	ackMu           sync.Mutex
	configWaiters   map[uint32]chan bool
	status          Status
	weatherFailures int
	soilFailures    int
	weatherAlerted  bool
	soilAlerted     bool
	offlineAlerted  bool
	db              *pgxpool.Pool
	mqtt            mqtt.Client
}

func New() (*http.Server, func(), error) {
	a := &App{configWaiters: make(map[uint32]chan bool), status: Status{FarmID: "demo-farm", DeviceID: "farm-001", FarmName: "สวนหลังบ้าน", PlantName: "มะเขือเทศเชอร์รี", Online: false, Mode: "AUTO", WeatherValid: true, SoilValid: true, TemperatureC: 29.4, HumidityPercent: 68, Lux: 18450, SoilMoisturePercent: 42, LightOn: true, LightMinLux: 15000, LightTargetLux: 22000, MoistureMinPercent: 35, MoistureTargetPercent: 50, ConfigVersion: 1}}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	if url := os.Getenv("DATABASE_URL"); url != "" {
		if db, err := pgxpool.New(ctx, url); err == nil {
			a.db = db
			_, _ = a.db.Exec(context.Background(), `
				INSERT INTO farms (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Smart Farm') ON CONFLICT (id) DO NOTHING;
				INSERT INTO devices (farm_id, device_uid, name, status) VALUES ('00000000-0000-0000-0000-000000000001', 'farm-001', 'ESP32 Farm Controller', 'online') ON CONFLICT (device_uid) DO NOTHING;
			`)
		} else {
			log.Printf("database disabled: %v", err)
		}
	}
	if broker := os.Getenv("MQTT_BROKER_URL"); broker != "" {
		a.connectMQTT(broker)
	}
	alertContext, stopAlerts := context.WithCancel(context.Background())
	go a.monitorDevice(alertContext)

	r := gin.New()
	r.Use(gin.Recovery(), requestLogger(), cors.New(cors.Config{AllowOrigins: []string{"http://localhost:3000", "http://127.0.0.1:3000", "https://*.line-apps.com"}, AllowWildcard: true, AllowMethods: []string{"GET", "POST", "PUT", "OPTIONS"}, AllowHeaders: []string{"Authorization", "Content-Type", "X-Line-Signature"}, AllowCredentials: true, MaxAge: 12 * time.Hour}))
	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	v1 := r.Group("/api/v1")
	v1.Use(a.authorizeLineUser)
	v1.GET("/farms/:farmId/status", a.getStatus)
	v1.GET("/farms/:farmId/history", a.getHistory)
	v1.GET("/farms/:farmId/events", a.getEvents)
	v1.POST("/farms/:farmId/mode", a.setMode)
	v1.POST("/farms/:farmId/light", a.setLight)
	v1.POST("/farms/:farmId/water", a.water)
	v1.POST("/farms/:farmId/plant-profile/apply", a.applyPlantProfile)
	v1.POST("/plants/recommend", a.recommendPlant)
	r.POST("/webhooks/line", a.lineWebhook)
	port := env("HTTP_PORT", "8080")
	cleanup := func() {
		stopAlerts()
		a.mu.RLock()
		client := a.mqtt
		a.mu.RUnlock()
		if client != nil {
			client.Disconnect(250)
		}
		if a.db != nil {
			a.db.Close()
		}
	}
	return &http.Server{Addr: ":" + port, Handler: r, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 55 * time.Second}, cleanup, nil
}

func (a *App) connectMQTT(broker string) {
	opts := mqtt.NewClientOptions().AddBroker(broker).SetClientID("smartfarm-api").SetAutoReconnect(true)
	if user := os.Getenv("MQTT_USERNAME"); user != "" {
		opts.SetUsername(user).SetPassword(os.Getenv("MQTT_PASSWORD"))
	}
	opts.OnConnect = func(c mqtt.Client) {
		log.Printf("mqtt connected to %s", broker)
		token := c.Subscribe("smartfarm/+/telemetry", 1, a.telemetry)
		token.Wait()
		if token.Error() != nil {
			log.Printf("mqtt subscribe: %v", token.Error())
		}
		ackToken := c.Subscribe("smartfarm/+/config/ack", 1, a.configAck)
		ackToken.Wait()
		if ackToken.Error() != nil {
			log.Printf("mqtt config ack subscribe: %v", ackToken.Error())
		}
	}
	client := mqtt.NewClient(opts)
	go func() {
		for {
			token := client.Connect()
			if token.Wait() && token.Error() != nil {
				log.Printf("mqtt connect failed: %v (retrying in 3s)", token.Error())
				time.Sleep(3 * time.Second)
				continue
			}
			a.mu.Lock()
			a.mqtt = client
			a.mu.Unlock()
			log.Printf("mqtt client ready")
			break
		}
	}()
}

func (a *App) telemetry(_ mqtt.Client, msg mqtt.Message) {
	var payload struct {
		DeviceID     string   `json:"device_id"`
		Temperature  *float64 `json:"temperature_c"`
		Humidity     *float64 `json:"humidity_percent"`
		Lux          *float64 `json:"lux"`
		Soil         *float64 `json:"soil_moisture_percent"`
		WeatherValid bool     `json:"weather_valid"`
		SoilValid    bool     `json:"soil_valid"`
		Light        bool     `json:"light_on"`
		Pump         bool     `json:"pump_on"`
		Mode         string   `json:"mode"`
		PlantName    string   `json:"plant_name"`
		LightMin     *float64 `json:"light_min_lux"`
		LightTarget  *float64 `json:"light_target_lux"`
		MoistureMin  *float64 `json:"moisture_min_percent"`
		MoistureGoal *float64 `json:"moisture_target_percent"`
		ConfigVer    *uint32  `json:"config_version"`
	}
	if json.Unmarshal(msg.Payload(), &payload) != nil || payload.DeviceID == "" {
		return
	}
	var alerts []string
	a.mu.Lock()
	a.status.DeviceID = payload.DeviceID
	if payload.Temperature != nil {
		a.status.TemperatureC = *payload.Temperature
	}
	if payload.Humidity != nil {
		a.status.HumidityPercent = *payload.Humidity
	}
	if payload.Lux != nil {
		a.status.Lux = *payload.Lux
	}
	if payload.Soil != nil {
		a.status.SoilMoisturePercent = *payload.Soil
	}
	a.status.WeatherValid = payload.WeatherValid
	a.status.SoilValid = payload.SoilValid
	if payload.WeatherValid {
		a.weatherFailures = 0
		a.weatherAlerted = false
	} else {
		a.weatherFailures++
		if a.weatherFailures >= 3 && !a.weatherAlerted {
			a.weatherAlerted = true
			alerts = append(alerts, fmt.Sprintf("⚠️ Smart Farm: เซนเซอร์อากาศไม่ทำงาน\nอุปกรณ์: %s\nไม่สามารถอ่านอุณหภูมิ ความชื้น และแสงได้ต่อเนื่อง 3 ครั้ง", payload.DeviceID))
		}
	}
	if payload.SoilValid {
		a.soilFailures = 0
		a.soilAlerted = false
	} else {
		a.soilFailures++
		if a.soilFailures >= 3 && !a.soilAlerted {
			a.soilAlerted = true
			alerts = append(alerts, fmt.Sprintf("⚠️ Smart Farm: เซนเซอร์ความชื้นดินไม่ทำงาน\nอุปกรณ์: %s\nไม่สามารถอ่านค่าความชื้นดินได้ต่อเนื่อง 3 ครั้ง", payload.DeviceID))
		}
	}
	a.status.LightOn = payload.Light
	a.status.PumpOn = payload.Pump
	a.status.Mode = payload.Mode
	if payload.PlantName != "" {
		a.status.PlantName = payload.PlantName
	}
	if payload.LightMin != nil {
		a.status.LightMinLux = int(*payload.LightMin)
	}
	if payload.LightTarget != nil {
		a.status.LightTargetLux = int(*payload.LightTarget)
	}
	if payload.MoistureMin != nil {
		a.status.MoistureMinPercent = *payload.MoistureMin
	}
	if payload.MoistureGoal != nil {
		a.status.MoistureTargetPercent = *payload.MoistureGoal
	}
	if payload.ConfigVer != nil {
		a.status.ConfigVersion = *payload.ConfigVer
	}
	wasOffline := !a.status.Online || a.offlineAlerted
	a.status.Online = true
	a.status.LastTelemetryAt = time.Now().UTC()
	a.offlineAlerted = false
	a.mu.Unlock()
	if wasOffline {
		go broadcastLine(fmt.Sprintf("✅ Smart Farm: ESP32 เปิดเครื่องแล้ว\nอุปกรณ์: %s\nเชื่อมต่อกับ MQTT สำเร็จ พร้อมทำงานแล้ว", payload.DeviceID))
	}
	for _, alert := range alerts {
		go broadcastLine(alert)
	}
	if a.db != nil {
		_, _ = a.db.Exec(context.Background(), `INSERT INTO sensor_readings(device_id, temperature_c, humidity_percent, lux, soil_moisture_percent, recorded_at) SELECT id,$2,$3,$4,$5,now() FROM devices WHERE device_uid=$1`, payload.DeviceID, payload.Temperature, payload.Humidity, payload.Lux, payload.Soil)
	}
}

func (a *App) monitorDevice(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			var alert string
			a.mu.Lock()
			if !a.status.LastTelemetryAt.IsZero() && time.Since(a.status.LastTelemetryAt) > 90*time.Second {
				a.status.Online = false
				if !a.offlineAlerted {
					a.offlineAlerted = true
					alert = fmt.Sprintf("🚨 Smart Farm: อุปกรณ์ออฟไลน์\nอุปกรณ์: %s\nไม่ได้รับข้อมูลจาก ESP32 เกิน 90 วินาที", a.status.DeviceID)
				}
			}
			a.mu.Unlock()
			if alert != "" {
				go broadcastLine(alert)
			}
		}
	}
}

func (a *App) getStatus(c *gin.Context) {
	a.mu.RLock()
	value := a.status
	a.mu.RUnlock()
	if !value.LastTelemetryAt.IsZero() && time.Since(value.LastTelemetryAt) > 90*time.Second {
		value.Online = false
	}
	c.JSON(200, value)
}
func (a *App) getHistory(c *gin.Context) {
	if a.db == nil {
		c.JSON(200, []any{})
		return
	}
	rows, err := a.db.Query(c, `SELECT recorded_at,temperature_c,humidity_percent,lux,soil_moisture_percent FROM sensor_readings ORDER BY recorded_at DESC LIMIT 1440`)
	if err != nil {
		c.JSON(500, gin.H{"error": "history unavailable"})
		return
	}
	defer rows.Close()
	result := make([]gin.H, 0)
	for rows.Next() {
		var at time.Time
		var t, h, l, s float64
		if rows.Scan(&at, &t, &h, &l, &s) == nil {
			result = append(result, gin.H{"at": at, "temperatureC": t, "humidityPercent": h, "lux": l, "soilMoisturePercent": s})
		}
	}
	c.JSON(200, result)
}
func (a *App) getEvents(c *gin.Context) { c.JSON(200, []any{}) }
func (a *App) setMode(c *gin.Context) {
	var in struct {
		Mode string `json:"mode"`
	}
	if c.ShouldBindJSON(&in) != nil || (in.Mode != "AUTO" && in.Mode != "MANUAL" && in.Mode != "SAFE") {
		c.JSON(400, gin.H{"error": "mode must be AUTO, MANUAL, or SAFE"})
		return
	}
	a.publish("command/mode", gin.H{"mode": in.Mode, "source": "MINI_APP"})
	a.mu.Lock()
	a.status.Mode = in.Mode
	if in.Mode == "SAFE" {
		a.status.LightOn = false
		a.status.PumpOn = false
	}
	a.mu.Unlock()
	c.JSON(202, gin.H{"accepted": true})
}
func (a *App) setLight(c *gin.Context) {
	var in struct {
		On bool `json:"on"`
	}
	if c.ShouldBindJSON(&in) != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}
	a.mu.RLock()
	mode := a.status.Mode
	a.mu.RUnlock()
	if mode != "MANUAL" {
		c.JSON(409, gin.H{"error": "light control requires MANUAL mode"})
		return
	}
	a.publish("command/light", gin.H{"on": in.On, "source": "MINI_APP"})
	c.JSON(202, gin.H{"accepted": true})
}
func (a *App) water(c *gin.Context) {
	var in struct {
		On *bool `json:"on"`
	}
	if c.ShouldBindJSON(&in) != nil || in.On == nil {
		c.JSON(400, gin.H{"error": "on must be true or false"})
		return
	}
	a.mu.RLock()
	mode := a.status.Mode
	a.mu.RUnlock()
	if mode != "MANUAL" {
		c.JSON(409, gin.H{"error": "watering requires MANUAL mode"})
		return
	}
	action := "OFF"
	if *in.On {
		action = "ON"
	}
	a.publish("command/pump", gin.H{"action": action, "source": "MINI_APP", "request_id": fmt.Sprintf("req-%d", time.Now().UnixMilli())})
	c.JSON(202, gin.H{"accepted": true})
}

func (a *App) applyPlantProfile(c *gin.Context) {
	var recommendation plantRecommendation
	if c.ShouldBindJSON(&recommendation) != nil || !validPlantRecommendation(recommendation) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ค่าคำแนะนำไม่ถูกต้อง ตรวจสอบช่วงค่าก่อนลองอีกครั้ง"})
		return
	}
	recommendation.PlantName = strings.TrimSpace(recommendation.PlantName)
	if recommendation.PlantName == "" || len([]rune(recommendation.PlantName)) > 100 || len(recommendation.PlantName) > 300 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุชื่อพืชไม่เกิน 100 ตัวอักษร"})
		return
	}

	a.configMu.Lock()
	defer a.configMu.Unlock()
	a.mu.RLock()
	current := a.status
	a.mu.RUnlock()
	if !current.Online || current.LastTelemetryAt.IsZero() || time.Since(current.LastTelemetryAt) > 90*time.Second {
		c.JSON(http.StatusConflict, gin.H{"error": "ESP32 ออฟไลน์ ต้องเชื่อมต่อก่อนจึงจะนำค่าไปใช้ได้"})
		return
	}
	a.mu.RLock()
	mqttClient := a.mqtt
	a.mu.RUnlock()
	if mqttClient == nil || !mqttClient.IsConnected() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "การเชื่อมต่ออุปกรณ์ขัดข้อง กรุณาลองใหม่"})
		return
	}
	version := current.ConfigVersion + 1
	if version == 0 {
		version = 1
	}
	waiter := make(chan bool, 1)
	a.ackMu.Lock()
	a.configWaiters[version] = waiter
	a.ackMu.Unlock()
	payload := gin.H{
		"version":    version,
		"plant_name": recommendation.PlantName,
		"light":      gin.H{"min_lux": recommendation.Light.MinLux, "target_lux": recommendation.Light.TargetLux},
		"watering":   gin.H{"moisture_min_percent": recommendation.Soil.MoistureMinPercent, "moisture_target_percent": recommendation.Soil.MoistureTargetPercent, "pump_duration_ms": 5000},
	}
	body, _ := json.Marshal(payload)
	token := mqttClient.Publish("smartfarm/farm-001/config/set", 1, false, body)
	if !token.WaitTimeout(3*time.Second) || token.Error() != nil {
		a.deleteConfigWaiter(version)
		c.JSON(http.StatusBadGateway, gin.H{"error": "ส่งค่าไปยัง ESP32 ไม่สำเร็จ ลองใหม่อีกครั้ง"})
		return
	}
	select {
	case applied := <-waiter:
		a.deleteConfigWaiter(version)
		if !applied {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "ESP32 ปฏิเสธค่าชุดนี้ กรุณาตรวจสอบช่วงค่า"})
			return
		}
		a.mu.Lock()
		a.status.PlantName = recommendation.PlantName
		a.status.LightMinLux = recommendation.Light.MinLux
		a.status.LightTargetLux = recommendation.Light.TargetLux
		a.status.MoistureMinPercent = recommendation.Soil.MoistureMinPercent
		a.status.MoistureTargetPercent = recommendation.Soil.MoistureTargetPercent
		a.status.ConfigVersion = version
		a.mu.Unlock()
		c.JSON(http.StatusOK, gin.H{"accepted": true, "version": version})
	case <-time.After(5 * time.Second):
		a.deleteConfigWaiter(version)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "ส่งค่าแล้วแต่ยังไม่ได้รับการตอบรับจาก ESP32 กรุณาตรวจสถานะก่อนลองซ้ำ"})
	case <-c.Request.Context().Done():
		a.deleteConfigWaiter(version)
	}
}

func (a *App) deleteConfigWaiter(version uint32) {
	a.ackMu.Lock()
	delete(a.configWaiters, version)
	a.ackMu.Unlock()
}

func (a *App) configAck(_ mqtt.Client, msg mqtt.Message) {
	var ack struct {
		Version uint32 `json:"version"`
		Applied bool   `json:"applied"`
	}
	if json.Unmarshal(msg.Payload(), &ack) != nil || ack.Version == 0 {
		return
	}
	a.ackMu.Lock()
	waiter := a.configWaiters[ack.Version]
	a.ackMu.Unlock()
	if waiter != nil {
		select {
		case waiter <- ack.Applied:
		default:
		}
	}
}

func (a *App) publish(suffix string, payload any) {
	a.mu.RLock()
	client := a.mqtt
	a.mu.RUnlock()
	if client == nil {
		return
	}
	body, _ := json.Marshal(payload)
	client.Publish("smartfarm/farm-001/"+suffix, 1, false, body)
}
func (a *App) lineWebhook(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.Status(400)
		return
	}
	secret := os.Getenv("LINE_CHANNEL_SECRET")
	if secret == "" || !validLineSignature(body, c.GetHeader("X-Line-Signature"), secret) {
		c.Status(401)
		return
	}
	var webhook struct {
		Events []struct {
			Type       string `json:"type"`
			ReplyToken string `json:"replyToken"`
			Source     struct {
				UserID string `json:"userId"`
			} `json:"source"`
			Message struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"message"`
			Postback struct {
				Data string `json:"data"`
			} `json:"postback"`
		} `json:"events"`
	}
	if json.Unmarshal(body, &webhook) != nil {
		c.Status(400)
		return
	}
	for _, event := range webhook.Events {
		command := strings.ToLower(strings.TrimSpace(event.Message.Text))
		if event.Postback.Data != "" {
			values, _ := url.ParseQuery(event.Postback.Data)
			command = values.Get("action")
		}
		message := a.handleLineCommand(command)
		if event.ReplyToken != "" && message != "" {
			go replyLine(event.ReplyToken, message)
		}
	}
	c.Status(200)
}

func (a *App) handleLineCommand(command string) string {
	a.mu.RLock()
	status := a.status
	a.mu.RUnlock()
	switch command {
	case "status", "สถานะ":
		connection := "ออฟไลน์"
		if status.Online {
			connection = "ออนไลน์"
		}
		return fmt.Sprintf("🌱 %s\nอุปกรณ์: %s · %s\nโหมด: %s\nอุณหภูมิ %.1f°C · ความชื้น %.0f%%\nแสง %.0f lux · ดิน %.1f%%\nไฟ %s · ปั๊ม %s", status.PlantName, status.DeviceID, connection, status.Mode, status.TemperatureC, status.HumidityPercent, status.Lux, status.SoilMoisturePercent, onOff(status.LightOn), onOff(status.PumpOn))
	case "auto":
		a.publish("command/mode", gin.H{"mode": "AUTO", "source": "LINE"})
		return "เปิดโหมด AUTO แล้ว — ESP32 จะควบคุมด้วยค่าที่ตั้งไว้"
	case "water":
		if status.Mode != "MANUAL" {
			return "เพื่อความปลอดภัย กรุณาเปลี่ยนเป็น MANUAL ก่อนรดน้ำ"
		}
		action := "ON"
		confirmation := "สั่งเปิดปั๊มแล้ว กดปุ่ม Water อีกครั้งเพื่อปิด"
		if status.PumpOn {
			action = "OFF"
			confirmation = "สั่งปิดปั๊มแล้ว"
		}
		a.publish("command/pump", gin.H{"action": action, "source": "LINE", "request_id": fmt.Sprintf("line-%d", time.Now().UnixMilli())})
		return confirmation
	case "light":
		if status.Mode != "MANUAL" {
			return "เพื่อความปลอดภัย กรุณาเปลี่ยนเป็น MANUAL ก่อนควบคุมไฟ"
		}
		a.publish("command/light", gin.H{"on": !status.LightOn, "source": "LINE"})
		return "ส่งคำสั่งสลับไฟปลูกแล้ว"
	case "help", "ช่วยเหลือ":
		return "ถามเรื่องฟาร์มหรือการดูแลพืชได้เลย\nคำสั่งควบคุม: สถานะ, auto, water, light\nหรือเปิด Smart Farm จาก Rich Menu"
	default:
		return a.chatWithFarm(command)
	}
}

func onOff(value bool) string {
	if value {
		return "เปิด"
	}
	return "ปิด"
}

func replyLine(replyToken, text string) {
	token := firstEnv("LINE_CHANNEL_ACCESS_TOKEN", "LINE_MESSAGING_CHANNEL_ACCESS_TOKEN")
	if token == "" {
		return
	}
	body, _ := json.Marshal(gin.H{"replyToken": replyToken, "messages": []gin.H{{"type": "text", "text": text}}})
	req, _ := http.NewRequest(http.MethodPost, "https://api.line.me/v2/bot/message/reply", strings.NewReader(string(body)))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("LINE reply: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("LINE reply status: %d", resp.StatusCode)
	}
}

func broadcastLine(text string) {
	token := firstEnv("LINE_CHANNEL_ACCESS_TOKEN", "LINE_MESSAGING_CHANNEL_ACCESS_TOKEN")
	if token == "" {
		log.Printf("LINE broadcast skipped: channel access token is not configured")
		return
	}
	body, _ := json.Marshal(gin.H{"messages": []gin.H{{"type": "text", "text": text}}})
	req, _ := http.NewRequest(http.MethodPost, "https://api.line.me/v2/bot/message/broadcast", strings.NewReader(string(body)))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("LINE broadcast: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		response, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		log.Printf("LINE broadcast status: %d %s", resp.StatusCode, strings.TrimSpace(string(response)))
	}
}

func (a *App) authorizeLineUser(c *gin.Context) {
	channelID := firstEnv("LINE_LOGIN_CHANNEL_ID", "LINE_CHANNEL_ID")
	if channelID == "" {
		c.Next()
		return
	}
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if token == "" {
		c.AbortWithStatusJSON(401, gin.H{"error": "LINE authentication required"})
		return
	}
	form := url.Values{"id_token": {token}, "client_id": {channelID}}
	resp, err := http.PostForm("https://api.line.me/oauth2/v2.1/verify", form)
	if err != nil {
		c.AbortWithStatusJSON(503, gin.H{"error": "LINE verification unavailable"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		c.AbortWithStatusJSON(401, gin.H{"error": "invalid LINE identity"})
		return
	}
	var identity struct {
		Sub string `json:"sub"`
	}
	if json.NewDecoder(resp.Body).Decode(&identity) != nil || identity.Sub == "" {
		c.AbortWithStatusJSON(401, gin.H{"error": "invalid LINE identity"})
		return
	}
	c.Set("line_user_id", identity.Sub)
	c.Next()
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}
func validLineSignature(body []byte, signature, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
func requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Printf("%s %s %d %s", c.Request.Method, c.Request.URL.Path, c.Writer.Status(), time.Since(start))
	}
}
func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
