package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

func (a *App) chatWithFarm(question string) string {
	question = strings.TrimSpace(question)
	if question == "" {
		return "ถามเรื่องสถานะฟาร์ม การดูแลพืช หรือพิมพ์ “ช่วยเหลือ” เพื่อดูคำสั่งได้เลยครับ"
	}
	runes := []rune(question)
	if len(runes) > 500 {
		question = string(runes[:500])
	}

	apiKey := strings.TrimSpace(os.Getenv("GROQ_API_KEY"))
	if apiKey == "" {
		return chatbotFallback()
	}
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "qwen/qwen3.8-27b"
	}

	a.mu.RLock()
	status := a.status
	a.mu.RUnlock()
	online := status.Online && !status.LastTelemetryAt.IsZero() && time.Since(status.LastTelemetryAt) <= 90*time.Second
	statusContext := fmt.Sprintf(
		"device=%s online=%t mode=%s plant=%s weather_sensor_valid=%t soil_sensor_valid=%t temperature=%.1fC humidity=%.1f%% light=%.0flux soil_moisture=%.1f%% light_on=%t pump_on=%t",
		status.DeviceID, online, status.Mode, status.PlantName, status.WeatherValid, status.SoilValid,
		status.TemperatureC, status.HumidityPercent, status.Lux, status.SoilMoisturePercent, status.LightOn, status.PumpOn,
	)

	body, _ := json.Marshal(map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": "คุณคือผู้ช่วย Smart Farm ตอบภาษาเดียวกับผู้ใช้ กระชับ เป็นมิตร และใช้ข้อมูลสถานะที่ให้มาเท่านั้นเมื่อพูดถึงค่าปัจจุบัน ถ้า sensor_valid=false ห้ามนำค่าของเซนเซอร์นั้นไปวิเคราะห์และต้องบอกว่าเซนเซอร์อ่านไม่ได้ ห้ามอ้างว่าได้สั่งอุปกรณ์แล้ว ห้ามสร้างคำสั่งควบคุมใหม่ คำสั่งที่รองรับคือ สถานะ, auto, water, light และคำสั่งควบคุมต้องให้ผู้ใช้ส่งเป็นข้อความแยก หลีกเลี่ยงคำแนะนำที่อาจทำให้พืชหรืออุปกรณ์เสียหาย"},
			{"role": "system", "content": "สถานะฟาร์มปัจจุบัน: " + statusContext},
			{"role": "user", "content": question},
		},
		"reasoning_effort": "none",
		"temperature":      0.3,
		"max_tokens":       350,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return chatbotFallback()
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		log.Printf("LINE chatbot Groq request: %v", err)
		return chatbotFallback()
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		response, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		log.Printf("LINE chatbot Groq status: %d %s", resp.StatusCode, strings.TrimSpace(string(response)))
		return chatbotFallback()
	}
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result) != nil || len(result.Choices) == 0 {
		return chatbotFallback()
	}
	answer := strings.TrimSpace(result.Choices[0].Message.Content)
	if answer == "" {
		return chatbotFallback()
	}
	answerRunes := []rune(answer)
	if len(answerRunes) > 1500 {
		answer = string(answerRunes[:1500])
	}
	return answer
}

func chatbotFallback() string {
	return "ตอนนี้ผู้ช่วยตอบคำถามเพิ่มเติมไม่ได้ชั่วคราว แต่ยังใช้คำสั่งได้: สถานะ, auto, water, light หรือ ช่วยเหลือ"
}
