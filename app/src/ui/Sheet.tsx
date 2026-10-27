import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { reducedMotion } from '../theme/ThemeProvider';

// Bottom sheet. Closes on backdrop tap, Escape, the close button, or a drag down on its top bar. Drawn on
// document.body: inside the top bar (which has a blur filter) a fixed sheet would be trapped in the bar.
// Only the top bar drags: on a phone a swipe on the content must scroll it, not start closing the sheet.
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const drag = useDragControls();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    // The page behind must not scroll while the sheet is open (iOS scrolls it through the backdrop).
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
    };
  }, [open, onClose]);

  const still = reducedMotion();
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="sheet-layer">
          <motion.div className="sheet-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={still ? { opacity: 0 } : { y: '100%' }}
            animate={still ? { opacity: 1 } : { y: 0 }}
            exit={still ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            drag={still ? false : 'y'}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => info.offset.y > 90 && onClose()}
          >
            <div className="sheet-head" onPointerDown={(e) => !still && drag.start(e)}>
              <div className="sheet-grip" aria-hidden="true" />
              <h2 className="sheet-title">{title}</h2>
              <button className="icon-btn sheet-close" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="sheet-body">{children}</div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
