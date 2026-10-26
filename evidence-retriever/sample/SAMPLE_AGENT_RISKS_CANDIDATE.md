# Sample corpus A — agent risks (synthetic test fixture)

## Attack surface

- 🟢 `source` Indirect prompt injection through retrieved documents is listed as an agent risk by OWASP. https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
- 🟡 `inference` A reader agent should have no privileged tools; the actor receives only schema-validated proposals.
- ⚪ `gap` No inventory of tools and credentials exists for this sample; absence of a tool in this list is not evidence that it is absent.

## Limits

- The sample does not contradict the main report; it exists only so that the retriever can be run without private files.
