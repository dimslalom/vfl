import { m } from 'motion/react';
import { wipeIn } from '../../shared/src/lib/motion';

// AnimatePresence tracks the React key on this component at the call site.
// phaseKey also identifies the rendered scene for diagnostics and captures.
export default function PhaseTransition({ phaseKey, children }) {
  return (
    <m.div data-phase-scene={phaseKey} variants={wipeIn} initial="initial" animate="animate" exit="exit">
      {children}
    </m.div>
  );
}
