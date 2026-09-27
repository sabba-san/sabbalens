# Sabbalens Design System

**Version:** 1.0  
**Status:** Implementation-ready  
**Owner:** Product / Design  

---

## 1. Brand Strategy

| Dimension | Definition |
|---|---|
| **Name** | Sabbalens |
| **Category** | Developer tool × Photography pipeline |
| **Audience** | Photographers & builders automating geo-aware social posts |
| **Personality** | Precise, brutalist-functional, calm, trustworthy |
| **Core Metaphor** | **FOCUS** — focus-peaking corner brackets + GPS crosshair + light-table frame |
| **Promise** | "Every frame, placed." |
| **Avoid** | Generic camera icons, purple/blue AI gradients, Inter, serif fonts, decorative UI |

---

## 2. Visual Mode

**Dark Developer / Builder** — near-black panels, monospace data, terminal aesthetic, single high-contrast accent.

---

## 3. Color System

### Palette (Locked)

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#09090B` | Page background (Zinc-950) |
| `--color-surface` | `#18181B` | Cards, dropzones, modals (Zinc-900) |
| `--color-surface-hover` | `#1F1F23` | Hover states |
| `--color-border` | `#27272A` | Hairlines, dividers (Zinc-800) |
| `--color-fg` | `#FAFAFA` | Primary text (Zinc-50) |
| `--color-fg-muted` | `#71717A` | Secondary text (Zinc-500) |
| `--color-accent` | `#FF2B2B` | **Focus Peaking** — CTAs, focus rings, status `scheduled`, reticle overlays |
| `--color-accent-hover` | `#FF5555` | Accent hover |
| `--color-success` | `#22C55E` | Status `published` (Green-500) |
| `--color-warning` | `#F59E0B` | Status `pending` (Amber-500) |
| `--color-error` | `#EF4444` | Status `failed` (Red-500) |

### Usage Rules

- **One accent only** — `#FF2B2B` carries all interactive emphasis.
- No gradients, no purple/blue glow, no additional accent colors.
- Background is always `#09090B`; photographs are the brightest elements.
- Surfaces `#18181B` for upload zones, metadata cards, command bars.

---

## 4. Typography

### Font Stack

| Role | Font | Fallback | Weight |
|---|---|---|---|
| **Display / UI** | `Satoshi` (preferred) / `Geist` | `system-ui, sans-serif` | 400, 500, 700 |
| **Data / Mono** | `JetBrains Mono` | `IBM Plex Mono, ui-monospace, monospace` | 400, 500 |

### Scale (Rem-based, Fluid)

| Token | Size | Line Height | Letter-Spacing | Usage |
|---|---|---|---|---|
| `--text-display` | `clamp(2.5rem, 5vw, 4rem)` | 1.05 | `-0.02em` | Hero, logo wordmark |
| `--text-h1` | `clamp(1.75rem, 3vw, 2.5rem)` | 1.1 | `-0.01em` | Page titles |
| `--text-h2` | `1.5rem` | 1.2 | `-0.01em` | Section heads |
| `--text-body` | `1rem` | 1.5 | `0` | Body copy |
| `--text-sm` | `0.875rem` | 1.5 | `0` | UI labels |
| `--text-xs` | `0.75rem` | 1.4 | `0.02em` | Timestamps, badges |
| `--text-mono` | `0.875rem` | 1.6 | `0` | EXIF, GPS, code, timestamps |
| `--text-mono-sm` | `0.75rem` | 1.5 | `0` | Inline coordinates |

### Rules

- **Ban:** `Inter`, all serif families.
- Tracking tight on display (`-0.02em` to `-0.01em`).
- Mono for all coordinates, timestamps, EXIF, CLI output.
- No fake tiny body copy — minimum readable `0.75rem`.

---

## 5. Logo System

### Mark Construction

```
┌─┐     ┌─┐
│   +   │  =  S-mark (focus brackets + crosshair)
└─┘     └─┘
```

- Two focus-peaking corner brackets forming `S` negative space.
- Center crosshair = GPS reticle + pipeline node.
- Single path, scalable to 16px favicon.

### Variants

| Variant | Use Case | Clear Space |
|---|---|---|
| **Primary** | App header, favicon, splash | 1× mark height |
| **Wordmark** | Marketing, login, footer | 1× cap height |
| **Mark Only** | App icon, browser tab, badge | 0.5× mark height |
| **Badge** | Physical, print, seal | 1.5× mark height |

### Forbidden

- Recoloring accent outside `#FF2B2B` / `#FAFAFA`.
- Adding drop shadows, glows, outlines.
- Stretching, rotating, enclosing in shapes.

---

## 6. Spacing & Grid

### Base Unit

`--space-1 = 4px` — all spacing multiples of 4px.

### Scale

| Token | Value | Usage |
|---|---|---|
| `--space-1` | `4px` | Icon gaps, inline |
| `--space-2` | `8px` | Chip padding, tight |
| `--space-3` | `12px` | Card inner gap |
| `--space-4` | `16px` | Card padding, standard |
| `--space-5` | `24px` | Section gap |
| `--space-6` | `32px` | Panel gap |
| `--space-8` | `48px` | Page section gap |
| `--space-10` | `64px` | Hero gap |

### Layout Grid

- **Container:** `max-width: 1200px`, centered, `padding: var(--space-6)`.
- **Gutters:** `var(--space-4)` between columns.
- **Panels:** `var(--space-6)` gap on brand boards.

---

## 7. Corner Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-none` | `0` | Full-bleed images, code blocks |
| `--radius-sm` | `4px` | Chips, badges, inputs |
| `--radius-md` | `8px` | Cards, dropzones, buttons |
| `--radius-lg` | `12px` | Modals, sheets |
| `--radius-full` | `9999px` | Pills, avatar, focus rings |

---

## 8. Shadows & Elevation

| Token | Value | Usage |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgba(0,0,0,0.3)` | Cards, default |
| `--shadow-2` | `0 4px 12px rgba(0,0,0,0.4)` | Modals, dropdowns |
| `--shadow-focus` | `0 0 0 2px #FF2B2B` | **Focus ring only** — never default blue |

---

## 9. Motion & Timing

| Token | Value | Usage |
|---|---|---|
| `--duration-fast` | `120ms` | Hover, tap |
| `--duration-base` | `200ms` | Transitions, accordion |
| `--duration-slow` | `300ms` | Modals, sheets |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Enter animations |

**Reduced motion:** Respect `prefers-reduced-motion: reduce` — disable non-essential motion.

---

## 10. Components

### 10.1 Button

```css
.btn {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 500;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--duration-fast), border-color var(--duration-fast);
}

.btn-primary {
  background: var(--color-accent);
  color: var(--color-bg);
}
.btn-primary:hover { background: var(--color-accent-hover); }
.btn-primary:focus-visible { outline: none; box-shadow: var(--shadow-focus); }

.btn-ghost {
  background: transparent;
  color: var(--color-fg);
  border-color: var(--color-border);
}
.btn-ghost:hover { background: var(--color-surface-hover); }
```

### 10.2 Input / Dropzone

```css
.input, .dropzone {
  font-family: var(--font-mono);
  font-size: var(--text-mono);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  color: var(--color-fg);
  transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.input:focus, .dropzone:focus-within {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-focus);
}
.dropzone-active { border-style: dashed; border-color: var(--color-accent); }
```

### 10.3 Card (Photo Metadata)

```css
.photo-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-3);
}
.photo-card__image { border-radius: var(--radius-sm); aspect-ratio: 4/3; object-fit: cover; }
.photo-card__meta { display: grid; gap: var(--space-1); font-family: var(--font-mono); font-size: var(--text-mono-sm); color: var(--color-fg-muted); }
.photo-card__status { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-1) var(--space-2); border-radius: var(--radius-full); font-size: var(--text-xs); font-weight: 500; }
```

### 10.4 Status Chips

| Status | Background | Text | Dot |
|---|---|---|---|
| `draft` | `transparent` | `#71717A` | `#71717A` |
| `scheduled` | `rgba(255,43,43,0.15)` | `#FF2B2B` | `#FF2B2B` |
| `published` | `rgba(34,197,94,0.15)` | `#22C55E` | `#22C55E` |
| `failed` | `rgba(239,68,68,0.15)` | `#EF4444` | `#EF4444` |

### 10.5 Code / Terminal Block

```css
.terminal {
  font-family: var(--font-mono);
  font-size: var(--text-mono);
  background: #000;
  border-radius: var(--radius-md);
  padding: var(--space-4);
  overflow-x: auto;
  line-height: 1.6;
}
.terminal__prompt { color: var(--color-accent); }
.terminal__output { color: var(--color-fg-muted); }
```

---

## 11. Icon System

- **Style:** 2px stroke, 24×24px viewBox, sharp corners.
- **Set:** Lucide / Phosphor (duotone off) — filtered to geometric set.
- **Key icons:** `upload`, `map-pin`, `clock`, `check`, `x`, `chevron-down`, `more-horizontal`, `image`, `settings`, `terminal`, `globe`.
- **Color:** `currentColor` — inherits text color.

---

## 12. Image Direction

### Principles

- Photographs are hero — never cropped by UI chrome.
- Halftone / grain overlay for brand panels only (not user content).
- Red reticle overlay on brand imagery only.
- Aspect ratios: `4:3`, `3:2`, `16:9` — no forced squares.

### Brand Panels

| Panel | Treatment |
|---|---|
| Hero / Atmosphere | Cinematic dusk landscape, 15% halftone, red reticle at rule-of-thirds |
| Construction | Vector geometry on `#09090B`, thin `#27272A` lines, red anchor points |
| Physical | Black field card, debossed mark, mono label |

---

## 13. Application Patterns

### 13.1 Upload Flow

```
┌─────────────────────────────────────┐
│  [S]  SABBALENS          [settings] │  ← App header (terminal chrome)
├─────────────────────────────────────┤
│                                     │
│   ┌─────────────────────────────┐   │
│   │  DROP PHOTO HERE            │   │  ← Dropzone #18181B, dashed #FF2B2B active
│   │  or click to select         │   │
│   └─────────────────────────────┘   │
│                                     │
│   [Photo Card] [Photo Card] ...     │  ← Grid, 4-col desktop
│                                     │
└─────────────────────────────────────┘
```

### 13.2 Photo Card (List View)

```
┌──────────────────────────────────────┐
│  ██████████████████████████████████  │  ← Thumbnail 4:3
├──────────────────────────────────────┤
│  DSC00234.jpg              ● draft   │  ← Filename + status chip
│  37.7749° N, 122.4194° W            │  ← Mono GPS
│  San Francisco, CA, USA              │  ← Location
│  2026-09-27 13:52:57 UTC             │  ← Mono timestamp
│  [Schedule] [Edit] [Delete]          │  ← Ghost buttons
└──────────────────────────────────────┘
```

### 13.3 Terminal Command Reference

```bash
$ sabbalens upload --path ./photos --schedule "2026-09-28 09:00"
✓ DSC00234.jpg → draft (37.7749, -122.4194) San Francisco
✓ DSC00235.jpg → scheduled 2026-09-28 09:00
$ sabbalens publish --status scheduled
→ posting to instagram...
✓ published instagram_media_id: 1234567890
```

---

## 14. Accessibility

- **Contrast:** All text ≥ 4.5:1 on background (`#FAFAFA` on `#09090B` = 15.9:1).
- **Focus:** Visible `#FF2B2B` ring on all interactive elements.
- **Motion:** Respect `prefers-reduced-motion`.
- **Color-blind:** Status chips use shape + text + color (not color alone).
- **Touch targets:** Minimum `44×44px`.

---

## 15. Implementation Checklist

| Area | Status | Notes |
|---|---|---|
| CSS Custom Properties | ☐ | Define all tokens in `:root` |
| Tailwind Config | ☐ | Extend theme with tokens |
| Font Loading | ☐ | Self-host Satoshi/Geist + JetBrains Mono |
| Logo SVG | ☐ | Optimized, viewBox `0 0 32 32` |
| Component Library | ☐ | Button, Input, Card, Chip, Dropzone, Terminal |
| Dark Mode Only | ☐ | No light mode — enforce `#09090B` |
| ESLint/Prettier | ☐ | Enforce design tokens only |
| Storybook | ☐ | Document all variants |

---

## 16. Governance

- **Changes:** PR required, design review for token modifications.
- **Versioning:** Semantic — patch for bugfix, minor for new component, major for token breaking change.
- **Deprecation:** 2 minor versions before removal.

---

## 17. Appendix: Brand Board Panels (3×3 Reference)

| # | Panel | Content |
|---|---|---|
| 1 | Logo Cover | S-mark + wordmark, red focus dot, `#09090B` |
| 2 | Construction | Grid, corner-bracket geometry, crosshair logic, thin rules |
| 3 | App UI | Dropzone + mono EXIF card (`37.7749,-122.4194`, `draft`) |
| 4 | Tagline | "Every frame, placed." — large Satoshi, centered |
| 5 | Color | 4 swatches only: bg, surface, fg, accent |
| 6 | Typography | Satoshi/Geist specimen + JetBrains Mono alphabet |
| 7 | Physical | Black field card, debossed mark, mono label |
| 8 | Image | Halftone dusk landscape, red reticle overlay |
| 9 | System Detail | Status chips, mono timestamps, icon row, focus ring |

---

*End of DESIGN.md — implementation source of truth.*