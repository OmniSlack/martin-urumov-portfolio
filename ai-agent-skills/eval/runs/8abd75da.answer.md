No, I don't agree. Neither result supports deleting anything yet.

**computeTotal:** An empty grep with exit 1 only means that exact string `computeTotal(` isn't in `src/`. It misses:
- references without a paren: callbacks (`.map(computeTotal)`), exports, re-exports, `computeTotal (`
- dynamic or string-based lookups
- callers outside `src/`: tests, other packages, scripts, generated code

Also, the definition itself usually contains `computeTotal(` (`function computeTotal(`). If it doesn't match either, then the function is declared in a different form (`const computeTotal = ...`), lives outside `src/`, or is named differently. That suggests the search is wrong, not that the code is dead. Re-run `grep -rnw computeTotal .` across the whole repo, and check `git log -S computeTotal`.

**/v2/orders:** A 404 from one unauthenticated request doesn't show the endpoint was removed. It could be:
- a missing auth header
- the wrong host or environment
- a route that needs an ID (`/v2/orders/{id}`)
- the wrong HTTP method
- a gateway or VPN issue

Retry with proper credentials and method, and check the API changelog or ask the owning team. Also confirm the client has no remaining callers.

Verify both, then delete.
