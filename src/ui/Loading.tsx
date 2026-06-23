import { useProgress } from '@react-three/drei';
import { useT } from '../i18n';

/** Fullscreen overlay with a real progress bar tied to asset loading. */
export function Loading() {
  const { active, progress } = useProgress();
  const { t } = useT();
  if (!active) return null;
  return (
    <div className="loading" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
      <div className="loading-inner">
        <div className="loading-title">{t('loading')}</div>
        <div className="loading-track">
          <div className="loading-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="loading-pct">{Math.round(progress)}%</div>
      </div>
    </div>
  );
}
