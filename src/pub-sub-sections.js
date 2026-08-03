const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {
  DailyRecapPost,
  WeeklyChampionPost,
  NoFeesPost,
  SkillCelebration,
  RecordBreakerPost,
  PlatformMilestonePost,
  ReferralLeaderboard,
  TeamRivalryPost,
  MultiGameUpdatePost,
} = require("./social-posts-functions");

admin.initializeApp();
const db = admin.firestore();

/**
 * DAILY RECAP FUNCTION
 * Runs every day at 11:59 PM (America/Denver time)
 */
exports.dailyRecapTrigger = functions.pubsub
  .schedule("every day 23:59")
  .timeZone("America/Denver")
  .onRun(async () => {
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0
      )
    );
    const endOfDay = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59
      )
    );

    const startSeconds = Math.floor(startOfDay.getTime() / 1000);
    const endSeconds = Math.floor(endOfDay.getTime() / 1000);

    const snapshot = await db
      .collection("winners")
      .where("createdAt.seconds", ">=", startSeconds)
      .where("createdAt.seconds", "<=", endSeconds)
      .get();

    if (snapshot.empty) {
      console.log("⚠️ No winners found for today.");
      return null;
    }

    const winners = snapshot.docs.map((doc) => doc.data());
    const totalPrizes = winners.reduce(
      (sum, w) => sum + (w.prizeAmount || 0),
      0
    );
    const winnerCount = winners.length;

    const fastest = winners.reduce((a, b) =>
      a.answerTime < b.answerTime ? a : b
    );
    const fastestTime = fastest.answerTime?.toFixed(2) || "0.00";
    const fastestUser = fastest.user?.displayName || "Anonymous";

    const biggest = winners.reduce((a, b) =>
      a.prizeAmount > b.prizeAmount ? a : b
    );
    const biggestWin = biggest.prizeAmount || 0;

    await DailyRecapPost({
      totalPrizes,
      winnerCount,
      fastestTime,
      fastestUser,
      biggestWin,
      mediaToUpload: null,
      captionLink: "https://squaretrivia.com",
    });

    console.log("✅ Daily Recap Post published successfully.");
    return null;
  });

/**
 * WEEKLY CHAMPIONS FUNCTION
 * Runs every Sunday at 11:59 PM (America/Denver time)
 */
exports.weeklyChampionTrigger = functions.pubsub
  .schedule("every sunday 23:59")
  .timeZone("America/Denver")
  .onRun(async () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - 7);

    const startSeconds = Math.floor(startOfWeek.getTime() / 1000);
    const endSeconds = Math.floor(now.getTime() / 1000);

    const snapshot = await db
      .collection("winners")
      .where("createdAt.seconds", ">=", startSeconds)
      .where("createdAt.seconds", "<=", endSeconds)
      .get();

    if (snapshot.empty) {
      console.log("⚠️ No winners found for this week.");
      return null;
    }

    const winners = snapshot.docs.map((doc) => doc.data());

    // Group by user
    const userStats = {};
    winners.forEach((w) => {
      const name = w.user?.displayName || "Anonymous";
      if (!userStats[name]) userStats[name] = { total: 0, wins: 0 };
      userStats[name].total += w.prizeAmount || 0;
      userStats[name].wins += 1;
    });

    // Sort by total prize
    const sorted = Object.entries(userStats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    const [w1, w2, w3] = sorted;

    await WeeklyChampionPost({
      winner1: w1?.name || "—",
      amount1: w1?.total || 0,
      wins1: w1?.wins || 0,
      winner2: w2?.name || "—",
      amount2: w2?.total || 0,
      wins2: w2?.wins || 0,
      winner3: w3?.name || "—",
      amount3: w3?.total || 0,
      wins3: w3?.wins || 0,
      mediaToUpload: null,
      captionLink: "https://squaretrivia.com",
    });

    console.log("✅ Weekly Champion Post published successfully.");
    return null;
  });

/**
 * WEEKLY "NO FEES" REMINDER
 * Runs every Friday at 6 PM (America/Denver)
 */
exports.noFeesTrigger = functions.pubsub
  .schedule("every friday 18:00")
  .timeZone("America/Denver")
  .onRun(async () => {
    console.log("🚀 Running NoFeesPost trigger...");

    await NoFeesPost({
      mediaToUpload: null,
      captionLink: "https://squaretrivia.com",
    });

    console.log("✅ No Fees Post published successfully.");
    return null;
  });

/**
 * SKILL CELEBRATION POST
 * Runs every 3 hours (America/Denver)
 * Finds the most recent winner with answerTime < 1s
 */
exports.skillCelebrationTrigger = functions.pubsub
  .schedule("every 3 hours")
  .timeZone("America/Denver")
  .onRun(async () => {
    console.log("⚡ Running SkillCelebration trigger...");

    const snapshot = await db
      .collection("winners")
      .orderBy("createdAt.seconds", "desc")
      .limit(20)
      .get();

    if (snapshot.empty) {
      console.log("⚠️ No winners found.");
      return null;
    }

    const winners = snapshot.docs.map((doc) => doc.data());
    const notable = winners.find((w) => w.answerTime && w.answerTime < 1);

    if (!notable) {
      console.log("⏸ No fast winners found (<1s).");
      return null;
    }

    const recentWinner = notable.user?.displayName || "Anonymous";
    const time = notable.answerTime.toFixed(2);
    const prize = notable.prizeAmount || 0;

    await SkillCelebration({
      recentWinner,
      time,
      prize,
      mediaToUpload: null,
      captionLink: "https://squaretrivia.com",
    });

    console.log(
      `✅ Skill Celebration posted for ${recentWinner} (${time}s / $${prize})`
    );
    return null;
  });

/**
 * PLATFORM MILESTONE CHECKER
 * Runs every 6 hours — posts when total payouts cross a major milestone
 */
exports.platformMilestoneTrigger = functions.pubsub
  .schedule("every 12 hours")
  .timeZone("America/Denver")
  .onRun(async () => {
    console.log("🚀 Checking for payout milestones...");

    const snapshot = await db.collection("winners").get();
    if (snapshot.empty) {
      console.log("⚠️ No winners found.");
      return null;
    }

    const winners = snapshot.docs.map((doc) => doc.data());
    const totalPayouts = winners.reduce(
      (sum, w) => sum + (w.prizeAmount || 0),
      0
    );
    const totalWinners = winners.length;

    // milestones to track
    const milestones = [
      10000, 50000, 100000, 250000, 500000, 1000000, 5000000, 10000000,
      50000000, 100000000,
    ];
    const lastMilestoneRef = db.collection("system").doc("milestoneTracker");
    const lastMilestoneDoc = await lastMilestoneRef.get();
    const lastMilestone = lastMilestoneDoc.exists
      ? lastMilestoneDoc.data().lastAmount
      : 0;

    // find next milestone reached
    const crossed = milestones.find(
      (m) => totalPayouts >= m && lastMilestone < m
    );

    if (!crossed) {
      console.log("⏸ No new milestones reached yet.");
      return null;
    }

    console.log(`🎉 Milestone crossed: $${crossed}`);
    await PlatformMilestonePost({
      amount: crossed.toLocaleString(),
      totalWinners,
      mediaToUpload: null,
      captionLink: "https://squaretrivia.com",
    });

    // Update tracker
    await lastMilestoneRef.set({ lastAmount: crossed }, { merge: true });

    console.log(`✅ Milestone Post published for $${crossed}`);
    return null;
  });

/**
 * RECORD BREAKER CHECKER
 * Runs every hour — posts when a new fastest-answer record is set
 */
exports.recordBreakerTrigger = functions.pubsub
  .schedule("every 1 hours")
  .timeZone("America/Denver")
  .onRun(async () => {
    console.log("⚡ Checking for record-breaking answers...");

    const snapshot = await db
      .collection("winners")
      .orderBy("answerTime", "asc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log("⚠️ No winners found.");
      return null;
    }

    const fastest = snapshot.docs[0].data();
    const currentFastestTime = fastest.answerTime;
    const winner = fastest.user?.displayName || "Anonymous";

    // Get previous record from Firestore tracker
    const recordRef = db.collection("system").doc("recordTracker");
    const recordDoc = await recordRef.get();
    const lastRecord = recordDoc.exists ? recordDoc.data().fastestTime : null;

    if (lastRecord && currentFastestTime >= lastRecord) {
      console.log("⏸ No new record set yet.");
      return null;
    }

    await RecordBreakerPost({
      winner,
      time: currentFastestTime.toFixed(3),
      oldTime: lastRecord ? lastRecord.toFixed(3) : "—",
      mediaToUpload: null,
      captionLink: "https://squaretrivia.com",
    });

    // Update tracker
    await recordRef.set(
      { fastestTime: currentFastestTime, winner },
      { merge: true }
    );

    console.log(
      `✅ New RecordBreaker post published (${currentFastestTime}s by ${winner})`
    );
    return null;
  });

/**
 * REFERRAL LEADERBOARD TRIGGER
 * Runs weekly (Monday 9:00 AM Denver time)
 */
exports.referralLeaderboardTrigger = functions.pubsub
  .schedule("0 9 * * MON") // Runs weekly (Monday 9:00 AM Denver time)
  .timeZone("America/Denver")
  .onRun(async () => {
    console.log("🏆 Running Referral Leaderboard Trigger...");

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    // Get users who referred others within the last week
    const snapshot = await db
      .collection("users")
      .where("referrals", ">", 0)
      .get();

    if (snapshot.empty) {
      console.log("⚠️ No referral data found.");
      return null;
    }

    const leaderboard = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        const referrals = d.referrals || 0;
        const totalEarned = d.totalEarned || 0;
        return {
          name: d.displayName || "Anonymous",
          referrals,
          amount: totalEarned,
        };
      })
      .sort((a, b) => b.referrals - a.referrals)
      .slice(0, 5);

    await ReferralLeaderboard({
      winners: leaderboard,
      mediaToUpload: null,
      captionLink: "https://squaretrivia.com/referrals",
    });

    console.log("✅ Referral Leaderboard post published.");
    return null;
  });

/**
 * TEAM RIVALRY TRIGGER
 * Runs mid-week (Wednesday 11:00 AM Denver time)
 */
exports.teamRivalryTrigger = functions.pubsub
  .schedule("0 11 * * WED") // Runs mid-week (Wednesday 11:00 AM Denver time)
  .timeZone("America/Denver")
  .onRun(async () => {
    console.log("⚔️ Running Team Rivalry Trigger...");

    // Example rivalry list (expand or fetch dynamically)
    const rivalries = [
      { teamA: "Cowboys", teamB: "Eagles" },
      { teamA: "Chiefs", teamB: "Bills" },
      { teamA: "49ers", teamB: "Rams" },
    ];

    // Pick a random rivalry each week
    const matchup = rivalries[Math.floor(Math.random() * rivalries.length)];

    // Count recent team wins (past week)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const snapshot = await db
      .collection("winners")
      .where("createdAt", ">", weekAgo)
      .get();

    let teamAWins = 0,
      teamBWins = 0;
    snapshot.forEach((doc) => {
      const data = doc.data();
      const team = data.team || "";
      if (team === matchup.teamA) teamAWins++;
      if (team === matchup.teamB) teamBWins++;
    });

    await TeamRivalryPost({
      teamA: matchup.teamA,
      teamB: matchup.teamB,
      teamAWins,
      teamBWins,
      mediaToUpload: null,
      captionLink: "https://squaretrivia.com",
    });

    console.log(
      `✅ Rivalry post published: ${matchup.teamA} vs ${matchup.teamB}`
    );
    return null;
  });

exports.multiGameUpdateTrigger = functions.pubsub
  .schedule("50 23 * * *") // Runs daily at 11:50 PM
  .timeZone("America/Denver")
  .onRun(async () => {
    console.log("🎯 Running MultiGameUpdateTrigger (11:50 PM)...");

    try {
      // Get "tomorrow" date range
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(tomorrow.getDate() + 1);

      // Convert to Firestore Timestamps (in seconds)
      const startTimestamp = Math.floor(tomorrow.getTime() / 1000);
      const endTimestamp = Math.floor(dayAfter.getTime() / 1000);

      console.log(
        `🕒 Checking for games between ${tomorrow.toISOString()} and ${dayAfter.toISOString()}`
      );

      // Fetch games scheduled for tomorrow
      const snapshot = await db
        .collection("games")
        .where("gameDate.seconds", ">=", startTimestamp)
        .where("gameDate.seconds", "<", endTimestamp)
        .get();

      if (snapshot.empty) {
        console.log("❌ No games found for tomorrow.");
        return null;
      }

      const games = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (games.length < 2) {
        console.log(
          `🟡 Only ${games.length} game found for tomorrow. Skipping trigger.`
        );
        return null;
      }

      // Determine the day name (e.g., "Sunday")
      const dayName = tomorrow.toLocaleDateString("en-US", { weekday: "long" });

      console.log(
        `✅ Found ${games.length} games scheduled for ${dayName}. Triggering post...`
      );

      await MultiGameUpdatePost({
        games,
        mediaToUpload: null,
        captionLink: "https://squaretrivia.com",
        day: dayName,
      });

      console.log(
        `🎉 Multi-game update post triggered successfully for ${dayName}.`
      );
      return null;
    } catch (error) {
      console.error("❌ Error in MultiGameUpdateTrigger:", error);
      return null;
    }
  });
