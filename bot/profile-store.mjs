import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export class ProfileStore {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.write({});
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch {
      return {};
    }
  }

  write(profiles) {
    const tempFile = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(profiles, null, 2));
    fs.renameSync(tempFile, this.filePath);
  }

  getProfile(userId) {
    const profiles = this.read();
    const key = String(userId);
    if (!profiles[key]) {
      profiles[key] = {
        user_id: key,
        created_at: Date.now(),
        progress: null,
        streak: { current: 0, longest: 0, last_day: "" },
        game: { starts: [], submissions: [] },
        referral: {
          code: crypto.randomBytes(5).toString("hex"),
          referred_by: null,
          rewards: [],
        },
        notifications: { enabled: false },
        analytics: { sessions: 0, games: 0, stars: 0 },
      };
      this.write(profiles);
    }
    const profile = profiles[key];
    profile.game ||= { starts: [], submissions: [] };
    profile.referral ||= {
      code: crypto.randomBytes(5).toString("hex"),
      referred_by: null,
      rewards: [],
    };
    profile.analytics ||= { sessions: 0, games: 0, stars: 0 };
    return profile;
  }

  syncProgress(userId, progress) {
    const profiles = this.read();
    const profile = this.ensureInObject(profiles, userId);
    profile.progress = {
      version: Number(progress?.version || 3),
      words: progress?.words && typeof progress.words === "object" ? progress.words : {},
      stats: progress?.stats && typeof progress.stats === "object" ? progress.stats : {},
      days: progress?.days && typeof progress.days === "object" ? progress.days : {},
      exams: Array.isArray(progress?.exams) ? progress.exams.slice(-100) : [],
      prefs: progress?.prefs && typeof progress.prefs === "object" ? progress.prefs : {},
      resolved_mistakes: Array.isArray(progress?.resolved_mistakes) ? progress.resolved_mistakes : [],
      audio_done: Array.isArray(progress?.audio_done) ? progress.audio_done : [],
      speaking_done: Array.isArray(progress?.speaking_done) ? progress.speaking_done : [],
      speaking_attempts: Number(progress?.speaking_attempts || 0),
      updated_at: Date.now(),
    };
    profile.analytics.sessions = Number(profile.analytics.sessions || 0) + 1;
    this.write(profiles);
    return profile.progress;
  }

  ensureInObject(profiles, userId) {
    const key = String(userId);
    if (!profiles[key]) {
      profiles[key] = {
        user_id: key,
        created_at: Date.now(),
        progress: null,
        streak: { current: 0, longest: 0, last_day: "" },
        game: { starts: [], submissions: [] },
        referral: {
          code: crypto.randomBytes(5).toString("hex"),
          referred_by: null,
          rewards: [],
        },
        notifications: { enabled: false },
        analytics: { sessions: 0, games: 0, stars: 0 },
      };
    }
    profiles[key].game ||= { starts: [], submissions: [] };
    profiles[key].referral ||= {
      code: crypto.randomBytes(5).toString("hex"),
      referred_by: null,
      rewards: [],
    };
    profiles[key].analytics ||= { sessions: 0, games: 0, stars: 0 };
    return profiles[key];
  }

  getProgress(userId) {
    return this.getProfile(userId).progress;
  }

  checkGameStart(userId, now = Date.now()) {
    const profiles = this.read();
    const profile = this.ensureInObject(profiles, userId);
    const starts = Array.isArray(profile.game.starts) ? profile.game.starts : [];
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const recent = starts.filter((timestamp) => Number(timestamp) > dayAgo);
    if (recent.length >= 1) return { allowed: false, reason: "daily_limit" };
    profile.game.starts = [...recent, now];
    profile.analytics.games = Number(profile.analytics.games || 0) + 1;
    this.write(profiles);
    return { allowed: true };
  }

  checkGameSubmission(userId, now = Date.now()) {
    const profiles = this.read();
    const profile = this.ensureInObject(profiles, userId);
    const submissions = Array.isArray(profile.game.submissions)
      ? profile.game.submissions
      : [];
    const hourAgo = now - 60 * 60 * 1000;
    const recent = submissions.filter((timestamp) => Number(timestamp) > hourAgo);
    if (recent.length >= 3) return { allowed: false, reason: "hourly_limit" };
    profile.game.submissions = [...recent, now];
    this.write(profiles);
    return { allowed: true };
  }

  grantFreeAccess(userId, hours, now = Date.now()) {
    const profiles = this.read();
    const profile = this.ensureInObject(profiles, userId);
    const until = now + hours * 60 * 60 * 1000;
    profile.access_free_until = Math.max(Number(profile.access_free_until || 0), until);
    this.write(profiles);
    return profile.access_free_until;
  }

  claimReferral(userId, code, now = Date.now()) {
    const profiles = this.read();
    const profile = this.ensureInObject(profiles, userId);
    const normalizedCode = String(code || "").trim().toLowerCase();
    if (!normalizedCode) return { ok: false, reason: "missing_code" };
    if (profile.referral.referred_by) return { ok: false, reason: "already_claimed" };

    let inviterId = null;
    for (const [candidateId, candidate] of Object.entries(profiles)) {
      if (candidate.referral?.code === normalizedCode) {
        inviterId = candidateId;
        break;
      }
    }
    if (!inviterId || inviterId === String(userId)) {
      return { ok: false, reason: "invalid_code" };
    }
    if (now - Number(profile.created_at || 0) > 24 * 60 * 60 * 1000) {
      return { ok: false, reason: "new_account_period_expired" };
    }

    profile.referral.referred_by = inviterId;
    const inviter = profiles[inviterId];
    inviter.referral.rewards ||= [];
    inviter.referral.rewards.push({
      user_id: String(userId),
      claimed_at: now,
      reward_free_until: now + 48 * 60 * 60 * 1000,
    });
    inviter.access_free_until = Math.max(
      Number(inviter.access_free_until || 0),
      now + 48 * 60 * 60 * 1000,
    );
    profile.access_free_until = Math.max(
      Number(profile.access_free_until || 0),
      now + 24 * 60 * 60 * 1000,
    );
    this.write(profiles);
    return { ok: true, free_until: profile.access_free_until };
  }
}
