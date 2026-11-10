// ============================================================
// Circling — The entry question
// "Is there something specific you're circling?"
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWater } from './WaterCanvas';
import { useSession } from '../contexts/SessionContext';
import './Circling.css';

export default function Circling({ onComplete, onCrisis }) {
  const waterRef = useWater();
  const { dispatch, checkCrisis } = useSession();
  const [mode, setMode] = useState('ask'); // ask | typing | finding
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Fade in
    const t = setTimeout(() => setVisible(true), 300);

    // Gentle ripple as the question surfaces
    const water = waterRef?.current;
    if (water) {
      setTimeout(() => water.createRipple(window.innerWidth * 0.5, window.innerHeight * 0.4, 0.5), 800);
    }

    return () => clearTimeout(t);
  }, []);

  const handleYes = useCallback(() => {
    setMode('typing');
    const water = waterRef?.current;
    if (water) water.createRipple(window.innerWidth * 0.4, window.innerHeight * 0.5, 0.3);
  }, []);

  const handleFindIt = useCallback(() => {
    setMode('finding');
    const water = waterRef?.current;
    if (water) {
      water.createRipple(window.innerWidth * 0.6, window.innerHeight * 0.5, 0.4);
      water.createRipple(window.innerWidth * 0.4, window.innerHeight * 0.6, 0.3);
    }

    // Brief pause, then proceed
    setTimeout(() => {
      dispatch({ type: 'SET_CIRCLING', payload: false });
      onComplete();
    }, 2500);
  }, [dispatch, onComplete]);

  const submittedRef = useRef(false);

  const handleSubmit = useCallback(() => {
    if (!text.trim() || submittedRef.current) return;
    submittedRef.current = true;
    const water = waterRef?.current;
    if (water) water.createRippleCascade(window.innerWidth * 0.5, window.innerHeight * 0.5, 0.8);

    const named = text.trim();
    dispatch({ type: 'SET_CIRCLING', payload: named });

    // The crisis check runs during the brief transition; both must finish before moving on.
    const pause = new Promise(resolve => setTimeout(resolve, 1500));
    Promise.all([checkCrisis(named), pause]).then(([crisis]) => {
      if (crisis && onCrisis) onCrisis();
      else onComplete();
    });
  }, [text, dispatch, onComplete, onCrisis, checkCrisis]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className={`circling ${visible ? 'visible' : ''}`}>
      {mode === 'ask' && (
        <div className="circling-content">
          <p className="circling-question">
            Is there something specific you're circling?
          </p>
          <p className="circling-sub">
            A stuck project, an unresolved question, a feeling,<br />
            a decision, a creative block, a problem.
          </p>
          <div className="circling-choices">
            <button className="circling-btn primary" onClick={handleYes}>
              Yes — let me name it
            </button>
            <button className="circling-btn" onClick={handleFindIt}>
              I'm not sure — help me find it
            </button>
          </div>
          <p className="circling-care">
            Rêvesvoir is an experiment in exploration. It works best when you're
            feeling settled, and it can't support you through a crisis.
          </p>
        </div>
      )}

      {mode === 'typing' && (
        <div className="circling-content">
          <p className="circling-prompt">
            Name it, however loosely.
          </p>
          <textarea
            className="circling-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="The thing that won't leave you alone..."
            rows={3}
            autoFocus
            aria-label="Describe what you're circling"
          />
          <p className="circling-hint">
            It doesn't have to be precise. Drop it into the water.
          </p>
          <button
            className="circling-submit"
            onClick={handleSubmit}
            disabled={!text.trim()}
          >
            Let it sink
          </button>
        </div>
      )}

      {mode === 'finding' && (
        <div className="circling-content">
          <p className="circling-finding">
            Then let's find out what's there.
          </p>
          <p className="circling-finding-sub">
            Your unconscious has been working on something.<br />
            We're going to help it surface.
          </p>
        </div>
      )}
    </div>
  );
}
