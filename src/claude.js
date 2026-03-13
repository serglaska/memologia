import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { saveAiResult } from './db.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const FILTER_SYSTEM = `You are a content moderator for a professional LinkedIn account.
Your job: decide if a meme from Reddit is suitable for LinkedIn and rewrite its caption if so.

LinkedIn audience: software engineers, tech leads, product managers, CTOs.
Tone: professional but with dry/ironic humor. Think "relatable dev life" not "edgy Reddit".

REJECT if the meme:
- Contains offensive or sexual content
- Is too niche (only funny to a tiny subculture)
- Requires knowing specific Reddit memes/slang to understand
- Has low-effort or no humor
- Is purely visual with nothing to caption

APPROVE if the meme:
- Is about software development, tech industry, product management, or work life
- Has universal tech humor that non-Reddit people will get
- Can be captioned in a way that adds professional insight

Respond ONLY with valid JSON. No markdown, no explanation.`;

const FILTER_PROMPT = (meme) => `Evaluate this meme:

Title: "${meme.title}"
Subreddit: r/${meme.subreddit}
Reddit score: ${meme.score}
Image URL: ${meme.image_url}

Respond with this exact JSON structure:
{
  "approved": true | false,
  "reason": "one sentence why",
  "linkedin_text": "the caption to post on LinkedIn (only if approved, otherwise null)"
}

If approved, write linkedin_text as:
- 1-3 short punchy sentences
- Can include 1-2 relevant hashtags at the end (#DevLife #SoftwareEngineering etc.)
- NO emojis unless very subtle
- Sound like a human, not a bot
- Reference the meme's core joke but make it feel like an original thought`;

export async function filterAndAdapt(meme) {
  try {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 512,
      system: FILTER_SYSTEM,
      messages: [{ role: 'user', content: FILTER_PROMPT(meme) }],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error(`[claude] JSON parse failed for meme ${meme.id}:`, text);
      return null;
    }

    const result = {
      approved: Boolean(parsed.approved),
      linkedinText: parsed.linkedin_text ?? null,
    };

    saveAiResult(meme.id, result);

    console.log(`[claude] ${meme.id}: ${result.approved ? '✅ approved' : '❌ rejected'} — ${parsed.reason}`);

    return result;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error('[claude] Rate limit hit, skipping meme:', meme.id);
    } else if (err instanceof Anthropic.APIError) {
      console.error(`[claude] API error ${err.status}:`, err.message);
    } else {
      console.error('[claude] Unexpected error:', err);
    }
    return null;
  }
}

export async function filterBatch(memes) {
  const results = [];
  for (const meme of memes) {
    const result = await filterAndAdapt(meme);
    if (result?.approved) {
      results.push({ meme, linkedinText: result.linkedinText });
    }
  }
  console.log(`[claude] Batch done: ${results.length}/${memes.length} approved`);
  return results;
}
