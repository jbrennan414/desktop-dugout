import type { GameState } from "./game-state.js";

export const CADENCE_MS = {
  LIVE: 7_000,
  MID_INNING: 30_000,
  PRE_GAME: 60_000,
  POST_GAME: 300_000,
  NO_GAME: 900_000,
} as const;

export function nextPollMs(state: GameState): number {
  switch (state.status) {
    case "live":
      return CADENCE_MS.LIVE;
    case "mid_inning":
    case "delayed":
      return CADENCE_MS.MID_INNING;
    case "pre_game":
    case "scheduled":
      return CADENCE_MS.PRE_GAME;
    case "final":
    case "postponed":
      return CADENCE_MS.POST_GAME;
    case "no_game_today":
      return CADENCE_MS.NO_GAME;
  }
}
