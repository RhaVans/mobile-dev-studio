# Mobile Dev Studio — AI Development Workflow

## 1. Source of Truth

GitHub is the shared source of truth.

Repository:
https://github.com/RhaVans/mobile-dev-studio

Git is the synchronization layer between AI agents.

Never assume another agent's local filesystem state is current.

---

## 2. Agent Roles

### Antigravity

Primary implementation agent.

Responsibilities:

- understand the task
- inspect the existing implementation
- plan the change
- implement the change
- run relevant tests
- verify the result
- update `.agent/HANDOFF.md`
- commit the completed work
- push the commit to GitHub

### OpenCode

Review, debugging, and verification agent.

Responsibilities:

- synchronize with GitHub
- read `.agent/WORKFLOW.md`
- read `.agent/HANDOFF.md`
- inspect the implementation
- reproduce reported issues
- run relevant tests
- fix issues when necessary
- update `.agent/HANDOFF.md`
- commit changes
- push changes to GitHub

### Mobile Dev Studio

Development control plane.

Responsibilities:

- provide project filesystem access
- provide terminal access
- provide Git visibility
- provide application/runtime visibility
- provide test and development tooling

Mobile Dev Studio is not the source of truth.

GitHub is.

---

## 3. Single Writer Rule

Only one AI agent may modify the working tree at a time.

Never allow Antigravity and OpenCode to simultaneously edit the same repository.

Before starting work, the agent must synchronize:

    git fetch origin
    git status --short --branch
    git log --oneline --decorate -10

If the working tree contains unexpected changes, stop and inspect them.

Do not blindly overwrite another agent's work.

---

## 4. Starting Work

Before modifying anything:

    git fetch origin
    git status --short --branch
    git log --oneline --decorate -10

Then inspect:

    cat .agent/WORKFLOW.md
    cat .agent/HANDOFF.md

Understand the current state before editing.

---

## 5. Implementation Cycle

Every development task follows:

1. Synchronize
2. Inspect
3. Plan
4. Implement
5. Test
6. Review changes
7. Update handoff
8. Commit
9. Push
10. Verify synchronization

Do not skip testing.

---

## 6. Tests Are Evidence

A statement such as:

"Looks good"

is not a test.

Prefer executable evidence.

Examples:

    python3 -m compileall .

    git diff --check

    git status --short --branch

For web applications, verify the application actually starts and responds.

For UI changes, verify the relevant page or interaction.

For API changes, test the affected endpoint.

For bug fixes, reproduce the bug before fixing it and verify the same scenario after fixing it.

Record important tests in `.agent/HANDOFF.md`.

---

## 7. Handoff Protocol

Before committing, update:

    .agent/HANDOFF.md

The handoff must describe:

- what was worked on
- files changed
- important implementation details
- tests performed
- test results
- current branch
- commit
- whether the commit was pushed
- known issues
- what the next agent should do

The handoff describes reality, not intention.

Do not claim a test passed unless it was actually run.

---

## 8. Git Protocol

Before commit:

    git status --short
    git diff --check
    git diff --stat

Review the actual changes.

Then:

    git add <specific-files>
    git commit -m "<clear message>"
    git push origin master

After pushing:

    git fetch origin
    git status --short --branch
    git log --oneline --decorate -3

The expected clean state is:

    ## master...origin/master

with no unexpected untracked or modified files.

---

## 9. Commit Rules

Commits should represent coherent units of work.

Good:

    feat: add terminal resize handling
    fix: prevent websocket reconnect loop
    refactor: separate git service
    test: add API health checks
    chore: add agent workflow

Avoid meaningless commits such as:

    stuff
    changes
    update
    fix
    test

Never commit:

- API keys
- passwords
- access tokens
- private credentials
- `.env` files containing secrets
- generated sensitive data

---

## 10. Branch Rules

The shared `master` branch is synchronized through GitHub.

Never force-push it.

Never rewrite shared history unless explicitly authorized.

Never use:

    git push --force

on the shared branch.

If another agent has pushed new work, synchronize before continuing.

---

## 11. Conflict Protocol

If Git reports a conflict:

STOP.

Do not blindly choose ours or theirs.

Inspect the conflict and understand what each side changed.

Resolve intentionally.

Then test the result before committing.

---

## 12. MCP Is Optional

MCP is not required for the workflow.

Agents must remain functional using:

- shell
- Git
- project files
- installed development tools
- application tests

Do not make the project's development workflow dependent on MCP availability.

---

## 13. No Assumptions

Never assume:

- another agent's local files exist
- another agent installed a package
- another agent has the same environment
- MCP is available
- a test passed because someone said it passed
- GitHub contains unpushed local work

Verify.

---

## 14. Completion Criteria

A task is complete only when:

- implementation is finished
- relevant tests were executed
- changes were reviewed
- `.agent/HANDOFF.md` is updated
- changes are committed
- changes are pushed
- working tree is synchronized with origin

Completion means:

    Implemented
    +
    Tested
    +
    Documented
    +
    Committed
    +
    Pushed
    =
    Done

---

## 15. Core Principle

GitHub is shared memory.

Commits are messages between agents.

Branches are workspaces.

Handoffs are context.

Tests are evidence.

One agent writes at a time.

Verify everything important.
