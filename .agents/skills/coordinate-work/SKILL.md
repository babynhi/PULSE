---
name: coordinate-work
description: Coordinate coding work across teammates and agent sessions using GitHub Issues. Use to split a feature into assignable tasks, pick up an issue, check for overlapping edits, hand off work, or see who is working on what.
---

# Coordinate work

Before starting, inspect git status --short --branch and identify the current branch and upstream. Work on the branch requested by the user or recorded on the issue; never switch branches implicitly. If the intended branch is unclear, resolve that before editing. Do not assume main is the task branch.\n\nUse GitHub Issues as the live task queue. Use the repository's existing statuses if it has them. Otherwise use one label per open task: `ready`, `in progress`, `blocked`, or `in review`. Treat merged work and closed issues as done. Read issue state with the GitHub connector or authenticated `gh` and write status changes back to that same queue.

## Plan and assign

- Read the relevant code, open issues, and related pull requests before dividing a feature. Give each proposed issue one deliverable, one human owner, the paths it reserves, dependencies by issue number, and observable acceptance criteria.
- Draft issues when asked to plan. Create them when asked to put the tasks on GitHub. Use the explicit teammate assignments, or leave the issues unassigned for the team's dispatcher.
- Have one teammate dispatch each batch. Compare candidate paths against other assigned work, including ready tasks. For a shared file, schema, or interface, agree on the contract first and sequence edits to the shared area. The dispatcher assigns at most one agent session per issue.
- Mark an assigned task ready only when its dependencies are satisfied and its paths are clear. Keep its scope on the issue so every session can read it.

## Pick up an issue

1. Read the latest issue, comments, and linked PR. For “my next task,” pick the highest priority ready issue assigned to the requesting teammate. Confirm the human owner and live status before work starts.
2. Compare the intended paths with assigned ready, in progress, blocked, and in review issues. Treat assigned paths as reserved until their owner releases them or the task is done. If paths overlap, give the dispatcher the conflicting issue and wait for an agreed scope or sequence.
3. Before editing, move the issue to in progress and record the branch name on it. Verify the checked-out branch matches the recorded branch before editing; if it does not, stop and resolve the discrepancy first. Start from the agreed base using a separate branch or worktree. Recheck active reservations before any scope expansion and get the dispatcher to update the issue first.
4. On a blocker, record what decision or dependency is needed, the branch, and the next step. Mark the issue blocked. To take over an active branch, confirm the handoff with the owner and resume from the recorded state.
5. When ready for review, link the PR and mark the issue in review. Report the checks run and anything the reviewer still needs to verify. After merge, confirm the issue is closed.

Before committing or pushing, recheck git status --short --branch, git branch --show-current, and the configured upstream. Commit and push only the intended task branch to its intended upstream. Never push main or another branch just because the task is complete; if the target is unclear, resolve it before pushing.\n\nIf the session cannot access the queue, have the owner record the claim and confirm current reservations before editing. Keep the issue updated at milestones, when blocked, and at handoff.

## Show the queue

Read current issues for “Who’s working on what?” Show each active issue with its status, human owner, and branch or PR. Include blockers and the next ready tasks by assignee.
