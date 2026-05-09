---
name: github-pr-review
description: "Use this skill when asked to address, fix, or resolve GitHub PR review comments. Covers fetching comments via gh CLI, applying code fixes one at a time, committing with commitlint-style messages, and resolving threads on GitHub."
---

# GitHub PR Review Comment Resolution

A repeatable process for fetching unresolved PR review comments, evaluating their validity, applying fixes one at a time with proper commit messages, replying on GitHub with agent attribution, and then marking threads as resolved.

Important: if a thread was addressed, you must leave a GitHub reply on that thread before resolving it. Do not resolve addressed threads silently.

## Prerequisites

- `gh` CLI authenticated (`gh auth status`)
- On the correct feature branch (`git branch --show-current`)
- Remote tracking set up (`git push -u origin <branch>`)

---

## Step 1 — Fetch All Inline Review Comments

Get every inline comment (with author, line, and body) for a PR:

```sh
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  --jq '.[] | {id: .id, author: .user.login, path: .path, line: .line, body: .body}'
```

To also see top-level PR comments (non-inline):

```sh
gh pr view {pr} --repo {owner}/{repo} --json reviews,comments
```

---

## Step 2 — Fetch GraphQL Thread IDs and Resolve Status

The REST API comment IDs cannot be used to resolve threads — you need the GraphQL `PRRT_*` node IDs:

```sh
gh api graphql -f query='
{
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {pr}) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes {
              databaseId
              body
            }
          }
        }
      }
    }
  }
}'
```

Map each `databaseId` (from REST) to its `id` (GraphQL `PRRT_*`) so you can reply and resolve it later.

---

## Step 3 — Evaluate Each Comment

For every unresolved thread, decide:

| Decision | Criteria |
|----------|----------|
| ✅ **Apply** | Valid bug, inconsistency, performance issue, or clear improvement that fits the PR scope |
| ⏭️ **Skip** | Out of scope, requires large refactor, contradicts existing patterns, or is purely stylistic preference |
| 🗣️ **Discuss** | Ambiguous — surface to the human before acting |

Work through comments **one at a time**, in priority order: bugs → performance → consistency → style.

---

## Step 4 — Apply Fix and Commit

For each comment being addressed, make the minimal targeted code change, then commit immediately using **commitlint-style messages**:

### Commit message format

```
<type>(<scope>): <short description>
```

| Type | When to use |
|------|-------------|
| `fix` | Bug fix, incorrect behaviour |
| `feat` | New functionality added |
| `perf` | Performance improvement |
| `refactor` | Code restructure with no behaviour change |
| `style` | Formatting, naming (no logic change) |
| `chore` | Config, deps, tooling |

**Examples from this workflow:**

```sh
git commit -m "refactor(blog): extract DEFAULT_PROMO_KEY constant for blackFridayBanner magic string"
git commit -m "perf(blog): set priority and eager loading for first 3 above-fold images to improve LCP"
git commit -m "feat(blog): add empty state when no posts are available for current locale"
git commit -m "fix(blog): use locale-aware date formatting with date-fns locale mapping"
git commit -m "feat(blog): add generateStaticParams and dynamicParams=false for static generation of all locale routes"
git commit -m "feat(blog): add generateMetadata with OG, Twitter, and alternates for SEO"
```

### Commit command

```sh
git add <file> && git commit -m "<type>(<scope>): <description>"
```

---

## Step 5 — Push to Remote

After all commits are done, push the branch:

```sh
git push origin <branch-name>
```

---

## Step 6 — Reply on GitHub Before Resolving

This step is required for every addressed thread. If you fixed the issue, you must post a reply on the GitHub thread before resolving it.

Before resolving an addressed thread, leave a reply on the inline review comment that:

- states the thread was addressed
- identifies the harness and model that wrote the fix
- includes the commit SHA or a one-line summary whenever possible

Do not skip this reply step for addressed threads. The reply is part of the workflow, not an optional courtesy.

Use the current runtime's harness + model string exactly as it is known in context, for example:

- `Zed - GPT-5.4`
- `Codex App - GPT-5.4`
- `Claude Code - Opus 4.6`
- `GPT-5.4` if the harness or software agent is not known

### Reply format

```text
<Harness> - <Model>

Addressed in <commit_sha>: <short summary>
```

### Reply command

Use the REST `comment_id` / `databaseId` from Steps 1-2:

```sh
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies \
  -f body=$'<Harness> - <Model>\n\nAddressed in <commit_sha>: <short summary>'
```

For threads that were intentionally deferred, leave the thread open. Add a reply only when that context helps the reviewer understand why it stays open.

Rule of thumb:
- addressed thread → reply first, then resolve
- deferred thread → usually leave open, optionally reply with context
- skipped thread → leave open

---

## Step 7 — Resolve Threads on GitHub

Use the GraphQL `resolveReviewThread` mutation with the `PRRT_*` node ID from Step 2.

Only do this after Step 6 has been completed for that addressed thread:
- fix committed
- GitHub reply posted on the thread
- then resolve

```sh
gh api graphql -f query='
mutation {
  resolveReviewThread(input: { threadId: "<PRRT_node_id>" }) {
    thread {
      isResolved
    }
  }
}'
```

Repeat for each addressed thread. Verify the response contains `"isResolved": true`.

For threads that were **skipped**, do not resolve them — leave them open so reviewers know they were intentionally deferred.

---

## Process Flow

```
Fetch REST comments (gh api pulls/{pr}/comments)
        │
        ▼
Fetch GraphQL thread IDs + isResolved status
        │
        ▼
For each unresolved thread:
  ├── Valid? ──► Apply code fix
  │                  │
  │                  ▼
  │             git add + git commit (commitlint msg)
  │                  │
  │                  ▼
  │             Reply to inline comment with harness/model attribution
  │             (required before resolving)
  │                  │
  │                  ▼
  │             Resolve thread via GraphQL mutation
  │
  ├── Skip? ──► Leave thread open, note reason
  │
  └── Ambiguous? ──► Ask human before proceeding
        │
        ▼
git push origin <branch>
```

---

## Full Reference — All Commands in Order

```sh
# 1. Check branch
git branch --show-current

# 2. Fetch inline review comments (REST)
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  --jq '.[] | {id: .id, author: .user.login, path: .path, line: .line, body: .body}'

# 3. Fetch thread node IDs + resolve status (GraphQL)
gh api graphql -f query='
{
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {pr}) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes {
              databaseId
              body
            }
          }
        }
      }
    }
  }
}'

# 4. Apply fix, then commit (one per comment)
git add <file> && git commit -m "<type>(<scope>): <description>"

# 5. Push
git push origin <branch-name>

# 6. Reply before resolving (repeat per addressed comment)
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies \
  -f body=$'<Harness> - <Model>\n\nAddressed in <commit_sha>: <short summary>'

# 7. Resolve thread (repeat per addressed comment)
gh api graphql -f query='
mutation {
  resolveReviewThread(input: { threadId: "<PRRT_node_id>" }) {
    thread { isResolved }
  }
}'
```

---

## Key Rules

- **One fix, one commit** — never batch multiple comment fixes into a single commit
- **Commitlint format always** — `type(scope): description`, lowercase, no period at end
- **Reply before resolve** — every addressed thread gets a GitHub reply before resolution
- **Identify the writer** — the reply must include the harness + model string, such as `Codex App - GPT-5.4` or `Claude Code - Opus 4.6`
- **Resolve only what you fixed** — do not resolve threads for skipped comments
- **REST IDs ≠ GraphQL IDs** — the `id` from `gh api pulls/{pr}/comments` cannot be used with `resolveReviewThread`; always fetch the `PRRT_*` node ID via GraphQL first
- **Use REST for replies, GraphQL for resolve** — reply with the review comment `databaseId`, resolve with the thread `PRRT_*` ID
- **Verify resolution** — check `"isResolved": true` in the mutation response before moving on
