// ============================================================
// Exercise Three: THE TIMED WRITE
// "I'm ready" button (already had one), persistent instructions,
// nudge prompts that surface during writing.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWater } from '../components/WaterCanvas';
import { useSession } from '../contexts/SessionContext';
import { haptics } from '../systems/AudioSystem';
import './TimedWrite.css';

const WRITE_DURATION = 180;

const INSTRUCTIONS = {
  title: 'The Timed Write',
  subtitle: 'Stream of Consciousness',
  lines: [
    'Write freely for three minutes in response to the prompt.',
    'Don\'t stop writing. Don\'t edit. Don\'t think too hard.',
    'Gentle nudges may surface — follow them or ignore them.',
    'When the timer ends, your writing is complete.',
  ],
};

const NUDGE_PROMPTS = [
  "What colour is this feeling?",
  "Who else is in this thought?",
  "Where does this live in your body?",
  "What would change if this resolved?",
  "What are you not saying?",
  "What does this remind you of?",
  "If this had a sound, what would it be?",
  "What's the opposite of what you just wrote?",
  "What would you do if no one was watching?",
  "What's underneath that?",
  "Keep going — don't stop now.",
  "What surprised you just then?",
  "What would the bravest version of you write?",
  "Stay with this. What else is there?",
];

export default function TimedWrite({ onComplete, audioSystem }) {
  const waterRef = useWater();
  const { dispatch, generateWritePrompt } = useSession();
  const textareaRef = useRef(null);

  const [phase, setPhase] = useState('loading');
  const [prompt, setPrompt] = useState('');
  const [introVisible, setIntroVisible] = useState(false);
  const [text, setText] = useState('');
  const [timeLeft, setTimeLeft] = useState(WRITE_DURATION);
  const [countdownNum, setCountdownNum] = useState(3);
  const [nudge, setNudge] = useState(null);
  const [nudgeFading, setNudgeFading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const timerRef = useRef(null);
  const nudgeTimerRef = useRef(null);
  const usedNudges = useRef(new Set());

  useEffect(() => {
    async function loadPrompt() {
      const p = await generateWritePrompt();
      setPrompt(p);
      setPhase('intro');
      setTimeout(() => setIntroVisible(true), 500);
    }
    loadPrompt();
  }, [generateWritePrompt]);

  const getNextNudge = useCallback(() => {
    const available = NUDGE_PROMPTS.filter((_, i) => !usedNudges.current.has(i));
    if (available.length === 0) {
      usedNudges.current.clear();
      return NUDGE_PROMPTS[Math.floor(Math.random() * NUDGE_PROMPTS.length)];
    }
    const idx = NUDGE_PROMPTS.indexOf(available[Math.floor(Math.random() * available.length)]);
    usedNudges.current.add(idx);
    return NUDGE_PROMPTS[idx];
  }, []);

  const startNudges = useCallback(() => {
    const firstDelay = 25000 + Math.random() * 10000;

    const showNudge = () => {
      const nextNudge = getNextNudge();
      setNudgeFading(false);
      setNudge(nextNudge);

      setTimeout(() => setNudgeFading(true), 6000);
      setTimeout(() => setNudge(null), 8000);

      const nextDelay = 20000 + Math.random() * 15000;
      nudgeTimerRef.current = setTimeout(showNudge, nextDelay);
    };

    nudgeTimerRef.current = setTimeout(showNudge, firstDelay);
  }, [getNextNudge]);

  const startCountdown = useCallback(() => {
    setPhase('countdown');
    setCountdownNum(3);

    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdownNum(count);
        haptics.tick();
        if (audioSystem) audioSystem.playTimerTick();
      } else {
        clearInterval(interval);
        setPhase('writing');
        setTimeLeft(WRITE_DURATION);

        setTimeout(() => textareaRef.current?.focus(), 100);

        timerRef.current = setInterval(() => {
          setTimeLeft(prev => {
            if (prev <= 1) { clearInterval(timerRef.current); return 0; }
            if ((prev - 1) % 30 === 0 && prev > 1) {
              if (audioSystem) audioSystem.playTimerTick();
            }
            return prev - 1;
          });
        }, 1000);

        startNudges();

        const water = waterRef?.current;
        if (water) water.createRipple(window.innerWidth / 2, window.innerHeight / 2, 0.6);
      }
    }, 1000);
  }, [audioSystem, startNudges]);

  useEffect(() => {
    if (timeLeft === 0 && phase === 'writing') {
      setPhase('complete');
      setNudge(null);
      clearTimeout(nudgeTimerRef.current);

      haptics.reveal();
      if (audioSystem) audioSystem.playReveal();

      const water = waterRef?.current;
      if (water) water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 1);

      dispatch({
        type: 'COMPLETE_EXERCISE',
        payload: {
          data: {
            prompt, text,
            wordCount: text.trim().split(/\s+/).filter(Boolean).length,
            duration: WRITE_DURATION,
          },
        },
      });

      setTimeout(() => onComplete(), 4000);
    }
  }, [timeLeft, phase]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    };
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const handleTextChange = useCallback((e) => {
    setText(e.target.value);
    const water = waterRef?.current;
    if (water && Math.random() < 0.08) {
      water.createRipple(
        window.innerWidth * (0.3 + Math.random() * 0.4),
        window.innerHeight * (0.3 + Math.random() * 0.4), 0.15
      );
    }
  }, []);

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className={`timed-write ${phase}`}>
      {phase === 'loading' && (
        <div className="tw-loading"><p>Preparing your prompt...</p></div>
      )}

      {phase === 'intro' && (
        <div className={`tw-intro ${introVisible ? 'visible' : ''}`}>
          <h2 className="tw-intro-title">{INSTRUCTIONS.title}</h2>
          <p className="tw-intro-subtitle">{INSTRUCTIONS.subtitle}</p>
          <div className="tw-intro-body">
            {INSTRUCTIONS.lines.map((line, i) => (
              <p key={i} className="tw-intro-line" style={{ animationDelay: `${0.8 + i * 0.6}s` }}>
                {line}
              </p>
            ))}
          </div>
          <div className="tw-prompt-preview">
            <p className="tw-prompt-text">"{prompt}"</p>
          </div>
          <button className="exercise-ready-btn" onClick={startCountdown}>
            I'm ready
          </button>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="tw-countdown">
          <span className="tw-countdown-number" key={countdownNum}>{countdownNum}</span>
        </div>
      )}

      {phase === 'writing' && (
        <div className="tw-writing">
          <div className={`tw-timer ${timeLeft <= 30 ? 'urgent' : ''}`}>
            {formatTime(timeLeft)}
          </div>

          {/* Prompt area — nudges swap in here so eyes stay in place */}
          <div className="tw-prompt-area">
            <div className={`tw-prompt-reminder ${nudge ? 'nudge-hidden' : ''}`}>"{prompt}"</div>
            {nudge && (
              <div className={`tw-nudge ${nudgeFading ? 'fading' : ''}`}>{nudge}</div>
            )}
          </div>

          <textarea
            ref={textareaRef}
            className="tw-textarea"
            value={text}
            onChange={handleTextChange}
            placeholder="Start writing..."
            autoFocus
            aria-label="Free writing area"
          />

          <div className="tw-wordcount">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </div>
        </div>
      )}

      {phase === 'complete' && (
        <div className="tw-complete">
          <p className="tw-complete-text">{wordCount} words poured out.</p>
          <p className="tw-complete-sub">
            Your unconscious has been speaking.<br />Let's see what it said.
          </p>
        </div>
      )}

      {/* PERSISTENT INSTRUCTIONS */}
      {phase === 'writing' && (
        <button className="instructions-toggle"
          onClick={() => setShowInstructions(!showInstructions)}
          aria-label="Show instructions">?</button>
      )}

      {showInstructions && (
        <div className="instructions-overlay" onClick={() => setShowInstructions(false)}>
          <div className="instructions-panel" onClick={(e) => e.stopPropagation()}>
            <h3 className="instructions-panel-title">{INSTRUCTIONS.title}</h3>
            {INSTRUCTIONS.lines.map((line, i) => (
              <p key={i} className="instructions-panel-line">{line}</p>
            ))}
            <button className="instructions-close" onClick={() => setShowInstructions(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
