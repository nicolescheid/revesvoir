// ============================================================
// AMBIGUITY CARDS — Threshold direction
// Procedurally-generated inkblot. Pareidolia as a doorway.
// User reveals a card, journals what they see, keeps three.
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWater } from '../components/WaterCanvas';
import { useSession } from '../contexts/SessionContext';
import { haptics } from '../systems/AudioSystem';
import PlateThreshold from './ambiguity/PlateThreshold.jsx';
import './AmbiguityCards.css';

const KEEPS_TO_COMPLETE = 3;
const REVEAL_MS = 3800;
const READY_DELAY_MS = 4200; // 600ms blot fade-in + 3800ms formation

const AMBIGUITY_PROMPTS = [
  'What do you see?',
  'What is this becoming?',
  'Who lives here?',
  'What just happened here?',
  'What is hiding inside?',
  'What does this remember?',
  'What is on the other side?',
  'What wants your attention?',
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

// session.id is a string like "lkb3mz7q4abc". Hash to a stable 32-bit int
// so the seeded rng can consume it. cardIndex makes successive cards in
// the same session distinct but still deterministic on reload.
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seedFor(sessionId, cardIndex) {
  const base = sessionId || 'anon';
  return hashSeed(`${base}:${cardIndex}`);
}

function seedLabel(seed) {
  return seed.toString(36).padStart(6, '0').slice(0, 6);
}

function promptFor(seed) {
  return AMBIGUITY_PROMPTS[Math.abs(seed | 0) % AMBIGUITY_PROMPTS.length];
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return reduced;
}

// ── Replay icon ────────────────────────────────────────────
function ReplayButton({ onClick }) {
  return (
    <button className="ac-replay" onClick={onClick} aria-label="Replay reveal">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M11.5 7a4.5 4.5 0 1 1-1.32-3.18M11.5 1.5V4H9"
          stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ── Main component ────────────────────────────────────────
export default function AmbiguityCards({ onComplete, audioSystem }) {
  const waterRef = useWater();
  const { session, dispatch } = useSession();
  const reducedMotion = usePrefersReducedMotion();
  const textareaRef = useRef(null);

  // Resume-friendly state lives in currentExercise.state via SessionContext.
  const persisted = session.currentExercise?.state || {};

  const [stage, setStage] = useState(persisted.stage || 'rest'); // rest | revealing | ready | journaling
  const [cardIndex, setCardIndex] = useState(persisted.cardIndex ?? 0);
  const [revealKey, setRevealKey] = useState(persisted.revealKey ?? 0);
  const [text, setText] = useState(persisted.text || '');
  const [entries, setEntries] = useState(persisted.entries || []);

  const seed = useMemo(() => seedFor(session.id, cardIndex), [session.id, cardIndex]);
  const promptTitle = useMemo(() => promptFor(seed), [seed]);

  // Persist exercise state through SessionContext so refresh resumes here.
  useEffect(() => {
    dispatch({
      type: 'UPDATE_EXERCISE',
      payload: { stage, cardIndex, revealKey, text, entries },
    });
  }, [stage, cardIndex, revealKey, text, entries, dispatch]);

  // revealing → ready after the formation completes.
  useEffect(() => {
    if (stage !== 'revealing') return;
    const id = setTimeout(() => setStage('ready'), reducedMotion ? 0 : READY_DELAY_MS);
    return () => clearTimeout(id);
  }, [stage, revealKey, reducedMotion]);

  // Focus the textarea when the prompt area appears.
  useEffect(() => {
    if (stage === 'ready' || stage === 'journaling') {
      const id = setTimeout(() => textareaRef.current?.focus(), 200);
      return () => clearTimeout(id);
    }
  }, [stage]);

  // ── Actions ───────────────────────────────────────────
  const ripple = (intensity = 0.4) => {
    const water = waterRef?.current;
    if (water) water.createRipple(window.innerWidth / 2, window.innerHeight / 2, intensity);
  };

  const begin = useCallback(() => {
    setRevealKey(k => k + 1);
    setStage('revealing');
    haptics.tap();
    ripple(0.5);
  }, []);

  const replay = useCallback(() => {
    setRevealKey(k => k + 1);
    setStage('revealing');
    haptics.tap();
  }, []);

  const discard = useCallback(() => {
    setText('');
    setStage('rest');
    haptics.tap();
  }, []);

  const newCard = useCallback(() => {
    setCardIndex(i => i + 1);
    setText('');
    setRevealKey(k => k + 1);
    setStage('revealing');
    haptics.pulse();
    if (audioSystem) audioSystem.playEmerge?.();
    ripple(0.4);
  }, [audioSystem]);

  const keep = useCallback(() => {
    if (!text.trim()) return;

    const entry = {
      cardIndex,
      seed,
      seedLabel: seedLabel(seed),
      prompt: promptTitle,
      text: text.trim(),
      savedAt: Date.now(),
    };
    const updated = [...entries, entry];
    setEntries(updated);

    haptics.pulse();
    if (audioSystem) audioSystem.playLink?.();
    ripple(0.5);

    if (updated.length >= KEEPS_TO_COMPLETE) {
      // Final keep — dispatch and exit the exercise.
      dispatch({
        type: 'COMPLETE_EXERCISE',
        payload: {
          data: {
            entries: updated,
            keepCount: updated.length,
          },
        },
      });
      haptics.reveal();
      if (audioSystem) audioSystem.playReveal?.();
      const water = waterRef?.current;
      if (water) water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 1);

      setTimeout(() => onComplete({
        type: 'ambiguity-cards',
        data: { entries: updated },
      }), 1200);
      return;
    }

    // Otherwise roll a new seed and return to rest for the next card.
    setCardIndex(i => i + 1);
    setText('');
    setStage('rest');
  }, [text, cardIndex, seed, promptTitle, entries, dispatch, onComplete, audioSystem, waterRef]);

  const onTextChange = (e) => {
    setText(e.target.value);
    if (stage === 'ready' && e.target.value.length > 0) setStage('journaling');
  };

  // ── Render ────────────────────────────────────────────
  const promptVisible = stage === 'ready' || stage === 'journaling';
  const blotPlateNum = ROMAN[entries.length] || ROMAN[ROMAN.length - 1];
  const canKeep = text.trim().length > 0;

  return (
    <div className="ambiguity-cards">
      <div className="ac-card" data-stage={stage}>

        <div className="ac-header">
          <span className="ac-meta">
            Session · Plate {blotPlateNum}
          </span>
          <span className="ac-meta ac-meta-right">
            Seed {seedLabel(seed)}
          </span>
        </div>

        <div className="ac-blot-area">
          {stage !== 'rest' && (
            <div className="ac-blot" key={`blot-${revealKey}`}>
              <PlateThreshold
                revealKey={revealKey}
                seed={seed}
                ink="#0e0a08"
                reducedMotion={reducedMotion}
              />
            </div>
          )}
          {stage === 'rest' && (
            <button className="ac-reveal-btn" onClick={begin}>
              Reveal a card
            </button>
          )}
          {promptVisible && <ReplayButton onClick={replay} />}
        </div>

        {promptVisible && (
          <div className="ac-prompt-area">
            <h2 className="ac-prompt-title">{promptTitle}</h2>
            <textarea
              ref={textareaRef}
              className="ac-textarea"
              value={text}
              onChange={onTextChange}
              placeholder="Free-write whatever surfaces. Don't edit."
              rows={4}
            />
            <div className="ac-actions">
              <button className="ac-discard" onClick={discard}>
                ← Discard
              </button>
              <div className="ac-actions-right">
                <button className="ac-new" onClick={newCard}>
                  ↻ New card
                </button>
                <button
                  className="ac-keep"
                  onClick={keep}
                  disabled={!canKeep}
                >
                  Keep ↗
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="ac-progress">
          {entries.length} of {KEEPS_TO_COMPLETE} kept
        </div>
      </div>
    </div>
  );
}
