# A8 — Developer Platform Consumer Certification

**Consumer:** Notes  
**Account contract:** 1.0  
**SDK compatibility:** 1.x  
**Integration mode:** `certified-legacy`  
**Verdict:** **CONSUMER CONTRACT CERTIFIED**

A8 does not rewrite Notes authentication. The A6/A7 implementation already uses the canonical THIEPN project/session authority and has full production/E2E certification. A8 adds the normalized developer manifest and a conformance gate so future platform changes can verify Notes remains compatible with SDK 1.x semantics.

## Contract

- canonical identity/session authority remains `thiepn-account`;
- canonical shared auth storage remains the only session authority;
- Notes remains local-first when cloud/account/network is unavailable;
- network/service failure does not become logout;
- safe reads may use bounded retries, while auth/writes are not blindly retried;
- ordinary sign-out remains explicitly local;
- new account features should be added through the central SDK contract before being copied into consumers.

## Certification evidence

- A8 consumer-contract workflow passes.
- Full Notes CI passes through format, contracts, lint, typecheck, unit tests and production build.
- Core browser compatibility passes.
- Complete no-retry E2E release regression passes.
- P20 release certification passes.
- PWA offline certification passes.
- No Notes authentication/session runtime code is changed by A8.

Merge remains gated on those workflows being green for the final A8 head. Runtime behavior remains the A7-certified release.
