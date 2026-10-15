---
name: plan-task
description: Plan a feature or fix with the user, write a task brief, and hand it to the developer agent to build in the background on its own branch; then review it with the reviewer agent, merge it into main, and release it. Use when the user asks to plan a task, says /plan-task, 기획해줘, 작업 맡길게, or wants a feature built in the background.
argument-hint: <what to build>
---

# Plan a task

The developer agent can't ask the user anything while it works, so every question gets answered here first. The output is a task brief complete enough that the developer never has to guess about anything a user would notice.

## 1. Understand the request

- The backlog is the build order in section 7 of the tech plan (`tech 기획안.md`): the next unchecked step, plus "MVP 이후" and "나중에 할 일". If the arguments are empty, offer the next steps as choices.
- Read the tech plan sections the task touches (the screen spec in 4.2 S2, the data model in 5.13, 5.3 for user isolation), the confirmed mockup (`mockup/saveme-mvp.html`: its screen list `SCREENS` and the `view…` functions draw each screen), `AGENTS.md`, and the code the task touches (screens, services, stores, models, `openapi.yaml`), so the questions are about real gaps.
- The mockup is confirmed (tech plan 4.1 "확정"): the screens should match it. Where the mockup and the plan disagree, or the mockup leaves a state out, that's a question for step 2.
- If the step ends with importing the user's existing data (tech plan 7, "내 기존 데이터 넣기"), include the importer in the brief, and plan to read the source files with the user in step 2.

## 2. Ask

Ask the user (in Korean, plainly; the user is not a backend expert) about everything that changes what users see or what gets stored, for example:

- states the mockup doesn't show, exact Korean labels and messages;
- edge cases (nothing entered, nothing found, very long text);
- what existing data needs for a new field (the user's real data is in `saveme` and gets migrated);
- anything that conflicts with the tech plan (the plan wins unless the user decides to change it; if so, the brief includes updating the plan, in Korean).

Use AskUserQuestion when the choices are clear, with your recommendation first. Don't ask about things you can decide from the code, the mockup and `AGENTS.md`. Keep asking until nothing user-visible is left open.

**Decide the release tag.** Find the current version (latest tag from `git tag --list "v*" --sort=-v:refname`, and `backend/pyproject.toml`), pick the number to raise with `docs/versioning.md`, and ask with your recommendation first, each option with a one-line Korean reason (for example "새 메뉴라 MINOR: v0.1.0 → v0.2.0").

## 3. Show the screen (when it differs from the mockup)

When the confirmed mockup already shows every state, the brief points to it and this step is skipped. Otherwise show the new or changed states before writing the brief:

- Make one HTML file in the scratchpad directory, `mockup-<short-name>.html`, that looks like the real app: the CSS from `frontend/src/styles.css` inlined, markup and class names copied from the real components or the mockup, realistic made-up Korean data. PC width and phone width (390px) frames side by side, **지금** and **바뀐 뒤**. Static.
- Load the `artifact-design` skill, then publish it with the Artifact tool (private, `icon: "design"`) so the user can open it on a phone too. Change and republish until the user is happy.

## 4. Write the brief

Save it to the scratchpad directory as `task-<short-name>.md` and show it to the user. Write it in English, with UI text quoted in Korean exactly as it should appear.

```markdown
# Task: <name>

## Goal
<one or two sentences: what the user gets>

## Behavior
- <each thing a user can see or do, with exact Korean labels/messages>
- <edge cases and what happens>

## Data and API
- <new tables/columns (with user_id), endpoints, migration; "none" if nothing>

## Done when
- <checkable outcomes, including the tests that must exist (with the another-user 404 tests)>

## Screens
- <mockup path and the screen ids in it (e.g. SCREENS "reviews", "review-edit"), plus any new mockup link>. Match it.

## Out of scope
- <what not to do>

## Decided with the user
- <each answer from step 2>

## Release
- Version vX.Y.Z (<MAJOR|MINOR|PATCH>: <reason>). Don't bump the version or edit `CHANGELOG.md`: the main session does that after merging.
```

Summarize the brief for the user in Korean and ask for an explicit OK. Change it until they agree.

## 5. Hand off

On OK, launch the developer agent with the Agent tool: `subagent_type: "developer"`, `isolation: "worktree"`, `run_in_background: true`, and the full brief as the prompt. Tell the user in one line that it's running.

## 6. When the developer finishes

1. Relay its report in short Korean: what was done, decisions it made, questions if it stopped. Answer questions with the user, then SendMessage the answers to the same agent.
2. Run the reviewer agent (`subagent_type: "reviewer"`) on the branch with the branch name, worktree path and brief. Send must-fix findings back to the developer and review again.
3. Merging into `main` changes the user's main branch, so ask first. On OK: `git merge --ff-only <branch>` from the repo root on `main` (rebase in the worktree first if `main` moved, rerunning the tests), run all tests on `main`, remove the worktree and delete the branch. Don't push.
4. Release the version from the brief, following "Releasing a version" in `docs/versioning.md`, and tell the user the version in one Korean line with the reason.
5. Tell the user how to get it into their running app: `scripts/update.ps1` (it backs up, rebuilds and migrates). If the step includes a data import, run it on `saveme_dev` first, have the user check the screens, then (after a backup) on `saveme`, as `docs/local-operations.md` describes.
6. Tick the step in tech plan section 7.
