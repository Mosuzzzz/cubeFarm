---
name: Smart Farm
description: A calm Thai-first greenhouse field logbook with instrument-clear telemetry and safety-conscious controls.
colors:
  field-paper: "#f3f0e7"
  botanical-ink: "#193329"
  observation-muted: "#667069"
  rule-line: "#d7d4c8"
  safe-green: "#17755a"
  deep-green: "#0c4e3a"
  soft-mint: "#d7e9df"
  caution-orange: "#d56a2d"
  signal-amber: "#e5b94a"
  sheet-white: "#fffdf7"
  danger-red: "#a94739"
typography:
  display:
    fontFamily: "Newsreader, serif"
    fontSize: "clamp(38px, 6vw, 68px)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Newsreader, serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.05
  body:
    fontFamily: "IBM Plex Sans Thai, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "IBM Plex Sans Thai, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.35
rounded:
  gauge: "3px"
  leaf-mark: "9px 9px 9px 2px"
  control: "8px"
  notice: "10px"
  actuator: "12px"
  sheet: "14px"
  navigation: "17px 17px 0 0"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.safe-green}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.label}"
    rounded: "{rounded.notice}"
    padding: "13px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.botanical-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  mode-active:
    backgroundColor: "{colors.botanical-ink}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.label}"
    rounded: "7px"
    padding: "8px 11px"
  card-sheet:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.botanical-ink}"
    rounded: "{rounded.sheet}"
    padding: "24px"
---

# Design System: Smart Farm

## Overview

**Creative North Star: "The Greenhouse Field Logbook"**

Smart Farm should feel like a careful agronomist's observation book translated into a dependable mobile instrument. Warm paper, fine rules, editorial headings, compact annotations, and tabular measurements create a calm record of the greenhouse rather than a glossy consumer dashboard.

The interface is Thai-first and built for quick operation inside LINE. Important conditions must scan at a glance: green communicates safe or active states, amber marks attention and illumination, and red is reserved for genuine loss of connection or danger. Physical actions remain explicit, bounded, and visibly separate from passive readings.

**Key Characteristics:**

- Warm paper surfaces with botanical ink and fine divider rules.
- Editorial serif headings paired with highly legible Thai sans-serif controls.
- Dense but breathable telemetry arranged like measured field observations.
- Green safe states, amber cautions, and text or icons accompanying every status color.
- Mobile-first controls with large targets and an always-near navigation rail.

## Colors

The palette is agricultural and materially quiet: ink and paper establish the page, while plant green and restrained warning hues carry operational meaning.

### Primary

- **Safe Green:** The principal action, online, healthy, pump, and plant-profile color; use it when the system can proceed safely.
- **Deep Green:** A deeper botanical anchor for strong emphasis and high-contrast green states.

### Secondary

- **Signal Amber:** Focus rings, light readings, and caution without alarm.
- **Caution Orange:** Historical temperature data and elevated attention states.

### Neutral

- **Field Paper:** The continuous application canvas; it should remain visible between observations and controls.
- **Botanical Ink:** Primary text, structural borders, selected modes, safety panels, and the bottom navigation.
- **Observation Muted:** Supporting timestamps, units, notes, and inactive states.
- **Rule Line:** Hairline separators that organize information without turning sections into boxes.
- **Sheet White:** Raised analytical and profile sheets, plus contained segmented controls.
- **Soft Mint:** Safe explanatory callouts and active water states.
- **Danger Red:** Offline and unsafe conditions only.

**The Semantic Field Rule.** Green means safe or active, amber means caution or illumination, and red means a real fault; never use these colors decoratively in ways that weaken their operational meaning.

**The Red Rarity Rule.** Danger red appears only when the operator needs to recognize a fault or blocked unsafe state.

## Typography

**Display Font:** Newsreader (with serif fallback)  
**Body Font:** IBM Plex Sans Thai (with sans-serif fallback)

**Character:** Newsreader gives farm names and section titles the authority of a printed field journal. IBM Plex Sans Thai keeps measurements, labels, and controls compact, contemporary, and highly legible on a phone.

### Hierarchy

- **Display** (600, fluid 38–68px, 0.98): Plant names and page headings; use sparingly as the dominant reading anchor.
- **Title** (600, 25px, 1.05): Section headings and profile titles.
- **Body** (400, 12px, 1.35): Explanations, notes, and Thai operational copy; longer descriptions stay near 62 characters per line.
- **Label** (700, 11px, 1.35): Controls, eyebrow labels, and compact system metadata.
- **Telemetry Value** (600, fluid 30–44px, 1): Large readings use tabular numerals and tight tracking for stable scanning.

**The Two-Voice Rule.** Newsreader speaks only for names and editorial hierarchy; IBM Plex Sans Thai carries every measurement, state, explanation, and action.

## Layout

The application uses a centered 1120px maximum content column with 20px side gutters and a 68px sticky header. Desktop telemetry forms a four-column observation row; actuator controls sit in a three-column strip, and thin rules connect related material without wrapping every item in a card.

At 760px and below, telemetry becomes a two-column grid, actuator controls move ahead of readings, and the bottom navigation becomes sticky in document flow. At 520px, the heading and mode selector stack. At 390px, nonessential connection copy collapses to its icon and profile content becomes a single column. Interactive controls maintain a 44px minimum height in the primary mobile operating view.

Spacing follows a compact 4/8/12/20/24/32px rhythm. Prefer open paper separated by rules; reserve filled sheets for charts, profiles, safety explanations, and other coherent instruments.

**The Observation-First Rule.** Arrange measurements by scan order and relationship, not by decorative card symmetry.

## Elevation & Depth

The system is flat by default. Fine rules and tonal shifts provide most hierarchy; shadows appear only on temporary overlays, fixed navigation, and discrete sheet-like analytical surfaces. Shadows are diffuse botanical-ink tints, never hard black outlines.

### Shadow Vocabulary

- **Sheet Lift** (`0 8px 26px rgba(25,51,41,.06)`): Profile and analytical sheets that sit above the field-paper canvas.
- **Chart Lift** (`0 7px 20px rgba(25,51,41,.06)`): Compact analytical containers.
- **Toast Lift** (`0 8px 24px rgba(25,51,41,.2)`): Temporary confirmations that must remain legible above content.
- **Navigation Lift** (`0 -10px 30px rgba(25,51,41,.12)`): The bottom navigation's separation from scrolling content.

**The Paper-Before-Shadow Rule.** Establish hierarchy with paper tone, rules, and spacing before adding elevation.

## Shapes

Corners are gently practical, not pill-like. Controls use 7–10px radii; instrument sheets use 14px; the navigation tray uses a 17px rounded top edge. Organic identity appears through selective asymmetry: the leaf brand mark uses a clipped lower-left corner, and the plant specimen mark combines square and rounded corners. Hairline borders remain crisp and gauges use a narrow 3px capsule.

**The Field-Tool Rule.** Keep geometry compact and tactile; avoid oversized pills or ornamental blobs that make controls feel promotional.

## Components

### Buttons

- **Shape:** Compact, gently rounded controls (7–10px); mobile operating buttons reach at least 44px high.
- **Primary:** Safe Green with Sheet White text and bold label typography; full-width actions use 13px vertical padding.
- **Outline:** Transparent paper with a Botanical Ink hairline and 8px radius.
- **Hover / Focus:** Preserve the semantic color and show a 3px Signal Amber focus outline with 3px offset; disabled controls lower opacity and remove the pointer affordance.

### Chips

- **Mode Selector:** A Sheet White segmented frame with a Botanical Ink border. The selected AUTO, MANUAL, or SAFE segment inverts to Botanical Ink with white text.
- **Metric Tabs:** Transparent, Rule Line bordered tabs; the selected metric uses Botanical Ink fill.

### Cards / Containers

- **Corner Style:** Sheet-like 14px corners for charts, profiles, and dark safety callouts.
- **Background:** Sheet White for analysis and configuration, Soft Mint for safe explanations, Botanical Ink for strong safety doctrine.
- **Shadow Strategy:** Flat for repeated rows; use Sheet Lift only for a coherent elevated instrument.
- **Border:** Prefer Rule Line separators between repeated facts rather than individual card outlines.
- **Internal Padding:** 18–24px on sheets; 12–20px on compact observations.

### Inputs / Fields

No text-entry field is established yet. Future fields should use the Body typeface, a Field Paper or Sheet White surface, an 8–10px radius, and a Rule Line border. Focus must use the same 3px Signal Amber outline as existing controls; errors require Danger Red plus explicit Thai text.

### Navigation

The bottom navigation is a Botanical Ink tray with four equal destinations. Inactive icons and Thai labels are muted green-gray; the active destination receives a lighter green-ink panel and white content. The top bar stays translucent over Field Paper, separated by one rule and a restrained blur.

### Telemetry Gauge

Use a 5px horizontal track with a filled current-value segment and two one-pixel threshold marks. Water uses Safe Green; light uses Signal Amber. Always pair the gauge with its numeric value, unit, and written threshold note.

### Event Row

Event rows are ledger entries separated by Rule Line. A small 34px icon tile carries actuator identity, the center contains action and reason, and the timestamp aligns at the trailing edge.

## Do's and Don'ts

### Do:

- **Do** preserve the Field Paper canvas and use rules to organize repeated observations.
- **Do** pair every green, amber, or red state with Thai text and an icon or explicit label.
- **Do** use tabular numerals for changing telemetry and keep units visually secondary.
- **Do** make the cause, limit, duration, and result of every physical action visible.
- **Do** respect reduced-motion preferences and retain the high-visibility amber keyboard focus ring.

### Don't:

- **Don't** turn telemetry into a grid of heavy floating cards when a shared ruled field communicates the relationship better.
- **Don't** use green as generic decoration, amber as celebration, or red for anything less than a fault or unsafe condition.
- **Don't** let AI recommendations resemble direct actuator commands; reviewable guidance and physical control remain visually distinct.
- **Don't** use Newsreader for dense Thai body copy, units, controls, or system states.
- **Don't** hide operational meaning behind color alone or reduce primary mobile controls below a 44px touch target.
