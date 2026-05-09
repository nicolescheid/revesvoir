// ============================================================
// RÊVESVOIR — Main Application
// Orchestrates: Arrival → Circling → 3x Word Weaving →
//   Pile Sort → Timed Write → Synthesis → [Go Deeper] → Shore
// Water canvas persists beneath everything
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import WaterCanvas, { useWater } from './components/WaterCanvas';
import Arrival from './components/Arrival';
import Circling from './components/Circling';
import WordWeaving from './exercises/WordWeaving';
import PileSort from './exercises/PileSort';
import TimedWrite from './exercises/TimedWrite';
import AmbiguityCards from './exercises/AmbiguityCards';
import SentenceCompletion from './exercises/SentenceCompletion';
import { SessionProvider, useSession } from './contexts/SessionContext';
import { AudioSystem, haptics } from './systems/AudioSystem';
import './styles/global.css';
import './App.css';

const TOTAL_WEAVING_ROUNDS = 3;
const API_BASE = 'https://revesvoir-api.nicole-scheid.workers.dev';

function AppInner() {
  const { session, dispatch, generateSynthesis, generateDeepSynthesis } = useSession();
  const waterRef = useWater();
  const audioRef = useRef(null);

  const [view, setView] = useState('arrival');
  const [emergedWords, setEmergedWords] = useState([]);
  const [usedSeedWords, setUsedSeedWords] = useState([]);
  const [weavingRound, setWeavingRound] = useState(1);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [synthesisData, setSynthesisData] = useState(null);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisPage, setSynthesisPage] = useState(0); // 0=question, 1=answer, 2=fullText, 3=choice
  const [bottleText, setBottleText] = useState('');
  const [bottleSent, setBottleSent] = useState(false);
  const [bottleSending, setBottleSending] = useState(false);

  // Deep dive state
  const [deepExercises, setDeepExercises] = useState([]); // completed deep exercises
  const [deepSynthesisData, setDeepSynthesisData] = useState(null);
  const [deepSynthesisLoading, setDeepSynthesisLoading] = useState(false);
  const [deepSynthesisPage, setDeepSynthesisPage] = useState(0);

  // Initialize audio on first user interaction
  const initAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new AudioSystem();
    }
    if (!audioInitialized) {
      audioRef.current.init();
      audioRef.current.resume();
      audioRef.current.startDrone();
      setAudioInitialized(true);
    }
  }, [audioInitialized]);

  // === VIEW TRANSITIONS ===
  const handleArrivalEnter = useCallback(() => {
    initAudio();
    setView('circling');
  }, [initAudio]);

  const handleCirclingComplete = useCallback(() => {
    setTimeout(() => {
      setWeavingRound(1);
      dispatch({ type: 'START_EXERCISE', payload: { type: 'word-weaving' } });
      setView('exercise-word-weaving');
    }, 2000);
  }, [dispatch]);

  // Word Weaving: accumulate words across rounds
  const handleWordWeavingComplete = useCallback((emerged, seedWordsUsed) => {
    const allEmerged = [...emergedWords, ...emerged];
    setEmergedWords(allEmerged);
    if (seedWordsUsed) {
      setUsedSeedWords(prev => [...prev, ...seedWordsUsed]);
    }

    if (weavingRound < TOTAL_WEAVING_ROUNDS) {
      setView('weaving-collection');
    } else {
      setTimeout(() => {
        dispatch({ type: 'START_EXERCISE', payload: { type: 'pile-sort' } });
        setView('exercise-pile-sort');
      }, 2500);
    }
  }, [emergedWords, weavingRound, dispatch]);

  // Continue to next weaving round from collection view
  const handleNextWeavingRound = useCallback(() => {
    const nextRound = weavingRound + 1;
    setWeavingRound(nextRound);
    dispatch({ type: 'START_EXERCISE', payload: { type: 'word-weaving' } });
    setView('exercise-word-weaving');
  }, [weavingRound, dispatch]);

  const handlePileSortComplete = useCallback(() => {
    setTimeout(() => {
      dispatch({ type: 'START_EXERCISE', payload: { type: 'timed-write' } });
      setView('exercise-timed-write');
    }, 2500);
  }, [dispatch]);

  const handleTimedWriteComplete = useCallback(async () => {
    setView('synthesis');
    setSynthesisLoading(true);
    setSynthesisPage(0);

    const result = await generateSynthesis();
    setSynthesisData(result);
    setSynthesisLoading(false);

    haptics.reveal();
    if (audioRef.current) audioRef.current.playReveal();

    const water = waterRef?.current;
    if (water) {
      water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 1.5);
    }
  }, [generateSynthesis]);

  // Synthesis pagination — page 3 is now the "go deeper?" choice
  const handleSynthesisContinue = useCallback(() => {
    const nextPage = synthesisPage + 1;
    setSynthesisPage(nextPage);

    haptics.tap();
    if (audioRef.current) audioRef.current.playEmerge();

    const water = waterRef?.current;
    if (water) {
      water.createRipple(window.innerWidth / 2, window.innerHeight * 0.4, 0.5);
    }
  }, [synthesisPage]);

  // "Go deeper" — enter deep dive flow
  const handleGoDeeper = useCallback(() => {
    setDeepExercises([]);
    dispatch({ type: 'START_EXERCISE', payload: { type: 'ambiguity-cards' } });
    setView('exercise-ambiguity-cards');

    haptics.pulse();
    const water = waterRef?.current;
    if (water) water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 0.8);
  }, [dispatch]);

  // Ambiguity Cards complete → Sentence Completion
  const handleCardsComplete = useCallback((result) => {
    setDeepExercises(prev => [...prev, result]);
    setTimeout(() => {
      dispatch({ type: 'START_EXERCISE', payload: { type: 'sentence-completion' } });
      setView('exercise-sentence-completion');
    }, 500);
  }, [dispatch]);

  // Sentence Completion complete → Deep Synthesis
  const handleSentenceComplete = useCallback(async (result) => {
    const allDeep = [...deepExercises, result];
    setDeepExercises(allDeep);

    setView('deep-synthesis');
    setDeepSynthesisLoading(true);
    setDeepSynthesisPage(0);

    const deepResult = await generateDeepSynthesis(allDeep);
    setDeepSynthesisData(deepResult);
    setDeepSynthesisLoading(false);

    haptics.reveal();
    if (audioRef.current) audioRef.current.playReveal();

    const water = waterRef?.current;
    if (water) water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 1.5);
  }, [deepExercises, generateDeepSynthesis]);

  // Deep synthesis pagination
  const handleDeepSynthesisContinue = useCallback(() => {
    setDeepSynthesisPage(prev => prev + 1);
    haptics.tap();
    if (audioRef.current) audioRef.current.playEmerge();
  }, []);

  // Shore bottle
  const handleSendBottle = useCallback(async () => {
    if (!bottleText.trim() || bottleSending) return;

    setBottleSending(true);
    try {
      await fetch(`${API_BASE}/shore/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: bottleText.trim(),
          author: 'anonymous',
        }),
      });
      setBottleSent(true);
    } catch (err) {
      // Still mark as sent so they're not stuck
      setBottleSent(true);
    }
    setBottleSending(false);

    haptics.reveal();
    const water = waterRef?.current;
    if (water) {
      water.createRippleCascade(window.innerWidth / 2, window.innerHeight / 2, 1);
    }
  }, [bottleText, bottleSending]);

  const handleToggleMute = useCallback(() => {
    if (audioRef.current) {
      const muted = audioRef.current.toggleMute();
      setAudioMuted(muted);
    }
  }, []);

  const handleNewSession = useCallback(() => {
    dispatch({ type: 'RESET' });
    setView('arrival');
    setEmergedWords([]);
    setUsedSeedWords([]);
    setWeavingRound(1);
    setSynthesisData(null);
    setSynthesisPage(0);
    setBottleText('');
    setBottleSent(false);
    setDeepExercises([]);
    setDeepSynthesisData(null);
    setDeepSynthesisPage(0);
  }, [dispatch]);

  return (
    <>
      {/* Views */}
      {view === 'arrival' && (
        <Arrival onEnter={handleArrivalEnter} />
      )}

      {view === 'circling' && (
        <Circling onComplete={handleCirclingComplete} />
      )}

      {view === 'exercise-word-weaving' && (
        <WordWeaving
          key={`weaving-${weavingRound}`}
          onComplete={handleWordWeavingComplete}
          audioSystem={audioRef.current}
          round={weavingRound}
          totalRounds={TOTAL_WEAVING_ROUNDS}
          usedWords={usedSeedWords}
        />
      )}

      {/* Collection view between weaving rounds */}
      {view === 'weaving-collection' && (
        <div className="collection-view">
          <div className="collection-inner">
            <p className="collection-round">
              Round {weavingRound} of {TOTAL_WEAVING_ROUNDS} complete
            </p>
            <p className="collection-count">
              {emergedWords.length} words have surfaced
            </p>
            <div className="collection-words">
              {emergedWords.map((word, i) => (
                <span key={i} className="collection-word">{word}</span>
              ))}
            </div>
            <p className="collection-prompt">
              {weavingRound < TOTAL_WEAVING_ROUNDS
                ? "Let's find more."
                : "These are yours now."}
            </p>
            <button className="collection-btn" onClick={handleNextWeavingRound}>
              Continue
            </button>
          </div>
        </div>
      )}

      {view === 'exercise-pile-sort' && (
        <PileSort
          emergedWords={emergedWords}
          onComplete={handlePileSortComplete}
          audioSystem={audioRef.current}
        />
      )}

      {view === 'exercise-timed-write' && (
        <TimedWrite
          onComplete={handleTimedWriteComplete}
          audioSystem={audioRef.current}
        />
      )}

      {/* Deep dive exercises */}
      {view === 'exercise-ambiguity-cards' && (
        <AmbiguityCards
          onComplete={handleCardsComplete}
          audioSystem={audioRef.current}
        />
      )}

      {view === 'exercise-sentence-completion' && (
        <SentenceCompletion
          onComplete={handleSentenceComplete}
          audioSystem={audioRef.current}
        />
      )}

      {/* Synthesis — paginated reveal */}
      {view === 'synthesis' && (
        <div className="synthesis-view">
          {synthesisLoading ? (
            <div className="synthesis-loading">
              <p className="synthesis-loading-text">
                The water is distilling...
              </p>
              <p className="synthesis-loading-sub">
                Reading the patterns across everything you did.
              </p>
            </div>
          ) : synthesisData ? (
            <div className="synthesis-reveal">

              {/* Page 0: The Question */}
              {synthesisPage >= 0 && (
                <div className={`synthesis-section ${synthesisPage === 0 ? 'current' : 'revealed'}`}>
                  <p className="synthesis-label">The question you're carrying:</p>
                  <p className="synthesis-question">{synthesisData.question}</p>
                  {synthesisPage === 0 && (
                    <button className="synthesis-continue" onClick={handleSynthesisContinue}>
                      Continue
                    </button>
                  )}
                </div>
              )}

              {/* Page 1: The Answer */}
              {synthesisPage >= 1 && (
                <div className={`synthesis-section ${synthesisPage === 1 ? 'current' : 'revealed'}`}>
                  <p className="synthesis-label">What you already know about the answer:</p>
                  <p className="synthesis-answer">{synthesisData.answer}</p>
                  {synthesisPage === 1 && (
                    <button className="synthesis-continue" onClick={handleSynthesisContinue}>
                      Continue
                    </button>
                  )}
                </div>
              )}

              {/* Page 2: Full Reflection */}
              {synthesisPage >= 2 && synthesisData.fullText && (
                <div className={`synthesis-section ${synthesisPage === 2 ? 'current' : 'revealed'}`}>
                  <p className="synthesis-full-text">{synthesisData.fullText}</p>
                  {synthesisPage === 2 && (
                    <button className="synthesis-continue" onClick={handleSynthesisContinue}>
                      Continue
                    </button>
                  )}
                </div>
              )}

              {/* Page 3: The Choice — go deeper or finish */}
              {synthesisPage >= 3 && (
                <div className="synthesis-section current choice-section">
                  <div className="choice-area">
                    <p className="choice-prompt">
                      Would you like to go deeper?
                    </p>
                    <p className="choice-sub">
                      Two more exercises can take you beneath what just surfaced.
                    </p>
                    <div className="choice-buttons">
                      <button className="choice-btn choice-deeper" onClick={handleGoDeeper}>
                        Go deeper
                      </button>
                      <button className="choice-btn choice-shore" onClick={() => setSynthesisPage(4)}>
                        Leave a message instead
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Page 4: Shore Bottle (if they chose not to go deeper) */}
              {synthesisPage >= 4 && (
                <div className="synthesis-section current bottle-section">
                  <div className="bottle-area">
                    <p className="bottle-title">Message in a Bottle</p>
                    <p className="bottle-prompt">
                      Leave something on the shore — a word, a thought,<br />
                      a fragment of what surfaced. Others will find it.
                    </p>

                    {!bottleSent ? (
                      <>
                        <textarea
                          className="bottle-textarea"
                          value={bottleText}
                          onChange={(e) => setBottleText(e.target.value)}
                          placeholder="What would you leave behind?"
                          maxLength={500}
                          autoFocus
                        />
                        <div className="bottle-actions">
                          <button
                            className="bottle-send"
                            onClick={handleSendBottle}
                            disabled={!bottleText.trim() || bottleSending}
                          >
                            {bottleSending ? 'Casting into the water...' : 'Cast into the water'}
                          </button>
                          <button className="bottle-skip" onClick={handleNewSession}>
                            Skip — begin again
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="bottle-sent">
                        <p className="bottle-sent-text">
                          Your message drifts on the water now.<br />
                          Others will find it on the shore.
                        </p>
                        <button className="synthesis-btn" onClick={handleNewSession}>
                          Begin again
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="synthesis-fallback">
              <p className="synthesis-fallback-text">
                The patterns are still forming.<br />
                Your mind has been active — trust what surfaced.
              </p>
              <button className="synthesis-btn" onClick={handleNewSession}>
                Begin again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Deep Synthesis — after "go deeper" exercises */}
      {view === 'deep-synthesis' && (
        <div className="synthesis-view deep">
          {deepSynthesisLoading ? (
            <div className="synthesis-loading">
              <p className="synthesis-loading-text">
                Reaching further down...
              </p>
              <p className="synthesis-loading-sub">
                Reading what the deeper exercises uncovered.
              </p>
            </div>
          ) : deepSynthesisData ? (
            <div className="synthesis-reveal">

              {/* Page 0: The Revelation */}
              {deepSynthesisPage >= 0 && (
                <div className={`synthesis-section ${deepSynthesisPage === 0 ? 'current' : 'revealed'}`}>
                  <p className="synthesis-label">Beneath the surface:</p>
                  <p className="synthesis-question">{deepSynthesisData.revelation}</p>
                  {deepSynthesisPage === 0 && (
                    <button className="synthesis-continue" onClick={handleDeepSynthesisContinue}>
                      Continue
                    </button>
                  )}
                </div>
              )}

              {/* Page 1: Full Deep Reflection */}
              {deepSynthesisPage >= 1 && deepSynthesisData.fullText && (
                <div className={`synthesis-section ${deepSynthesisPage === 1 ? 'current' : 'revealed'}`}>
                  <p className="synthesis-full-text">{deepSynthesisData.fullText}</p>
                  {deepSynthesisPage === 1 && (
                    <button className="synthesis-continue" onClick={handleDeepSynthesisContinue}>
                      Continue
                    </button>
                  )}
                </div>
              )}

              {/* Page 2: Closing + Bottle */}
              {deepSynthesisPage >= 2 && (
                <div className="synthesis-section current">
                  {deepSynthesisData.closing && (
                    <p className="deep-closing">{deepSynthesisData.closing}</p>
                  )}

                  <div className="bottle-area" style={{ marginTop: '2em' }}>
                    <p className="bottle-prompt">
                      Leave something on the shore before you go.
                    </p>

                    {!bottleSent ? (
                      <>
                        <textarea
                          className="bottle-textarea"
                          value={bottleText}
                          onChange={(e) => setBottleText(e.target.value)}
                          placeholder="What would you leave behind?"
                          maxLength={500}
                          autoFocus
                        />
                        <div className="bottle-actions">
                          <button
                            className="bottle-send"
                            onClick={handleSendBottle}
                            disabled={!bottleText.trim() || bottleSending}
                          >
                            {bottleSending ? 'Casting into the water...' : 'Cast into the water'}
                          </button>
                          <button className="bottle-skip" onClick={handleNewSession}>
                            Skip — begin again
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="bottle-sent">
                        <p className="bottle-sent-text">
                          Your message drifts on the water now.<br />
                          Others will find it on the shore.
                        </p>
                        <button className="synthesis-btn" onClick={handleNewSession}>
                          Begin again
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="synthesis-fallback">
              <p className="synthesis-fallback-text">
                Something stirred but didn't fully surface.<br />
                Trust what you felt during the exercises.
              </p>
              <button className="synthesis-btn" onClick={handleNewSession}>
                Begin again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Persistent UI */}
      {view !== 'arrival' && (
        <>
          <div className="app-wordmark">
            RÊVESVOIR <span className="app-beta">BETA</span>
          </div>

          <button
            className="app-audio-toggle"
            onClick={handleToggleMute}
            aria-label={audioMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {audioMuted ? '🔇' : '🔊'}
          </button>
        </>
      )}
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <WaterCanvas>
        <AppInner />
      </WaterCanvas>
    </SessionProvider>
  );
}
