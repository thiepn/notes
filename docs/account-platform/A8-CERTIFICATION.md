# A8 — Developer Platform Consumer Certification

**Consumer:** Notes  
**Account contract:** 1.0  
**SDK compatibility:** 1.x  
**Integration mode:** `certified-legacy`

A8 does not rewrite Notes authentication. The A6/A7 implementation already uses the canonical THIEPN project/session authority and has full production/E2E certification. A8 adds the normalized developer manifest and a conformance gate so future platform changes can verify Notes remains compatible with SDK 1.x semantics.

## Contract

- canonical identity/session authority remains `thiepn-account`;
- canonical shared auth storage remains the only session authority;
- Notes remains local-first when cloud/account/network is unavailable;
- network/service failure does not become logout;
- safe reads may use bounded retries, while auth/writes are not blindly retried;
- ordinary sign-out remains explicitly local;
- new account features should be added through the central SDK contract before being copied into consumers.

## Status

**CERTIFICATION PENDING A8 CI.** Runtime behavior is unchanged from the A7-certified release.
