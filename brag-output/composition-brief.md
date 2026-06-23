# Hyperframes Composition Brief: AI Folders

## Objective
Create a 20-second app-store-style launch brag video for AI Folders.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20s

## Source Material
- Project root: `C:\Users\david\OneDrive\Documents\Extensions Chrome\GeminiFoldersAntigravity\GeminiFolders`
- Primary files read: `docs/index.html`, `docs/site/styles.css`, `docs/site/i18n-manual.js`,
  `docs/site/logos.js`, `extensions/ai-folders/popup.html`, `src/popup.css`
- Product name: AI Folders
- Tagline / strongest claim: "Organize your AI conversations" / "One library. Every AI."
- Key UI to recreate: the dark glass popup (gradient logo + 📁/📝 mode toggle, search,
  folder rows with emoji + chat counts, prompt rows) and the `#name`+Space prompt injection.
- Copy that must appear verbatim:
  - "Your AI chats. One endless list."
  - "Folders for everything."
  - "Type #name. Your prompt appears."
  - "One library. Every AI."
  - "Organize your AI conversations."
  - "Free · Open source · Private · 43 languages"
  - "aifolders.xyz"

## Creative Direction
- Tone preset: app-store
- Creative direction: premium dark product film, brand gradient as the spine
- Interpretation: clean feature-forward reveals, confident holds, smooth motion, no jokes,
  no abstract filler. Every scene shows the real product.
- Angle: AI Folders is the one organizing layer on top of every AI — folders + a prompt
  library fired with `#name`, synced everywhere. The brand gradient (green→teal→blue→
  violet→orange) is the colors of the AIs it unifies.
- Hook: messy ungrouped chat list + "Your AI chats. One endless list."
- Outro / punchline: wordmark in brand gradient → "Organize your AI conversations" → trust chips → aifolders.xyz
- Avoid: generic SaaS language, abstract filler visuals, redesigning the product.

## Visual Identity
- Background: `#202124` popup dark, over deep field `#090b16`
- Text: `#e8eaed` / `#f4f5fa`; muted `rgba(255,255,255,0.62)`
- Accent: `#8ab4f8`; brand gradient `linear-gradient(108deg,#10a37f,#20b2aa,#3b86d9,#8a6df0,#d97757)`
- Glass: `rgba(20,25,45,0.45)`, border `rgba(255,255,255,0.10)`, top border `rgba(255,255,255,0.18)`
- Display font: Schibsted Grotesk (use web font with system fallback); body same
- Visual references: dark glass popup, 📁/📝 toggle, emoji folder rows, real brand SVG logos.

## Storyboard
Use `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. The pile — 3.0s — ungrouped chat list drifts up + "Your AI chats. One endless list."
2. Folders — 4.5s — popup in; 4 emoji folders drop in one by one; "Folders for everything."
3. Prompt library + injection — 4.5s — toggle 📁→📝; type `#review`+Space; prompt types into chat box; "Type #name. Your prompt appears."
4. Every AI — 4.0s — 7 brand logos arrive one by one on gradient rail + local chip; "One library. Every AI."
5. Outro — 4.0s — wordmark in gradient + tagline + trust chips + aifolders.xyz.

## Audio
- Audio role: warm clean corporate bed + consistent light SFX layer.
- Audio arc: establish → placed folder drops → tactile typing → additive logo pops → single bell resolve.
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`, volume 0.32.
- Music treatment: in from 0s, hold under whole edit, gentle duck/fade under final logo so the bell rings.
- Music cue guidance: bundled preset (120.19 BPM). Strong cues 16–24s; lock outro logo to 17.02s.
  Beat grid ~0.5s from 3.02s for folder + logo reveals.
- Audio-reactive treatment: subtle; brand-gradient glow / logo presence may breathe with RMS. No waveform/EQ visuals.
- Audio-coupled moments:
  - Scene 2 folders — soft `drop` per folder (beat-grid ~4.0/4.55/5.1/5.65s)
  - Scene 3 toggle + typing — `switch` then randomized `keyboard` ticks
  - Scene 4 logos — soft `card-place`/`drop` per logo on consecutive beats (~12.0→15.0s)
  - Scene 5 outro logo — `impactBell_heavy_000` beat-locked 17.02s
- SFX selection guidance: soft, low-HF-risk picks; match motion; never stack.
- Exact SFX choice: pick filenames/timestamps/volume against the implemented animation.
- Audio files: already copied into `brag-output/composition/assets/`.

## Hyperframes Instructions
- Native conventions: root `data-composition-id`, clips with `class="clip"` +
  `data-start`/`data-duration`/`data-track-index`, paused GSAP timeline on `window.__timelines`.
- Show real UI/copy from the project (popup, toggle, folders, logos).
- Keep all text readable; hold each caption to its reading floor.
- 20s total; lint + inspect clean before render.
- Music + SFX layer present; 1 beat-lock on the outro bell (17.02s); sequential reveals on the beat grid.
- One subtle audio-reactive element (gradient glow) or document if extraction unavailable.
