---
name: RadiodioDJ
colors:
  surface: "#111317"
  surface-dim: "#111317"
  surface-bright: "#37393e"
  surface-container-lowest: "#0c0e12"
  surface-container-low: "#1a1c20"
  surface-container: "#1e2024"
  surface-container-high: "#282a2e"
  surface-container-highest: "#333539"
  on-surface: "#e2e2e8"
  on-surface-variant: "#c4c5d9"
  inverse-surface: "#e2e2e8"
  inverse-on-surface: "#2f3035"
  outline: "#8e90a2"
  outline-variant: "#434656"
  surface-tint: "#b8c3ff"
  primary: "#b8c3ff"
  on-primary: "#002388"
  primary-container: "#2e5bff"
  on-primary-container: "#efefff"
  inverse-primary: "#124af0"
  secondary: "#ddb7ff"
  on-secondary: "#490080"
  secondary-container: "#6f00be"
  on-secondary-container: "#d6a9ff"
  tertiary: "#ffb59b"
  on-tertiary: "#5b1a00"
  tertiary-container: "#c24100"
  on-tertiary-container: "#ffece6"
  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"
  primary-fixed: "#dde1ff"
  primary-fixed-dim: "#b8c3ff"
  on-primary-fixed: "#001356"
  on-primary-fixed-variant: "#0035be"
  secondary-fixed: "#f0dbff"
  secondary-fixed-dim: "#ddb7ff"
  on-secondary-fixed: "#2c0051"
  on-secondary-fixed-variant: "#6900b3"
  tertiary-fixed: "#ffdbcf"
  tertiary-fixed-dim: "#ffb59b"
  on-tertiary-fixed: "#380d00"
  on-tertiary-fixed-variant: "#812800"
  background: "#111317"
  on-background: "#e2e2e8"
  surface-variant: "#333539"
typography:
  deck-title:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: "700"
    lineHeight: 28px
    letterSpacing: -0.02em
  data-primary:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "600"
    lineHeight: 20px
  data-secondary:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 16px
  numeric-display:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: "700"
    lineHeight: 32px
  numeric-label:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: "500"
    lineHeight: 12px
    letterSpacing: 0.05em
  list-item:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: "500"
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  grid-margin: 12px
  grid-gutter: 8px
---

## Brand & Style

The design system is engineered for the high-pressure environment of live performance, emphasizing precision, reliability, and immediate visual feedback. The brand personality is "Technological Precision"—fusing the heritage of tactile analog gear with the limitless capabilities of modern digital signal processing.

The aesthetic follows a **Modern-Skeuomorphic Hybrid** approach. While the library and management tools utilize a flat, systematic UI to maximize data density, the performance decks employ subtle depth, inner shadows, and radial gradients to mimic physical hardware. This creates a psychological "performance zone" distinct from the "management zone." The emotional response is one of absolute control and "midnight" focus, minimizing eye strain during long sets in dark environments.

## Colors

The palette is rooted in a "Midnight" spectrum. The background uses a near-black neutral to ensure the display remains unobtrusive in a booth. Surface tiers are built using subtle shifts in charcoal and deep gray to define hierarchy without the need for heavy borders.

**Electric Blue** is the primary action color, used for active deck states, primary buttons, and selected tracks. **Vibrant Purple** serves as the secondary accent for creative functions like FX parameters and hot cues. High-visibility **Signal Green** is reserved strictly for playback status and level meters, while **Warning Red** indicates clipping or critical hardware alerts.

## Typography

This design system utilizes a dual-font strategy to balance legibility with technical utility.

**Inter** is used for all metadata—track names, artists, and UI labels—providing a clean, neutral character that remains legible at small sizes in dense lists.

**JetBrains Mono** is utilized for all time-critical numerical data, including BPM, Remaining Time, and Pitch Percentage. The monospaced nature of the font prevents "layout jitter" during rapid value changes (e.g., when the BPM is fluctuating or the timer is counting down), ensuring numbers remain perfectly aligned vertically.

## Layout & Spacing

The layout uses a **Fluid-Fixed Hybrid** model optimized for high-density information display. The interface is divided into functional zones:

- **Performance Header:** Fixed height, containing the global clock, settings, and master volume.
- **Deck Zone:** Flexible width (50/50 split), containing the waveform displays and playback controls.
- **Mixer Strip:** Fixed center width, housing faders and EQ knobs.
- **Library/Browser:** Expandable vertical zone at the bottom of the screen.

A 4px baseline grid ensures tight alignment of controls. Gutters are kept to a minimum (8px) to maximize the "Native App" feel, allowing for more visible tracks in the library and larger waveform visualization.

## Elevation & Depth

Visual hierarchy is achieved through a mix of **Tonal Layering** and **Tactile Shadows**.

1.  **The Base:** The lowest tier is the application background (Black).
2.  **The Decks:** Performance areas use a "sunken" effect created by 1px inner shadows and a slightly lighter surface (Surface-Low), mimicking a hardware chassis.
3.  **Active Controls:** Knobs, faders, and buttons use a "raised" skeuomorphic treatment with a 2px drop shadow (40% opacity) and a subtle top-edge highlight to suggest tactility.
4.  **Floating Modals:** Temporary overlays (like FX menus) use a Backdrop Blur (20px) to separate them from the busy performance interface, maintaining focus on the task at hand.

## Shapes

The design system employs a "Professional-Industrial" shape language. Corner radii are kept tight (4px for standard components) to maintain a crisp, technical look that maximizes screen real estate.

- **Fader Caps & Knobs:** Use a 2px radius for a rugged, machined-metal appearance.
- **Buttons:** 4px radius for a standard tactile feel.
- **Containers:** 0px to 4px, emphasizing a structural, "racked" hardware look where components sit flush against one another.
- **Waveform Containers:** Hard 0px corners to ensure the visual data reaches the very edge of the designated area.

## Components

- **Faders:** The "Rugged Fader" component features a recessed track with a subtle inner glow. The cap has a high-contrast center "index" line in Electric Blue.
- **Waveforms:** High-contrast, multi-layer visualizations. The background is Surface-Lowest; the foreground is a gradient of Primary/Secondary color depending on frequency (Bass/Mid/Treble).
- **Tactile Buttons:** Play/Cue buttons are large with a "glowing" state. When active, they utilize an outer glow (8px blur) in Signal Green or Warning Red.
- **Status Indicators:** Small, circular "LEDs" that use a CSS radial gradient to simulate a physical bulb.
- **Library Lists:** High-density rows (28px height) with alternating "zebra" striping. The hover state uses a subtle Surface-High highlight.
- **Jog Wheels (Skeuomorphic):** A circular element with a radial "brushed metal" texture and a 1px border. The center displays track progress and a "needle" position indicator.
- **Input Fields:** Search bars and metadata editors are flat with a 1px Surface-High border, turning Electric Blue on focus.
