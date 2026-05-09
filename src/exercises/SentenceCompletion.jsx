// ============================================================
// SENTENCE COMPLETION — Deep Dive Exercise
// AI generates sentence stems from the user's patterns.
// User completes them rapidly. Speed prevents filtering.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWater } from '../components/WaterCanvas';
import { useSession } from '../contexts/SessionContext';
import { haptics } from '../systems/AudioSystem';
import './SentenceCompletion.css';

const FALLBACK_STEMS = [
  'The thing I keep circling is...',
  'If nobody was watching I would...',
  'What I actually want is...',
  'The part I never say out loud is...',
  'I keep pretending that...',
  'The real question is...',
  'What changed without me noticing is...',
  'If I stopped being careful I would...',
];

export default function SentenceCompletion({ onComplete, audioSystem }) {
  const waterRef = useWater();
  const { session, dispatch } = useSession();
  const inputRef = useRef(null);

  const [phase, setPhase] = useState('loading');
  const [introVisible, setIntroVisible] = useState(false);
  const [stems, setStems] = useState([]);
  const [currentStem, setCurrentStem] = useState(0);
  const [response, setResponse] = useState('');
  const [completions, setCompletions] = useState([]);
  const [stemVisible, setStemVisible] = useState(false);

  // Load stems from API
  useEffect(() => {
    async function loadStems() {
      try {
        const API_URL = 'https://revesvoir-api.nicole-scheid.workers.dev';
        const res = await fetch(`${API_URL}/sentence-stems`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            circling: session.circling,
            exercises: session.exercises.map(e => ({
              type: e.type,
              data: e.data,
              analysis: e.analysis,
            })),
            patterns: session.patterns,
            synthesis: session.synthesis,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.stems && data.stems.length > 0) {
            setStems(data.stems);
          } else {
            setStems(FALLBACK_STEMS);
          }
        } else {
          setStems(FALLBACK_STEMS);
        }
      } catch (err) {
        console.log('Stems API unavailable:', err);
        setStems(FALLBACK_STEMS);
      }

      setPhase('intro');
      setTimeout(() => setIntroVisible(true), 300);
    }

    loadStems();
  }, []);

  const handleReady = useCallback(() => {
    setPhase('completing');
    setStemVisible(false);
    setTimeout(() => {
      setStemVisible(true);
      setTimeout(() => inputRef.current?.focus(), 300);
    }, 100);

    haptics.tap();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!response.trim()) return;

    const completion = {
      stem: stems[currentStem],
      response: response.trim(),
    };

    const updated = [...completions, completion];
    setCompletions(updated);
    setResponse('');

    haptics.pulse();
    if (audioSystem) audioSystem.playTick();

    const water = waterRef?.current;
    if (water) {
      water.createRipple(
        window.innerWidth * (0.3 + Math.random() * 0.4),
        window.innerHeight * 0.5,
        0.3,
      );
    }

    if (currentStem < stems.length - 1) {
      // Next stem
      setStemVisible(false);
      setTimeout(() => {
        setCurrentStem(prev => prev + 1);
        setStemVisible(true);
        setTimeout(() => inputRef.current?.focus(), 200);
      }, 500);
    } else {
      // All done
      setPhase('complete');
      haptics.reveal();
      if (audioSystem) audioSystem.playReveal();
      if (water) water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 1);

      dispatch({
        type: 'COMPLETE_EXERCISE',
        payload: {
          data: {
            completions: updated,
            stemCount: stems.length,
          },
        },
      });

      setTimeout(() => onComplete({
        type: 'sentence-completion',
        data: { completions: updated },
      }), 3500);
    }
  }, [response, currentStem, stems, completions, dispatch, onComplete, audioSystem]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const progress = stems.length > 0
    ? ((currentStem + (response.trim() ? 0.5 : 0)) / stems.length)
    : 0;

  return (
    <div className="sentence-completion">
      {/* Loading */}
      {phase === 'loading' && (
        <div className="sc-loading">
          <p>Preparing your sentences...</p>
        </div>
      )}

      {/* Intro */}
      {phase === 'intro' && (
        <div className={`sc-intro ${introVisible ? 'visible' : ''}`}>
          <h2 className="sc-intro-title">Sentence Completion</h2>
          <p className="sc-intro-subtitle">Rapid Response</p>
          <div className="sc-intro-body">
            <p className="sc-intro-line" style={{ animationDelay: '0.8s' }}>
              You'll see the beginning of a sentence.
            </p>
            <p className="sc-intro-line" style={{ animationDelay: '1.4s' }}>
              Complete it with the first thing that comes to mind.
            </p>
            <p className="sc-intro-line" style={{ animationDelay: '2.0s' }}>
              Don't think. Don't edit. Just finish the thought.
            </p>
          </div>
          <button className="exercise-ready-btn" onClick={handleReady}>
            I'm ready
          </button>
        </div>
      )}

      {/* Completing */}
      {phase === 'completing' && stems[currentStem] && (
        <div className="sc-completing">
          {/* Progress bar */}
          <div className="sc-progress-bar">
            <div className="sc-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>

          <div className="sc-stem-area">
            <p className={`sc-stem ${stemVisible ? 'visible' : ''}`}>
              {stems[currentStem]}
            </p>

            <input
              ref={inputRef}
              className="sc-input"
              type="text"
              value={response}
              onChange={e => setResponse(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="..."
              maxLength={200}
              autoComplete="off"
            />

            <button
              className="sc-next-btn"
              onClick={handleSubmit}
              disabled={!response.trim()}
            >
              {currentStem < stems.length - 1 ? '→' : 'Finish'}
            </button>
          </div>

          <p className="sc-counter">
            {currentStem + 1} of {stems.length}
          </p>
        </div>
      )}

      {/* Complete */}
      {phase === 'complete' && (
        <div className="sc-complete">
          <p className="sc-complete-text">
            {completions.length} thoughts, unfiltered.
          </p>
          <p className="sc-complete-sub">
            Your first instinct is usually the honest one.
          </p>
        </div>
      )}
    </div>
  );
}
