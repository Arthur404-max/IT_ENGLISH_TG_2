# Telegram IT English — roadmap plan

## Summary

The implementation upgrades the Telegram Mini App from a browser-local static experience into a server-backed learning product with reliable access, progress sync, referrals, streaks, blitz exams, leaderboards, notifications and monetization.

## Technical Context

- Frontend: static HTML/JavaScript/PWA on GitHub Pages.
- Telegram identity: validated `initData`; `user.id` is the account key.
- Bot: Node.js polling-compatible server, Telegram Stars payments.
- Storage: atomic JSON files initially; migration path to SQLite/PostgreSQL is required for production scale.
- Existing APIs: local `/api/progress`, `/api/session`, `/api/answer`, study queue and static IndexedDB snapshot.
- Public hosting: Tailscale Funnel temporarily; cloud 24/7 host is a separate deployment phase.

## Implementation Steps

### 1. Server foundation

Create one server-owned profile per Telegram user with access, subscription, referral, streak, game limits, progress, analytics and backup metadata.

### 2. Progress synchronization

Add authenticated endpoints to push and pull a validated progress snapshot. Keep IndexedDB as a cache, but server state becomes authoritative.

### 3. Referral protection

Issue signed referral codes, prevent self-referrals and repeated devices/IP abuse, require completed learning action before reward and issue only one free period per qualifying referral.

### 4. Free-game limits

Limit free game starts to one per day and three submissions per hour. Preserve personalized FSRS questions and give 24-hour access only after 8/10.

### 5. Streak and blitz

Add daily streak calculation, streak recovery rules, 5-minute blitz sessions and anti-cheat result submission.

### 6. Leaderboards

Create daily, weekly and friend leaderboards based on server-calculated scores and use Telegram-provided names only for display.

### 7. Notifications

Add review/reminder scheduling and Telegram private-chat notifications. Require opt-in and stop immediately on block/unsubscribe.

### 8. Monetization and admin

Add subscriptions, promo codes, gifts, purchase history, refund records and admin-only commands guarded by Telegram user IDs.

### 9. Voice and certificates

Add speech recording metadata, server or optional client speech feedback, weekly diagnosis and downloadable certificate/report artifacts.

### 10. Deployment and backups

Move from polling/Tailscale to webhook or hosted worker, add immutable purchase backups, encrypted secrets and automated restore drills.

## Task Breakdown

- [ ] T001 [Plan:1.1] Add `bot/data/profiles.json` and atomic write/load helpers in `bot/server.mjs`.
- [ ] T002 [Plan:1.1] Add server profile model for access, streak, attempts, referrals, progress and analytics.
- [ ] T003 [Plan:1.1] Add purchase backup and periodic snapshot helpers.
- [ ] T004 [Plan:2.1] Implement authenticated `POST /api/profile/progress/sync`.
- [ ] T005 [Plan:2.1] Implement authenticated `GET /api/profile/progress`.
- [ ] T006 [Plan:2.1] Validate and merge only known progress fields on server sync.
- [ ] T007 [Plan:2.1] Load server progress in `telegram.js` and keep IndexedDB as offline cache.
- [ ] T008 [Plan:3.1] Implement referral code creation and referral status endpoints.
- [ ] T009 [Plan:3.1] Reject self-referrals, duplicate referrers and reward eligibility abuse.
- [ ] T010 [Plan:4.1] Count game starts/submissions per Telegram user and enforce server limits.
- [ ] T011 [Plan:4.1] Store game score history and 24-hour free access.
- [ ] T012 [Plan:5.1] Implement `/api/streak/status` and streak grant from completed learning sessions.
- [ ] T013 [Plan:5.1] Implement `/api/blitz/start` and server-ranked `/api/blitz/submit`.
- [ ] T014 [Plan:6.1] Implement daily/weekly leaderboard endpoints.
- [ ] T015 [Plan:6.1] Render leaderboard UI in `analytics.js`.
- [ ] T016 [Plan:7.1] Add notification opt-in and reminder settings.
- [ ] T017 [Plan:7.1] Add Telegram reminder scheduler and unsubscribe handling.
- [ ] T018 [Plan:8.1] Add subscription duration fields and Stars subscription invoices.
- [ ] T019 [P] [Plan:8.1] Add promo-code validation and gift grants.
- [ ] T020 [P] [Plan:8.1] Add admin-only purchase history and refund commands.
- [ ] T021 [Plan:9.1] Add voice result endpoints and client recording metadata.
- [ ] T022 [Plan:9.1] Add weekly diagnosis and certificate/report export.
- [ ] T023 [Plan:10.1] Deploy webhook receiver or 24/7 hosted service.
- [ ] T024 [Plan:10.1] Run restore drill and document backup procedure.

## Requirement Mapping

| REQ ID | Description | Plan Items | Implementation Evidence |
|--------|-------------|------------|------------------------|
| REQ-001 | Server validates Telegram identity | P1-P4 | `validateInitData`, profile sync endpoints |
| REQ-002 | Progress follows Telegram account | P2 | profile progress sync and restore |
| REQ-003 | Referral cannot be abused | P3 | signed referral code and eligibility checks |
| REQ-004 | Free game is rate-limited | P4 | game attempt counters and server nonce |
| REQ-005 | Daily streak is persistent | P5 | streak status and session grant |
| REQ-006 | Blitz session is timed and scored | P5 | blitz start/submit endpoints |
| REQ-007 | Leaderboards are server-ranked | P6 | leaderboard endpoints and analytics UI |
| REQ-008 | Telegram reminders are opt-in | P7 | notification settings and scheduler |
| REQ-009 | Subscriptions, promos and gifts exist | P8 | subscription and promo records |
| REQ-010 | Admin can inspect purchases and refunds | P8 | guarded admin commands |
| REQ-011 | Voice and reports are available | P9 | voice result and certificate endpoints |
| REQ-012 | Production runtime is 24/7 and recoverable | P10 | hosted webhook and backup restore |
