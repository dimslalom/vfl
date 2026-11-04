// Browser-only regression fixture for the actual countdown hook.
import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { m, LazyMotion, domMax } from 'motion/react';
import useSkippableTimeline from '/src/lib/useSkippableTimeline.js';
function Timer() {
  const [active, setActive] = useState(false);
  const [completed, setCompleted] = useState(0);
  const timeline = useSkippableTimeline({ duration: 1500, active, onDone: () => { setActive(false); setCompleted(n => n + 1); } });
  useEffect(() => { window.auditTimerRenders = (window.auditTimerRenders ?? 0) + 1; });
  useEffect(() => { window.auditTimer = { start: () => setActive(true), skip: timeline.skip }; });
  return <><m.div id="fill" style={{ scaleX: timeline.progress, width: 300, height: 20, background: 'red', transformOrigin: 'left' }}/><output id="completed">{completed}</output></>;
}
createRoot(document.getElementById('root')).render(<LazyMotion features={domMax} strict><Timer/></LazyMotion>);
