# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16, React 19, TypeScript, and Tailwind CSS for the LINE MINI App; Go and Gin for the API; PostgreSQL for persistence; Mosquitto MQTT for device messaging; ESP32 Arduino firmware; Docker Compose, Nginx, and Cloudflare Tunnel for deployment.

## Users

The sole user is the farm Owner. The Owner monitors one smart farm, reviews its history, configures the active plant, switches operating mode, and safely controls the light and water pump from LINE.

## Product Purpose

Smart Farm monitors a plant's environment and automates lighting and irrigation while giving the Owner a clear, mobile-first control surface inside LINE. A successful demonstration shows live telemetry, safe manual control, plant configuration, history, and continued local automation while the backend is offline.

## Positioning

AI researches and recommends plant requirements, but the ESP32 owns physical safety and local automation. The farm remains safe and operational without internet access.

## Operating Context

The Owner uses a LINE MINI App and LINE Official Account. The ESP32 and Mosquitto run on the same LAN as a local Ubuntu server. Public HTTPS access is limited to the web application, API, and LINE webhook.

## Capabilities and Constraints

- Monitor light, calibrated soil moisture, temperature, humidity, connectivity, mode, and relay states.
- Support AUTO, MANUAL, and SAFE modes.
- Time-limit every pump activation and enforce cooldown and sensor-validity rules locally.
- Store sensor, actuator, configuration, recommendation, and alert history.
- Let the Owner review or edit validated Gemini recommendations before applying them.
- Never allow Gemini to publish device commands or directly control a relay.
- Keep secrets server-side and verify LINE webhook and LIFF identities.
- The MVP has one Owner role; multi-user sharing and role-based access are not included.

## Brand Commitments

The product name is Smart Farm. Interface copy should be direct, calm, and safety-conscious. Technical values and states must be understandable at a glance on a phone.

## Evidence on Hand

- `docs/Smart Farm Project Overview.md`
- `docs/Smart Farm SRS.md`
- No existing logo, visual identity, production telemetry, testimonials, or photography is supplied. Demonstration values must be clearly labeled as sample data.

## Product Principles

1. Local automation remains safe without the cloud.
2. The Owner can understand current conditions at a glance.
3. Every physical action has a visible cause, limit, and result.
4. AI recommendations remain reviewable, sourced, and separate from actuator control.
5. Mobile operation inside LINE is the primary interaction.

## Accessibility & Inclusion

The mobile web interface should meet WCAG 2.1 AA contrast and keyboard/focus expectations, avoid color-only status communication, and respect reduced-motion preferences.
