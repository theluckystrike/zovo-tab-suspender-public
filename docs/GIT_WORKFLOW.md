# Git Workflow for Multi-Agent Development

This document outlines the branching strategy and merge process for parallel feature development.

---

## Branch Structure

```
main
├── agent-0/architect          ← Foundation work (created first)
├── agent-1/countdown-indicator
├── agent-2/dashboard-sync
└── agent-3/exclusion-feedback
    └── integration/all-features  ← Final merge branch
```

---

## Setup Commands

### Initial Setup (Run Once)

```bash
# Ensure we're on main and up to date
git checkout main
git pull origin main

# Create Agent 0 branch (Architect - runs first)
git checkout -b agent-0/architect
# ... do Agent 0 work ...
git add .
git commit -m "Agent 0: Add architecture docs, contracts, and test infrastructure"
git push -u origin agent-0/architect

# Merge Agent 0 to main before other agents start
git checkout main
git merge agent-0/architect --no-ff -m "Merge Agent 0: Foundation"
git push origin main
```

### Feature Branch Creation (Agents 1-3)

```bash
# Agent 1: Countdown Indicator
git checkout main
git pull origin main
git checkout -b agent-1/countdown-indicator

# Agent 2: Dashboard Sync
git checkout main
git pull origin main
git checkout -b agent-2/dashboard-sync

# Agent 3: Exclusion Feedback
git checkout main
git pull origin main
git checkout -b agent-3/exclusion-feedback
```

---

## Commit Message Convention

Use this format for all commits:

```
<Agent>: <Short description>

<Detailed description if needed>

Files changed:
- path/to/file1.js
- path/to/file2.css
```

### Examples

```
Agent 1: Add timer tracking module

Implements TabTimerTracker class that persists countdown
information across service worker restarts.

Files changed:
- src/features/countdown/timer-tracker.js
- src/features/countdown/countdown.css
```

```
Agent 2: Fix dashboard stats sync

Dashboard now subscribes to STATS_UPDATED broadcasts
and refreshes automatically when stats change.

Files changed:
- src/features/stats/stats-manager.js
- src/features/stats/dashboard-provider.js
```

---

## Parallel Development Rules

### DO

1. **Create new files** in your designated directories:
   - Agent 1: `src/features/countdown/`
   - Agent 2: `src/features/stats/`
   - Agent 3: `src/features/exclusions/`

2. **Add to existing files** using clear markers:
   ```javascript
   // ========== AGENT 1: COUNTDOWN INDICATOR ==========
   // ... your code here ...
   // ========== END AGENT 1 ==========
   ```

3. **Use feature flags** for all new functionality

4. **Document all changes** in your commit messages

### DON'T

1. **Don't modify core logic** in these files:
   - `background.js` (except adding message handlers)
   - `popup.js` (except adding initialization)
   - `manifest.json` (except version bump by Agent 4)

2. **Don't rename existing functions or variables**

3. **Don't change existing storage key schemas**

4. **Don't remove any existing code**

---

## Integration Process (Agent 4)

### Step 1: Create Integration Branch

```bash
git checkout main
git pull origin main
git checkout -b integration/all-features
```

### Step 2: Merge Feature Branches (in order)

```bash
# Merge Agent 1
git merge agent-1/countdown-indicator --no-ff -m "Merge: Countdown Indicator feature"

# If conflicts, resolve and commit:
# git add .
# git commit -m "Resolve conflicts: Agent 1 merge"

# Merge Agent 2
git merge agent-2/dashboard-sync --no-ff -m "Merge: Dashboard Sync feature"

# Merge Agent 3
git merge agent-3/exclusion-feedback --no-ff -m "Merge: Exclusion Feedback feature"
```

### Step 3: Resolve Any Conflicts

Common conflict areas and resolution strategy:

| File | Conflict Type | Resolution |
|------|--------------|------------|
| `popup.html` | Multiple elements added | Keep all, order logically |
| `popup.js` | Multiple initializations | Combine into single init block |
| `popup.css` | Multiple style blocks | Keep all, no conflict |
| `background.js` | Multiple message handlers | Add all handlers to switch |

### Step 4: Run Tests

```bash
# Unit tests
npm test

# Integration tests
node test/integration/pre-flight-check.js
node test/integration/storage-integrity.js

# Manual testing checklist
# (see TEST_RESULTS.md template)
```

### Step 5: Finalize

```bash
# Bump version in manifest.json
# Update CHANGELOG.md

# Commit final changes
git add .
git commit -m "Release v1.1.0: Countdown, Dashboard Sync, Exclusion Feedback"

# Create release tag
git tag -a v1.1.0 -m "Release v1.1.0"

# Push everything
git push origin integration/all-features
git push origin v1.1.0
```

### Step 6: Create PR to Main

```bash
# Create pull request
gh pr create \
  --title "Release v1.1.0: Three New Features" \
  --body "## Features
- Per-tab countdown indicator
- Dashboard stats sync fix
- Exclusion feedback on Suspend All

## Testing
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing completed

## Rollback
See docs/ROLLBACK_PLAN.md"
```

---

## Conflict Prevention Checklist

Before starting work, each agent should:

- [ ] Read `docs/ARCHITECTURE.md`
- [ ] Read `docs/CONTRACTS.md`
- [ ] Pull latest from main
- [ ] Create feature branch from main
- [ ] Only modify files in designated directories
- [ ] Use feature flags for all new code
- [ ] Test in isolation before requesting merge

---

## Hotfix Process

If a critical bug is found after merge:

```bash
# Create hotfix branch from the release tag
git checkout v1.1.0
git checkout -b hotfix/critical-fix

# Make minimal fix
# ... edit files ...

# Commit and tag
git commit -m "Hotfix: <description>"
git tag -a v1.1.1 -m "Hotfix release"

# Merge back to main
git checkout main
git merge hotfix/critical-fix --no-ff
git push origin main
git push origin v1.1.1
```

---

## Branch Cleanup

After successful release:

```bash
# Delete local feature branches
git branch -d agent-1/countdown-indicator
git branch -d agent-2/dashboard-sync
git branch -d agent-3/exclusion-feedback
git branch -d integration/all-features

# Delete remote feature branches
git push origin --delete agent-1/countdown-indicator
git push origin --delete agent-2/dashboard-sync
git push origin --delete agent-3/exclusion-feedback
```
