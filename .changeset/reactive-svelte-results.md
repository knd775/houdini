---
"houdini": patch
"houdini-core": patch
"houdini-svelte": minor
---

Add experimental field-level Svelte reactivity via `experimentalFieldReactivity`
in the `houdini-svelte` plugin config. Enable it and regenerate to use direct
`Query.data` and plain fragment `data` reads. Existing store APIs remain the default.
