// ============================================================
// Exercise Two: PILE SORT
// "I'm ready" button, persistent instructions overlay.
// Drag emerged words into intuitive groupings.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWater } from '../components/WaterCanvas';
import { useSession } from '../contexts/SessionContext';
import { haptics } from '../systems/AudioSystem';
import './PileSort.css';

const INSTRUCTIONS = {
  title: 'Pile Sort',
  subtitle: 'Intuitive Grouping',
  lines: [
    'These words emerged from your connections.',
    'Sort them into piles — as many or as few as feels right.',
    'Drag words close together to form a group.',
    'Some words might stand alone. That\'s data too.',
  ],
};

export default function PileSort({ emergedWords = [], onComplete, audioSystem }) {
  const waterRef = useWater();
  const { dispatch } = useSession();

  const [phase, setPhase] = useState('intro');
  const [introVisible, setIntroVisible] = useState(false);
  const [words, setWords] = useState([]);
  const [piles, setPiles] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showInstructions, setShowInstructions] = useState(false);

  // Initialize words
  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const padding = 80;

    const positioned = emergedWords.map((text, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const baseX = w * 0.2 + col * (w * 0.15);
      const baseY = h * 0.25 + row * 80;

      return {
        id: `pile-word-${i}`,
        text,
        x: Math.max(padding, Math.min(w - padding - 120, baseX + (Math.random() - 0.5) * 40)),
        y: Math.max(padding, Math.min(h - padding - 40, baseY + (Math.random() - 0.5) * 20)),
        pileId: null,
      };
    });

    setWords(positioned);
    setTimeout(() => setIntroVisible(true), 500);
  }, [emergedWords]);

  // User clicks "I'm ready"
  const handleReady = useCallback(() => {
    setPhase('appearing');

    const water = waterRef?.current;
    words.forEach((word, i) => {
      setTimeout(() => {
        if (water) water.createRipple(word.x + 50, word.y + 15, 0.25);
      }, i * 150);
    });

    setTimeout(() => setPhase('sorting'), words.length * 150 + 1000);
  }, [words]);

  const handleWordDown = useCallback((wordId, e) => {
    if (phase !== 'sorting') return;
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const word = words.find(w => w.id === wordId);
    if (!word) return;

    setDragging(wordId);
    setDragOffset({ x: clientX - word.x, y: clientY - word.y });
    haptics.tap();
  }, [words, phase]);

  const handleMove = useCallback((e) => {
    if (!dragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    setWords(prev => prev.map(w =>
      w.id === dragging ? { ...w, x: clientX - dragOffset.x, y: clientY - dragOffset.y } : w
    ));
  }, [dragging, dragOffset]);

  const handleUp = useCallback(() => {
    if (!dragging) return;

    const word = words.find(w => w.id === dragging);
    if (!word) { setDragging(null); return; }

    const SNAP_DISTANCE = 80;

    // Check proximity to existing piles
    let snappedToPile = null;
    for (const pile of piles) {
      const dx = word.x - pile.x;
      const dy = word.y - pile.y;
      if (Math.sqrt(dx * dx + dy * dy) < SNAP_DISTANCE + pile.words.length * 10) {
        snappedToPile = pile.id;
        break;
      }
    }

    if (snappedToPile) {
      setPiles(prev => prev.map(p =>
        p.id === snappedToPile ? { ...p, words: [...p.words, word.id] } : p
      ));
      setWords(prev => prev.map(w =>
        w.id === dragging ? { ...w, pileId: snappedToPile } : w
      ));
      haptics.tick();
      if (audioSystem) audioSystem.playTick();
    } else {
      const nearbyWord = words.find(w =>
        w.id !== dragging && !w.pileId &&
        Math.sqrt(Math.pow(w.x - word.x, 2) + Math.pow(w.y - word.y, 2)) < SNAP_DISTANCE
      );

      if (nearbyWord) {
        const newPileId = `pile-${Date.now()}`;
        const pileX = (word.x + nearbyWord.x) / 2;
        const pileY = (word.y + nearbyWord.y) / 2;

        setPiles(prev => [...prev, {
          id: newPileId,
          words: [nearbyWord.id, word.id],
          x: pileX, y: pileY,
        }]);

        setWords(prev => prev.map(w =>
          (w.id === dragging || w.id === nearbyWord.id) ? { ...w, pileId: newPileId } : w
        ));

        haptics.pulse();
        if (audioSystem) audioSystem.playLink();

        const water = waterRef?.current;
        if (water) water.createRipple(pileX + 50, pileY + 15, 0.4);
      }
    }

    setDragging(null);
  }, [dragging, words, piles, audioSystem]);

  const handleDone = useCallback(() => {
    setPhase('complete');
    haptics.reveal();
    if (audioSystem) audioSystem.playReveal();

    const water = waterRef?.current;
    if (water) water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 0.8);

    const pileData = piles.map(pile => ({
      words: pile.words.map(wId => words.find(w => w.id === wId)?.text).filter(Boolean),
    }));
    const unpiledWords = words.filter(w => !w.pileId).map(w => w.text);

    dispatch({
      type: 'COMPLETE_EXERCISE',
      payload: {
        data: {
          piles: pileData,
          unpiledWords,
          totalWords: words.length,
          numberOfPiles: piles.length + unpiledWords.length,
        },
      },
    });

    setTimeout(() => onComplete(), 3500);
  }, [piles, words, dispatch, onComplete, audioSystem]);

  const someSorted = piles.length > 0;
  const allSorted = words.length > 0 && words.every(w => w.pileId);

  return (
    <div
      className={`pile-sort ${phase}`}
      onMouseMove={handleMove}
      onTouchMove={handleMove}
      onMouseUp={handleUp}
      onTouchEnd={handleUp}
    >
      {/* INTRO with "I'm ready" */}
      {(phase === 'intro' || phase === 'appearing') && (
        <div className={`ps-intro ${introVisible ? 'visible' : ''} ${phase === 'appearing' ? 'dissolving' : ''}`}>
          <h2 className="ps-intro-title">{INSTRUCTIONS.title}</h2>
          <p className="ps-intro-subtitle">{INSTRUCTIONS.subtitle}</p>
          <div className="ps-intro-body">
            {INSTRUCTIONS.lines.map((line, i) => (
              <p key={i} className="ps-intro-line" style={{ animationDelay: `${0.8 + i * 0.6}s` }}>
                {line}
              </p>
            ))}
          </div>
          {phase === 'intro' && (
            <button className="exercise-ready-btn" onClick={handleReady}>
              I'm ready
            </button>
          )}
        </div>
      )}

      {/* Pile indicators */}
      {piles.map(pile => (
        <div key={pile.id} className="ps-pile-zone"
          style={{ left: pile.x - 30, top: pile.y - 20 }}>
          <span className="ps-pile-count">{pile.words.length}</span>
        </div>
      ))}

      {/* Words */}
      {phase !== 'intro' && words.map((word) => (
        <div
          key={word.id}
          className={[
            'ps-word',
            dragging === word.id ? 'dragging' : '',
            word.pileId ? 'piled' : '',
          ].filter(Boolean).join(' ')}
          style={{ left: word.x, top: word.y, zIndex: dragging === word.id ? 100 : 10 }}
          onMouseDown={(e) => handleWordDown(word.id, e)}
          onTouchStart={(e) => handleWordDown(word.id, e.nativeEvent)}
        >
          {word.text}
        </div>
      ))}

      {/* Done button */}
      {phase === 'sorting' && someSorted && (
        <div className="ps-done-area">
          <button className="ps-done-btn" onClick={handleDone}>
            {allSorted ? 'These feel right' : 'Done sorting'}
          </button>
          {!allSorted && (
            <p className="ps-done-hint">Some words stand alone — that's data too</p>
          )}
        </div>
      )}

      {phase === 'complete' && (
        <div className="ps-complete">
          <p className="ps-complete-text">
            {piles.length} {piles.length === 1 ? 'group' : 'groups'} formed.
            <br />The shape of your thinking is beginning to show.
          </p>
        </div>
      )}

      {/* PERSISTENT INSTRUCTIONS BUTTON */}
      {phase === 'sorting' && (
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
