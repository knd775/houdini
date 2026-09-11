# knd775/houdini

A fork of [HoudiniGraphql/houdini](https://github.com/HoudiniGraphql/houdini) that builds preview
packages from upstream's unreleased `main`, because upstream releases slower than we need some of its
bug fixes.

## The one rule

`main` is identical to upstream's `main`. Nothing fork-local is ever committed to it.

That rule keeps two things working at once. Syncing is always a fast-forward, so it can't conflict,
and a branch cut from `main` holds only your own commits, so it can go straight to an upstream PR.

Everything fork-local lives on this `preview` branch. It shares no history with `main` and is never
merged into it.

## Running a preview build

Push to this branch. An empty commit is enough:

```bash
git commit --allow-empty -m "chore: build preview" && git push origin preview
```

There's no button in the Actions tab. GitHub only fires `workflow_dispatch` and `schedule` for
workflow files that exist on the repository's default branch, and putting this workflow on `main`
would break the rule above. A push to any branch does run that branch's workflows, so pushing here
is the trigger.

If you want the button, make this the fork's default branch with
`gh repo edit knd775/houdini --default-branch preview`. `main` stays pristine either way. The cost is
that the repo homepage and a fresh `git clone` then land on this branch.

Each build fast-forwards `main` to upstream first, so it doubles as a sync. That push is the only
thing the workflow writes to this repository, and `git merge --ff-only` means it fails loudly rather
than merging if `main` has drifted.

## Installing a preview

Every run's summary lists a URL per package:

```bash
pnpm add https://pkg.pr.new/knd775/houdini/houdini@<sha>
```

Install `houdini` and whichever plugin you use. The rest arrives as dependencies, because the
preview's cross-package dependencies point at sibling previews instead of npm.

That redirect matters most for `houdini-core`, `houdini-react` and `houdini-svelte`, which each ship
a compiled Go binary through `optionalDependencies`. The binary you get is the one built from the
commit you asked for.

Those three are also stamped `X.Y.Z-preview-<sha>`. Their postinstall falls back to downloading
`<name>-<platform>@<version>` from npm when the optional platform package is missing. At the released
version, that fallback pairs upstream's published binary with this preview's JavaScript and says
nothing about it. A version npm can't answer turns that silence into a 404.

## Prerequisites

The [pkg.pr.new GitHub App](https://github.com/apps/pkg-pr-new) has to be installed on this
repository. Without it the publish step fails, though everything before it still runs.

`PLATFORMS` in the workflow decides which platform packages get published. Each one is a separate
cross-compiled binary, so the list is short by default. npm and pnpm match a package's `os` and `cpu`
fields, so nothing ever asks for a platform that isn't there. Add `wasm` for the WASI build.

If pkg.pr.new rejects the payload for size, the fallback is to attach the same tarballs to a
prerelease in this repo and rewrite the cross-package dependencies to those download URLs.

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

## Upstream workflows disabled in this fork

Release, Trigger docs rebuild, Publish VS Code Extension and Cache Benchmarks are disabled through
the Actions API, not by deleting their files, since editing them would put fork-local changes on
`main`. That state lives in repository settings and survives syncing. CI Checks is still on.
