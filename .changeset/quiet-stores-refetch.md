---
'houdini': patch
'houdini-core': patch
---

Fix query stores that were subscribed but never fetched sending their query without variables when the session changes or a record is refreshed.
