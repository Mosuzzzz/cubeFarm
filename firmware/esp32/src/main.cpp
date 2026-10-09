#include <Arduino.h>
#include <ArduinoJson.h>
#include <ModbusMaster.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <Wire.h>
#if __has_include("../include/secrets.h")
#include "../include/secrets.h"
#else
#include "../include/secrets.example.h"
#warning "Using placeholder Wi-Fi/MQTT credentials from secrets.example.h"
#endif

// ET-SMART FARM V1 mapping, preserved from the original sketch.
constexpr char DEVICE_ID[] = "farm-001";
constexpr int MODBUS_RX_PIN = 26, MODBUS_TX_PIN = 27;
constexpr uint8_t WEATHER_ID = 247, SOIL_ID = 1, RELAY_PCF_ADDRESS = 0x38;
constexpr uint8_t LIGHT_RELAY_MASK = 0x01, PUMP_RELAY_MASK = 0x04;
constexpr uint32_t SAMPLE_MS = 5000, TELEMETRY_MS = 30000, SENSOR_STALE_MS = 15000;

struct Config
{
    uint32_t version = 1;
    String mode = "AUTO", plantName = "มะเขือเทศเชอร์รี";
    float lightMinLux = 15000, lightTargetLux = 22000, moistureMin = 35, moistureTarget = 50;
    uint32_t pumpMs = 5000, maxPumpMs = 10000;
} config;
struct State
{
    float temperature = NAN, humidity = NAN, lux = NAN, soil = NAN;
    bool weatherValid = false, soilValid = false, lightOn = false, pumpOn = false;
    uint8_t weatherError = 0, soilError = 0, soilValidStreak = 0;
    uint16_t soilRaw = 0;
    uint32_t weatherAt = 0, soilAt = 0, pumpOffAt = 0, lastSample = 0, lastTelemetry = 0;
} state;

HardwareSerial modbusSerial(2);
ModbusMaster weatherSensor, soilSensor;
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
Preferences prefs;
uint8_t relayPort = 0xFF;
bool deadlineReached(uint32_t now, uint32_t deadline) { return static_cast<int32_t>(now - deadline) >= 0; }
bool writeRelay(uint8_t mask, bool on)
{
    uint8_t candidate = on ? relayPort & static_cast<uint8_t>(~mask) : relayPort | mask;
    Wire.beginTransmission(RELAY_PCF_ADDRESS);
    Wire.write(candidate);
    if (Wire.endTransmission() != 0)
        return false;
    relayPort = candidate;
    return true;
}
bool setLight(bool on)
{
    if (!writeRelay(LIGHT_RELAY_MASK, on))
        return false;
    state.lightOn = on;
    return true;
}
bool soilReady() { return state.soilValid && state.soilValidStreak >= 3 && millis() - state.soilAt <= SENSOR_STALE_MS; }
bool setPump(bool on, uint32_t duration = 0, bool requireSoil = true)
{
    if (on)
    {
        if ((requireSoil && !soilReady()) || state.pumpOn)
            return false;
        if (duration > 0)
        {
            duration = min(duration, config.maxPumpMs);
            if (duration < 100)
                return false;
        }
    }
    if (!writeRelay(PUMP_RELAY_MASK, on))
        return false;
    state.pumpOn = on;
    state.pumpOffAt = on && duration > 0 ? millis() + duration : 0;
    return true;
}

void loadConfig()
{
    prefs.begin("smartfarm", true);
    config.version = prefs.getUInt("version", config.version);
    config.mode = prefs.getString("mode", config.mode);
    config.plantName = prefs.getString("plantName", config.plantName);
    config.lightMinLux = prefs.getFloat("lightMin", config.lightMinLux);
    config.lightTargetLux = prefs.getFloat("lightTarget", config.lightTargetLux);
    config.moistureMin = prefs.getFloat("moistureMin", config.moistureMin);
    config.moistureTarget = prefs.getFloat("moistureTarget", config.moistureTarget);
    config.pumpMs = prefs.getUInt("pumpMs", config.pumpMs);
    config.maxPumpMs = prefs.getUInt("maxPumpMs", config.maxPumpMs);
    prefs.end();
}
void saveConfig()
{
    prefs.begin("smartfarm", false);
    prefs.putUInt("version", config.version);
    prefs.putString("mode", config.mode);
    prefs.putString("plantName", config.plantName);
    prefs.putFloat("lightMin", config.lightMinLux);
    prefs.putFloat("lightTarget", config.lightTargetLux);
    prefs.putFloat("moistureMin", config.moistureMin);
    prefs.putFloat("moistureTarget", config.moistureTarget);
    prefs.putUInt("pumpMs", config.pumpMs);
    prefs.putUInt("maxPumpMs", config.maxPumpMs);
    prefs.end();
}

void readSensors()
{
    uint8_t result = weatherSensor.readInputRegisters(0, 5);
    state.weatherError = result;
    if (result == weatherSensor.ku8MBSuccess)
    {
        float t = static_cast<int16_t>(weatherSensor.getResponseBuffer(1)) / 10.0f, h = static_cast<int16_t>(weatherSensor.getResponseBuffer(2)) / 10.0f, l = static_cast<int16_t>(weatherSensor.getResponseBuffer(4)) / 10.0f;
        state.weatherValid = t >= -40 && t <= 85 && h >= 0 && h <= 100 && l >= 0 && l <= 200000;
        if (state.weatherValid)
        {
            state.temperature = t;
            state.humidity = h;
            state.lux = l;
            state.weatherAt = millis();
        }
    }
    else
        state.weatherValid = false;
    delay(50);
    result = soilSensor.readHoldingRegisters(1, 1);
    state.soilError = result;
    if (result == soilSensor.ku8MBSuccess)
    {
        uint16_t vwc = soilSensor.getResponseBuffer(0);
        state.soilRaw = vwc;
        state.soilValid = vwc <= 10000;
        if (state.soilValid)
        {
            state.soil = vwc / 100.0f;
            state.soilAt = millis();
            if (state.soilValidStreak < 3)
                ++state.soilValidStreak;
        }
        else
            state.soilValidStreak = 0;
    }
    else
    {
        state.soilValid = false;
        state.soilValidStreak = 0;
    }
    Serial.printf("Sensors weather err=0x%02X valid=%d temp=%.1f humidity=%.1f lux=%.1f | soil err=0x%02X valid=%d raw=%u vwc=%.2f\n",
                  state.weatherError, state.weatherValid, state.temperature, state.humidity, state.lux,
                  state.soilError, state.soilValid, state.soilRaw, state.soil);
}

void publishTelemetry()
{
    if (!mqtt.connected())
        return;
    JsonDocument doc;
    doc["device_id"] = DEVICE_ID;
    if (state.weatherValid)
    {
        doc["temperature_c"] = state.temperature;
        doc["humidity_percent"] = state.humidity;
        doc["lux"] = state.lux;
    }
    else
    {
        doc["temperature_c"] = nullptr;
        doc["humidity_percent"] = nullptr;
        doc["lux"] = nullptr;
    }
    if (state.soilValid)
        doc["soil_moisture_percent"] = state.soil;
    else
        doc["soil_moisture_percent"] = nullptr;
    doc["weather_valid"] = state.weatherValid;
    doc["soil_valid"] = soilReady();
    doc["weather_error"] = state.weatherError;
    doc["soil_error"] = state.soilError;
    doc["soil_raw"] = state.soilRaw;
    doc["light_on"] = state.lightOn;
    doc["pump_on"] = state.pumpOn;
    doc["mode"] = config.mode;
    doc["plant_name"] = config.plantName;
    doc["light_min_lux"] = config.lightMinLux;
    doc["light_target_lux"] = config.lightTargetLux;
    doc["moisture_min_percent"] = config.moistureMin;
    doc["moisture_target_percent"] = config.moistureTarget;
    doc["config_version"] = config.version;
    char payload[768];
    serializeJson(doc, payload);
    String topic = "smartfarm/" + String(DEVICE_ID) + "/telemetry";
    // Retain the latest state so the API restores the active plant immediately
    // after a restart instead of briefly falling back to its demo profile.
    bool published = mqtt.publish(topic.c_str(), payload, true);
    Serial.printf("Telemetry publish=%d mqtt_state=%d topic=%s payload=%s\n",
                  published, mqtt.state(), topic.c_str(), payload);
}
void publishAck(uint32_t version, bool applied)
{
    JsonDocument doc;
    doc["version"] = version;
    doc["applied"] = applied;
    char payload[128];
    serializeJson(doc, payload);
    String topic = "smartfarm/" + String(DEVICE_ID) + "/config/ack";
    mqtt.publish(topic.c_str(), payload, false);
}

void onMessage(char *topic, byte *payload, unsigned int length)
{
    JsonDocument doc;
    if (deserializeJson(doc, payload, length))
        return;
    String value(topic);
    if (value.endsWith("/command/mode"))
    {
        String mode = doc["mode"] | "";
        if (mode == "AUTO" || mode == "MANUAL" || mode == "SAFE")
        {
            if (mode != "MANUAL" && state.pumpOn && state.pumpOffAt == 0)
                setPump(false);
            config.mode = mode;
            if (mode == "SAFE")
            {
                setPump(false);
                setLight(false);
            }
            saveConfig();
            publishTelemetry();
        }
    }
    else if (value.endsWith("/command/light") && config.mode == "MANUAL")
        setLight(doc["on"] | false);
    else if (value.endsWith("/command/pump") && config.mode == "MANUAL")
    {
        String action = doc["action"] | "";
        if (action == "ON")
            setPump(true, 0, false);
        else if (action == "OFF")
            setPump(false);
        publishTelemetry();
    }
    else if (value.endsWith("/config/set"))
    {
        uint32_t version = doc["version"] | 0U;
        String plantName = doc["plant_name"] | config.plantName;
        float lightMin = doc["light"]["min_lux"] | config.lightMinLux, lightTarget = doc["light"]["target_lux"] | config.lightTargetLux, moistureMin = doc["watering"]["moisture_min_percent"] | config.moistureMin, moistureTarget = doc["watering"]["moisture_target_percent"] | config.moistureTarget;
        uint32_t pumpMs = doc["watering"]["pump_duration_ms"] | config.pumpMs;
        bool valid = version > config.version && plantName.length() > 0 && plantName.length() <= 300 && lightMin >= 0 && lightTarget > lightMin && lightTarget <= 200000 && moistureMin > 0 && moistureMin < moistureTarget && moistureTarget <= 100 && pumpMs >= 100 && pumpMs <= config.maxPumpMs;
        if (valid)
        {
            config.version = version;
            config.plantName = plantName;
            config.lightMinLux = lightMin;
            config.lightTargetLux = lightTarget;
            config.moistureMin = moistureMin;
            config.moistureTarget = moistureTarget;
            config.pumpMs = pumpMs;
            saveConfig();
            publishAck(version, true);
            publishTelemetry();
        }
        else if (version > config.version)
        {
            publishAck(version, false);
        }
    }
}

void connectNetwork()
{
    static uint32_t lastAttempt = millis();
    static uint32_t lastMqttAttempt = 0;
    static bool wasConnected = false;
    if (WiFi.status() != WL_CONNECTED)
    {
        wasConnected = false;
        if (millis() - lastAttempt < 30000)
            return;
        lastAttempt = millis();
        // Finish the previous attempt before retrying with the saved credentials.
        // Auto-reconnect is disabled so only this loop owns retries.
        Serial.printf("Wi-Fi retry (status %d)\n", WiFi.status());
        WiFi.disconnect();
        WiFi.reconnect();
        return;
    }
    lastAttempt = millis();
    if (!wasConnected)
    {
        wasConnected = true;
        Serial.print("Wi-Fi connected, IP: ");
        Serial.println(WiFi.localIP());
    }
    if (mqtt.connected())
        return;
    if (millis() - lastMqttAttempt < 5000)
        return;
    lastMqttAttempt = millis();
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setCallback(onMessage);
    String client = "smartfarm-" + String(DEVICE_ID);
    if (mqtt.connect(client.c_str(), MQTT_USER, MQTT_PASSWORD))
    {
        Serial.printf("MQTT connected to %s:%u\n", MQTT_HOST, MQTT_PORT);
        String commands = "smartfarm/" + String(DEVICE_ID) + "/command/#", configuration = "smartfarm/" + String(DEVICE_ID) + "/config/set";
        mqtt.subscribe(commands.c_str(), 1);
        mqtt.subscribe(configuration.c_str(), 1);
        publishTelemetry();
    }
    else
        Serial.printf("MQTT connect failed, state=%d host=%s:%u\n", mqtt.state(), MQTT_HOST, MQTT_PORT);
}
void automate()
{
    if (config.mode != "AUTO")
        return;
    if (state.weatherValid && millis() - state.weatherAt <= SENSOR_STALE_MS)
    {
        if (state.lux < config.lightMinLux)
            setLight(true);
        else if (state.lux >= config.lightTargetLux)
            setLight(false);
    }
    if (!soilReady())
    {
        if (state.pumpOn)
            setPump(false);
        return;
    }
    if (state.soil < config.moistureMin && !state.pumpOn)
        setPump(true, config.pumpMs);
}

void setup()
{
    Serial.begin(115200);
    Wire.begin(21, 22);
    writeRelay(LIGHT_RELAY_MASK, false);
    writeRelay(PUMP_RELAY_MASK, false);
    modbusSerial.begin(9600, SERIAL_8N1, MODBUS_RX_PIN, MODBUS_TX_PIN);
    weatherSensor.begin(WEATHER_ID, modbusSerial);
    soilSensor.begin(SOIL_ID, modbusSerial);
    loadConfig();
    mqtt.setBufferSize(768);
    state.lastSample = millis() - SAMPLE_MS;
    state.lastTelemetry = millis() - TELEMETRY_MS;
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    connectNetwork();
}
void loop()
{
    connectNetwork();
    mqtt.loop();
    uint32_t now = millis();
    if (state.pumpOn && state.pumpOffAt != 0 && deadlineReached(now, state.pumpOffAt))
    {
        setPump(false);
        publishTelemetry();
    }
    if (now - state.lastSample >= SAMPLE_MS)
    {
        state.lastSample = now;
        readSensors();
        automate();
    }
    if (now - state.lastTelemetry >= TELEMETRY_MS)
    {
        state.lastTelemetry = now;
        publishTelemetry();
    }
    delay(10);
}
