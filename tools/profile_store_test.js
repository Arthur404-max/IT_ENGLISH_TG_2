import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProfileStore } from "../bot/profile-store.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itelab-profile-"));
const file = path.join(dir, "profiles.json");
const store = new ProfileStore(file);

const progress = store.syncProgress(123, {
  version: 3,
  words: { "1|array": { lapses: 2, leech: true } },
  stats: { answers: 10, correct: 8 },
});
assert.equal(progress.version, 3);
assert.equal(progress.words["1|array"].leech, true);

const now = Date.now();
assert.equal(store.checkGameStart(123, now).allowed, true);
assert.equal(store.checkGameStart(123, now + 1000).allowed, false);
assert.equal(store.checkGameSubmission(123, now).allowed, true);
assert.equal(store.checkGameSubmission(123, now + 1000).allowed, true);
assert.equal(store.checkGameSubmission(123, now + 2000).allowed, true);
assert.equal(store.checkGameSubmission(123, now + 3000).allowed, false);

store.getProfile(123).created_at = now - 60 * 1000;
store.getProfile(456).created_at = now - 60 * 1000;
const inviter = store.getProfile(123);
const invitee = store.getProfile(456);
const claim = store.claimReferral(456, inviter.referral.code, now);
assert.equal(claim.ok, true);
assert.equal(store.claimReferral(456, inviter.referral.code, now).ok, false);
assert.equal(store.claimReferral(456, inviter.referral.code, now).reason, "already_claimed");

const freeUntil = store.grantFreeAccess(123, 24, now);
assert.ok(freeUntil > now);

const dayOne = new Date("2026-11-24T10:00:00.000Z").getTime();
const dayTwo = new Date("2026-11-25T10:00:00.000Z").getTime();
assert.equal(store.recordLearningDay(789, dayOne).current, 1);
assert.equal(store.recordLearningDay(789, dayTwo).current, 2);

const blitz = store.startBlitz(123, now);
assert.ok(blitz.session_id);
assert.equal(store.submitBlitz(123, blitz.session_id, 18, 20, now + 60_000).ok, true);
const leaderboard = store.getLeaderboard(5);
assert.ok(leaderboard.length >= 1);

assert.equal(store.setNotifications(123, true).enabled, true);
const subscription = store.grantSubscription(123, 7, "week", now);
assert.equal(subscription.plan, "week");

fs.rmSync(dir, { recursive: true, force: true });
console.log("PASS: profile sync, daily game limit, hourly submission limit, referral");
