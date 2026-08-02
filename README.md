# Mobile Dev Studio

AI-Assisted Mobile Development Control Plane

Mobile Dev Studio is a lightweight development control plane designed to operate a mobile software-development workflow from a constrained environment.

The system is built around three cooperating layers:

1. Mobile Dev Studio — development control plane
2. Antigravity — primary implementation agent
3. OpenCode — review, debugging, and verification agent

GitHub is the synchronization layer and the authoritative source of project state.

The objective is simple:

«One agent writes. Another agent verifies. Git records the state. Tests provide evidence.»

---

1. System Architecture

                         ┌──────────────────────┐
                         │       GITHUB         │
                         │   SOURCE OF TRUTH    │
                         └──────────┬───────────┘
                                    │
                         fetch / pull / push
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
          ┌──────────────────┐             ┌──────────────────┐
          │   ANTIGRAVITY     │             │     OPENCODE     │
          │                  │             │                  │
          │ Implementation   │             │ Review           │
          │ Planning         │             │ Debugging        │
          │ Testing          │             │ Integration      │
          │ Integration      │             │ Verification     │
          │                  │             │ Repair           │
          └────────┬─────────┘             └────────┬─────────┘
                   │                                │
                   └──────────────┬─────────────────┘
                                  │
                                  ▼
                       ┌────────────────────┐
                       │ MOBILE DEV STUDIO  │
                       │                    │
                       │ Filesystem         │
                       │ Terminal           │
                       │ Runtime            │
                       │ Git visibility     │
                       │ Development tools  │
                       └────────────────────┘

Mobile Dev Studio is not the source of truth.

The local filesystem is not the source of truth.

An AI agent's memory is not the source of truth.

GitHub is the source of truth.

---

2. Operating Environment

The current development environment consists of:

Android device
        │
        ▼
     Termux
        │
        ▼
   proot-distro
        │
        ▼
 Ubuntu 24.04 LTS
        │
        ├── Git
        ├── Node.js
        ├── npm / npx
        ├── Python
        └── Mobile Dev Studio

The environment is intentionally designed to work without assuming dedicated development hardware.

The development machine can therefore be treated as:

Termux
  └── Ubuntu
       └── Mobile Dev Studio
            └── Git repository
                 └── AI workflow

---

3. Repository Structure

The project currently follows this general structure:

mobile-dev-studio/
│
├── .agent/
│   ├── WORKFLOW.md
│   └── HANDOFF.md
│
├── .git/
│
├── .gitignore
│
├── .venv/
│
└── app/
    ├── agent/
    ├── filesystem/
    ├── git/
    ├── static/
    └── terminal/

The ".agent/" directory contains operational documentation for AI agents.

It is not application code.

It exists to maintain continuity between independent AI sessions.

---

4. Agent Responsibilities

4.1 Antigravity — Implementation Agent

Antigravity is the primary construction agent.

Responsibilities:

1. Understand the requested task.
2. Inspect the existing implementation.
3. Read the workflow documentation.
4. Read the current handoff.
5. Synchronize with GitHub.
6. Plan the modification.
7. Implement the modification.
8. Run relevant tests.
9. Verify the resulting behavior.
10. Update the handoff.
11. Commit the completed work.
12. Push the commit to GitHub.

Antigravity should leave the repository in a state another agent can understand.

The implementation agent should not merely make the code "look correct."

It must produce evidence.

---

4.2 OpenCode — Review and Verification Agent

OpenCode is the secondary engineering agent.

Its primary purpose is independent verification.

Responsibilities:

1. Synchronize with GitHub.
2. Read ".agent/WORKFLOW.md".
3. Read ".agent/HANDOFF.md".
4. Inspect the implementation.
5. Inspect the relevant Git history.
6. Reproduce reported problems.
7. Run relevant tests.
8. Identify implementation defects.
9. Fix defects when authorized and appropriate.
10. Verify the fix.
11. Update the handoff.
12. Commit changes.
13. Push changes to GitHub.

OpenCode should not blindly trust Antigravity's claims.

A statement such as:

"Fixed."

is not evidence.

A statement such as:

pytest -q
12 passed

is evidence.

---

5. Mobile Dev Studio — Control Plane

Mobile Dev Studio provides the operational environment around the agents.

Its responsibilities include:

- filesystem access
- terminal access
- Git visibility
- application/runtime visibility
- development tooling
- test execution
- project inspection

It does not decide which agent owns the current task.

It does not replace GitHub.

It does not replace testing.

Think of Mobile Dev Studio as the control room, not the authoritative archive.

---

6. GitHub — Source of Truth

GitHub provides the shared state between agents.

The local machine may contain:

- uncommitted modifications
- stale branches
- incomplete work
- temporary files
- failed experiments
- broken builds
- agent-specific state

Therefore:

«Never assume another agent's local filesystem is current.»

Instead, synchronize through Git.

The basic synchronization operation is:

git fetch origin
git status --short --branch
git log --oneline --decorate -10

This establishes:

- remote state
- local working-tree state
- branch relationship
- recent project history

---

7. Single Writer Rule

Only one AI agent may modify the working tree at a time.

Do not allow Antigravity and OpenCode to simultaneously modify the same checkout.

The safe model is:

Agent A
   │
   ├── modify
   ├── test
   ├── verify
   ├── commit
   └── push
          │
          ▼
       GitHub
          │
          ▼
Agent B
   │
   ├── fetch
   ├── inspect
   ├── test
   ├── repair if necessary
   ├── commit
   └── push

This prevents concurrent filesystem modification and reduces merge conflicts.

---

8. Standard Agent Startup Procedure

Every agent begins by establishing the repository state.

cd /root/projects/mobile-dev-studio

git fetch origin

git status --short --branch

git log --oneline --decorate -10

Then inspect:

cat .agent/WORKFLOW.md
cat .agent/HANDOFF.md

The agent should understand:

Where am I?
What changed?
Who worked last?
What was tested?
What remains?
Is the tree clean?
What does GitHub contain?

Only after this should implementation begin.

---

9. Task Acquisition

When receiving a new task:

REQUEST
   │
   ▼
UNDERSTAND
   │
   ▼
INSPECT
   │
   ▼
PLAN
   │
   ▼
IMPLEMENT
   │
   ▼
TEST
   │
   ▼
VERIFY
   │
   ▼
HANDOFF
   │
   ▼
COMMIT
   │
   ▼
PUSH

Do not jump directly from:

"User requested X"

to:

"Modify file Y."

First determine how the current system actually works.

---

10. Inspect Before Editing

Before modifying a component, inspect:

git status --short --branch

find . -maxdepth 2 -type f | sort

git log --oneline --decorate -10

Then inspect the relevant implementation.

For example:

find app -maxdepth 3 -type f | sort

The agent should establish:

- existing architecture
- relevant files
- dependencies
- current behavior
- previous changes
- possible regressions
- test coverage

The principle is:

«Do not repair a system you have not inspected.»

---

11. Implementation Protocol

Implementation should be incremental.

Recommended sequence:

1. Inspect
2. Form hypothesis
3. Make smallest useful change
4. Run focused test
5. Inspect result
6. Expand change if necessary
7. Run broader tests
8. Review diff
9. Commit

Avoid unrelated refactoring during a focused task.

A small diff is easier to:

- understand
- test
- review
- revert
- transfer between agents

---

12. Testing as Evidence

Tests are not decoration.

Tests are evidence.

A successful test should answer a specific question.

Examples:

Does the server start?
Does the endpoint respond?
Does the UI render?
Does the terminal connect?
Does Git status work?
Does the changed function return the expected result?
Does the regression still occur?

Prefer focused tests first.

Example:

python -m pytest

or:

python -m pytest tests/test_specific_feature.py

For syntax-level validation:

python -m compileall app

For Git integrity:

git diff --check

For repository state:

git status --short --branch

The agent must report what was actually executed.

Never fabricate test results.

---

13. Evidence Hierarchy

Engineering claims should be backed by progressively stronger evidence.

Level 0
"I think it works."

        ↓

Level 1
"Code inspection suggests it works."

        ↓

Level 2
"Static validation succeeds."

        ↓

Level 3
"Focused test succeeds."

        ↓

Level 4
"Integration test succeeds."

        ↓

Level 5
"Runtime behavior was manually verified."

        ↓

Level 6
"Independent agent reproduced and verified it."

The stronger the claim, the stronger the evidence required.

---

14. Handoff Protocol

".agent/HANDOFF.md" is the transfer document between agents.

It should contain:

Task
Changed files
Implementation details
Tests
Git branch
Commit
Push status
Known issues
Next agent instructions

A handoff should allow a new agent to continue without asking:

«"What the hell happened here?"»

A useful handoff describes:

WHAT changed
WHY it changed
HOW it works
HOW it was tested
WHAT remains

---

15. Handoff Example

A completed handoff should resemble:

Task
Implement terminal reconnect behavior.

Changed
- app/terminal/connection.py
- app/static/index.html

Important implementation details
- reconnect attempts are limited
- existing sessions are not duplicated
- connection state is explicitly tracked

Tests
- python -m pytest tests/test_terminal.py
- Result: 8 passed

Git
- Branch: master
- Commit: abc1234
- Pushed: yes

Known Issues
- None

Next Agent
Verify reconnect behavior against a real browser session.

The exact details will change per task.

The principle does not.

---

16. Git Commit Protocol

Before committing:

git status --short --branch
git diff --check
git diff

Then stage only the intended changes:

git add <files>

Review the staged diff:

git diff --cached --check
git diff --cached --stat
git diff --cached

Then commit:

git commit -m "type: concise description"

Examples:

feat: add terminal reconnect handling
fix: prevent duplicate websocket sessions
refactor: simplify agent session lifecycle
test: add terminal connection coverage
chore: update agent workflow

---

17. Push Protocol

After committing:

git fetch origin
git status --short --branch

Confirm the branch is in the expected state.

Then:

git push origin master

Finally verify:

git fetch origin
git status --short --branch
git log --oneline --decorate -3

A successful completion should normally result in:

## master...origin/master

with no unexpected working-tree changes.

---

18. Dirty Working Tree Protocol

If an agent begins with:

## master...origin/master
 M some/file

do not immediately overwrite the file.

Determine what the modification is:

git diff -- some/file

If unknown files exist:

git status --short

Inspect them before acting.

The rule is:

«Never destroy unknown work merely because it is inconvenient.»

If the state is ambiguous, stop and inspect.

---

19. Remote Divergence Protocol

If Git reports:

ahead 1

the local branch contains one commit not yet pushed.

If it reports:

behind 1

the remote contains a commit missing locally.

If it reports:

ahead 1, behind 1

the histories have diverged.

Do not blindly overwrite either side.

First inspect:

git log --oneline --decorate --graph --all -20

Then determine the correct integration strategy.

---

20. Branch Discipline

Branches represent workspaces.

The default principle is:

master
  │
  ├── stable shared state
  │
  └── agent work happens in controlled sequence

Do not force-push shared history.

Do not rewrite published commits merely to make the graph look cleaner.

Git history is operational information.

---

21. MCP Policy

MCP is optional.

The development workflow must not depend on MCP being available.

If MCP is unavailable:

Git
+
Filesystem
+
Terminal
+
Tests
+
GitHub

remain sufficient for synchronization.

MCP may provide additional capabilities, but it is not the synchronization mechanism.

Git is.

---

22. Secrets and Credentials

Never commit:

.env
API keys
tokens
passwords
private credentials
SSH private keys
service-account credentials
session secrets

Before committing, inspect suspicious files.

Useful checks include:

git status --short
git diff
git diff --cached

Do not paste credentials into:

- source files
- README files
- workflow documents
- handoff documents
- commit messages

If a credential is accidentally committed, treat it as compromised and rotate it.

---

23. Failure Handling

When something fails:

FAILURE
   │
   ▼
STOP
   │
   ▼
CAPTURE ERROR
   │
   ▼
REPRODUCE
   │
   ▼
IDENTIFY CAUSE
   │
   ▼
CHANGE ONE THING
   │
   ▼
TEST AGAIN

Do not randomly modify several components simultaneously.

Avoid:

try command A
fail
try random command B
fail
rewrite configuration
fail
delete files
panic

Instead:

observe
hypothesize
test
modify
verify

The terminal is an instrument panel.

Read the instruments.

---

24. Accidental Terminal Input

Long shell commands can be corrupted by mobile terminals, pasted multiline input, quoting errors, or interrupted heredocs.

If the shell begins producing strange commands such as:

bash: M: command not found

or creates unexpected files:

?? "some accidental command text"

stop immediately.

Inspect:

git status --short

ls -lah

find . -maxdepth 1 -type f -print

Do not continue blindly.

Remove only files that have been positively identified as accidental.

Then verify:

git status --short --branch

---

25. Documentation Files

The ".agent/" directory is operational infrastructure.

WORKFLOW.md

Defines:

- system architecture
- agent roles
- synchronization rules
- Git protocol
- testing expectations
- safety constraints
- handoff procedure

HANDOFF.md

Defines the current operational state of the project between agents.

Both files should remain understandable to an independent agent.

---

26. Development Cycle

The complete development cycle is:

┌───────────────────────┐
│       TASK ARRIVES    │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│      SYNCHRONIZE      │
│   fetch / status / log│
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│         READ          │
│ workflow / handoff    │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│        INSPECT        │
│ code / architecture   │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│         PLAN          │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│       IMPLEMENT       │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│         TEST          │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│        VERIFY         │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│       HANDOFF         │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│        COMMIT         │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│         PUSH          │
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│   REMOTE VERIFICATION │
└───────────┬───────────┘
            │
            └──────────────► NEXT AGENT

---

27. Agent State Machine

An agent should conceptually exist in one of these states:

IDLE
 │
 ▼
SYNCHRONIZING
 │
 ▼
INSPECTING
 │
 ▼
PLANNING
 │
 ▼
IMPLEMENTING
 │
 ▼
TESTING
 │
 ├── FAIL ──► DEBUGGING ──► TESTING
 │
 ▼
VERIFYING
 │
 ▼
HANDOFF
 │
 ▼
COMMITTING
 │
 ▼
PUSHING
 │
 ▼
COMPLETE

An agent must not declare completion while tests are failing unless the failure is explicitly documented as a known issue.

---

28. What "Done" Means

A task is not complete merely because code was changed.

A task is complete when:

- the requested behavior is implemented
- relevant tests have been executed
- important behavior has been verified
- the diff contains the intended changes
- the handoff is updated
- the commit exists
- the commit has been pushed
- the remote state has been verified
- known issues are documented

Operationally:

DONE =
Implementation
+
Testing
+
Verification
+
Documentation
+
Commit
+
Push

---

29. What Agents Must Never Do

Do not:

- force-push shared branches
- overwrite another agent's work blindly
- delete unknown files
- commit secrets
- commit ".env" files
- fabricate test results
- assume MCP is available
- assume another agent's local environment exists
- assume local Git state equals remote Git state
- declare success without evidence
- modify unrelated components without justification
- use destructive commands without understanding their effect

When uncertain:

«Inspect first. Modify second.»

---

30. Operational Philosophy

This workflow intentionally treats AI agents as independent engineering processes rather than as a single continuous intelligence.

An agent session can disappear.

A model can change.

A context window can end.

A local filesystem can become stale.

An agent can forget what happened five minutes earlier.

The repository must remain understandable anyway.

Therefore:

GitHub      = shared memory
Git commits = durable messages
Branches    = workspaces
Handoffs    = context transfer
Tests       = evidence
Mobile Dev Studio = control plane
Agents      = workers

The system should remain operational even if any single AI session disappears.

---

31. Final Operational Checklist

Before starting:

git fetch origin
git status --short --branch
git log --oneline --decorate -10
cat .agent/WORKFLOW.md
cat .agent/HANDOFF.md

Before committing:

git status --short
git diff --check
git diff
git diff --cached --check

After committing:

git log --oneline --decorate -3

After pushing:

git fetch origin
git status --short --branch
git log --oneline --decorate -3

Expected clean state:

## master...origin/master

No unexplained modifications.

No unexplained files.

No unpushed work.

No undocumented failures.

---

Core Principle

GitHub is shared memory.

Commits are messages between agents.

Branches are workspaces.

Handoffs are context.

Tests are evidence.

One agent writes at a time.

Verify everything important.

This is the operating doctrine of Mobile Dev Studio.
