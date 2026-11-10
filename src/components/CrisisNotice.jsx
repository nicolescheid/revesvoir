// ============================================================
// CrisisNotice — shown instead of a reflection when what the
// visitor wrote suggests they may be in crisis.
// Copy agreed with Nicole; change it only with her approval.
// ============================================================

import { useEffect, useRef } from 'react';
import './CrisisNotice.css';

export default function CrisisNotice({ onEnd, onBack }) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="crisis-view" role="alertdialog" aria-labelledby="crisis-heading" aria-describedby="crisis-body">
      <div className="crisis-inner">
        <h1 id="crisis-heading" className="crisis-heading" tabIndex={-1} ref={headingRef}>
          Let's pause here.
        </h1>
        <div id="crisis-body" className="crisis-body">
          <p>
            Some of what you've written sounds like you may be going through
            something very hard right now.
          </p>
          <p>
            Rêvesvoir is an experiment in exploration. It can't respond properly
            to a crisis, and it works best when you're feeling settled enough to
            wonder.
          </p>
          <p>
            If you're in crisis, we don't recommend using Rêvesvoir right now.
            Please get in touch with your doctor, or another professional who
            supports you, so they can help you through this time.
          </p>
          <p>
            If you're in immediate danger, call your local emergency number.
          </p>
        </div>
        <div className="crisis-actions">
          <button className="crisis-btn primary" onClick={onEnd}>
            End this session
          </button>
          {onBack && (
            <button className="crisis-btn" onClick={onBack}>
              Go back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
