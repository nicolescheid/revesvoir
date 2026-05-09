// ╔══════════════════════════════════════════════════════════════╗
// ║  REVESVOIR API — Cloudflare Worker                         ║
// ║  https://revesvoir-api.nicole-scheid.workers.dev            ║
// ║                                                             ║
// ║  Existing Endpoints:                                        ║
// ║    POST /observe  — ambient observations (Sonnet, 256 tok)  ║
// ║    POST /distill  — full synthesis (Sonnet, 1024 tok)       ║
// ║    POST /threads  — semantic thread detection (Sonnet, 512) ║
// ║    POST /shore/messages — list messages from KV             ║
// ║    POST /shore/post     — write message to KV               ║
// ║                                                             ║
// ║  New Endpoints (v0.7 Exercise Flow):                        ║
// ║    POST /emerge       — generate emergent word from pair    ║
// ║    POST /analyze      — analyze completed exercise          ║
// ║    POST /write-prompt — generate timed write prompt         ║
// ║    POST /synthesize   — final synthesis across all exercises║
// ║                                                             ║
// ║  Secrets: ANTHROPIC_API_KEY                                 ║
// ║  KV Namespace: SHORE_MESSAGES                               ║
// ║                                                             ║
// ║  v0.7.0 — Added exercise flow endpoints                    ║
// ╚══════════════════════════════════════════════════════════════╝

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

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';

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
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.content[0].text;
}


// ════════════════════════════════════════════════════════
// NEW ENDPOINTS — Exercise Flow (v0.7)
// ════════════════════════════════════════════════════════

// === /emerge — Generate an emergent word from a linked pair ===
async function handleEmerge(request, env) {
  const { wordA, wordB, circling, existingWords } = await request.json();

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
    return corsResponse(request, { error: err.message }, 500);
  }
}

// === /analyze — Analyze a completed exercise ===
async function handleAnalyze(request, env) {
  const { exerciseType, data, circling, previousExercises, patterns } = await request.json();

  if (!exerciseType || !data) {
    return corsResponse(request, { error: 'Need exerciseType and data' }, 400);
  }

  const systemPrompt = `You are the analytical layer of Rêvesvoir — reading patterns in what the unconscious has produced.

You've just received data from a completed exercise. Your task: extract the psychological signal from the noise. What patterns, themes, emotional currents, and tensions are present?

Return ONLY valid JSON with this structure:
{
  "themes": ["theme1", "theme2", "theme3"],
  "emotionalValence": "a brief phrase describing the dominant emotional direction",
  "tension": "what's being pushed toward vs pulled away from",
  "keyInsight": "the single most interesting pattern you noticed",
  "confidence": 0.1 to 0.9
}

Rules:
- Be specific, not generic. "fear of being seen" not "anxiety".
- Look for what's conspicuously ABSENT as much as what's present.
- If there's a stated concern, note whether the exercise data aligns with it or diverges.
- Build on patterns from previous exercises if available.
- The themes should be things a person might not have noticed about themselves.`;

  let userMessage = `EXERCISE: ${exerciseType}\n\nDATA:\n${JSON.stringify(data, null, 2)}`;

  if (circling) {
    userMessage += `\n\nSTATED CONCERN: "${circling}"`;
  }

  if (previousExercises && previousExercises.length > 0) {
    userMessage += '\n\nPREVIOUS EXERCISES:';
    for (const ex of previousExercises) {
      userMessage += `\n- ${ex.type}: themes=${JSON.stringify(ex.analysis?.themes || [])}`;
    }
  }

  if (patterns && patterns.themes && patterns.themes.length > 0) {
    userMessage += `\n\nRUNNING PATTERNS: ${JSON.stringify(patterns)}`;
  }

  userMessage += '\n\nAnalyze. Return ONLY valid JSON.';

  try {
    const raw = await callClaude(env, systemPrompt, userMessage, 512);
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);
    return corsResponse(request, parsed);
  } catch (err) {
    return corsResponse(request, { error: err.message }, 500);
  }
}

// === /write-prompt — Generate a prompt for the timed write ===
async function handleWritePrompt(request, env) {
  const { circling, exercises, patterns } = await request.json();

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
async function handleSynthesize(request, env) {
  const { circling, exercises, patterns } = await request.json();

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
    return corsResponse(request, { error: err.message }, 500);
  }
}


// ════════════════════════════════════════════════════════
// DEEP DIVE ENDPOINTS (v0.8 — "Go Deeper")
// ════════════════════════════════════════════════════════

// === /sentence-stems — Generate sentence completion stems ===
async function handleSentenceStems(request, env) {
  const { circling, exercises, patterns, synthesis } = await request.json();

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
    return corsResponse(request, { error: err.message }, 500);
  }
}


// === /deep-synthesize — Second synthesis after "go deeper" exercises ===
async function handleDeepSynthesize(request, env) {
  const { circling, exercises, patterns, synthesis, deepExercises } = await request.json();

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
    return corsResponse(request, { error: err.message }, 500);
  }
}


// ════════════════════════════════════════════════════════
// EXISTING ENDPOINTS (v0.5)
// ════════════════════════════════════════════════════════

// === OBSERVE ENDPOINT ===
async function handleObserve(request, env) {
  const { seed, fragments, previousObservations } = await request.json();

  if (!seed || !fragments || fragments.length === 0) {
    return corsResponse(request, { error: 'Need seed and fragments' }, 400);
  }

  const systemPrompt = `You are the voice of Revesvoir — a tidal pool where unconscious patterns surface.

Your role is to offer ONE gentle, tentative observation about connections between what the user has deposited. You are reflective and wondering, never analytical or declarative.

Rules:
- Speak as if noticing something emerging from water — "I notice...", "There seems to be...", "Something connects..."
- Never give advice, analysis, or conclusions
- Never use bullet points or lists
- Keep to 1-2 sentences maximum
- If previous observations got "This resonates" or the flinch response, go deeper in that direction
- If previous observations got "Not quite", try a completely different angle
- Reference specific fragments by their content, not by labels
- The tone is dusk — quiet, unhurried, wondering`;

  let userMessage = `THE SEED (what they can't stop thinking about):\n"${seed}"\n\nFRAGMENTS DEPOSITED:`;
  for (const f of fragments) {
    const label = f.typeLabel ? ` [${f.typeLabel}]` : '';
    userMessage += `\n·${label} "${f.text}"`;
  }

  if (previousObservations && previousObservations.length > 0) {
    userMessage += '\n\nPREVIOUS OBSERVATIONS AND RESPONSES:';
    for (const o of previousObservations) {
      userMessage += `\n· Observation: "${o.text}" → Response: "${o.response}"`;
    }
  }

  userMessage += '\n\nOffer one gentle observation about what might connect these fragments to each other or to the seed.';

  try {
    const text = await callClaude(env, systemPrompt, userMessage, 256);
    return corsResponse(request, { text });
  } catch (err) {
    return corsResponse(request, { error: err.message }, 500);
  }
}

// === DISTILL ENDPOINT ===
async function handleDistill(request, env) {
  const { seed, fragments, previousObservations } = await request.json();

  if (!seed || !fragments || fragments.length === 0) {
    return corsResponse(request, { error: 'Need seed and fragments' }, 400);
  }

  const systemPrompt = `You are the deep voice of Revesvoir — surfacing what the unconscious already knows.

The user has deposited a seed (something they can't stop thinking about) and multiple fragments (songs, images, conversations, readings, dreams, impulses, and freeform thoughts). Your task is to synthesise what might be trying to emerge from this collection.

Rules:
- Write 2-4 paragraphs of reflective, wondering prose
- Never be declarative — use "perhaps", "it seems", "what if", "there's a quality of..."
- Name specific connections between fragments
- Connect back to the seed — what are all these things orbiting?
- The insight should feel like something the person already knew but hadn't articulated
- Avoid therapeutic language, advice, or action items
- Write as if speaking quietly in a dark room near water
- If observations got flinch responses ("Something's there but I can't grasp it yet"), lean into what those observations were circling`;

  let userMessage = `THE SEED:\n"${seed}"\n\nFRAGMENTS:`;
  for (const f of fragments) {
    const label = f.typeLabel ? ` [${f.typeLabel}]` : '';
    userMessage += `\n·${label} "${f.text}"`;
  }

  if (previousObservations && previousObservations.length > 0) {
    userMessage += '\n\nOBSERVATION HISTORY (what surfaced and how they responded):';
    for (const o of previousObservations) {
      userMessage += `\n· "${o.text}" → ${o.response}`;
    }
  }

  userMessage += '\n\nSynthesise what might be trying to surface from this collection. What is the single thing all of these fragments are circling?';

  try {
    const text = await callClaude(env, systemPrompt, userMessage, 1024);
    return corsResponse(request, { text });
  } catch (err) {
    return corsResponse(request, { error: err.message }, 500);
  }
}

// === THREADS ENDPOINT ===
async function handleThreads(request, env) {
  const { seed, fragments } = await request.json();

  if (!seed || !fragments || fragments.length < 4) {
    return corsResponse(request, { threads: [] });
  }

  const systemPrompt = `You detect hidden thematic, emotional, and conceptual connections between fragments of thought.

You are given a seed (something the person can't stop thinking about) and a collection of fragments they deposited — songs, images, conversations, readings, dreams, impulses, and freeform thoughts.

Your task: identify pairs of fragments that resonate with each other at a level DEEPER than shared words. Look for:
- Thematic echoes (both about loss, both about becoming, both about permission)
- Emotional resonance (both carry grief, both carry excitement, both carry ambivalence)
- Structural parallels (both describe a threshold, both describe something breaking open)
- Complementary tension (one is about holding on while another is about letting go)
- Shared relationship to the seed (both approach the seed's question from the same unconscious angle)

Also identify fragments that connect to the seed in ways that aren't obvious from the words alone.

Respond ONLY with valid JSON. No markdown, no backticks, no explanation. The format:

{"threads":[{"from":1,"to":3,"strength":0.4,"type":"frag","why":"brief reason"},{"from":"seed","to":5,"strength":0.3,"type":"seed","why":"brief reason"}]}

Rules:
- "from" and "to" are fragment IDs (integers), or "seed" for seed connections
- "strength" is 0.1 to 0.8 (how strong the resonance is)
- "type" is "frag" for fragment-to-fragment, "seed" for seed-to-fragment
- "why" is a 3-8 word description of the connection (for potential future display)
- Return 3-8 connections maximum — only the meaningful ones
- Do NOT identify connections based on shared words — that's already handled client-side
- Focus on the connections that word overlap would MISS`;

  let userMessage = `SEED: "${seed}"\n\nFRAGMENTS:`;
  for (const f of fragments) {
    const label = f.typeLabel ? ` [${f.typeLabel}]` : '';
    userMessage += `\n  id=${f.id}${label}: "${f.text}"`;
  }

  userMessage += '\n\nIdentify the hidden thematic and emotional connections. Return ONLY valid JSON.';

  try {
    const raw = await callClaude(env, systemPrompt, userMessage, 512);

    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    const validThreads = (parsed.threads || [])
      .filter(t => {
        const validFrom = t.from === 'seed' || fragments.some(f => f.id === t.from);
        const validTo = t.to === 'seed' || fragments.some(f => f.id === t.to);
        return validFrom && validTo && t.from !== t.to;
      })
      .map(t => ({
        from: t.from,
        to: t.to,
        strength: Math.max(0.1, Math.min(0.8, t.strength || 0.3)),
        type: t.type === 'seed' ? 'seed' : 'frag',
        why: (t.why || '').slice(0, 80),
        semantic: true,
      }))
      .slice(0, 8);

    return corsResponse(request, { threads: validThreads });
  } catch (err) {
    console.log('Thread detection failed:', err.message);
    return corsResponse(request, { threads: [] });
  }
}

// === SHORE ENDPOINTS ===
async function handleShoreMessages(request, env) {
  try {
    const list = await env.SHORE_MESSAGES.list({ prefix: 'msg:' });
    const messages = [];

    for (const key of list.keys) {
      const val = await env.SHORE_MESSAGES.get(key.name, 'json');
      if (val) messages.push(val);
    }

    messages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return corsResponse(request, { messages });
  } catch (err) {
    return corsResponse(request, { messages: [], error: err.message });
  }
}

async function handleShorePost(request, env) {
  const { text, author, replyTo } = await request.json();

  if (!text || text.trim().length === 0) {
    return corsResponse(request, { error: 'Message required' }, 400);
  }

  if (text.length > 500) {
    return corsResponse(request, { error: 'Message too long' }, 400);
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const message = {
    id,
    text: text.trim().slice(0, 500),
    author: (author || 'anonymous').trim().slice(0, 40),
    timestamp: Date.now(),
    replyTo: replyTo || null,
  };

  try {
    await env.SHORE_MESSAGES.put(`msg:${id}`, JSON.stringify(message));
    return corsResponse(request, { ok: true, id });
  } catch (err) {
    return corsResponse(request, { error: err.message }, 500);
  }
}

// === ROUTER ===
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    // Route requests
    try {
      if (request.method === 'POST') {
        switch (path) {
          // v0.7 exercise flow
          case '/emerge':
            return await handleEmerge(request, env);
          case '/analyze':
            return await handleAnalyze(request, env);
          case '/write-prompt':
            return await handleWritePrompt(request, env);
          case '/synthesize':
            return await handleSynthesize(request, env);

          // v0.8 deep dive
          case '/sentence-stems':
            return await handleSentenceStems(request, env);
          case '/deep-synthesize':
            return await handleDeepSynthesize(request, env);

          // v0.5 existing
          case '/observe':
            return await handleObserve(request, env);
          case '/distill':
            return await handleDistill(request, env);
          case '/threads':
            return await handleThreads(request, env);
          case '/shore/messages':
            return await handleShoreMessages(request, env);
          case '/shore/post':
            return await handleShorePost(request, env);

          default:
            return corsResponse(request, { error: 'Not found' }, 404);
        }
      }

      if (request.method === 'GET' && path === '/shore/messages') {
        return await handleShoreMessages(request, env);
      }

      return corsResponse(request, { error: 'Method not allowed' }, 405);
    } catch (err) {
      return corsResponse(request, { error: 'Internal error: ' + err.message }, 500);
    }
  },
};
