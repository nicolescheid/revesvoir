// ============================================================
// REVESVOIR — Session Context
// Manages the full session state across all exercises
// Persists to localStorage, feeds forward to AI analysis
// ============================================================

import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';

const API_URL = 'https://revesvoir-api.nicole-scheid.workers.dev';

// === SESSION SHAPE ===
const initialSession = {
  id: null,                    // unique session ID
  startedAt: null,             // timestamp
  phase: 'arrival',            // arrival | circling | exercises | synthesis
  circling: null,              // null = not asked yet, string = stated concern, false = "find it for me"

  exercises: [],               // ordered array of completed exercise data
  currentExercise: null,       // { type, state, startedAt }

  // Running AI analysis — updated after each exercise
  patterns: {
    themes: [],                // recurring themes detected across exercises
    associations: [],          // word/concept pairs that keep appearing
    emotionalValence: null,    // overall emotional direction
    tension: null,             // what's being pushed away or toward
    convergence: null,         // what everything points at
  },

  // Final synthesis
  synthesis: null,             // { question, answer, fullText }

  // Passphrase persistence
  passphrase: null,
};

// === ACTIONS ===
function sessionReducer(state, action) {
  switch (action.type) {
    case 'START_SESSION':
      return {
        ...initialSession,
        id: generateId(),
        startedAt: Date.now(),
        phase: 'arrival',
      };

    case 'SET_CIRCLING':
      return {
        ...state,
        circling: action.payload, // string or false
        phase: 'exercises',
      };

    case 'START_EXERCISE':
      return {
        ...state,
        currentExercise: {
          type: action.payload.type,
          state: action.payload.initialState || {},
          startedAt: Date.now(),
        },
      };

    case 'UPDATE_EXERCISE':
      return {
        ...state,
        currentExercise: {
          ...state.currentExercise,
          state: {
            ...state.currentExercise?.state,
            ...action.payload,
          },
        },
      };

    case 'COMPLETE_EXERCISE':
      return {
        ...state,
        exercises: [
          ...state.exercises,
          {
            type: state.currentExercise.type,
            data: action.payload.data,
            analysis: action.payload.analysis || null,
            completedAt: Date.now(),
          },
        ],
        currentExercise: null,
      };

    case 'UPDATE_PATTERNS':
      return {
        ...state,
        patterns: {
          ...state.patterns,
          ...action.payload,
        },
      };

    case 'SET_SYNTHESIS':
      return {
        ...state,
        phase: 'synthesis',
        synthesis: action.payload,
      };

    case 'SET_PHASE':
      return {
        ...state,
        phase: action.payload,
      };

    case 'SET_PASSPHRASE':
      return {
        ...state,
        passphrase: action.payload,
      };

    case 'LOAD_SESSION':
      return {
        ...state,
        ...action.payload,
      };

    case 'RESET':
      return { ...initialSession };

    default:
      return state;
  }
}

// === CONTEXT ===
const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Persist to localStorage on every change
  useEffect(() => {
    if (session.id) {
      try {
        localStorage.setItem('revesvoir-session', JSON.stringify(session));
      } catch (e) {}
    }
  }, [session]);

  // Load on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('revesvoir-session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id) {
          dispatch({ type: 'LOAD_SESSION', payload: parsed });
        }
      }
    } catch (e) {}
  }, []);

  // === API HELPERS ===
  const analyzeExercise = useCallback(async (exerciseType, data) => {
    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseType,
          data,
          circling: sessionRef.current.circling,
          previousExercises: sessionRef.current.exercises.map(e => ({
            type: e.type,
            data: e.data,
            analysis: e.analysis,
          })),
          patterns: sessionRef.current.patterns,
        }),
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.log('Analysis API unavailable:', err);
    }
    return null;
  }, []);

  const generateSynthesis = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circling: sessionRef.current.circling,
          exercises: sessionRef.current.exercises.map(e => ({
            type: e.type,
            data: e.data,
            analysis: e.analysis,
          })),
          patterns: sessionRef.current.patterns,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        dispatch({ type: 'SET_SYNTHESIS', payload: result });
        return result;
      }
    } catch (err) {
      console.log('Synthesis API unavailable:', err);
    }
    return null;
  }, []);

  // Generate a prompt for the Timed Write based on patterns
  const generateWritePrompt = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/write-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circling: sessionRef.current.circling,
          exercises: sessionRef.current.exercises.map(e => ({
            type: e.type,
            data: e.data,
            analysis: e.analysis,
          })),
          patterns: sessionRef.current.patterns,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.prompt;
      }
    } catch (err) {
      console.log('Write prompt API unavailable:', err);
    }
    // Fallback prompts
    const fallbacks = [
      "Write about the space between what you want and what you're afraid of.",
      "Describe a door you keep not opening.",
      "Write about the thing you almost said but didn't.",
      "What does your mind do when nobody is watching?",
      "Write about something that changed without you noticing.",
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }, []);

  // Generate words for Exercise One
  const generateEmergentWord = useCallback(async (wordA, wordB) => {
    try {
      const response = await fetch(`${API_URL}/emerge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordA,
          wordB,
          circling: sessionRef.current.circling,
          existingWords: sessionRef.current.currentExercise?.state?.words || [],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.word;
      }
    } catch (err) {
      console.log('Emerge API unavailable:', err);
    }
    // Fallback: combine the words in an evocative way
    return fallbackEmerge(wordA, wordB);
  }, []);

  // Deep synthesis — second pass after "go deeper" exercises
  const generateDeepSynthesis = useCallback(async (deepExercises) => {
    try {
      const response = await fetch(`${API_URL}/deep-synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circling: sessionRef.current.circling,
          exercises: sessionRef.current.exercises.map(e => ({
            type: e.type,
            data: e.data,
            analysis: e.analysis,
          })),
          patterns: sessionRef.current.patterns,
          synthesis: sessionRef.current.synthesis,
          deepExercises,
        }),
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.log('Deep synthesis API unavailable:', err);
    }
    return null;
  }, []);

  const value = {
    session,
    dispatch,
    analyzeExercise,
    generateSynthesis,
    generateDeepSynthesis,
    generateWritePrompt,
    generateEmergentWord,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
}

// === UTILITIES ===
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fallbackEmerge(wordA, wordB) {
  // Simple but evocative fallback: blend the words
  const evocative = [
    'threshold', 'undertow', 'resonance', 'permission', 'becoming',
    'erosion', 'longing', 'clarity', 'gravity', 'emergence',
    'wildness', 'surrender', 'recognition', 'departure', 'anchor',
    'undercurrent', 'refusal', 'devotion', 'silence', 'vertigo',
    'origin', 'dissolve', 'inheritance', 'fracture', 'convergence',
  ];
  return evocative[Math.floor(Math.random() * evocative.length)];
}
