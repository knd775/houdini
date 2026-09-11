# Preview builds

This fork publishes installable preview packages built from upstream's unreleased `main`, so an app can
pick up a fix before it lands on npm. Everything that makes this fork differ from upstream lives on the
`preview` branch, which is also its default branch.

## The one rule

`main` is identical to upstream's `main`. Nothing fork-local is ever committed to it.

That rule keeps two things working at once. Syncing is always a fast-forward, so it can't conflict,
and a branch cut from `main` holds only your own commits, so it can go straight to an upstream PR.

Everything fork-local lives on this `preview` branch. It shares no history with `main` and is never
merged into it.

## Running a preview build

Any of these works. The first two need nothing but a browser or the GitHub mobile app:

- Tick a box on the [Preview builds](../../issues/1) issue.
- Comment on any issue in this repo:
  - `/preview` builds upstream's current `main`
  - `/preview <sha>` builds one named commit and leaves `main` alone
  - `/sync` fast-forwards `main` and stops there
- Press **Run workflow** on the Preview release workflow in the Actions tab.
- Push to this branch: `git commit --allow-empty -m "chore: build preview" && git push origin preview`

The comment and checkbox paths are owner-only, since anyone can comment on a public repo. Comment
bodies reach the script through the environment rather than template interpolation, so `/preview`
with a shell command in it is rejected as a bad sha instead of running.

Every request reacts to what you did and reports back as a comment, so you never need to open the
run. A sync takes about twenty seconds; a build takes about five minutes.

### Why this branch is the default branch

GitHub fires `issue_comment`, `issues`, `workflow_dispatch` and `schedule` only for workflow files
that exist on the repository's **default** branch. Putting this workflow on `main` would break the
rule above, so the default branch is this one instead. `main` is untouched either way. The visible
cost is that the repo homepage and a fresh `git clone` land here rather than on the Houdini source.

Revert with `gh repo edit knd775/houdini --default-branch main`, which leaves only the push trigger
working.

### Syncing main

`/sync` and the sync checkbox exist because changing the default branch took the **Sync fork** button
away: GitHub only offers it for the default branch, and that's this one now.

A full build fast-forwards `main` first anyway, so it doubles as a sync. Building a named commit
doesn't, since that's a one-off look at old code rather than a statement about where `main` should be.

That fast-forward is the only thing the workflow writes to this repository, and `git merge --ff-only`
means it fails loudly rather than merging if `main` has somehow drifted.

## Installing a preview

Every build reports a URL per package:

```bash
pnpm add https://pkg.pr.new/knd775/houdini/houdini@<sha>
```

Install `houdini` explicitly, alongside whichever plugin you use. Upstream's build drops the
`houdini` dependency from `houdini-svelte` and `houdini-react` before publishing, on npm as well as
here, so a plugin on its own won't pull it in.

Platform packages do come along automatically. `houdini-core`, `houdini-react` and `houdini-svelte`
each ship a compiled Go binary through `optionalDependencies`, and the preview's entries point at
sibling previews rather than npm, so the compiler you get is built from the commit you asked for.

Two details make that safe, and both exist because the failure they prevent is silent:

Those three packages are stamped `X.Y.Z-preview-<sha>`. Their postinstall falls back to downloading
`<name>-<platform>@<version>` from npm when the optional platform package is missing. At the released
version, that fallback pairs upstream's published binary with this preview's JavaScript and says
nothing about it. A version npm can't answer turns that silence into a 404.

`PLATFORMS` in the workflow decides which platform packages get built into the preview, and the
entries for every other platform are dropped from `optionalDependencies` rather than left pointing at
a version npm has never seen. Add a platform there if you start installing on one, `wasm` included.

## Prerequisites

The [pkg.pr.new GitHub App](https://github.com/apps/pkg-pr-new) has to stay installed on this
repository. Without it the publish step fails and everything before it still runs.

If pkg.pr.new ever rejects the payload for size, the fallback is to attach the same tarballs to a
prerelease in this repo and rewrite the cross-package dependencies to those download URLs. A build of
two platforms was 97 MB.

## Contributing upstream

Branch from upstream rather than from the fork:

```bash
git remote add upstream https://github.com/HoudiniGraphql/houdini   # once
git fetch upstream
git switch -c fix/whatever upstream/main
```

Push to `origin` and open the PR against `HoudiniGraphql/houdini`. Branching from `origin/main` works
too while the rule above holds, but going through `upstream/main` doesn't depend on the mirror being
current.

With both remotes present, `gh` resolves to the parent repo, so fork-local commands need to say so:
`gh run list --repo knd775/houdini`.

## Upstream workflows disabled in this fork

Release, Trigger docs rebuild, Publish VS Code Extension and Cache Benchmarks are disabled through
the Actions API, not by deleting their files, since editing them would put fork-local changes on
`main`. That state lives in repository settings and survives syncing.

CI Checks is still on, which means each fast-forward of `main` also spends about six minutes of
Actions minutes running upstream's suite here. Disable it the same way if that isn't worth it.
