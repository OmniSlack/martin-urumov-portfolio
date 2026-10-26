
# LIMITATIONS



- Verification is local, not production deployment evidence.

- No remote deployment, Drive operation, or real Adapter action was verified.

- The tests prove the enumerated authority, persistence, concurrency and fail-closed behaviours; they do not prove arbitrary statements are true.

- node_modules is excluded from the package. Dependency identity is represented by package-lock.json.

- Reproduction should use npm ci with the recorded lock file.

- The operating system, Node executable, Docker image and PostgreSQL binary are not fully frozen by this ZIP.

- This package does not claim to be R5.

- Historical material does not automatically become current authority.
