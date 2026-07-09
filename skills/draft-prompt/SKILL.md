---
name: draft-prompt
description: Use when the user wants help turning a rough idea into a prompt — e.g. "help me write a prompt for...", "I want to brainstorm...", "draft a prompt to...", "I need to figure out how to ask for...". Runs a short one-question-at-a-time interview, then calls the optimize_prompt MCP tool with the assembled draft and context.
---

# draft-prompt

Interview the user to build a solid `draft` (and `context`) before calling the
`optimize_prompt` MCP tool. Ask ONE question at a time. Prefer multiple-choice
phrasing when there's a natural small set of answers; open-ended is fine when
there isn't.

## Step 1: Classify

Ask:

> "What are you trying to do?"
>
> 1. Brainstorm / come up with ideas
> 2. Fix a bug
> 3. Plan a feature or write a spec
> 4. Research a topic
> 5. Learn or understand something
> 6. Write a message (email, Slack, text, etc.)
> 7. Something else

Based on the answer, go to the matching section below (Step 2a–2g). Ask that
section's questions ONE AT A TIME, waiting for each answer before asking the
next.

## Step 2a: Brainstorming

Ask these one at a time:
1. "What problem are you solving?"
2. "Why is it a problem? (impact, who's affected)"
3. "Any constraints, or options you've already ruled out?"
4. "What would success look like?"

Mapping:
- Draft: "Help me brainstorm ideas for [answer 1]."
- Context: "This matters because [answer 2]. Constraints/ruled-out options: [answer 3]. Success looks like: [answer 4]."

## Step 2b: Bug fix

Ask these one at a time:
1. "What's the observed behavior, and what did you expect instead?"
2. "What are the steps to reproduce it?"
3. "Any error messages or logs?"
4. "What have you already tried?"

Mapping:
- Draft: "Help me fix this bug: [answer 1]."
- Context: "Steps to reproduce: [answer 2]. Errors/logs: [answer 3]. Already tried: [answer 4]."

## Step 2c: Feature / spec

Ask these one at a time:
1. "What should this do?"
2. "Who is it for?"
3. "Any constraints? (tech, deadline, existing patterns to follow)"
4. "What does 'done' look like?"

Mapping:
- Draft: "Help me plan/write a spec for: [answer 1]."
- Context: "This is for [answer 2]. Constraints: [answer 3]. Definition of done: [answer 4]."

## Step 2d: Research / deep-dive

Ask these one at a time:
1. "What topic do you want to research?"
2. "Why do you need this — what decision does it inform?"
3. "How deep? (quick overview vs. exhaustive)"
4. "Preferred sources/format, or anything to avoid?"

Mapping:
- Draft: "Research [answer 1] for me."
- Context: "This informs: [answer 2]. Depth wanted: [answer 3]. Source/format preferences: [answer 4]."

## Step 2e: Learning / explanation

Ask these one at a time:
1. "What do you want to understand?"
2. "What's your current level or background with this?"
3. "Why now — curiosity, or blocked on something?"
4. "Preferred explanation style? (analogy, step-by-step, examples, etc.)"

Mapping:
- Draft: "Explain [answer 1] to me."
- Context: "My background: [answer 2]. Reason for asking now: [answer 3]. Preferred style: [answer 4]."

## Step 2f: Communication (email / Slack / text)

Ask these one at a time:
1. "Who is this message to?"
2. "What outcome do you want from them?"
3. "What tone? (formal, casual, etc.)"
4. "Key points to include?"
5. "Any length constraints?"

Mapping:
- Draft: "Write a message to [answer 1] that achieves: [answer 2]."
- Context: "Tone: [answer 3]. Key points: [answer 4]. Length constraints: [answer 5]."

## Step 2g: Generic fallback

Ask these one at a time:
1. "What's the goal?"
2. "Any relevant context or background?"
3. "Any constraints?"

Mapping:
- Draft: "[answer 1]"
- Context: "[answer 2]. Constraints: [answer 3]."

## Step 3: Assemble and call optimize_prompt

Take the branch's "Draft:" and "Context:" templates and fill in the actual
answers, rephrasing into natural, coherent sentences (not raw concatenation
or a bulleted dump of answers).

Then call the `optimize_prompt` MCP tool:

```json
{
  "draft": "<assembled draft>",
  "context": "<assembled context>"
}
```

Leave all other parameters (`target_model`, `interactive`, `auto_cot`,
`auto_guardrails`, `auto_intent`, `auto_repair`, etc.) at their defaults
unless the user has said something in the interview that clearly implies an
override (e.g. they named a specific target model). Do NOT add any extra
confirmation step before this call — `optimize_prompt` already defaults to
`interactive: true`, which makes the calling assistant pause and show the
result for approval before acting on it.

Return the tool's result as-is.
