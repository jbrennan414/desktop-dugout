import { describe, expect, it } from "vitest";
import { CADENCE_MS, nextPollMs } from "../src/domain/cadence.js";
import type { GameState } from "../src/domain/game-state.js";

const base: GameState = {
  team_id: "BOS",
  game_id: "g1",
  status: "live",
  balls: 0,
  strikes: 0,
  outs: 0,
  inning: 1,
  half: "top",
  home_team: "BOS",
  away_team: "NYY",
  home_score: 0,
  away_score: 0,
  hits_home: 0,
  hits_away: 0,
  errors_home: 0,
  errors_away: 0,
  linescore: [],
  updated_at: new Date(0).toISOString(),
};

describe("nextPollMs", () => {
  it("polls fastest during a live at-bat", () => {
    expect(nextPollMs({ ...base, status: "live" })).toBe(CADENCE_MS.LIVE);
  });

  it("slows down between innings", () => {
    expect(nextPollMs({ ...base, status: "mid_inning" })).toBe(CADENCE_MS.MID_INNING);
  });

  it("uses pre-game cadence before first pitch", () => {
    expect(nextPollMs({ ...base, status: "pre_game" })).toBe(CADENCE_MS.PRE_GAME);
    expect(nextPollMs({ ...base, status: "scheduled" })).toBe(CADENCE_MS.PRE_GAME);
  });

  it("uses post-game cadence after the last out", () => {
    expect(nextPollMs({ ...base, status: "final" })).toBe(CADENCE_MS.POST_GAME);
    expect(nextPollMs({ ...base, status: "postponed" })).toBe(CADENCE_MS.POST_GAME);
  });

  it("uses the slowest cadence when there is no game today", () => {
    expect(nextPollMs({ ...base, status: "no_game_today" })).toBe(CADENCE_MS.NO_GAME);
  });

  it("polls faster live than mid-inning, which is faster than pre-game, which is faster than post-game, which is faster than no-game", () => {
    expect(CADENCE_MS.LIVE).toBeLessThan(CADENCE_MS.MID_INNING);
    expect(CADENCE_MS.MID_INNING).toBeLessThan(CADENCE_MS.PRE_GAME);
    expect(CADENCE_MS.PRE_GAME).toBeLessThan(CADENCE_MS.POST_GAME);
    expect(CADENCE_MS.POST_GAME).toBeLessThan(CADENCE_MS.NO_GAME);
  });
});
