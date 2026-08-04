/**
 * The room's competition lifecycle: lobby, ready-up, start, auto-end.
 *
 * A 'shared' room only has a live group puzzle while `room.game.status` is
 * 'active'. Getting there is a lobby the owner configures (how many days the
 * game runs) and every current member has to ready up before the owner can
 * start it — same idea as a lobby in an online game. No stockpiled tiles
 * carry in: the moment the game starts, its canvas opens at zero, and only
 * completions from here on count toward it (see tiles fan-out in usePuzzle).
 *
 * The timer is checked client-side (there's no server cron available here):
 * whoever's looking at the room when `endsAt` passes ends it for everyone,
 * freezing the canvas for the gallery and chat reveal, then resets the room
 * to a fresh, unconfigured lobby for the next round.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useArena } from './ArenaContext';
import { endGame, getGamePuzzle, setGameDuration, setReady, startGame } from './data/rooms';

export function useRoomGame() {
  const { room, players, guardArena } = useArena();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const game = room?.game;
  const status = game?.status ?? 'lobby';
  const readyMap = game?.ready ?? {};
  const memberIds = players.map((p) => p.id);
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const readyCount = memberIds.filter((id) => readyMap[id]).length;
  const allReady = memberIds.length > 0 && readyCount === memberIds.length;
  const iAmReady = !!(uid && readyMap[uid]);

  const endingRef = useRef(false);

  // Auto-end: whoever has the room open when the timer runs out ends it.
  // Guarded by a ref (not just status) so two effect fires in the same tick
  // (e.g. StrictMode) can't both race to call endGame.
  useEffect(() => {
    if (!room || status !== 'active' || !game?.endsAt) return;
    const msLeft = new Date(game.endsAt).getTime() - Date.now();
    const fire = async () => {
      if (endingRef.current) return;
      endingRef.current = true;
      try {
        if (game.startedAt) await endGame(room.id, game.startedAt, playerNames);
      } finally {
        endingRef.current = false;
      }
    };
    if (msLeft <= 0) {
      void fire();
      return;
    }
    const t = window.setTimeout(() => void fire(), msLeft);
    return () => window.clearTimeout(t);
    // playerNames is derived fresh each render from `players`; keying off its
    // JSON avoids re-arming the timer on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, status, game?.endsAt, game?.startedAt, JSON.stringify(playerNames)]);

  const configure = useCallback(
    (durationDays: number) => {
      if (!room) return Promise.resolve(undefined);
      return guardArena(() => setGameDuration(room.id, durationDays));
    },
    [room, guardArena],
  );

  const toggleReady = useCallback(() => {
    if (!room || !uid) return Promise.resolve(undefined);
    return guardArena(() => setReady(room.id, uid, !iAmReady));
  }, [room, uid, iAmReady, guardArena]);

  const start = useCallback(() => {
    if (!room || !game?.durationDays || !allReady) return Promise.resolve(undefined);
    return guardArena(() => startGame(room.id, game.durationDays!).then(() => undefined));
  }, [room, game?.durationDays, allReady, guardArena]);

  /** Owner may also end the game early. */
  const endNow = useCallback(() => {
    if (!room || !game?.startedAt) return Promise.resolve(undefined);
    return guardArena(() => endGame(room.id, game.startedAt!, playerNames));
  }, [room, game?.startedAt, guardArena, playerNames]);

  return {
    status,
    game,
    readyCount,
    totalMembers: memberIds.length,
    allReady,
    iAmReady,
    configure,
    toggleReady,
    start,
    endNow,
    getCanvas: () => (room && game?.startedAt ? getGamePuzzle(room.id, game.startedAt) : Promise.resolve(null)),
  };
}
