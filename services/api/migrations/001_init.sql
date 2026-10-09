CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), line_user_id text UNIQUE NOT NULL, display_name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS farms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid REFERENCES users(id), name text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Bangkok', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS devices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid REFERENCES farms(id), device_uid text UNIQUE NOT NULL, name text NOT NULL, firmware_version text, last_seen_at timestamptz, status text NOT NULL DEFAULT 'offline');
CREATE TABLE IF NOT EXISTS sensor_readings (id bigserial PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), temperature_c double precision, humidity_percent double precision, lux double precision, soil_moisture_percent double precision, recorded_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sensor_readings_device_time_idx ON sensor_readings(device_id, recorded_at DESC);
CREATE TABLE IF NOT EXISTS plant_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid REFERENCES farms(id), plant_name text NOT NULL, profile_json jsonb NOT NULL, source_type text NOT NULL, active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_recommendations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid REFERENCES farms(id), plant_name text NOT NULL, model text NOT NULL, raw_response jsonb, validated_profile_json jsonb NOT NULL, grounding_metadata_json jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS actuator_events (id bigserial PRIMARY KEY, device_id uuid REFERENCES devices(id), actuator text NOT NULL, action text NOT NULL, duration_ms integer, source text NOT NULL, reason text NOT NULL, request_id text, recorded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS alerts (id bigserial PRIMARY KEY, device_id uuid REFERENCES devices(id), severity text NOT NULL, type text NOT NULL, message text NOT NULL, acknowledged_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS device_configurations (id bigserial PRIMARY KEY, device_id uuid REFERENCES devices(id), version bigint NOT NULL, config_json jsonb NOT NULL, applied_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(device_id, version));

INSERT INTO farms (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Smart Farm') ON CONFLICT (id) DO NOTHING;
INSERT INTO devices (farm_id, device_uid, name, status) VALUES ('00000000-0000-0000-0000-000000000001', 'farm-001', 'ESP32 Farm Controller', 'online') ON CONFLICT (device_uid) DO NOTHING;

