# MockCortex Frontend Design Notes

## Goal

Make MockCortex feel like a deliberate interview rehearsal studio, not a generic AI tool with interchangeable cards, gradients, and copy.

## Core Principles

1. Build from a product voice first.
   - The interface should sound like a rehearsal environment: session, archive, interviewer, brief, critique.
   - Avoid generic AI wording such as "magic", "smart", "assistant", or "unlock potential" unless the feature truly needs it.

2. Keep a small visual vocabulary.
   - Warm paper surfaces
   - Ink-dark contrast panels
   - Rust as the main accent
   - Serif display plus geometric sans utility typography

3. Reuse patterns with intent.
   - Use the shared shell, button, panel, and eyebrow styles in `src/index.css`.
   - New pages should adapt those primitives before inventing one-off card systems.

4. Give every page one clear job.
   - Home sells the product.
   - Interviewers establish tone.
   - Setup builds the brief.
   - Archive supports comparison and reflection.

5. Motion should clarify, not decorate.
   - Use simple fades and short vertical movement to stage content.
   - Avoid ornamental motion loops that do not support comprehension.

## Things That Make Apps Look "Vibe Coded"

- Same dark glass card treatment on every screen
- Default `Inter` plus generic gradient headline
- Too many unrelated accent colors
- Copy that sounds like every AI startup
- No page-level hierarchy or narrative framing
- Components that are visually consistent but emotionally empty

## Guardrails For New UI Work

- Start from existing shared classes before adding new ones.
- Introduce a new accent treatment only if it has a product meaning.
- Prefer fewer, stronger sections over stacking many similar cards.
- Keep button hierarchy obvious: one primary action per section.
- Review mobile spacing and tap targets before shipping.
