# Contributing to RemitX

Thanks for helping with RemitX. This repository mixes product work, SDK-style integration tasks, and grant-style contributor issues, so the fastest way to keep things moving is to claim work clearly and keep the PR scope tight.

## Before you start

1. Read the issue all the way through and leave a short comment that you are taking it.
2. Wait for the maintainer to confirm if the issue asks for assignment or coordination.
3. Keep one issue per PR unless the maintainer explicitly asks for a bundle.
4. Work against the current code in `README.md` and the repo itself, not the older framing in `FOUNDATION.md`.

Example claim comment:

```text
/attempt #499

I can take this one and should have a PR up today.
```

## Expected turnaround

Use these as rough defaults unless the issue says otherwise:

- Small docs or copy fixes: same day, usually within a few hours
- Focused frontend or API fixes: 1-2 days
- Larger architecture, contract, or protocol work: agree on scope in the issue before starting

If you get blocked, leave a short update in the issue instead of going silent. A quick “I’m still on this, PR tomorrow” is enough to prevent duplicate work.

## Local setup

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Run lint before opening a PR:

```bash
npm run lint
```

## Pull request checklist

Before opening a PR, make sure you have:

- kept the change focused on the issue you claimed
- tested the commands or snippets you mention in docs
- updated docs when behavior changed
- explained any intentional deviation from the issue in the PR description

A good PR description usually includes:

- what changed
- how you verified it
- any follow-up work that should stay out of this PR

## How grants / bounties are handled

If an issue is marked as a bounty or grant task:

1. Claim it in the issue first so maintainers can see it is in progress.
2. Open a PR that links the issue and describes the verification you ran.
3. Wait for review and merge confirmation before assuming payout.
4. If the repo uses a bot or platform-specific command like `/claim`, include it exactly where the issue or maintainer asks for it.

Do not assume every issue is first-come-first-served forever. If maintainers need to reassign stale work, they may do that.

## Scope discipline

The easiest PRs to review here are the ones that do one thing well. If you notice adjacent cleanup while working, mention it in the PR notes instead of quietly expanding the change.

## Dependency updates

Dependabot is configured in `.github/dependabot.yml` for the root `npm` app, the `contracts/escrow` Cargo crate, and any GitHub Actions used in the repo, all on a weekly schedule. It opens its own PRs against `main` — treat those PRs like any other contribution (read the changelog for anything non-trivial before approving, and let CI run once workflows exist).
