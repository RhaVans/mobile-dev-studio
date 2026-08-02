# Mobile Dev Studio — AI Development Workflow

## Source of Truth

GitHub is the shared synchronization layer between Antigravity, OpenCode, and Mobile Dev Studio.

## Before Starting Work

Run:

git fetch origin
git status --short --branch

Never assume another agent's local filesystem state.

## Agent Rules

Use a dedicated branch for substantial work:

agent/<agent-name>-<task>

Make small, meaningful commits.

## Handoff

Before handing work to another agent:

git status --short
git add <files>
git commit -m "type: description"
git push -u origin <branch>

Report:
- What changed
- What was tested
- Current branch
- Commit hash
- Remaining problems

## Taking Over

Run:

git fetch origin
git branch -a
git log --oneline --decorate --all -15

Then switch to the relevant branch.

## Never

Do not:
- force-push shared branches
- overwrite another agent's work blindly
- commit secrets
- commit .env files
- assume MCP is available
- assume another agent's local environment exists

## Principle

GitHub is shared memory.

Commits are messages between agents.

Branches are workspaces.

Tests are evidence.
