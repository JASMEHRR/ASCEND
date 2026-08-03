/**
 * The picture itself.
 *
 * A CSS grid over one background image: each cell shows its own slice via
 * background-position, so there's no image slicing, no canvas element, and no
 * extra network requests — one image, N windows onto it.
 *
 * Unplaced cells are dark. Placed ones fade in. A tile placed in a later week
 * than the canvas — a repair — carries a marker, so a rescued picture still
 * reads as rescued.
 */
import { motion } from 'motion/react';
import type { TilePlacement } from '../logic/types';

interface Props {
  imageUrl: string;
  cols: number;
  rows: number;
  placements: TilePlacement[];
  /** Grid index currently flying in, animated with a spring. */
  landing?: number | null;
  /** Dim the whole picture — used for another player's unrevealed canvas. */
  hidden?: boolean;
  /**
   * The image's true width/height. The grid is sized by tile count, not by the
   * picture, so without this the frame takes the grid's ratio and the photo
   * stretches to fit it. Falls back to the grid ratio only when unknown.
   */
  aspect?: number;
}

export default function PuzzleCanvas({ imageUrl, cols, rows, placements, landing, hidden, aspect }: Props) {
  const byIndex = new Map(placements.map((p) => [p.index, p]));

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40"
      style={{ aspectRatio: aspect && aspect > 0 ? `${aspect}` : `${cols} / ${rows}` }}
    >
      <div
        className="grid h-full w-full"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
      >
        {Array.from({ length: cols * rows }, (_, i) => {
          const tile = byIndex.get(i);
          const col = i % cols;
          const row = Math.floor(i / cols);
          // background-size is the whole grid; position picks this cell's slice.
          const style: React.CSSProperties = {
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: `${cols * 100}% ${rows * 100}%`,
            backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
          };

          if (!tile) {
            return <div key={i} className="bg-white/[0.02] ring-[0.5px] ring-inset ring-white/5" />;
          }

          return (
            <motion.div
              key={i}
              initial={landing === i ? { opacity: 0, scale: 1.6, filter: 'brightness(2.2)' } : false}
              animate={{ opacity: hidden ? 0.12 : 1, scale: 1, filter: 'brightness(1)' }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="relative"
              style={style}
            >
              {/* Repairs are marked: this tile was earned in a later week. */}
              {tile.repair && (
                <span
                  aria-label="Placed later"
                  className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-amber-400/80 shadow-[0_0_4px_rgba(251,191,36,0.8)]"
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
