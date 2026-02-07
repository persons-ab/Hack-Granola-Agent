import { readFileSync } from "fs";
import { resolve } from "path";
import { ai } from "./models.js";

const soulPath = resolve(import.meta.dirname, "../../SOUL.md");
const SOUL = readFileSync(soulPath, "utf-8");

const INSTRUCTIONS = `${SOUL}

You generate SHORT in-character Slack messages (1-2 sentences max) for the situation described. Return ONLY the message text, nothing else. No markdown formatting, no quotes around the output.`;

/**
 * Generate a Dr. Evil-flavored Slack message for a given situation.
 */
export async function characterLine(situation: string): Promise<string> {
  return (await ai(INSTRUCTIONS, situation)).trim();
}
