import { describe, expect, it } from "vitest";
import { MockProvider } from "../src/providers/mock-provider.js";

describe("MockProvider", () => {
  it("returns null for the no_game fixture", async () => {
    const p = new MockProvider({ fixture: "no_game" });
    expect(await p.getCurrentGame("BOS")).toBeNull();
  });

  it("returns pre_game state with cleared count and inning", async () => {
    const p = new MockProvider({ fixture: "pre_game" });
    const game = await p.getCurrentGame("BOS");
    expect(game).not.toBeNull();
    expect(game?.status).toBe("pre_game");
    expect(game?.inning).toBeNull();
    expect(game?.half).toBeNull();
    expect(game?.balls).toBe(0);
  });

  it("returns a live_early state with realistic count and partial linescore", async () => {
    const p = new MockProvider({ fixture: "live_early" });
    const game = await p.getCurrentGame("BOS");
    expect(game?.status).toBe("live");
    expect(game?.inning).toBe(3);
    expect(game?.balls).toBeGreaterThanOrEqual(0);
    expect(game?.strikes).toBeLessThanOrEqual(3);
    expect(game?.outs).toBeLessThanOrEqual(3);
    const filledInnings = game?.linescore.filter((r) => r.home !== null || r.away !== null) ?? [];
    expect(filledInnings.length).toBeGreaterThan(0);
  });

  it("returns final state with 3 outs and consistent scores", async () => {
    const p = new MockProvider({ fixture: "final" });
    const game = await p.getCurrentGame("BOS");
    expect(game?.status).toBe("final");
    expect(game?.outs).toBe(3);
    expect(game?.home_score).toBeGreaterThan(game?.away_score ?? Infinity);
  });

  it("stamps updated_at from the injected clock", async () => {
    const fixed = new Date("2026-04-01T19:05:00Z");
    const p = new MockProvider({ fixture: "live_late", now: () => fixed });
    const game = await p.getCurrentGame("BOS");
    expect(game?.updated_at).toBe(fixed.toISOString());
  });

  it("echoes the team_id passed in", async () => {
    const p = new MockProvider({ fixture: "live_early" });
    const game = await p.getCurrentGame("NYY");
    expect(game?.team_id).toBe("NYY");
  });
});
