/**
 * Conventional Commits enforcement (see #490). Extends the standard
 * community ruleset rather than inventing our own - keeps commit history
 * consistent with the rest of the ecosystem and leaves room for automated
 * changelog generation later without a custom parser.
 *
 * Enforced via the .husky/commit-msg hook (runs on every local commit).
 * There is no CI re-check of this yet - the repo has no GitHub Actions
 * workflows configured, and adding one is out of scope for this change
 * (see the PR description for why).
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
};
