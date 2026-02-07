import OpenAI from "openai";
import { config } from "../config.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

/**
 * Call the Responses API and return raw text.
 */
export async function ai(instructions: string, input: string): Promise<string> {
  const resp = await openai.responses.create({
    model: MODEL,
    instructions,
    input,
  });
  return resp.output_text;
}

/**
 * Call the Responses API with JSON output and parse the result.
 */
export async function aiJSON<T = unknown>(instructions: string, input: string): Promise<T> {
  const resp = await openai.responses.create({
    model: MODEL,
    instructions,
    input: input + "\n\nRespond with JSON.",
    text: { format: { type: "json_object" } },
  });
  return JSON.parse(resp.output_text);
}
