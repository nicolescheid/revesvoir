// ============================================================
// Exercise One: WORD WEAVING
// Drag words toward each other to link them.
// When close enough, they connect and an emergent word appears.
// Works on both touch (mobile) and mouse (desktop).
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWater } from '../components/WaterCanvas';
import { useSession } from '../contexts/SessionContext';
import { haptics } from '../systems/AudioSystem';
import './WordWeaving.css';

// Master word list — evocative, concrete, sensory. No repeats within a session.
const MASTER_WORDS = [
  // water / nature
  'tide', 'root', 'current', 'river', 'stone', 'salt', 'bloom', 'seed',
  'drift', 'shore', 'ember', 'frost', 'thorn', 'moss', 'ash', 'clay',
  'pollen', 'silt', 'bark', 'reef', 'dew', 'sap', 'grain', 'husk',
  // body / senses
  'skin', 'bone', 'pulse', 'breath', 'marrow', 'nerve', 'sinew', 'vein',
  'tongue', 'palm', 'rib', 'spine', 'scar', 'wrist', 'throat', 'iris',
  // space / structure
  'threshold', 'door', 'bridge', 'edge', 'margin', 'boundary', 'hollow',
  'vessel', 'shelter', 'nest', 'anchor', 'hinge', 'arch', 'vault',
  'corridor', 'window', 'ledge', 'frame', 'alcove', 'well',
  // light / dark
  'shadow', 'light', 'mirror', 'lens', 'prism', 'lantern', 'flicker',
  'glimmer', 'eclipse', 'haze', 'dusk', 'dawn', 'spark', 'gleam',
  // movement / force
  'gravity', 'orbit', 'wave', 'fracture', 'thread', 'wire', 'weight',
  'compass', 'needle', 'lever', 'spring', 'torque', 'pendulum', 'spiral',
  // inner / abstract-but-concrete
  'silence', 'key', 'cradle', 'garden', 'knot', 'ink', 'rust',
  'chalk', 'amber', 'dust', 'feather', 'bell', 'coin', 'mask',
  'quilt', 'ladder', 'latch', 'candle', 'smoke', 'riddle',
];

// Track which words have been used this session (persists across rounds via prop)
// We pass usedWords from App if needed, but simpler: just shuffle and slice differently each round
function pickWords(count, excludeWords = []) {
  const available = MASTER_WORDS.filter(w => !excludeWords.includes(w));
  // Fisher-Yates shuffle
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

const INSTRUCTIONS = {
  title: 'Word Weaving',
  subtitle: 'Free Association',
  lines: [
    'Drag any word toward another that feels connected.',
    'When they touch, something new will emerge.',
    'There is no wrong pairing \u2014 just follow your intuition.',
  ],
};

const LINK_DISTANCE = 90; // how close before words snap-link

export default function WordWeaving({ onComplete, audioSystem, round = 1, totalRounds = 1, usedWords = [], prevEmergedWords = [] }) {
  const waterRef = useWater();
  const { session, dispatch, generateEmergentWord } = useSession();

  const [words, setWords] = useState([]);
  const [links, setLinks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState('intro');
  const [introVisible, setIntroVisible] = useState(false);
  const [allPaired, setAllPaired] = useState(false);

  // Drag state
  const [dragging, setDragging] = useState(null); // { id, offsetX, offsetY, startX, startY }
  const [nearTarget, setNearTarget] = useState(null);
  const wordsRef = useRef([]); // keep a ref for use in move handler
  const wordsInitialized = useRef(false);

  // Keep wordsRef in sync
  useEffect(() => { wordsRef.current = words; }, [words]);

  // Initialize words
  useEffect(() => {
    if (wordsInitialized.current) return;
    wordsInitialized.current = true;

    // Pick 8 fresh words, excluding any already used in previous rounds
    const pool = pickWords(8, usedWords);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const padding = 80;
    const wordWidth = 110;
    const wordHeight = 40;

    const positioned = pool.map((text, i) => {
      const angle = (i / pool.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const radius = Math.min(w, h) * 0.2 + Math.random() * 70;
      const x = w / 2 + Math.cos(angle) * radius;
      const y = h / 2 + Math.sin(angle) * radius;

      return {
        id: `word-${i}`,
        text,
        x: Math.max(padding, Math.min(w - padding - wordWidth, x)),
        y: Math.max(padding, Math.min(h - padding - wordHeight, y)),
        isOriginal: true,
        isEmerged: false,
        linked: false,
        fading: false,
        bobDelay: Math.random() * 3,
        bobY: -(2 + Math.random() * 3),
      };
    });

    setWords(positioned);
  }, [round]);

  // Intro timing
  useEffect(() => {
    const t0 = setTimeout(() => setIntroVisible(true), 400);
    return () => clearTimeout(t0);
  }, []);

  const handleReady = useCallback(() => {
    setPhase('appearing');

    const water = waterRef?.current;
    if (water) {
      words.forEach((word, i) => {
        setTimeout(() => water.createRipple(word.x + 50, word.y + 15, 0.3), i * 250);
      });
    }

    setTimeout(() => setPhase('weaving'), words.length * 250 + 1200);
  }, [words]);

  // Check if all originals are paired
  useEffect(() => {
    if (phase !== 'weaving' || allPaired || generating) return;

    const originals = words.filter(w => w.isOriginal);
    const allLinked = originals.length > 0 && originals.every(w => w.linked);

    if (allLinked) {
      setAllPaired(true);
      setPhase('revealing');

      haptics.reveal();
      if (audioSystem) audioSystem.playReveal();

      const water = waterRef?.current;
      if (water) water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 1);

      setTimeout(() => {
        setPhase('complete');

        const emergedWords = words.filter(w => w.isEmerged).map(w => w.text);
        const linkData = links.map(l => ({
          from: words.find(w => w.id === l.from)?.text,
          to: words.find(w => w.id === l.to)?.text,
          emerged: l.emerged,
        }));

        dispatch({
          type: 'COMPLETE_EXERCISE',
          payload: {
            data: {
              originalWords: words.filter(w => w.isOriginal).map(w => w.text),
              links: linkData,
              emergedWords,
              linkOrder: links.map(l => [l.from, l.to]),
            },
          },
        });

        setTimeout(() => {
          const seedWords = words.filter(w => w.isOriginal).map(w => w.text);
          onComplete(emergedWords, seedWords);
        }, 3500);
      }, 3000);
    }
  }, [words, links, phase, generating, allPaired]);

  // === DRAG INTERACTION ===

  const getPos = (e) => {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  };

  const handleDragStart = useCallback((wordId, e) => {
    if (phase !== 'weaving' || generating) return;
    const word = words.find(w => w.id === wordId);
    if (!word || !word.isOriginal || word.linked) return;

    e.preventDefault();
    const pos = getPos(e);

    setDragging({
      id: wordId,
      offsetX: pos.x - word.x,
      offsetY: pos.y - word.y,
      startX: word.x,
      startY: word.y,
    });

    haptics.tap();
    const water = waterRef?.current;
    if (water) water.createRipple(word.x + 50, word.y + 15, 0.2);
  }, [words, phase, generating]);

  const handleDragMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();

    const pos = getPos(e);
    const newX = pos.x - dragging.offsetX;
    const newY = pos.y - dragging.offsetY;

    // Move the word
    setWords(prev => prev.map(w =>
      w.id === dragging.id ? { ...w, x: newX, y: newY } : w
    ));

    // Check proximity to other unlinked originals
    const cx = newX + 55;
    const cy = newY + 20;
    let closest = null;
    let closestDist = Infinity;

    wordsRef.current.forEach(w => {
      if (w.id === dragging.id || !w.isOriginal || w.linked) return;
      const wx = w.x + 55;
      const wy = w.y + 20;
      const dist = Math.sqrt((cx - wx) ** 2 + (cy - wy) ** 2);
      if (dist < LINK_DISTANCE && dist < closestDist) {
        closest = w.id;
        closestDist = dist;
      }
    });

    setNearTarget(closest);
  }, [dragging]);

  const handleDragEnd = useCallback(async (e) => {
    if (!dragging) return;

    const draggedId = dragging.id;
    const fromWord = wordsRef.current.find(w => w.id === draggedId);
    const toWord = nearTarget ? wordsRef.current.find(w => w.id === nearTarget) : null;

    if (toWord && fromWord && !fromWord.linked && !toWord.linked) {
      // === LINK! ===
      haptics.pulse();
      if (audioSystem) audioSystem.playLink();

      const fromPos = { x: fromWord.x + 55, y: fromWord.y + 20 };
      const toPos = { x: toWord.x + 55, y: toWord.y + 20 };

      const water = waterRef?.current;
      const midX = (fromWord.x + toWord.x) / 2 + 55;
      const midY = (fromWord.y + toWord.y) / 2 + 20;
      if (water) water.createRipple(midX, midY, 0.5);

      // Mark both as linked and fading
      setWords(prev => prev.map(w =>
        (w.id === draggedId || w.id === nearTarget) ? { ...w, linked: true, fading: true } : w
      ));

      setDragging(null);
      setNearTarget(null);
      setGenerating(true);

      const newLink = { from: draggedId, to: nearTarget, emerged: null, fromPos, toPos };
      setLinks(prev => [...prev, newLink]);

      // Generate emergent word from AI. Pass everything the API must NOT
      // return: this round's seed words, words already emerged this round,
      // and emerged words from any prior rounds. Without this list the
      // worker's "do not repeat" instruction has nothing to hold on to and
      // collapses onto the same handful of words (threshold, resonance...).
      const seedWords = wordsRef.current
        .filter(w => w.isOriginal)
        .map(w => w.text);
      const emergedSoFar = wordsRef.current
        .filter(w => w.isEmerged)
        .map(w => w.text);
      const existingWords = [...seedWords, ...emergedSoFar, ...prevEmergedWords];
      const emergentText = await generateEmergentWord(fromWord.text, toWord.text, existingWords);

      const emergeX = (fromWord.x + toWord.x) / 2;
      const emergeY = (fromWord.y + toWord.y) / 2;

      const newWord = {
        id: `emerged-${Date.now()}`,
        text: emergentText,
        x: Math.max(60, Math.min(window.innerWidth - 160, emergeX)),
        y: Math.max(60, Math.min(window.innerHeight - 60, emergeY)),
        isOriginal: false,
        isEmerged: true,
        linked: false,
        fading: false,
        bobDelay: Math.random() * 3,
        bobY: -(2 + Math.random() * 2),
      };

      setWords(prev => [...prev, newWord]);
      setLinks(prev => prev.map(l =>
        l.from === newLink.from && l.to === newLink.to ? { ...l, emerged: emergentText } : l
      ));
      setGenerating(false);

      haptics.doubleTap();
      if (audioSystem) audioSystem.playEmerge();
      if (water) water.createRipple(newWord.x + 55, newWord.y + 20, 0.6);

    } else {
      // No link — snap back
      setWords(prev => prev.map(w =>
        w.id === draggedId ? { ...w, x: dragging.startX, y: dragging.startY } : w
      ));
      setDragging(null);
      setNearTarget(null);
    }
  }, [dragging, nearTarget, generateEmergentWord, audioSystem]);

  const remainingCount = words.filter(w => w.isOriginal && !w.linked).length;

  return (
    <div
      className={`word-weaving ${phase}`}
      onMouseMove={handleDragMove}
      onTouchMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onTouchEnd={handleDragEnd}
    >
      {/* INTRO — full on round 1, abbreviated on subsequent rounds */}
      {(phase === 'intro' || phase === 'appearing') && (
        <div className={`ww-intro ${introVisible ? 'visible' : ''} ${phase === 'appearing' ? 'dissolving' : ''}`}>
          {round === 1 ? (
            <>
              <h2 className="ww-intro-title">{INSTRUCTIONS.title}</h2>
              <p className="ww-intro-subtitle">{INSTRUCTIONS.subtitle}</p>
              <div className="ww-intro-body">
                {INSTRUCTIONS.lines.map((line, i) => (
                  <p key={i} className="ww-intro-line" style={{ animationDelay: `${0.8 + i * 0.6}s` }}>
                    {line}
                  </p>
                ))}
              </div>
              {totalRounds > 1 && (
                <p className="ww-intro-rounds">
                  This will happen {totalRounds} times, each with new words.
                </p>
              )}
            </>
          ) : (
            <>
              <h2 className="ww-intro-title">Round {round}</h2>
              <p className="ww-intro-subtitle">
                {round < totalRounds
                  ? `${totalRounds - round} more after this`
                  : 'Last round'}
              </p>
              <p className="ww-intro-line" style={{ animationDelay: '0.5s' }}>
                New words. Same intuition.
              </p>
            </>
          )}
          {phase === 'intro' && (
            <button className="exercise-ready-btn" onClick={handleReady}>
              {round === 1 ? "I'm ready" : 'Continue'}
            </button>
          )}
        </div>
      )}

      {/* SVG: visible strings between linked pairs */}
      <svg className="ww-svg-layer" style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
        {links.map((link, i) => {
          const x1 = link.fromPos.x, y1 = link.fromPos.y;
          const x2 = link.toPos.x, y2 = link.toPos.y;
          const cpx = (x1 + x2) / 2 + ((i % 2 === 0 ? 1 : -1) * 15);
          const cpy = (y1 + y2) / 2 - 20;

          return (
            <g key={i}>
              <path d={`M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`}
                stroke="rgba(138, 180, 216, 0.07)" strokeWidth="6" fill="none" className="ww-string-glow" />
              <path d={`M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`}
                stroke="rgba(138, 180, 216, 0.22)" strokeWidth="1.5" fill="none" className="ww-string-line" />
            </g>
          );
        })}

        {/* Active drag line */}
        {dragging && (() => {
          const from = words.find(w => w.id === dragging.id);
          if (!from) return null;
          const startX = dragging.startX + 55;
          const startY = dragging.startY + 20;
          const endX = from.x + 55;
          const endY = from.y + 20;
          return (
            <line x1={startX} y1={startY} x2={endX} y2={endY}
              stroke="rgba(138, 180, 216, 0.35)" strokeWidth="1.5" strokeDasharray="6 8"
              className="ww-active-string" />
          );
        })()}
      </svg>

      {/* Words on the water */}
      {phase !== 'intro' && words.map((word) => (
        <div
          key={word.id}
          className={[
            'ww-word',
            word.isOriginal ? 'original' : 'emerged',
            word.linked ? 'linked' : '',
            word.fading ? 'fading' : '',
            dragging?.id === word.id ? 'dragging' : '',
            nearTarget === word.id ? 'near-target' : '',
            word.isOriginal && !word.linked && phase === 'weaving' ? 'linkable' : '',
            word.isEmerged && !allPaired ? 'ghostly' : '',
            word.isEmerged && allPaired ? 'solidifying' : '',
          ].filter(Boolean).join(' ')}
          style={{
            left: word.x,
            top: word.y,
            '--bob-y': `${word.bobY}px`,
            animationDelay: dragging?.id === word.id ? '0s, 99999s' : `0s, ${word.bobDelay}s`,
          }}
          onMouseDown={(e) => handleDragStart(word.id, e)}
          onTouchStart={(e) => handleDragStart(word.id, e)}
        >
          {word.text}
        </div>
      ))}

      {generating && (
        <div className="ww-generating">something is forming...</div>
      )}

      {phase === 'weaving' && (
        <div className="ww-progress">
          {totalRounds > 1 && (
            <span className="ww-round">Round {round} of {totalRounds}</span>
          )}
          <span>{remainingCount} {remainingCount === 1 ? 'word' : 'words'} waiting</span>
        </div>
      )}

      {phase === 'complete' && (
        <div className="ww-complete">
          <p className="ww-complete-text">New words have surfaced from your connections.</p>
        </div>
      )}
    </div>
  );
}
