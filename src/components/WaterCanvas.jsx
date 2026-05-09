// ============================================================
// WaterCanvas — Persistent background layer
// Lives outside React rendering cycle, provides ref for ripples
// ============================================================

import { useEffect, useRef, createContext, useContext } from 'react';
import { WaterSystem } from '../systems/WaterSystem';

const WaterContext = createContext(null);

export function useWater() {
  return useContext(WaterContext);
}

export default function WaterCanvas({ children }) {
  const canvasRef = useRef(null);
  const waterRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && !waterRef.current) {
      waterRef.current = new WaterSystem(canvasRef.current);
      waterRef.current.init();
    }

    return () => {
      if (waterRef.current) {
        waterRef.current.destroy();
      }
    };
  }, []);

  return (
    <WaterContext.Provider value={waterRef}>
      <canvas
        ref={canvasRef}
        id="water-canvas"
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
        }}
      />
      {children}
    </WaterContext.Provider>
  );
}
