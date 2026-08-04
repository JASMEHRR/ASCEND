/**
 * The weekly picture.
 *
 * Earned tiles are a wallet, not a schedule: a tile can land on this week's
 * canvas or go back and repair any older unfinished one. Tiles placed on a
 * week other than the one they were earned in are flagged, so a repaired
 * picture still reads as repaired — recoverable, but honest.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useArena } from './ArenaContext';
// Canvases are per-user by default — a picture isn't tied to whichever room
// you happened to be looking at. A room with puzzleMode 'shared' instead
// reads/writes the one canvas at arenaRooms/{roomId}/weeks/{week}.
import { getWeek, listWeeks, saveWeek } from './data/habits';
import { getRoomWeek, listRoomWeeks, saveRoomWeek } from './data/rooms';
import type { WeekDoc } from './data/schema';
import { todayStr, weekDays, weekKey } from './logic/dates';
import { isComplete, nextSlot, nextSlotInHalf, progress } from './logic/reveal';
import { gridFor, projectedTiles, spentThisWeek, tilesEarnedOn } from './logic/tiles';
import type { TilePlacement, WeekKey } from './logic/types';

export interface Canvas extends Omit<WeekDoc, 'placements'> {
  week: WeekKey;
  /** Stored placements with their canvas week re-attached. */
  placements: TilePlacement[];
  placed: number;
  total: number;
  complete: boolean;
  fraction: number;
}

/** Read form: the week lives in the document id, so put it back on each tile. */
function hydrate(week: WeekKey, doc: WeekDoc): Canvas {
  const placements: TilePlacement[] = (doc.placements ?? []).map((p) => ({ ...p, week }));
  return {
    ...doc,
    week,
    placements,
    placed: placements.length,
    total: doc.cols * doc.rows,
    complete: isComplete(doc.cols, doc.rows, placements),
    fraction: progress(doc.cols, doc.rows, placements),
  };
}

export function usePuzzle() {
  const { habits, entries, today, room } = useArena();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // 'shared' reads/writes the room's one canvas instead of the user's own;
  // missing puzzleMode on an older room defaults to solo.
  const shared = room?.puzzleMode === 'shared';
  const roomId = room?.id ?? null;

  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const week = weekKey(today);

  const reload = useCallback(async () => {
    if (shared) {
      // No room, no shared canvas to read yet.
      if (!roomId) {
        setCanvases([]);
        setLoading(false);
        return;
      }
      const all = await listRoomWeeks(roomId);
      setCanvases(all.map((w) => hydrate(w.week, w)));
      setLoading(false);
      return;
    }
    // No room needed: the picture is yours, not the room's.
    if (!uid) {
      setCanvases([]);
      setLoading(false);
      return;
    }
    const all = await listWeeks(uid);
    setCanvases(all.map((w) => hydrate(w.week, w)));
    setLoading(false);
  }, [uid, shared, roomId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = useMemo(() => canvases.find((c) => c.week === week) ?? null, [canvases, week]);

  /**
   * Older canvases still missing tiles. These are what spare tiles repair, and
   * they never expire — a strong week can always go back and finish a bad one.
   */
  const repairable = useMemo(
    () => canvases.filter((c) => c.week !== week && !c.complete),
    [canvases, week],
  );

  /**
   * Tiles earned this week that haven't been placed anywhere.
   *
   * Counted against every placement across all canvases, not just this week's,
   * because a tile spent repairing March is no longer available for August.
   */
  const available = useMemo(() => {
    const earned = weekDays(today).reduce((n, d) => n + tilesEarnedOn(habits, entries, d), 0);
    // On a shared canvas, tiles carry the playerId that earned them, so
    // "spent" only counts this player's own placements — otherwise one
    // active member's tiles would look like they'd drained everyone's
    // balance. Solo canvases have no other player to filter out.
    const spent = canvases.reduce(
      (n, c) => n + spentThisWeek(c.placements, weekDays(today), shared ? (uid ?? undefined) : undefined),
      0,
    );
    return Math.max(0, earned - spent);
  }, [habits, entries, today, canvases, shared, uid]);

  /** Start this week's picture from a URL or an uploaded data URL. */
  const setImage = useCallback(
    async (imageUrl: string, aspect = 1) => {
      const tiles = projectedTiles(habits, week, today);
      const { cols, rows } = gridFor(tiles, aspect);
      setBusy(true);
      try {
        if (shared) {
          if (!roomId) return;
          const existing = await getRoomWeek(roomId, week);
          await saveRoomWeek(roomId, week, {
            imageUrl,
            cols,
            rows,
            aspect,
            // Changing the image mid-week keeps whatever's already been placed.
            placements: existing?.placements ?? [],
            revealed: existing?.revealed ?? false,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
          });
        } else {
          if (!uid) return;
          const existing = await getWeek(uid, week);
          await saveWeek(uid, week, {
            imageUrl,
            cols,
            rows,
            aspect,
            placements: existing?.placements ?? [],
            revealed: existing?.revealed ?? false,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
          });
        }
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [uid, habits, week, today, reload, shared, roomId],
  );

  /**
   * Place one tile on a target canvas. Returns the placement so the UI can
   * animate the piece into its slot.
   */
  const place = useCallback(
    async (targetWeek: WeekKey = week): Promise<TilePlacement | null> => {
      if (available <= 0) return null;
      if (shared ? !roomId : !uid) return null;
      const canvas = canvases.find((c) => c.week === targetWeek);
      if (!canvas || canvas.complete) return null;

      // A shared room canvas has no fixed halves — any member may fill any
      // open slot, and `playerId` on the tile records who did. The legacy
      // two-player owner/guest split (`sharedWith`) only applies to solo
      // canvases and is untouched here.
      let index: number | null;
      if (shared) {
        index = nextSlot(canvas.cols, canvas.rows, canvas.placements);
      } else {
        const side: 'owner' | 'guest' = canvas.sharedWith === uid ? 'guest' : 'owner';
        index = canvas.sharedWith
          ? nextSlotInHalf(side, canvas.cols, canvas.rows, canvas.placements)
          : nextSlot(canvas.cols, canvas.rows, canvas.placements);
      }
      if (index === null) return null;

      const tile: TilePlacement = {
        index,
        week: targetWeek,
        earnedOn: today,
        repair: weekKey(today) !== targetWeek,
        at: new Date().toISOString(),
        ...(shared && uid ? { playerId: uid } : {}),
      };

      setBusy(true);
      try {
        // Strip `week` on the way down — it's the document id.
        const stored = [...canvas.placements, tile].map(({ week: _w, ...rest }) => rest);
        if (shared) {
          await saveRoomWeek(roomId!, targetWeek, { placements: stored });
        } else {
          await saveWeek(uid!, targetWeek, { placements: stored });
        }
        await reload();
        return tile;
      } finally {
        setBusy(false);
      }
    },
    [uid, available, canvases, week, today, reload, shared, roomId],
  );

  /** Show the finished picture to the room. One-way by design. */
  const reveal = useCallback(
    async (targetWeek: WeekKey) => {
      if (shared) {
        if (!roomId) return;
        await saveRoomWeek(roomId, targetWeek, { revealed: true });
      } else {
        if (!uid) return;
        await saveWeek(uid, targetWeek, { revealed: true });
      }
      await reload();
    },
    [uid, reload, shared, roomId],
  );

  return { loading, busy, week, current, canvases, repairable, available, setImage, place, reveal, reload };
}

export const currentWeekKey = () => weekKey(todayStr());
