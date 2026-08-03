const { logger } = require("firebase-functions");
const {
  getRandomCTA,
  twPublish,
  fbPublish,
  igPublish,
  getHashtags,
  tgPublish,
} = require("./social-posts");

const hashTags = getHashtags();
// Unified logging helper
function logInfo(context, data) {
  console.log(`🟢 [INFO] ${context}:`, data);
  logger.info(`[${context}]`, data);
}
function logError(context, error) {
  console.error(
    `🔴 [ERROR] ${context}:`,
    error.response?.data || error.message
  );
  logger.error(`[${context}]`, error.response?.data || error.message);
}
// ✅ Clean helper to extract file extensions safely from URLs
function getFileExt(url = "") {
  if (!url) return "";
  try {
    const cleanUrl = url.split("?")[0].split("#")[0];
    const ext = cleanUrl.split(".").pop().toLowerCase();
    return ext;
  } catch {
    return "";
  }
}
async function postToAllPlatforms({ media, caption, link }) {
  const ext = media ? getFileExt(media) : null;

  try {
    if (ext && ["jpg", "jpeg", "png"].includes(ext)) {
      // 📸 Image post
      await fbPublish({ media, caption, type: "IMAGE" });
      await tgPublish({ media, caption, type: "IMAGE" });
      await igPublish({ media, caption, type: "IMAGE" });
      await twPublish({ message: caption, imagePath: media, type: "IMAGE" });
    } else if (ext === "mp4") {
      // 🎥 Video post
      await fbPublish({ media, caption, type: "VIDEO" });
      await tgPublish({ media, caption, type: "VIDEO" });
      await igPublish({ media, caption, type: "VIDEO" });
      await twPublish({ message: caption, imagePath: media, type: "VIDEO" });
    } else if (link) {
      // 🔗 Link post
      await fbPublish({ link, caption, type: "LINK" });
      await tgPublish({ caption: `${caption}\n\n${link}`, type: "LINK" });
      await twPublish({ message: caption, link, type: "LINK" });
    } else if (!media && !link && caption) {
      // 📝 Text-only post
      await fbPublish({ caption, type: "TEXT" });
      await tgPublish({ caption, type: "TEXT" });
      await twPublish({ message: caption, type: "TEXT" });
    } else {
      throw new Error(
        `❌ Unsupported file type: .${ext || "unknown"}. Use JPG, PNG, or MP4.`
      );
    }

    logInfo("✅ All platform posts completed successfully", {
      media,
      caption,
      link,
    });
  } catch (error) {
    logError(
      "❌ Error posting to all platforms",
      error.response?.data || error
    );
    throw error;
  }
}

// Builds post text with CTA + hashTags
function buildTemplate(body, cta) {
  return `${body.trim()}

${cta}

${hashTags}`;
}

// Post Templates
//
// 1. Winner Announcements

// Trigger: Immediately after a game ends or a winner is declared.
// Big Win Template → When prize ≥ $100 or top-tier win.
// Standard Win → For normal wins (mid-tier, typical payouts).
// Photo Finish → When the win margin is less than 1 second between winner and runner-up.

// Big Win Post Generator
async function BigWinPost({
  winner,
  prize,
  time,
  team1,
  team2,
  square,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
🚨 ${winner} just took home $${prize} with a blazing ${time}s answer! Think you're faster? 🏃‍♂️  

${team1} vs ${team2} - Square ${square}  
Speed Wins. Always.  
#SquareTrivia #SpeedWins
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Standard Win Post Generator// Standard Win Post Generator with Random Templates
async function StandardWinPost({
  winner,
  prize,
  team1,
  team2,
  time,
  square,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });

  // Define multiple templates
  const templates = [
    // Win-1: Quick & Clean
    `🏆 WINNER: @${winner}

Square "${square}" = ${prize}
Time: ${time} seconds
Game: ${team1} vs ${team2}

Speed Wins Always.`,

    // Win-2: Speed Focus
    `⚡ ${time} SECONDS TO VICTORY

@${winner} takes Square "${square}"
Prize: ${prize}

Speed Wins Always.`,

    // Win-3: Prize Focus
    `💰 ${prize} WINNER

@${winner} dominated Square "${square}"
Winning time: ${time}s

Speed Wins Always.`,

    // Win-4: Competition Angle
    `🔥 @${winner} WINS

Beat ${winner} others to Square "${square}"
Time: ${time}s = ${prize}

Think you're faster?
Speed Wins Always.`,

    // Win-5: Celebration
    `🎊 VICTORY on Square "${square}"

@${winner}
Speed: ${time} seconds
Payout: ${prize}

Your turn next.
Speed Wins Always.`,
    // orignal message
    `
BOOM! 💥 $${prize} win for ${winner} on the ${team1} vs ${team2} board!  
Answer time: ${time} seconds ⚡  

Speed Wins. Always.
  `,
  ];

  // Pick a random template
  const selectedTemplate =
    templates[Math.floor(Math.random() * templates.length)];

  // Replace placeholders
  const body = selectedTemplate;

  // Post to all platforms
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Photo Finish Post Generator
async function PhotoFinishPost({
  winner,
  loser,
  diff,
  winTime,
  loseTime,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
INSANE FINISH! 🏁  
${winner} beats ${loser} by just ${diff} seconds!  
Winner: ${winTime}s  
Runner-up: ${loseTime}s  

Every millisecond counts!  
Speed Wins. Always. 📸
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// 3. Daily/Weekly Summaries

// Trigger: Before and during a board/game filling.
// Board Going Fast → When a board is >70% full.
// New Board Alert → As soon as a new game board is created.
// Final Call → 1–2 hours before kickoff/start.
// Prime Squares Alert → When statistically strong/“hot” squares are still unclaimed.
// Board Full Announcement → Once a board is sold out (100% full).
// Multi-Game Update → On days with multiple live games (daily snapshot).
// Tier Status Update → When high-value tiers are nearly sold out but not full.

// Board Going Fast
async function BoardGoingFastPost({
  team1,
  team2,
  tier,
  totalClaims,
  mediaToUpload,
  captionLink,
}) {
  const total = totalClaims?.total || 0;
  const claimed = totalClaims?.claimed || 0;
  const left = Math.max(total - claimed, 0);
  const leftPercent = total > 0 ? ((claimed / total) * 100).toFixed(0) : 0;

  // 🧩 Extract numeric value if tier is like "tier_25"
  const tierValue =
    typeof tier === "string" && tier.startsWith("tier_")
      ? tier.replace("tier_", "")
      : tier;

  const tierLine = `$${tierValue} Tier: ${
    left > 0 ? `${left} squares left (${leftPercent}% filled)` : "SOLD OUT"
  }`;

  const cta = getRandomCTA({ link: captionLink });
  const body = `
🔥 ${team1} vs ${team2} filling up FAST!  

${tierLine}

Get your square before kickoff!  
Speed Wins. Always. ⚡
  `;

  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body.trim(), cta),
    link: captionLink,
  });
}

// New Board Alert
async function NewBoardAlertPost({
  team1,
  team2,
  day,
  time,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
🚨 NEW BOARD LIVE 🚨  

${team1} vs ${team2} - ${day} ${time}  

All tiers available NOW:  
💰 $25 → Win $200/quarter  
💰 $50 → Win $450/quarter  
💰 $100 → Win $900/quarter  

First come, first served!  
Speed Wins. Always.
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Final Call
async function FinalCallPost({
  team1,
  team2,
  timeLeft,
  squaresLeft,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
⏰ LAST CHANCE: ${team1} vs ${team2}  

Game starts in ${timeLeft}!  
${squaresLeft} squares remaining  

Don't watch from the sidelines.  
Speed Wins. Always. 🎯
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Board Full Announcement
async function BoardFullAnnouncementPost({
  team1,
  team2,
  totalPrize,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
SOLD OUT! ${team1} vs ${team2} is LOCKED IN! 🔒  

100 players competing for $${totalPrize}  
Fastest fingers will win.  

Check other games or join the waitlist.  
Speed Wins. Always. 💪
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Multi-Game Update
async function MultiGameUpdatePost({ games, mediaToUpload, captionLink, day }) {
  // games example: [{match: "Cowboys vs Eagles", fill: "85%"}, ...]
  const cta = getRandomCTA({ link: captionLink });

  const gameLines = games.map((g) => `${g.match}: ${g.fill} FULL`).join("\n");
  const body = `
📊 ${day} Board Status:  

${gameLines}

Get in NOW before they're gone!  
Speed Wins. Always.
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Tier Status Update
async function TierStatusUpdatePost({
  team1,
  team2,
  tiers,
  mediaToUpload,
  captionLink,
}) {
  // tiers example: [{tier: 1000, left: 2}, {tier: 500, left: 0}, ...]
  const cta = getRandomCTA({ link: captionLink });

  const tierLines = tiers
    .map(
      (t) =>
        `$${t.tier} Tier: ${
          t.left > 0 ? `${t.left} squares left!` : "SOLD OUT"
        }`
    )
    .join("\n");
  const body = `
🎯 ${team1} vs ${team2} Availability:  

${tierLines}

Big money squares going fast!  
Speed Wins. Always. 💰
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// 3. Daily/Weekly Summaries

// Trigger: Scheduled posts (auto-cron).
// Daily Recap → End of each day (summarize wins, biggest prize, fastest player).
// Weekly Champion → Every Sunday evening or Monday morning (show leaderboard).

// Daily Recap
async function DailyRecapPost({
  totalPrizes,
  winnerCount,
  fastestTime,
  fastestUser,
  biggestWin,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
📊 Today's Square Trivia Stats:  
💰 $${totalPrizes} won  
🏆 ${winnerCount} winners  
⚡ Fastest: ${fastestTime}s by ${fastestUser}  
🔥 Biggest: $${biggestWin}  

Your sports knowledge = real money!
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Weekly Champion
async function WeeklyChampionPost({
  winner1,
  amount1,
  wins1,
  winner2,
  amount2,
  wins2,
  winner3,
  amount3,
  wins3,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
👑 This Week's Square Trivia Champions:  

🥇 ${winner1} - $${amount1} (${wins1} wins)  
🥈 ${winner2} - $${amount2} (${wins2} wins)  
🥉 ${winner3} - $${amount3} (${wins3} wins)  

Think you can make next week's list? 🎯
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// 4. Game Promotion

// Trigger: Pre-game marketing.
// Upcoming Game → When new games for the week are announced (2–3 days before kickoff).
// Last Chance → 2–3 hours before game start (or when <20% of squares left).

// Upcoming Game
async function UpcomingGamePost({ team1, team2, mediaToUpload, captionLink }) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
🏈 ${team1} vs ${team2} boards are LIVE!  

Tiers available:  
✅ $25 tier - Win $200/quarter  
✅ $50 tier - Win $450/quarter  
✅ $100 tier - Win $900/quarter  

NO FEES - Answer fast, win big!
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Upcoming Game
async function LastChancePost({
  team1,
  team2,
  spotsLeft,
  highestTier,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
⏰ FINAL CALL: ${team1} vs ${team2} kicks off in 2 hours!  

Still ${spotsLeft} squares available.  
Biggest tier still open: $${highestTier}  

Don't miss out! 🎯
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// . Milestone / Special Events

// Trigger: Periodically to build credibility + after payouts.
// NO FEES Emphasis → Weekly reminder OR after payouts are processed.
// Skill Celebration → After a notable fast answer win (especially when users confuse with “luck-based” games).

// Platform Milestone
async function PlatformMilestonePost({
  amount,
  totalWinners,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
🎉 MILESTONE ALERT!  

We've now paid out over $${amount} in prizes!  
${totalWinners} winners and counting.  
All skill, no luck!  

Thank you for making Square Trivia the fastest growing skill-based platform! 💪
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Record Breaker Post Generator
async function RecordBreakerPost({
  winner,
  time,
  oldTime,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink, time: time });
  const body = `
🚨 NEW RECORD! 🚨  

${winner} just set the fastest answer time this week: ${time} seconds!  
Previous record: ${oldTime}s  

Think you can beat it? Speed pays! ⚡
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// TRUST BUILDINGS

// Trigger: Platform growth milestones or record events.
// Platform Milestone → When total payouts cross a big milestone ($10k, $50k, $100k).
// Record Breaker → When someone sets a new fastest-answer record.

// No Fees Post Generator
async function NoFeesPost({ mediaToUpload, captionLink }) {
  const cta = getRandomCTA({ link: captionLink });
  const options = [
    { icon: "⚡", title: "Express service", detail: "Get 96% today" },
    { icon: "⏰", title: "Standard service", detail: "Get 100% in 2–3 days" },
  ]
    .map((o) => `${o.icon} ${o.title}: ${o.detail}`)
    .join("\n");
  const body = `
Win $200? Get paid $200! NO FEES on Square Trivia!  

${options}

Your choice, your money!
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Skill Celebration Post Generator
async function SkillCelebration({
  recentWinner,
  time,
  prize,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink, time: time });
  const comparisons = [
    { icon: "🎲", label: "Traditional squares", desc: "Hope for luck" },
    { icon: "⚡", label: "Square Trivia winners", desc: "Trust their speed" },
  ]
    .map((c) => `${c.label}: ${c.icon} ${c.desc}`)
    .join("\n");
  const body = `
What separates Square Trivia winners from everyone else?

${comparisons}

${recentWinner} just proved it with a ${time}s answer for $${prize}!
Speed Wins. Always. 🧠💰 
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Engagement Builders

// Trigger: Weekly, to drive conversation and competition.
// Referral Leaderboard → Weekly (Sunday night / Monday morning).
// Team Rivalry → Post mid-week OR before a major rivalry game (Cowboys vs Eagles, Chiefs vs Bills, etc.).

// Team Rivalry Post Generator
async function TeamRivalryPost({
  teamA,
  teamB,
  teamAWins,
  teamBWins,
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const body = `
Battle of the Fanbases! 🏈

${teamA} fans: ${teamAWins} wins this week  
${teamB} fans: ${teamBWins} wins this week  

Who knows their team better? Prove it on Sunday!
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Referral Leaderboard Post Generator
async function ReferralLeaderboard({
  winners = [],
  mediaToUpload,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink });
  const leaderboard = winners
    .map(
      (w, i) =>
        `${i + 1}. ${w.name}: $${w.amount} won from ${w.referrals} referrals`
    )
    .join("\n");
  const body = `
🏆 This Week's Referral Winners:

${leaderboard}

These players win on the board AND off the board.
Speed Wins. Always. 💰
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
    link: captionLink,
  });
}

// Platform-Specific Variations (Discussion Needed):

// Twitter (Short) → Auto-adapt from Winner/Recap templates, compressed.
// Instagram (Visual) → Use Winner Announcement + image card designs.
// Telegram (Rich) → Winner templates expanded with Markdown formatting.
// Platform-Specific Winner Post Generators

// Twitter (Short) Winner Post Generator
async function WinnerPostTwitter({
  winnerName,
  prize,
  gameName,
  time,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink, time: time });
  const body = `
${winnerName} ➡️ $${prize}${time ? ` ⚡ ${time}s` : ""}

${gameName}: Where speed pays 🏁

#SkillNotLuck
  `;

  const post = buildTemplate(body, cta);
  await twPublish(post);
  return post;
}

// Instagram (Visual) Winner Post Generator
async function WinnerPostInstagram({
  winnerName,
  team,
  prize,
  time,
  mediaToUpload,
  imageUrl,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink, time: time });
  const body = `
[IMAGE: ${imageUrl || "Winner card 🏆"}]

When your ESPN addiction finally pays off 💰

${winnerName} turned their ${team} knowledge into $${prize} with a lightning-fast ${time}s answer!

NO FEES. Just skill. Just speed. Just win. ⚡
  `;
  return postToAllPlatforms({
    media: mediaToUpload,
    caption: buildTemplate(body, cta),
  });
}

// Telegram (Rich) Winner Post Generator
async function WinnerPostTelegram({
  winnerName,
  prize,
  time,
  team1,
  team2,
  square,
  triviaQuestion,
  answer,
  captionLink,
}) {
  const cta = getRandomCTA({ link: captionLink, time: time });
  const body = `
🔥 *WINNER ALERT* 🔥

*Player:* ${winnerName}
*Prize:* $${prize}
*Answer Time:* ⚡ ${time}s
*Game:* ${team1} vs ${team2}
*Square:* ${square}

_"${triviaQuestion}"_
Answer: *${answer}*

Think you could’ve been faster? Join now - NO FEES!
  `;

  const post = buildTemplate(body, cta);
  await igPublish({ caption: post });
  return post;
}

// Exports

module.exports = {
  // Winner Announcements
  BigWinPost,
  StandardWinPost,
  PhotoFinishPost,
  //2. Board Status & Promotions
  BoardGoingFastPost,
  NewBoardAlertPost,
  FinalCallPost,
  BoardFullAnnouncementPost,
  MultiGameUpdatePost,
  TierStatusUpdatePost,
  // Daily/Weekly Summaries
  DailyRecapPost,
  WeeklyChampionPost,
  // Export Game Promotion Posts
  UpcomingGamePost,
  LastChancePost,
  // Milestone / Special Event Posts
  PlatformMilestonePost,
  RecordBreakerPost,
  //Trust Buildings
  NoFeesPost,
  SkillCelebration,
  // Export Engagement Builders
  ReferralLeaderboard,
  TeamRivalryPost,
  // Export platform-specific functions
  WinnerPostTwitter,
  WinnerPostInstagram,
  WinnerPostTelegram,
};
