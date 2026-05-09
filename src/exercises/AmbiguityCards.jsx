// ============================================================
// AMBIGUITY CARDS — Deep Dive Exercise
// AI generates abstract visual parameters from user's patterns.
// Client renders them as procedural SVGs.
// User says what they see — pure projection.
// This is a genuinely new projective instrument.
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWater } from '../components/WaterCanvas';
import { useSession } from '../contexts/SessionContext';
import { haptics } from '../systems/AudioSystem';
import './AmbiguityCards.css';

const TOTAL_CARDS = 5;

// ── Procedural SVG Renderer ──────────────────────────────
// Takes card parameters from Claude and renders abstract compositions

// Seeded random for reproducible visuals per card
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Color palettes
const PALETTES = {
  cold: [
    'rgba(80, 130, 180, 0.6)', 'rgba(100, 160, 200, 0.4)',
    'rgba(60, 100, 150, 0.7)', 'rgba(140, 180, 210, 0.3)',
    'rgba(40, 70, 110, 0.5)',
  ],
  warm: [
    'rgba(180, 140, 80, 0.6)', 'rgba(200, 160, 100, 0.4)',
    'rgba(160, 110, 60, 0.7)', 'rgba(210, 180, 140, 0.3)',
    'rgba(140, 90, 50, 0.5)',
  ],
  mixed: [
    'rgba(140, 100, 160, 0.5)', 'rgba(100, 160, 140, 0.4)',
    'rgba(180, 130, 100, 0.6)', 'rgba(80, 140, 180, 0.3)',
    'rgba(160, 140, 80, 0.5)',
  ],
  monochrome: [
    'rgba(160, 160, 160, 0.6)', 'rgba(120, 120, 120, 0.4)',
    'rgba(200, 200, 200, 0.3)', 'rgba(80, 80, 80, 0.7)',
    'rgba(180, 180, 180, 0.2)',
  ],
  deep: [
    'rgba(40, 60, 100, 0.7)', 'rgba(80, 50, 90, 0.5)',
    'rgba(30, 80, 70, 0.6)', 'rgba(100, 70, 50, 0.4)',
    'rgba(50, 40, 80, 0.6)',
  ],
};

function generateBlobPath(cx, cy, radius, irregularity, rand) {
  const points = 8 + Math.floor(rand() * 5);
  const pts = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (0.7 + rand() * irregularity * 0.6);
    pts.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }

  // Smooth closed path with quadratic beziers
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length; i++) {
    const next = pts[(i + 1) % pts.length];
    const midX = (pts[i].x + next.x) / 2;
    const midY = (pts[i].y + next.y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${midX} ${midY}`;
  }
  d += ' Z';
  return d;
}

function generateSpiralPath(cx, cy, radius, turns, rand) {
  let d = `M ${cx} ${cy}`;
  const steps = turns * 20;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    const r = t * radius + rand() * 5;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    d += ` L ${x} ${y}`;
  }
  return d;
}

function generateWavePath(x1, y1, x2, y2, amplitude, rand) {
  const steps = 12;
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const baseY = y1 + (y2 - y1) * t;
    const wave = Math.sin(t * Math.PI * 3 + rand() * 2) * amplitude;
    d += ` L ${x} ${baseY + wave}`;
  }
  return d;
}

function renderForm(form, cardWidth, cardHeight, palette, rand) {
  const cx = form.x * cardWidth;
  const cy = form.y * cardHeight;
  const scale = form.scale || 1;
  const opacity = form.opacity || 0.5;
  const color = palette[Math.floor(rand() * palette.length)];
  const baseSize = Math.min(cardWidth, cardHeight) * 0.12 * scale;

  switch (form.type) {
    case 'blob':
      return (
        <path
          key={`${form.type}-${cx}-${cy}`}
          d={generateBlobPath(cx, cy, baseSize, form.scale, rand)}
          fill={color}
          opacity={opacity}
          transform={`rotate(${form.rotation || 0} ${cx} ${cy})`}
        />
      );

    case 'line':
      return (
        <line
          key={`${form.type}-${cx}-${cy}`}
          x1={cx - baseSize}
          y1={cy}
          x2={cx + baseSize}
          y2={cy + (rand() - 0.5) * baseSize}
          stroke={color}
          strokeWidth={1 + rand() * 2}
          opacity={opacity}
          strokeLinecap="round"
          transform={`rotate(${form.rotation || 0} ${cx} ${cy})`}
        />
      );

    case 'dot_cluster': {
      const dots = 5 + Math.floor(rand() * 10);
      return (
        <g key={`${form.type}-${cx}-${cy}`} opacity={opacity}>
          {Array.from({ length: dots }).map((_, i) => (
            <circle
              key={i}
              cx={cx + (rand() - 0.5) * baseSize * 2}
              cy={cy + (rand() - 0.5) * baseSize * 2}
              r={1 + rand() * 4}
              fill={palette[Math.floor(rand() * palette.length)]}
            />
          ))}
        </g>
      );
    }

    case 'spiral':
      return (
        <path
          key={`${form.type}-${cx}-${cy}`}
          d={generateSpiralPath(cx, cy, baseSize, 2 + rand() * 2, rand)}
          fill="none"
          stroke={color}
          strokeWidth={1 + rand() * 1.5}
          opacity={opacity}
          strokeLinecap="round"
        />
      );

    case 'crack': {
      const segments = 4 + Math.floor(rand() * 4);
      let d = `M ${cx} ${cy}`;
      let x = cx, y = cy;
      for (let i = 0; i < segments; i++) {
        x += (rand() - 0.4) * baseSize * 0.8;
        y += rand() * baseSize * 0.6;
        d += ` L ${x} ${y}`;
      }
      return (
        <path
          key={`${form.type}-${cx}-${cy}`}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={0.5 + rand() * 1.5}
          opacity={opacity}
          strokeLinecap="round"
        />
      );
    }

    case 'wave':
      return (
        <path
          key={`${form.type}-${cx}-${cy}`}
          d={generateWavePath(
            cx - baseSize, cy,
            cx + baseSize, cy + (rand() - 0.5) * baseSize,
            baseSize * 0.4, rand
          )}
          fill="none"
          stroke={color}
          strokeWidth={1 + rand() * 2}
          opacity={opacity}
          strokeLinecap="round"
        />
      );

    case 'void':
      return (
        <circle
          key={`${form.type}-${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={baseSize * 0.8}
          fill="rgba(8, 14, 28, 0.9)"
          stroke={color}
          strokeWidth={0.5}
          opacity={opacity}
        />
      );

    case 'tendril': {
      const length = baseSize * 2;
      let d = `M ${cx} ${cy}`;
      let x = cx, y = cy;
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        x += (Math.cos(t * Math.PI * 3 + rand()) * length * 0.15);
        y -= length * 0.12 + rand() * 5;
        d += ` Q ${x + rand() * 10} ${y + rand() * 10} ${x} ${y}`;
      }
      return (
        <path
          key={`${form.type}-${cx}-${cy}`}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={0.8 + rand() * 1.5}
          opacity={opacity}
          strokeLinecap="round"
        />
      );
    }

    case 'arch': {
      const archWidth = baseSize * 1.5;
      const archHeight = baseSize * 1.2;
      return (
        <path
          key={`${form.type}-${cx}-${cy}`}
          d={`M ${cx - archWidth} ${cy + archHeight} Q ${cx} ${cy - archHeight} ${cx + archWidth} ${cy + archHeight}`}
          fill="none"
          stroke={color}
          strokeWidth={1.5 + rand() * 2}
          opacity={opacity}
          strokeLinecap="round"
          transform={`rotate(${form.rotation || 0} ${cx} ${cy})`}
        />
      );
    }

    case 'nest': {
      const layers = 3 + Math.floor(rand() * 3);
      return (
        <g key={`${form.type}-${cx}-${cy}`} opacity={opacity}>
          {Array.from({ length: layers }).map((_, i) => (
            <path
              key={i}
              d={generateBlobPath(cx, cy, baseSize * (0.5 + i * 0.25), 1.2 + i * 0.2, rand)}
              fill="none"
              stroke={palette[i % palette.length]}
              strokeWidth={0.5 + rand()}
            />
          ))}
        </g>
      );
    }

    default:
      return null;
  }
}

// ── Card SVG Component ───────────────────────────────────
function CardSVG({ card, index }) {
  const width = 320;
  const height = 420;
  const seed = hashString(card.seed_word + index);
  const rand = seededRandom(seed);
  const palette = PALETTES[card.palette] || PALETTES.deep;

  // Background gradient based on mood
  const bgGradients = {
    tension: ['rgba(30, 20, 40, 1)', 'rgba(50, 30, 35, 1)'],
    release: ['rgba(20, 30, 40, 1)', 'rgba(25, 40, 50, 1)'],
    threshold: ['rgba(25, 25, 35, 1)', 'rgba(35, 30, 40, 1)'],
    depth: ['rgba(15, 20, 35, 1)', 'rgba(20, 25, 45, 1)'],
    emergence: ['rgba(25, 30, 35, 1)', 'rgba(30, 35, 40, 1)'],
  };

  const [bgTop, bgBottom] = bgGradients[card.mood] || bgGradients.depth;
  const gradientId = `bg-${index}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="ac-card-svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bgTop} />
          <stop offset="100%" stopColor={bgBottom} />
        </linearGradient>
        <filter id={`blur-${index}`}>
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* Background */}
      <rect width={width} height={height} rx="12" fill={`url(#${gradientId})`} />

      {/* Subtle texture — random fine dots */}
      <g opacity="0.08">
        {Array.from({ length: 40 }).map((_, i) => (
          <circle
            key={`tex-${i}`}
            cx={rand() * width}
            cy={rand() * height}
            r={0.3 + rand() * 0.8}
            fill="white"
          />
        ))}
      </g>

      {/* Render each form */}
      {(card.forms || []).map((form, fi) =>
        renderForm(form, width, height, palette, seededRandom(seed + fi * 1000 + 1))
      )}

      {/* Vignette */}
      <rect
        width={width}
        height={height}
        rx="12"
        fill="none"
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="20"
        style={{ filter: `url(#blur-${index})` }}
      />
    </svg>
  );
}


// ── Fallback cards if API fails ──────────────────────────
const FALLBACK_CARDS = [
  {
    seed_word: 'threshold',
    mood: 'threshold',
    density: 0.5,
    symmetry: 0.3,
    organic: 0.8,
    vertical_weight: 0.2,
    palette: 'deep',
    forms: [
      { type: 'arch', x: 0.5, y: 0.4, scale: 1.5, rotation: 0, opacity: 0.5 },
      { type: 'void', x: 0.5, y: 0.6, scale: 0.8, rotation: 0, opacity: 0.6 },
      { type: 'dot_cluster', x: 0.3, y: 0.3, scale: 0.6, rotation: 0, opacity: 0.4 },
      { type: 'tendril', x: 0.7, y: 0.7, scale: 0.7, rotation: 45, opacity: 0.3 },
    ],
  },
  {
    seed_word: 'tension',
    mood: 'tension',
    density: 0.7,
    symmetry: 0.1,
    organic: 0.6,
    vertical_weight: -0.5,
    palette: 'warm',
    forms: [
      { type: 'crack', x: 0.4, y: 0.2, scale: 1.2, rotation: 15, opacity: 0.6 },
      { type: 'blob', x: 0.6, y: 0.5, scale: 1.0, rotation: 0, opacity: 0.4 },
      { type: 'line', x: 0.3, y: 0.7, scale: 1.5, rotation: -20, opacity: 0.5 },
      { type: 'dot_cluster', x: 0.7, y: 0.3, scale: 0.5, rotation: 0, opacity: 0.3 },
      { type: 'spiral', x: 0.5, y: 0.8, scale: 0.6, rotation: 0, opacity: 0.35 },
    ],
  },
  {
    seed_word: 'release',
    mood: 'release',
    density: 0.3,
    symmetry: 0.6,
    organic: 0.9,
    vertical_weight: 0.5,
    palette: 'cold',
    forms: [
      { type: 'wave', x: 0.5, y: 0.5, scale: 1.8, rotation: 0, opacity: 0.4 },
      { type: 'blob', x: 0.5, y: 0.3, scale: 0.7, rotation: 0, opacity: 0.3 },
      { type: 'tendril', x: 0.4, y: 0.6, scale: 0.5, rotation: 90, opacity: 0.25 },
    ],
  },
  {
    seed_word: 'depth',
    mood: 'depth',
    density: 0.6,
    symmetry: 0.4,
    organic: 0.7,
    vertical_weight: -0.3,
    palette: 'monochrome',
    forms: [
      { type: 'nest', x: 0.5, y: 0.45, scale: 1.2, rotation: 0, opacity: 0.5 },
      { type: 'void', x: 0.3, y: 0.7, scale: 0.5, rotation: 0, opacity: 0.4 },
      { type: 'crack', x: 0.7, y: 0.25, scale: 0.8, rotation: -30, opacity: 0.35 },
      { type: 'dot_cluster', x: 0.6, y: 0.75, scale: 0.4, rotation: 0, opacity: 0.3 },
    ],
  },
  {
    seed_word: 'emergence',
    mood: 'emergence',
    density: 0.5,
    symmetry: 0.5,
    organic: 0.85,
    vertical_weight: 0.4,
    palette: 'mixed',
    forms: [
      { type: 'spiral', x: 0.5, y: 0.45, scale: 1.3, rotation: 0, opacity: 0.5 },
      { type: 'blob', x: 0.35, y: 0.3, scale: 0.6, rotation: 30, opacity: 0.35 },
      { type: 'tendril', x: 0.6, y: 0.6, scale: 0.9, rotation: -15, opacity: 0.4 },
      { type: 'wave', x: 0.5, y: 0.8, scale: 1.0, rotation: 0, opacity: 0.25 },
    ],
  },
];


// ── Main Component ───────────────────────────────────────
export default function AmbiguityCards({ onComplete, audioSystem }) {
  const waterRef = useWater();
  const { session, dispatch } = useSession();
  const inputRef = useRef(null);

  const [phase, setPhase] = useState('loading'); // loading | intro | viewing | responding | complete
  const [introVisible, setIntroVisible] = useState(false);
  const [cards, setCards] = useState([]);
  const [currentCard, setCurrentCard] = useState(0);
  const [response, setResponse] = useState('');
  const [interpretations, setInterpretations] = useState([]);
  const [cardVisible, setCardVisible] = useState(false);

  // Load cards from API
  useEffect(() => {
    async function loadCards() {
      try {
        const API_URL = 'https://revesvoir-api.nicole-scheid.workers.dev';
        const res = await fetch(`${API_URL}/generate-cards`, {
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
          if (data.cards && data.cards.length > 0) {
            setCards(data.cards);
          } else {
            setCards(FALLBACK_CARDS);
          }
        } else {
          setCards(FALLBACK_CARDS);
        }
      } catch (err) {
        console.log('Cards API unavailable:', err);
        setCards(FALLBACK_CARDS);
      }

      setPhase('intro');
      setTimeout(() => setIntroVisible(true), 300);
    }

    loadCards();
  }, []);

  const handleReady = useCallback(() => {
    setPhase('viewing');
    setCardVisible(false);
    setTimeout(() => setCardVisible(true), 100);

    const water = waterRef?.current;
    if (water) water.createRipple(window.innerWidth / 2, window.innerHeight / 2, 0.5);
    haptics.tap();
  }, []);

  const handleRespond = useCallback(() => {
    setPhase('responding');
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const handleSubmitResponse = useCallback(() => {
    if (!response.trim()) return;

    const card = cards[currentCard];
    const newInterpretation = {
      cardIndex: currentCard,
      text: response.trim(),
      mood: card?.mood || 'unknown',
      seed_word: card?.seed_word || 'unknown',
    };

    const updated = [...interpretations, newInterpretation];
    setInterpretations(updated);
    setResponse('');

    haptics.pulse();
    if (audioSystem) audioSystem.playLink();

    const water = waterRef?.current;
    if (water) water.createRipple(window.innerWidth / 2, window.innerHeight / 2, 0.4);

    if (currentCard < cards.length - 1) {
      // Next card
      setCardVisible(false);
      setTimeout(() => {
        setCurrentCard(prev => prev + 1);
        setPhase('viewing');
        setTimeout(() => setCardVisible(true), 100);
      }, 800);
    } else {
      // All cards done
      setPhase('complete');
      haptics.reveal();
      if (audioSystem) audioSystem.playReveal();
      if (water) water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 1);

      // Dispatch exercise complete
      dispatch({
        type: 'COMPLETE_EXERCISE',
        payload: {
          data: {
            interpretations: updated,
            cardCount: cards.length,
          },
        },
      });

      setTimeout(() => onComplete({
        type: 'ambiguity-cards',
        data: { interpretations: updated },
      }), 3500);
    }
  }, [response, currentCard, cards, interpretations, dispatch, onComplete, audioSystem]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitResponse();
    }
  }, [handleSubmitResponse]);

  return (
    <div className="ambiguity-cards">
      {/* Loading */}
      {phase === 'loading' && (
        <div className="ac-loading">
          <p>Generating cards from your patterns...</p>
        </div>
      )}

      {/* Intro */}
      {phase === 'intro' && (
        <div className={`ac-intro ${introVisible ? 'visible' : ''}`}>
          <h2 className="ac-intro-title">Ambiguity Cards</h2>
          <p className="ac-intro-subtitle">Projection</p>
          <div className="ac-intro-body">
            <p className="ac-intro-line" style={{ animationDelay: '0.8s' }}>
              Five images will appear. They mean nothing specific.
            </p>
            <p className="ac-intro-line" style={{ animationDelay: '1.4s' }}>
              Look at each one and say what you see.
            </p>
            <p className="ac-intro-line" style={{ animationDelay: '2.0s' }}>
              Whatever comes to mind first — that's the answer.
            </p>
          </div>
          <button className="exercise-ready-btn" onClick={handleReady}>
            Show me
          </button>
        </div>
      )}

      {/* Card viewing */}
      {phase === 'viewing' && cards[currentCard] && (
        <div className="ac-card-view">
          <div className="ac-card-progress">
            {currentCard + 1} of {cards.length}
          </div>

          <div className={`ac-card-container ${cardVisible ? 'visible' : ''}`}>
            <CardSVG card={cards[currentCard]} index={currentCard} />
          </div>

          <button className="ac-respond-btn" onClick={handleRespond}>
            I see something
          </button>
        </div>
      )}

      {/* Response input */}
      {phase === 'responding' && cards[currentCard] && (
        <div className="ac-respond-view">
          <div className="ac-card-small">
            <CardSVG card={cards[currentCard]} index={currentCard} />
          </div>

          <div className="ac-respond-area">
            <p className="ac-respond-prompt">What do you see?</p>
            <textarea
              ref={inputRef}
              className="ac-respond-input"
              value={response}
              onChange={e => setResponse(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="A shape, a feeling, a memory..."
              maxLength={300}
              rows={3}
            />
            <button
              className="ac-submit-btn"
              onClick={handleSubmitResponse}
              disabled={!response.trim()}
            >
              {currentCard < cards.length - 1 ? 'Next card' : 'Finish'}
            </button>
          </div>
        </div>
      )}

      {/* Complete */}
      {phase === 'complete' && (
        <div className="ac-complete">
          <p className="ac-complete-text">
            Five cards. Five projections.
          </p>
          <p className="ac-complete-sub">
            What you saw was never in the images.
          </p>
        </div>
      )}
    </div>
  );
}
