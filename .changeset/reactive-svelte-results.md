---
"houdini": patch
"houdini-core": patch
"houdini-svelte": minor
---

Add opt-in Svelte field reactivity via top-level `experimentalFieldReactivity`,
with direct `Query.data` reads and readonly result arrays. Add named selection
types and a `mutable()` list-copy helper. Existing store APIs remain the default.
