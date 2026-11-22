---
name: inspora-design-direction
description: Develops a visual direction from Inspora references. Use when the user asks to choose or compare directions, write a design brief, or build something from the references; ordinary reference searches use inspora-discovery.
---

# Inspora design direction

This skill covers requested guidance: comparing or choosing directions, writing a brief, or applying references in an implementation. A search request, project description or selected reference on its own stays with `inspora-discovery`.

## Workflow

1. **Start from what is settled.** Reuse the brief, constraints and references already in the conversation. *Done when* you can name the decision the user needs next.
2. **Ask only consequential questions.** When plausible answers would change the next recommendation or build, ask one focused question in plain language, with options drawn from the brief or references and room for the user's own answer. Apply the answer, then check whether another open choice would still shape the deliverable. Settle minor details with sensible defaults. When the user asks you to decide, recommend and state your assumptions. *Done when* there is enough direction for the requested next step.
3. **Ground each direction in evidence.** Illustrate each direction with two relevant works, preferring ones already shown, and search again only to fill a real evidence gap. Inspect them with `get_works`; for motion that informs a build, use `get_work` with `detail: "study"` when `preview.motion_sheets` is above 0. *Done when* every claim traces to an attached image or the work's text.
4. **Compare and recommend.** Compare the qualities that matter to this project, such as hierarchy, composition, typography, density or interaction. Explain the tradeoffs and the reason for your recommendation, and credit and link every work.
5. **Deliver.** For a brief, turn the borrowed qualities into an original composition for the user's content: the layout, type, color roles and interaction states the next step needs. For an implementation, follow the project's existing conventions and workflow.

## Evidence limits

- An image shows only its frame, and `evidence.visual_notes` may describe a different one: trust the image. A hero screenshot supports claims about the hero; lower sections, empty product windows and cropped controls stay unverified.
- `preview.study.available: true`: use the sheets' sample times for observed states and label any timing between samples as a proposal. Dense sheets sample up to 8 frames per second with holds collapsed, so a jump between tile times is a pause. When `dense_sheets.not_attached` lists sheets covering the moment you need (see `ranges`), fetch them with `sheets` before describing it. With `partial: true`, only the attached sheets are observed; `omitted_roles` names the rest. `dense_sheets.cropped_to` means the sheets show only the part of the frame where the design appears; the still shows the whole frame.
- `preview.palette`: colours sampled from the prepared image, with approximate share. With `background` and `content`, the canvas is reported apart and `content` shares are of the design itself, so a small saturated content colour may be an accent, an icon or a logo: check the image. Use them as measured starting values, not confirmed brand colours.
- `preview.motion_sheets: 0` or `preview.study.available: false`: the motion is description-only. Say so.
- `legacy_low_resolution_thumbnail`: fine text and controls are unreadable; take those details from the description.
- Adaptation works (evidence with a gap: a contained, broader or semantic subject, or an unverified context or style) support what-to-borrow claims within that limit; the right subject with `context.unverified` is the right artifact from another domain.
- Confirm font and technology names in the work's text before stating them.
- A direction with no supporting work stays labeled unsupported; a work that conflicts with the project's requirements stays out.

## Style

Plain language, with a short explanation for each design term that adds precision. Commas or separate sentences in place of em dashes. Match depth to the request; a finished deliverable can end without a closing question.
