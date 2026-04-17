# Styling Memory

## Shared Styling System

2026-04-17 | AGENT:@codex | Source | Shared component styling is centralized in `frontend/app/styles/app.scss`.
2026-04-17 | AGENT:@codex | Tokens | Shared form, button, and modal styles rely on design tokens such as `--space-*`, `--radius-*`, `--font-*`, `--bg-*`, `--border-*`, `--text-*`, and `--color-*`.
2026-04-17 | AGENT:@codex | Inputs | `.form-input` and `.form-select` share the same styling block: full width, tokenized padding, `var(--bg-surface)` background, `var(--border-medium)` border, rounded corners, and focus state with primary border plus glow ring.
2026-04-17 | AGENT:@codex | Buttons | `.btn` defines the shared button layout: inline-flex alignment, spacing gap, tokenized padding, medium-small font, semibold text, rounded corners, no border by default, and fast transition.
2026-04-17 | AGENT:@codex | Buttons | Variant classes currently confirmed in shared SCSS are `.btn-primary` and `.btn-secondary`, with additional utility button classes elsewhere such as `.btn-xs`, `.btn-icon`, and `.btn-back`.
2026-04-17 | AGENT:@codex | Modals | `.modal-backdrop`, `.modal-panel`, `.modal-header`, `.modal-close-btn`, and `.modal-content` define the generic modal system. Panels default to `max-width: 500px`, rounded corners, surface background, border, shadow, and internal padding.
2026-04-17 | AGENT:@codex | Dropdowns | Dropdown styling is tightly integrated with the same form system via `.form-input-wrapper`, `.dropdown-trigger`, `.dropdown-menu`, and `.dropdown-option`, including a dedicated `in-modal` path with raised z-index.
2026-04-17 | AGENT:@codex | Layout Pattern | Templates commonly compose shared class utilities such as `flex`, `col`, `gap-*`, `between`, `x-center`, `glass-panel`, `rounded-lg`, and typography tokens around the shared components instead of embedding component-specific CSS in each template.
2026-04-17 | AGENT:@codex | Modal Pattern | Most CRUD screens use the generic `Modal` shell plus utility layout classes for forms, while some richer experiences like lead detail use custom modal markup with the same `.modal-backdrop` and `.modal-panel` primitives directly in the template.
