---
name: SexyVoice.ai
colors:
  background: "#020817"
  foreground: "#f8fafc"
  card: "#020817"
  card-foreground: "#f8fafc"
  popover: "#020817"
  popover-foreground: "#f8fafc"
  primary: "#125bce"
  primary-active: "#2b7cff"
  primary-foreground: "#ffffff"
  secondary: "#1e293b"
  secondary-foreground: "#f8fafc"
  muted: "#1e293b"
  muted-foreground: "#94a3b8"
  accent: "#1e293b"
  accent-foreground: "#f8fafc"
  destructive: "#ff5460"
  destructive-foreground: "#ffffff"
  border: "#1e293b"
  input: "#1e293b"
  ring: "#1d4ed8"
  brand-purple: "#b066ff"
  brand-red: "#ff3366"
  promo-primary: "#ec4899"
  promo-accent: "#f472b6"
  gradient-start: "#884cff"
  gradient-mid: "#0ea5e9"
  gradient-end: "#ff3399"
typography:
  fontFamily: Inter
  display-lg:
    fontSize: 48px
    fontWeight: "700"
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontSize: 32px
    fontWeight: "600"
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-md:
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
  body-lg:
    fontSize: 18px
    fontWeight: "400"
    lineHeight: 28px
  body-md:
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  label-sm:
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 16px
rounded:
  sm: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1300px
  hit-area-offset: 16px
motion:
  accordion-down: 0.2s ease-out
  accordion-up: 0.2s ease-out
  bounce-subtle: 2s ease-in-out infinite
  fade-in: 0.5s ease-out forwards
  scale-in: 0.3s ease-out forwards
  float: 6s ease-in-out infinite
  pulse-slow: 3s ease-in-out infinite
  incoming-call: 2s ease-in-out infinite
components:
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    borderColor: "{colors.border}"
    rounded: "{rounded.xl}"
    shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    transition: all 150ms ease
  button-hover:
    backgroundColor: "{colors.primary-active}"
  input:
    backgroundColor: transparent
    borderColor: "{colors.input}"
    rounded: "{rounded.md}"
---

## Brand & Visual Identity

The SexyVoice.ai design system embraces a minimalist, "Cinematic Dark" aesthetic. Engineered for a mature, modern, and highly interactive user base, the platform operates exclusively in dark mode to mimic the immersive, focused environment of a professional audio studio. 

The visual language relies heavily on the juxtaposition of deep, shadowy slate backgrounds and hyper-vibrant neon gradients. A recurring signature visual motif is the stylized audio waveform, acting as a dynamic centerpiece that communicates the product's core AI audio capabilities at a glance.

## Colors & Atmosphere

Depth and hierarchy are established through stark contrast and concentrated bursts of color against a dark canvas.

- **The Void (Backgrounds):** The foundation is a rich, near-black slate (`#020817`). It provides maximum contrast for crisp white typography and reduces eye strain, allowing foreground elements and accent colors to glow.
- **Gradient Emphasis:** Vibrant multi-stop linear gradients (transitioning smoothly from intense violet/purple to hot pink/red) are used sparingly but powerfully. They highlight the audio waveform visuals and key expressive words in hero typography (e.g., "Uncensored").
- **Action Accents:** Primary calls to action (like the "Sign up" buttons) utilize a solid, trustworthy electric blue (`#125bce`) to stand out from the purple/pink brand gradients, ensuring clear conversion paths.
- **Secondary Text:** Subtitles, microcopy, and descriptive text use a muted slate-gray (`muted-foreground`), providing necessary information without competing with primary headings.

## Typography

The platform utilizes **Inter** across all UI elements, prioritizing stark legibility and geometric modernism.

- **Hero & Display:** Large, bold headings (700 weight) command attention in centered layouts. 
- **Gradient Text:** For extreme emphasis, key brand value propositions are rendered using transparent text with a background gradient clip, seamlessly tying the typography to the surrounding visual audio elements.
- **Utility & Structure:** Font weights are intentionally constrained. Regular (400) is used for dense application text, while Medium (500) and Semibold (600) handle interactive labels and structural hierarchy. 

## Layout & Composition

The structural geometry balances technical precision with breathing room.

- **Centered Minimalism:** Landing pages and hero sections utilize a highly focused, single-column centered layout. Generous vertical spacing isolates the core message, waveform graphic, and call-to-action to eliminate distractions.
- **Button Hierarchy:** Navigation and actions clearly distinguish intent. Primary actions use a solid blue background with a subtle border radius (`0.375rem`), while secondary actions (like "Log in") use ghost or highly muted styling to blend into the dark nav bar.
- **Containers & Controls:** Large structural elements use a softer `0.75rem` (xl) border radius, while standard interactive controls use a sharper `0.375rem` (md) radius, reinforcing their nature as precision tools.

## Motion & Interaction

Motion injects a highly tactile, responsive feel into standard web interactions.

- **Micro-interactions:** Buttons feature smooth hover transitions, providing immediate visual feedback through color brightening and subtle expansions.
- **Ambient Animation:** The system utilizes continuous, subtle animations to indicate platform life and status. Elements like the audio waveform visual imply constant activity, while UI elements "float" continuously on sine waves or pulse gently to guide user focus without overwhelming the senses.
