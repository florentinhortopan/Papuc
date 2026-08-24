# Papuc iOS Design System

Stitch project: `projects/3060932858356978304` (Papuc iOS)
Design system asset: `assets/3b2bafb1266444b6afbeee1a749df6f9`

## Product
Voice-first DSCR deal scout. Airbnb-like mobile discovery — not a desktop catalogue.

## Principles
- Photo-forward vertical feed (full-bleed listing images)
- Secondary UI in bottom sheets with grabber + detents (peek / half / full)
- Contained underwriting panels inside deal sheet (accordions)
- Thumb-zone primary actions (Save / Skip / Talk)
- Brand + one conversational CTA on Home: Talk to Papuc
- No multi-column dashboards, no dense KPI strips in first viewport

## Colors
- background: #0B0B0F
- surface: #16161D
- surfaceAlt: #1F1F29
- border: #2A2A36
- primary (Papuc violet): #7C5CFF
- text: #F5F5F7
- textMuted: #9AA0AA
- success: #3DDC97
- warning: #FFB454
- danger: #FF5C7A
- glass: rgba(22,22,29,0.72)

## Sheet map
| Surface | Presentation | Detent |
|---------|--------------|--------|
| Filters | Modal sheet | half |
| Deal peek | Sheet over feed | ~45–50% |
| Deal full | Expanded sheet | full |
| Voice | Full-screen cover | — |
| Push permission | Modal sheet | half |
| Share / Why score | Modal sheet | half |

## Stitch screens
- Home Discovery
- Property Deal Peek Sheet
- Voice Concierge (+ animated)

## Motion
Sheet spring present/dismiss. Subtle card image scale. Voice chip bubble-in / mic pulse.

## Iterate loop
1. Edit in Stitch → update tokens here + RN components
2. Dev Client + Metro hot reload
3. `eas update --channel preview` for JS-only
4. TestFlight binary when native changes
