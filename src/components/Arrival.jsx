// ============================================================
// Arrival — Cinematic etymology sequence
// rêves → voir → réservoir → Rêvesvoir
// Each beat mounts into the DOM one at a time, then unmounts.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWater } from './WaterCanvas';
import { useSession } from '../contexts/SessionContext';
import './Arrival.css';

const BEATS = [
  { type: 'word', word: 'rêves', meaning: 'dreams', ripple: 0.7 },
  { type: 'word', word: 'voir', meaning: 'to see', ripple: 0.6 },
  { type: 'word', word: 'réservoir', meaning: 'a place where things collect', ripple: 0.8 },
  { type: 'title', word: 'Rêvesvoir', ripple: 1.4 },
  { type: 'tagline', line1: 'Seeing dreams.', line2: 'A reservoir of what your unconscious already knows.', ripple: 0.5 },
  { type: 'invitation', ripple: 0.3 },
  { type: 'button', ripple: 0.3 },
];

// How long each beat is visible before fading (ms)
const HOLD_TIMES = [2800, 2800, 3000, 3500, 4000, 4500, 999999];
const FADE_TIME = 1200;
const RISE_TIME = 2500;
const INITIAL_DELAY = 1500;

export default function Arrival({ onEnter }) {
  const waterRef = useWater();
  const { dispatch } = useSession();
  const [activeBeat, setActiveBeat] = useState(-1); // which beat is currently showing
  const [beatPhase, setBeatPhase] = useState('hidden'); // hidden | rising | visible | fading
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const runSequence = async () => {
      await delay(INITIAL_DELAY);

      for (let i = 0; i < BEATS.length; i++) {
        if (!mounted.current) return;

        const beat = BEATS[i];

        // Mount and start rising
        setActiveBeat(i);
        setBeatPhase('rising');

        // Ripple on the water
        const water = waterRef?.current;
        if (water) {
          water.createRipple(
            window.innerWidth * 0.5,
            window.innerHeight * (0.45 + Math.random() * 0.1),
            beat.ripple
          );
          setTimeout(() => {
            if (water) water.createRipple(
              window.innerWidth * 0.5 + (Math.random() - 0.5) * 60,
              window.innerHeight * 0.5 + (Math.random() - 0.5) * 40,
              beat.ripple * 0.4
            );
          }, 300);
        }

        // Wait for rise animation
        await delay(RISE_TIME);
        if (!mounted.current) return;
        setBeatPhase('visible');

        // Hold
        const holdTime = HOLD_TIMES[i];
        if (beat.type === 'button') {
          // Button stays — don't continue the sequence
          return;
        }

        await delay(holdTime);
        if (!mounted.current) return;

        // Fade out
        setBeatPhase('fading');
        await delay(FADE_TIME);
        if (!mounted.current) return;

        // Brief gap between beats
        setBeatPhase('hidden');
        await delay(800);
      }
    };

    runSequence();

    return () => { mounted.current = false; };
  }, []);

  const handleEnter = useCallback(() => {
    dispatch({ type: 'START_SESSION' });
    onEnter();
  }, [dispatch, onEnter]);

  const beat = activeBeat >= 0 ? BEATS[activeBeat] : null;

  return (
    <div className="arrival" role="region" aria-label="Welcome sequence">
      <div className="cinema">
        {beat && (
          <div className={`cinema-beat ${beatPhase}`} key={activeBeat}>

            {beat.type === 'word' && (
              <>
                <span className="cinema-word">{beat.word}</span>
                <span className="cinema-meaning">{beat.meaning}</span>
              </>
            )}

            {beat.type === 'title' && (
              <span className="cinema-title">{beat.word}</span>
            )}

            {beat.type === 'tagline' && (
              <>
                <span className="cinema-tagline">{beat.line1}</span>
                <span className="cinema-tagline-sub">{beat.line2}</span>
              </>
            )}

            {beat.type === 'invitation' && (
              <span className="cinema-invitation">
                You've been running background processes —<br />
                in sleep, on walks, in the spaces between thoughts.<br />
                Your unconscious has been working.
              </span>
            )}

            {beat.type === 'button' && (
              <button
                className="arrival-enter"
                onClick={handleEnter}
                aria-label="Begin the experience"
              >
                Begin
              </button>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
