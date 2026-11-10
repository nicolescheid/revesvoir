// Rêvesvoir API: Cloudflare Worker (revesvoir-api)
// Config, bindings and account: wrangler.toml. Secret: ANTHROPIC_API_KEY.
//
// POST /emerge /write-prompt /synthesize /sentence-stems /deep-synthesize  (Claude)
// POST /shore/post, GET|POST /shore/messages                               (KV SHORE_MESSAGES)
//
// Guards (2026-11-10): allowed Origin required on POST, JSON body <= 32 KB,
// strings and arrays capped, per-IP rate limits (LLM_LIMITER, SHORE_LIMITER),
// 30 s upstream timeout, generic error messages (details go to the Worker log).

const ALLOWED_ORIGINS = [
  'https://revesvoir.com',
  'https://www.revesvoir.com',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const CLAUDE_MODEL = 'claude-sonnet-5';
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_STRING = 8000;
const MAX_ARRAY = 60;
const MAX_DEPTH = 6;
const CLAUDE_TIMEOUT_MS = 30000;

// Trim every string and array in the request body so no field can grow a prompt without bound.
function capInput(value, depth = 0) {
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  if (depth >= MAX_DEPTH) return null;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map(v => capInput(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, MAX_ARRAY)) out[k] = capInput(v, depth + 1);
    return out;
  }
  return value;
}

async function readBody(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return { error: 'Request too large', status: 413 };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: 'Request too large', status: 413 };
  try {
    const parsed = text ? JSON.parse(text) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Invalid request', status: 400 };
    }
    return { body: capInput(parsed) };
  } catch {
    return { error: 'Invalid request', status: 400 };
  }
}

// Log the detail, return a generic message. Upstream error text never reaches the caller.
function failure(request, err, label = 'request') {
  console.error(`[${label}]`, err && err.message ? err.message : err);
  return corsResponse(request, { error: 'Something went quiet. Please try again.' }, 502);
}

async function underLimit(limiter, request, scope) {
  if (!limiter) return true; // binding missing (e.g. misconfigured local run): fail open, logged
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  try {
    const { success } = await limiter.limit({ key: `${scope}:${ip}` });
    return success;
  } catch (err) {
    console.error('[ratelimit]', err.message);
    return true;
  }
}

// === CORS ===
function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function corsResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

// === CLAUDE API CALL ===
async function callClaude(env, systemPrompt, userMessage, maxTokens = 256) {
  const response = await fetch(CLAUDE_API, {
    method: 'POST',
    signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const block = (data.content || []).find(b => b.type === 'text');
  if (!block) throw new Error(`No text block (stop_reason ${data.stop_reason})`);
  return block.text;
}


// ════════════════════════════════════════════════════════
// NEW ENDPOINTS — Exercise Flow (v0.7)
// ════════════════════════════════════════════════════════

// === /emerge — Generate an emergent word from a linked pair ===
async function handleEmerge(request, env, body) {
  const { wordA, wordB, circling, existingWords } = body;

  if (!wordA || !wordB) {
    return corsResponse(request, { error: 'Need wordA and wordB' }, 400);
  }

  const systemPrompt = `You are the unconscious voice of Rêvesvoir — a reservoir of hidden meaning.

Two words have been linked by intuition. Your task: generate ONE new word that lives in the space between them. Not a synonym. Not a combination. The word that *emerges* from their connection — the thing they're both reaching toward.

Rules:
- Return ONLY a single word. Nothing else. No punctuation, no explanation.
- The word should be evocative, not clinical.
- Prefer concrete nouns and sensory words over abstract concepts.
- The word should feel like a discovery, not a definition.
- Never repeat a word already in play.
- If the person has stated something they're circling, let it subtly influence your choice — but don't be obvious about it.`;

  let userMessage = `Linked words: "${wordA}" ↔ "${wordB}"`;

  if (existingWords && existingWords.length > 0) {
    userMessage += `\n\nWords already in play (do NOT repeat these): ${existingWords.join(', ')}`;
  }

  if (circling) {
    userMessage += `\n\nThe person is circling: "${circling}" (let this subtly inform your choice)`;
  }

  userMessage += '\n\nReturn ONE word.';

  try {
    const raw = await callClaude(env, systemPrompt, userMessage, 32);
    // Clean: take only the first word, lowercase, strip punctuation
    const word = raw.trim().split(/\s+/)[0].replace(/[^a-zA-ZÀ-ÿ'-]/g, '').toLowerCase();
    return corsResponse(request, { word: word || 'resonance' });
  } catch (err) {
    return failure(request, err);
  }
}

// === /write-prompt — Generate a prompt for the timed write ===
async function handleWritePrompt(request, env, body) {
  const { circling, exercises, patterns } = body;

  const systemPrompt = `You are the prompter of Rêvesvoir — creating a single writing prompt that will unlock what the unconscious is holding.

The person has just completed exercises that revealed patterns, associations, and emotional textures. Now they need a prompt for 3 minutes of stream-of-consciousness writing.

Rules:
- Return ONLY the prompt text. Nothing else. No quotes around it.
- The prompt should be 1-2 sentences.
- It should be specific enough to trigger something but open enough to go anywhere.
- It should touch the emotional nerve the exercises have been circling.
- Use concrete, sensory language — "the room", "the weight", "the sound" — not abstract concepts.
- If patterns show avoidance of a topic, the prompt should gently approach it from the side.
- Never be therapeutic or clinical. Be poetic and direct.
- The prompt should feel slightly uncomfortable — like it knows something.`;

  let userMessage = '';

  if (circling) {
    userMessage += `STATED CONCERN: "${circling}"\n\n`;
  }

  if (exercises && exercises.length > 0) {
    userMessage += 'EXERCISE RESULTS:\n';
    for (const ex of exercises) {
      userMessage += `\n${ex.type}:`;
      if (ex.analysis) {
        userMessage += ` themes=${JSON.stringify(ex.analysis.themes || [])}`;
        if (ex.analysis.emotionalValence) userMessage += `, emotion="${ex.analysis.emotionalValence}"`;
        if (ex.analysis.tension) userMessage += `, tension="${ex.analysis.tension}"`;
      }
      if (ex.data?.emergedWords) {
        userMessage += `, emerged words: ${ex.data.emergedWords.join(', ')}`;
      }
      if (ex.data?.piles) {
        userMessage += `, pile groups: ${ex.data.piles.map(p => `[${p.words.join(', ')}]`).join(' | ')}`;
      }
    }
  }

  if (patterns && patterns.themes && patterns.themes.length > 0) {
    userMessage += `\n\nRUNNING PATTERNS: themes=${patterns.themes.join(', ')}`;
    if (patterns.tension) userMessage += `, tension="${patterns.tension}"`;
  }

  userMessage += '\n\nGenerate ONE writing prompt that will unlock what these patterns are circling. Return ONLY the prompt text.';

  try {
    const raw = await callClaude(env, systemPrompt, userMessage, 128);
    // Clean any accidental quotes
    const prompt = raw.trim().replace(/^["']|["']$/g, '');
    return corsResponse(request, { prompt });
  } catch (err) {
    // Fallback prompts
    const fallbacks = [
      "Write about the space between what you want and what you're afraid of.",
      "Describe a door you keep not opening.",
      "Write about the thing you almost said but didn't.",
      "What does your mind do when nobody is watching?",
      "Write about something that changed without you noticing.",
    ];
    return corsResponse(request, { prompt: fallbacks[Math.floor(Math.random() * fallbacks.length)] });
  }
}

// === /synthesize — Final synthesis across all exercises ===
async function handleSynthesize(request, env, body) {
  const { circling, exercises, patterns } = body;

  if (!exercises || exercises.length === 0) {
    return corsResponse(request, { error: 'Need exercise data' }, 400);
  }

  const systemPrompt = `You are the deepest voice of Rêvesvoir — the moment the water clears and shows what was always at the bottom.

A person has completed a series of exercises designed to surface what their unconscious is processing. They did free association (linking words intuitively), pile sorting (grouping emerged concepts), and stream-of-consciousness writing. Each exercise produced data that was analyzed for patterns.

Your task: synthesize everything into two revelations.

1. THE QUESTION — What is the real question this person is carrying? Not the surface question, not the question they think they're asking. The question underneath. Start it with a question mark in the mind, but phrase it as a statement of what they're grappling with.

2. THE ANSWER — What do they already know about the answer? What has every exercise been pointing toward? This isn't advice. It's a mirror. Show them what they already showed you.

3. FULL TEXT — A 2-3 paragraph reflection that weaves the question and answer together, references specific things from their exercises, and feels like recognition — "oh, I already knew that."

Return ONLY valid JSON:
{
  "question": "The question you're carrying is...",
  "answer": "And what you already know is...",
  "fullText": "The longer reflection..."
}

Rules:
- If they stated a concern, acknowledge it but reveal what's UNDERNEATH it. "You said this was about X. But everything you did points to Y."
- Be specific. Reference their actual words, their groupings, their associations.
- The tone is quiet wonder, not proclamation. "It seems like..." not "You are..."
- This should feel like a gift, not a diagnosis.
- The person should feel seen, not exposed.
- If the exercises point in contradictory directions, name the contradiction — that IS the insight.
- Write as if speaking in a dark room near water, after a long silence.`;

  let userMessage = '';

  if (circling) {
    userMessage += `STATED CONCERN: "${circling}"\n\n`;
  } else {
    userMessage += 'MODE: Discovery (no stated concern — find what emerged)\n\n';
  }

  userMessage += 'EXERCISE RESULTS:\n';
  for (const ex of exercises) {
    userMessage += `\n=== ${ex.type.toUpperCase()} ===\n`;

    if (ex.data) {
      if (ex.data.originalWords) {
        userMessage += `Seed words: ${ex.data.originalWords.join(', ')}\n`;
      }
      if (ex.data.links) {
        userMessage += 'Connections made:\n';
        for (const l of ex.data.links) {
          userMessage += `  "${l.from}" ↔ "${l.to}" → emerged: "${l.emerged}"\n`;
        }
      }
      if (ex.data.emergedWords) {
        userMessage += `All emerged words: ${ex.data.emergedWords.join(', ')}\n`;
      }
      if (ex.data.piles) {
        userMessage += 'Intuitive groupings:\n';
        ex.data.piles.forEach((p, i) => {
          userMessage += `  Group ${i + 1}: [${p.words.join(', ')}]\n`;
        });
      }
      if (ex.data.unpiledWords && ex.data.unpiledWords.length > 0) {
        userMessage += `Words that stood alone: ${ex.data.unpiledWords.join(', ')}\n`;
      }
      if (ex.data.prompt) {
        userMessage += `Writing prompt given: "${ex.data.prompt}"\n`;
      }
      if (ex.data.text) {
        userMessage += `Stream of consciousness (${ex.data.wordCount} words):\n"${ex.data.text}"\n`;
      }
    }

    if (ex.analysis) {
      userMessage += `Analysis: themes=${JSON.stringify(ex.analysis.themes || [])}`;
      if (ex.analysis.emotionalValence) userMessage += `, emotion="${ex.analysis.emotionalValence}"`;
      if (ex.analysis.tension) userMessage += `, tension="${ex.analysis.tension}"`;
      if (ex.analysis.keyInsight) userMessage += `, key insight="${ex.analysis.keyInsight}"`;
      userMessage += '\n';
    }
  }

  if (patterns && patterns.themes && patterns.themes.length > 0) {
    userMessage += `\nRUNNING PATTERNS ACROSS ALL EXERCISES:\n`;
    userMessage += `Themes: ${patterns.themes.join(', ')}\n`;
    if (patterns.tension) userMessage += `Central tension: ${patterns.tension}\n`;
    if (patterns.convergence) userMessage += `Convergence point: ${patterns.convergence}\n`;
  }

  userMessage += '\nSynthesize everything. What question are they carrying? What do they already know? Return ONLY valid JSON.';

  try {
    const raw = await callClaude(env, systemPrompt, userMessage, 1500);
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.question || !parsed.answer) {
      throw new Error('Missing question or answer in synthesis');
    }

    return corsResponse(request, {
      question: parsed.question,
      answer: parsed.answer,
      fullText: parsed.fullText || null,
    });
  } catch (err) {
    return failure(request, err);
  }
}


// ════════════════════════════════════════════════════════
// DEEP DIVE ENDPOINTS (v0.8 — "Go Deeper")
// ════════════════════════════════════════════════════════

// === /sentence-stems — Generate sentence completion stems ===
async function handleSentenceStems(request, env, body) {
  const { circling, exercises, patterns, synthesis } = body;

  const systemPrompt = `You are the probing voice of Rêvesvoir — the question that won't let go.

Generate 8 sentence stems for a rapid-fire completion exercise. The person will complete each one quickly, stream-of-consciousness. The speed prevents their conscious mind from filtering.

The stems should:
- Be specific to this person's material, not generic
- Approach their avoidance patterns from unexpected angles
- Mix registers: some tender, some confrontational, some playful
- Get progressively more direct (start oblique, end pointed)
- Never be longer than 10 words
- Never be therapy-speak ("I feel..." "My inner child...")

Return ONLY valid JSON: { "stems": ["stem1...", "stem2...", ...] }`;

  let userMessage = '';
  if (circling) userMessage += `Concern: "${circling}"\n`;
  if (synthesis) {
    userMessage += `Synthesis question: ${synthesis.question}\n`;
    userMessage += `Synthesis answer: ${synthesis.answer}\n`;
  }
  if (patterns?.themes?.length) userMessage += `Themes: ${patterns.themes.join(', ')}\n`;
  if (patterns?.tension) userMessage += `Tension: ${patterns.tension}\n`;

  // Include emerged words
  for (const ex of (exercises || [])) {
    if (ex.data?.emergedWords) {
      userMessage += `Key words: ${ex.data.emergedWords.join(', ')}\n`;
    }
  }

  userMessage += '\nGenerate 8 sentence stems. Return ONLY valid JSON.';

  try {
    const raw = await callClaude(env, systemPrompt, userMessage, 800);
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);

    if (!parsed.stems || !Array.isArray(parsed.stems)) {
      throw new Error('Invalid stems response');
    }

    return corsResponse(request, { stems: parsed.stems });
  } catch (err) {
    return failure(request, err);
  }
}


// === /deep-synthesize — Second synthesis after "go deeper" exercises ===
async function handleDeepSynthesize(request, env, body) {
  const { circling, exercises, patterns, synthesis, deepExercises } = body;

  const systemPrompt = `You are the deepest layer of Rêvesvoir — below where the first synthesis reached.

The person has already received a first synthesis. Then they chose to go deeper. They completed additional projective exercises: looking at abstract images and saying what they saw, rapidly completing sentence stems. These deeper exercises bypass conscious filtering more aggressively than the first round.

Your task: a SECOND synthesis that goes beneath the first one. This should feel like removing another layer.

Return ONLY valid JSON:
{
  "revelation": "A single sentence — the thing beneath the thing. What the deeper exercises exposed that the first round only circled.",
  "fullText": "2-3 paragraphs. Reference specific things from the deeper exercises — what they saw in the cards, how they completed the sentences. Show them the pattern they can't see themselves. This should feel like being gently, precisely understood.",
  "closing": "A single line to close the session. Something they can carry with them."
}

Rules:
- This synthesis should be MORE specific and MORE direct than the first.
- Reference the first synthesis and show what was hiding beneath it.
- If they saw the same thing in multiple cards, name it.
- If their sentence completions contradicted each other, that IS the insight.
- Tone: intimate, unflinching, kind. Like a letter from someone who knows them well.`;

  let userMessage = '';
  if (circling) userMessage += `STATED CONCERN: "${circling}"\n\n`;

  userMessage += `FIRST SYNTHESIS:\n`;
  if (synthesis) {
    userMessage += `Question: ${synthesis.question}\n`;
    userMessage += `Answer: ${synthesis.answer}\n`;
    if (synthesis.fullText) userMessage += `Reflection: ${synthesis.fullText}\n`;
  }

  userMessage += '\nDEEP DIVE EXERCISES:\n';
  for (const ex of (deepExercises || [])) {
    userMessage += `\n=== ${ex.type.toUpperCase()} ===\n`;

    if (ex.type === 'ambiguity-cards' && ex.data?.interpretations) {
      userMessage += 'What they saw in each card:\n';
      ex.data.interpretations.forEach((interp, i) => {
        userMessage += `  Card ${i + 1}: "${interp.text}"`;
        if (interp.mood) userMessage += ` (card mood: ${interp.mood})`;
        userMessage += '\n';
      });
    }

    if (ex.type === 'sentence-completion' && ex.data?.completions) {
      userMessage += 'Sentence completions:\n';
      ex.data.completions.forEach(c => {
        userMessage += `  "${c.stem}" → "${c.response}"\n`;
      });
    }
  }

  // Original exercises for context
  userMessage += '\nORIGINAL EXERCISES (for reference):\n';
  for (const ex of (exercises || [])) {
    if (ex.data?.emergedWords) {
      userMessage += `Emerged words: ${ex.data.emergedWords.join(', ')}\n`;
    }
    if (ex.data?.text) {
      userMessage += `Writing: "${ex.data.text.slice(0, 400)}"\n`;
    }
  }

  userMessage += '\nSynthesize everything — first round AND deep dive. What is beneath the first synthesis? Return ONLY valid JSON.';

  try {
    const raw = await callClaude(env, systemPrompt, userMessage, 2000);
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);

    if (!parsed.revelation) {
      throw new Error('Missing revelation in deep synthesis');
    }

    return corsResponse(request, {
      revelation: parsed.revelation,
      fullText: parsed.fullText || null,
      closing: parsed.closing || null,
    });
  } catch (err) {
    return failure(request, err);
  }
}


// === SHORE ENDPOINTS ===
async function handleShoreMessages(request, env) {
  try {
    const list = await env.SHORE_MESSAGES.list({ prefix: 'msg:' });
    const messages = [];

    for (const key of list.keys.slice(-50)) {
      const val = await env.SHORE_MESSAGES.get(key.name, 'json');
      if (val) messages.push(val);
    }

    messages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return corsResponse(request, { messages });
  } catch (err) {
    console.error('[shore list]', err.message);
    return corsResponse(request, { messages: [] });
  }
}

async function handleShorePost(request, env, body) {
  const { text, author, replyTo } = body;

  if (typeof text !== 'string' || text.trim().length === 0) {
    return corsResponse(request, { error: 'Message required' }, 400);
  }

  if (text.length > 500) {
    return corsResponse(request, { error: 'Message too long' }, 400);
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const message = {
    id,
    text: text.trim().slice(0, 500),
    author: (typeof author === 'string' && author.trim() ? author : 'anonymous').trim().slice(0, 40),
    timestamp: Date.now(),
    replyTo: typeof replyTo === 'string' && /^[0-9a-z-]{1,40}$/.test(replyTo) ? replyTo : null,
  };

  try {
    await env.SHORE_MESSAGES.put(`msg:${id}`, JSON.stringify(message));
    return corsResponse(request, { ok: true, id });
  } catch (err) {
    return failure(request, err);
  }
}

// === ROUTER ===
const LLM_ROUTES = {
  '/emerge': handleEmerge,
  '/write-prompt': handleWritePrompt,
  '/synthesize': handleSynthesize,
  '/sentence-stems': handleSentenceStems,
  '/deep-synthesize': handleDeepSynthesize,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      if (request.method === 'GET' && path === '/shore/messages') {
        return await handleShoreMessages(request, env);
      }

      if (request.method !== 'POST') {
        return corsResponse(request, { error: 'Method not allowed' }, 405);
      }

      const isLlm = Object.prototype.hasOwnProperty.call(LLM_ROUTES, path);
      const isShore = path === '/shore/post' || path === '/shore/messages';
      if (!isLlm && !isShore) {
        return corsResponse(request, { error: 'Not found' }, 404);
      }

      // Browsers always send Origin on these cross-origin POSTs. Not proof against scripts,
      // but it turns away casual reuse; the rate limits do the real work.
      const origin = request.headers.get('Origin') || '';
      if (!ALLOWED_ORIGINS.includes(origin)) {
        return corsResponse(request, { error: 'Forbidden' }, 403);
      }

      if (path === '/shore/messages') {
        return await handleShoreMessages(request, env);
      }

      const limiter = isLlm ? env.LLM_LIMITER : env.SHORE_LIMITER;
      if (!(await underLimit(limiter, request, isLlm ? 'llm' : 'shore'))) {
        return corsResponse(request, { error: 'Slow down a little, then try again.' }, 429);
      }

      const { body, error, status } = await readBody(request);
      if (error) return corsResponse(request, { error }, status);

      if (isLlm) return await LLM_ROUTES[path](request, env, body);
      return await handleShorePost(request, env, body);
    } catch (err) {
      return failure(request, err, 'router');
    }
  },
};
