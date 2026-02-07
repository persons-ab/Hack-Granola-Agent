import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback = ""): string {
  return process.env[key] || fallback;
}

export const config = {
  port: parseInt(optional("PORT", "3030")),
  granola: {
    oauthToken: optional("GRANOLA_OAUTH_TOKEN"),
    mcpUrl: "https://mcp.granola.ai/mcp",
  },
  openai: {
    apiKey: required("OPENAI_API_KEY"),
  },
  slack: {
    botToken: optional("SLACK_BOT_TOKEN"),
    appToken: optional("SLACK_APP_TOKEN"),
    signingSecret: optional("SLACK_SIGNING_SECRET"),
    summaryChannelId: optional("SUMMARY_CHANNEL_ID"),
  },
  linear: {
    apiKey: optional("LINEAR_API_KEY"),
    teamId: optional("LINEAR_TEAM_ID"),
  },
} as const;
