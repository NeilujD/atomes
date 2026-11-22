<!--
Title: Conventional Commit, with the milestone or the Linear ticket as scope. It sets the next version.
  feat(M14): …         New (minor)
  fix(CORE-123): …     Fix (patch)
  perf: / refactor: …  Improvement (patch)
  feat!: / fix!: …     Breaking change (major): needs a "### Migration" part below
  docs: / ci: / chore: / test: / build: / style: / revert: …  not in the release notes
-->

## Summary

<!-- The smallest view that makes the change clear: a call tree, a diff sketch, a file tree or a diagram, with one or two lines of text. -->

## Evidence

<!-- Proof that it works: screenshots for visual changes, else test or command output. -->

## Merge Danger

**Door:** <!-- one-way (hard to undo) or two-way (easy to revert) -->

**Blast Radius:** <!-- one word, then what could break -->

## Release notes

<!-- Text for readers, in Markdown, for the GitHub Release. It goes under a heading made from the PR title.
Write "none" for a change readers do not see. Leave it empty to use the title only.
For a breaking change, add a level-3 heading named Migration that says what readers or operators must do.
For a step on production before the deploy (a Coolify setting, a script), add a level-3 heading named
"Before you deploy": it goes to the release PR, not to the notes. Any PR type can have it.
Image URLs must point to main, not to this branch. -->
