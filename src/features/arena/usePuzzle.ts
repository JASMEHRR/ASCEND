/**
 * Puzzles: your own windowed picture, plus your active room games.
 *
 * Every habit completion earns a tile that's simultaneously spendable on
 * your solo puzzle AND every room's currently-active group game — there's
 * no sync toggle and no shared pool; one completion is one tile per
 * destination it's eligible for. A tile placed on a window other than the
 * one it was earned in is flagged as a repair, so a rescued picture still
 * reads as rescued.
 *
 * Solo puzzles are windowed rather than locked to the calendar week: you
 * pick a start day and a duration when you open one, so a brand-new account
 * adding habits mid-week gets a properly-sized canvas immediately instead of
 * a 1-piece stub that waits for next Monday.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useArena } from './ArenaContext';
import { listPuzzles, savePuzzle } from './data/habits';
import { saveGamePuzzle, subscribeGamePuzzle } from './data/rooms';
import type { PuzzleDoc } from './data/schema';
import { todayStr, weekKey } from './logic/dates';
import { isComplete, nextSlot, nextSlotInHalf, progress } from './logic/reveal';
import { gridFor, projectedWindowTiles, spentThisWeek, tilesEarnedOn, windowDays } from './logic/tiles';
import type { PuzzleId, TilePlacement } from './logic/types';

export interface Canvas extends Omit<PuzzleDoc, 'placements'> {
  id: PuzzleId;
  placements: TilePlacement[];
  placed: number;
  total: number;
  complete: boolean;
  fraction: number;
}

/** Read form: the puzzle's own id lives outside the doc, so attach it to each tile. */
function hydrate(id: PuzzleId, doc: PuzzleDoc): Canvas {
  const placements: TilePlacement[] = (doc.placements ?? []).map((p) => ({ ...p, week: id }));
  return {
    ...doc,
    id,
    placements,
    placed: placements.length,
    total: doc.cols * doc.rows,
    complete: isComplete(doc.cols, doc.rows, placements),
    fraction: progress(doc.cols, doc.rows, placements),
  };
}

export function usePuzzle() {
  const { habits, entries, today, rooms, guardArena } = useArena();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [canvases, setCanvases] = useState<Canvas[]>([]);
  // One active-game canvas per room currently running one, keyed by roomId.
  const [gameCanvases, setGameCanvases] = useState<Record<string, Canvas>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const activeGameRooms = useMemo(
    () => rooms.filter((r) => r.puzzleMode === 'shared' && r.game?.status === 'active' && r.game?.startedAt),
    [rooms],
  );
  // A stable key describing which rooms/games should be subscribed, so the
  // subscription effect below only re-runs when that set actually changes,
  // not on every unrelated re-render of `rooms`.
  const activeGameKey = activeGameRooms.map((r) => `${r.id}:${r.game?.startedAt}`).join(',');

  /** Your own solo puzzles — a one-shot fetch is fine since only you write these. */
  const reload = useCallback(async () => {
    if (!uid) {
      setCanvases([]);
      setLoading(false);
      return;
    }
    const all = await listPuzzles(uid);
    setCanvases(all.map((w) => hydrate(w.id, w)));
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * Live subscriptions to every room game you're currently in. This has to be
   * a listener, not a fetch: a teammate placing a tile, or the game ending on
   * someone else's clock, must appear here without you touching anything —
   * that immediacy is the point of a shared board. Applying an update that
   * requires a fresh sign-in or a room rejoin would defeat that.
   */
  useEffect(() => {
    const unsubs = activeGameRooms.map((r) =>
      subscribeGamePuzzle(r.id, r.game!.startedAt!, (doc) => {
        setGameCanvases((cur) => {
          if (!doc) {
            const { [r.id]: _drop, ...rest } = cur;
            return rest;
          }
          return { ...cur, [r.id]: hydrate(r.game!.startedAt!, doc) };
        });
      }),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGameKey]);

  /** The most recent open (incomplete, not-yet-ended) solo puzzle, if any. */
  const current = useMemo(
    () => canvases.find((c) => !c.ended && !c.complete) ?? canvases[0] ?? null,
    [canvases],
  );

  /** Older solo puzzles still missing tiles — what spare tiles can repair. */
  const repairable = useMemo(
    () => canvases.filter((c) => c.id !== current?.id && !c.complete && !c.ended),
    [canvases, current],
  );

  /** Tiles earned in the current puzzle's window that haven't been placed anywhere. */
  const available = useMemo(() => {
    if (!current) return 0;
    const win = windowDays(current.startsAt, current.days);
    const earned = win.reduce((n, d) => n + tilesEarnedOn(habits, entries, d), 0);
    const spent = canvases.reduce((n, c) => n + spentThisWeek(c.placements, win, undefined), 0);
    return Math.max(0, earned - spent);
  }, [habits, entries, canvases, current]);

  /**
   * Spendable balance for one room's active game canvas, filtered to this
   * player's own placements — one active member's tiles must never look like
   * they drained a teammate's balance too.
   */
  const availableForRoom = useCallback(
    (roomId: string): number => {
      const canvas = gameCanvases[roomId];
      const room = activeGameRooms.find((r) => r.id === roomId);
      if (!canvas || !room?.game?.startedAt || !uid) return 0;
      const win = windowDays(canvas.startsAt, canvas.days);
      const earned = win.reduce((n, d) => n + tilesEarnedOn(habits, entries, d), 0);
      const spent = spentThisWeek(canvas.placements, win, uid);
      return Math.max(0, earned - spent);
    },
    [gameCanvases, activeGameRooms, habits, entries, uid],
  );

  /** Start a new solo puzzle window: pick the image, start day, and duration. */
  const setImage = useCallback(
    async (imageUrl: string, aspect = 1, startsAt: string = today, days = 7): Promise<void> => {
      if (!uid) return;
      const tiles = projectedWindowTiles(habits, startsAt, days);
      const { cols, rows } = gridFor(tiles, aspect);
      setBusy(true);
      try {
        await savePuzzle(uid, startsAt, {
          imageUrl,
          cols,
          rows,
          aspect,
          startsAt,
          days,
          placements: [],
          revealed: false,
          createdAt: new Date().toISOString(),
        });
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [uid, habits, today, reload],
  );

  /** Change the picture on the current open solo puzzle, keeping its window. */
  const changeImage = useCallback(
    async (imageUrl: string, aspect = 1): Promise<void> => {
      if (!uid || !current) return;
      setBusy(true);
      try {
        await savePuzzle(uid, current.id, { imageUrl, aspect });
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [uid, current, reload],
  );

  /** Place one tile on a solo canvas (current or an old repairable one). */
  const place = useCallback(
    async (targetId: PuzzleId = current?.id ?? ''): Promise<TilePlacement | null> => {
      if (!uid || available <= 0 || !targetId) return null;
      const canvas = canvases.find((c) => c.id === targetId);
      if (!canvas || canvas.complete) return null;

      const side: 'owner' | 'guest' = canvas.sharedWith === uid ? 'guest' : 'owner';
      const index = canvas.sharedWith
        ? nextSlotInHalf(side, canvas.cols, canvas.rows, canvas.placements)
        : nextSlot(canvas.cols, canvas.rows, canvas.placements);
      if (index === null) return null;

      const tile: TilePlacement = {
        index,
        week: targetId,
        earnedOn: today,
        repair: targetId !== current?.id,
        at: new Date().toISOString(),
      };

      setBusy(true);
      try {
        const stored = [...canvas.placements, tile].map(({ week: _w, ...rest }) => rest);
        await savePuzzle(uid, targetId, { placements: stored });
        await reload();
        return tile;
      } finally {
        setBusy(false);
      }
    },
    [uid, available, canvases, current, today, reload],
  );

  /** Place one tile on a room's active game canvas, tagged with who earned it. */
  const placeInRoom = useCallback(
    async (roomId: string): Promise<TilePlacement | null> => {
      const room = activeGameRooms.find((r) => r.id === roomId);
      const canvas = gameCanvases[roomId];
      if (!uid || !room?.game?.startedAt || !canvas || canvas.complete) return null;
      if (availableForRoom(roomId) <= 0) return null;

      const index = nextSlot(canvas.cols, canvas.rows, canvas.placements);
      if (index === null) return null;

      const tile: TilePlacement = {
        index,
        week: room.game.startedAt,
        earnedOn: today,
        repair: false,
        at: new Date().toISOString(),
        playerId: uid,
      };

      setBusy(true);
      try {
        const stored = [...canvas.placements, tile].map(({ week: _w, ...rest }) => rest);
        // No reload() here — the live subscription above picks up this write
        // (and every other member's) on its own.
        await saveGamePuzzle(roomId, room.game.startedAt, { placements: stored });
        return tile;
      } finally {
        setBusy(false);
      }
    },
    [uid, activeGameRooms, gameCanvases, availableForRoom, today],
  );

  const reveal = useCallback(
    async (targetId: PuzzleId) => {
      if (!uid) return;
      await savePuzzle(uid, targetId, { revealed: true });
      await reload();
    },
    [uid, reload],
  );

  const setPrivate = useCallback(
    async (targetId: PuzzleId, isPrivate: boolean) => {
      if (!uid) return;
      await guardArena(() => savePuzzle(uid, targetId, { private: isPrivate }));
      await reload();
    },
    [uid, guardArena, reload],
  );

  return {
    loading,
    busy,
    current,
    canvases,
    repairable,
    available,
    gameCanvases,
    activeGameRooms,
    availableForRoom,
    setImage,
    changeImage,
    place,
    placeInRoom,
    reveal,
    setPrivate,
    reload,
  };
}

export const currentWeekKey = () => weekKey(todayStr());
