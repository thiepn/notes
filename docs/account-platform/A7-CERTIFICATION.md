# A7 — Operations, Observability & Recovery

**Consumer:** Notes  
**Operations contract:** A7.1  
**Implementation state:** implemented on `a7-operations-observability-recovery`; certification in progress

## Operational behavior

- Notes remains local-first when THIEPN Account, network or cloud sync is unavailable.
- Network failures are represented separately from authentication (`401`) and authorization (`403`) failures.
- Only safe `GET`/`HEAD` reads receive bounded transient retries: maximum three attempts with exponential backoff.
- Authentication calls and write/delete operations are never blindly retried.
- Exhausted network reads fail with status `0` and an explicit message that local Notes data is unchanged.
- Operational logs contain event name, generated operation ID, category/status/attempt/duration only. They do not include email, user ID, tokens, Notes content, attachment contents or request bodies.

## Automated coverage

`operations.test.ts` certifies:

- network/authentication/authorization/rate-limit/service classification;
- 401/403/validation failures are non-retryable;
- transient reads are retried within a strict bound;
- authorization failures stop after one attempt.

Existing Notes A6/E2E coverage continues to prove that shared sign-out clears account state without deleting local Notes data and that offline state remains distinct from signed-out state.

## Published metadata

`public/.well-known/thiepn-app.json` exposes only non-sensitive deployment/operations contract metadata for synthetic diagnostics.

## Recovery contract

Frontend rollback follows the central `ROLLBACK.md`. Cloud/data recovery follows central `DATA-RECOVERY.md`. Notes local IndexedDB content must not be deleted as a side effect of Auth/network recovery.

## Certification matrix

| Check                                              | Status                             |
| -------------------------------------------------- | ---------------------------------- |
| Failure taxonomy implemented                       | PASS                               |
| Network failure distinct from logout               | PASS                               |
| Bounded read retries                               | PASS                               |
| Auth/write retries prohibited by implementation    | PASS                               |
| Redacted operations log shape                      | PASS                               |
| Local-first degraded mode                          | PASS by implementation; CI pending |
| Existing full Notes CI/E2E                         | PENDING A7 PR CI                   |
| Production shell synthetic check                   | PENDING central A7 monitor         |
| Real signed-in production session/revocation smoke | MANUAL REQUIRED                    |

## Verdict

**NOT CERTIFIED — A7 branch CI, central synthetic production monitoring and the remaining signed-in production smoke must complete.**
