import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle } from '@ui-sdk/react/dialog';
import GameIcon from './GameIcon';
import { t } from '../lib/i18n';
import styles from './Sheet.module.css';

// The one modal for new UI. ui-sdk's Dialog owns focus, the Tab trap, Esc,
// outside presses and handing focus back to whatever opened it.
export default function Sheet({ open, onClose, title, head = null, side = 'center', children }) {
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogBackdrop className={styles.backdrop} />
      <DialogContent className={styles.sheet} data-side={side}>
        <div className={styles.head}>
          <DialogTitle className={styles.title}>{title}</DialogTitle>
          {head}
          <DialogClose className={styles.close} aria-label={t('Close')}>
            <GameIcon name="close" size={18} />
          </DialogClose>
        </div>
        <div className={styles.body}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
