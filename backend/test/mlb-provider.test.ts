import { describe, expect, it } from "vitest";
import { MlbProvider } from "../src/providers/mlb-provider.js";

function fixtureFetch(schedule: unknown, feed: unknown): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = url.includes("/schedule") ? schedule : feed;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function urlAwareFetch(
  schedule: unknown,
  feedsByGamePk: Record<string, unknown>,
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/schedule")) {
      return new Response(JSON.stringify(schedule), { status: 200 });
    }
    const match = /\/game\/(\d+)\/feed/.exec(url);
    const pk = match?.[1];
    if (pk && feedsByGamePk[pk]) {
      return new Response(JSON.stringify(feedsByGamePk[pk]), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const scheduleWithLiveGame = {
  dates: [
    {
      date: "2026-09-20",
      games: [{ gamePk: 745678, status: { abstractGameState: "Live" } }],
    },
  ],
};

const liveFeed = {
  gamePk: 745678,
  gameData: {
    status: { abstractGameState: "Live", detailedState: "In Progress" },
    teams: {
      home: { abbreviation: "MIL", teamName: "Brewers" },
      away: { abbreviation: "CHC", teamName: "Cubs" },
    },
  },
  liveData: {
    linescore: {
      currentInning: 5,
      inningHalf: "Top",
      inningState: "Top",
      balls: 3,
      strikes: 1,
      outs: 2,
      innings: [
        { num: 1, home: { runs: 0 }, away: { runs: 0 } },
        { num: 2, home: { runs: 1 }, away: { runs: 0 } },
        { num: 3, home: { runs: 0 }, away: { runs: 2 } },
        { num: 4, home: { runs: 0 }, away: { runs: 0 } },
        { num: 5, home: {}, away: { runs: 1 } },
      ],
      teams: {
        home: { runs: 1, hits: 4, errors: 0 },
        away: { runs: 3, hits: 6, errors: 1 },
      },
    },
  },
};

const emptySchedule = { dates: [] };

const finalFeed = {
  gamePk: 111111,
  gameData: {
    status: { abstractGameState: "Final", detailedState: "Final" },
    teams: {
      home: { abbreviation: "MIL" },
      away: { abbreviation: "CHC" },
    },
  },
  liveData: {
    linescore: {
      currentInning: 9,
      inningHalf: "Bottom",
      balls: 0,
      strikes: 0,
      outs: 3,
      innings: Array.from({ length: 9 }, (_, i) => ({
        num: i + 1,
        home: { runs: 0 },
        away: { runs: 0 },
      })),
      teams: {
        home: { runs: 5, hits: 10, errors: 0 },
        away: { runs: 4, hits: 8, errors: 2 },
      },
    },
  },
};

describe("MlbProvider", () => {
  it("returns no_game_today when the schedule is empty", async () => {
    const provider = new MlbProvider(fixtureFetch(emptySchedule, {}));
    const game = await provider.getCurrentGame("brewers");
    expect(game?.status).toBe("no_game_today");
    expect(game?.inning).toBeNull();
  });

  it("returns null for an unknown team slug", async () => {
    const provider = new MlbProvider(fixtureFetch(emptySchedule, {}));
    expect(await provider.getCurrentGame("not-a-team")).toBeNull();
  });

  it("parses a live game into GameState", async () => {
    const provider = new MlbProvider(fixtureFetch(scheduleWithLiveGame, liveFeed));
    const game = await provider.getCurrentGame("brewers");
    expect(game).not.toBeNull();
    expect(game?.status).toBe("live");
    expect(game?.inning).toBe(5);
    expect(game?.half).toBe("top");
    expect(game?.balls).toBe(3);
    expect(game?.strikes).toBe(1);
    expect(game?.outs).toBe(2);
    expect(game?.home_team).toBe("MIL");
    expect(game?.away_team).toBe("CHC");
    expect(game?.home_score).toBe(1);
    expect(game?.away_score).toBe(3);
    expect(game?.linescore.length).toBe(9);
    expect(game?.linescore[4]?.away).toBe(1);
    expect(game?.linescore[4]?.home).toBeNull();
    expect(game?.team_id).toBe("brewers");
  });

  it("parses a final game and clears count / outs", async () => {
    const schedule = {
      dates: [{ date: "2026-09-20", games: [{ gamePk: 111111 }] }],
    };
    const provider = new MlbProvider(fixtureFetch(schedule, finalFeed));
    const game = await provider.getCurrentGame("brewers");
    expect(game?.status).toBe("final");
    expect(game?.balls).toBe(0);
    expect(game?.strikes).toBe(0);
    expect(game?.outs).toBe(0);
    expect(game?.home_score).toBe(5);
    expect(game?.away_score).toBe(4);
  });

  it("maps inningState Middle/End to mid_inning", async () => {
    const midFeed = {
      ...liveFeed,
      liveData: {
        ...liveFeed.liveData,
        linescore: { ...liveFeed.liveData.linescore, inningState: "Middle" },
      },
    };
    const provider = new MlbProvider(fixtureFetch(scheduleWithLiveGame, midFeed));
    const game = await provider.getCurrentGame("brewers");
    expect(game?.status).toBe("mid_inning");
  });

  it("prefers a recent Final over an upcoming Preview (last game stays until next begins)", async () => {
    const schedule = {
      dates: [
        { date: "2026-09-20", games: [{ gamePk: 111, status: { abstractGameState: "Final" } }] },
        { date: "2026-09-21", games: [{ gamePk: 222, status: { abstractGameState: "Preview" } }] },
      ],
    };
    const finalFeedFor111 = { ...finalFeed, gamePk: 111 };
    const provider = new MlbProvider(
      urlAwareFetch(schedule, { "111": finalFeedFor111 }),
    );
    const game = await provider.getCurrentGame("brewers");
    expect(game?.status).toBe("final");
    expect(game?.game_id).toBe("111");
  });

  it("promotes a Live game over any recent Final", async () => {
    const schedule = {
      dates: [
        { date: "2026-09-20", games: [{ gamePk: 111, status: { abstractGameState: "Final" } }] },
        { date: "2026-09-21", games: [{ gamePk: 333, status: { abstractGameState: "Live" } }] },
      ],
    };
    const liveFeedFor333 = { ...liveFeed, gamePk: 333 };
    const provider = new MlbProvider(
      urlAwareFetch(schedule, { "333": liveFeedFor333 }),
    );
    const game = await provider.getCurrentGame("brewers");
    expect(game?.status).toBe("live");
    expect(game?.game_id).toBe("333");
  });

  it("falls back to the most recent Final when today has no game", async () => {
    const scheduleWithOnlyFinal = {
      dates: [
        {
          date: "2026-09-18",
          games: [{ gamePk: 111111, status: { abstractGameState: "Final" } }],
        },
        {
          date: "2026-09-20",
          games: [{ gamePk: 222222, status: { abstractGameState: "Final" } }],
        },
      ],
    };
    const provider = new MlbProvider(fixtureFetch(scheduleWithOnlyFinal, finalFeed));
    const game = await provider.getCurrentGame("brewers");
    expect(game?.status).toBe("final");
  });

  it("maps a postponed detailedState to postponed status", async () => {
    const postFeed = {
      ...liveFeed,
      gameData: {
        ...liveFeed.gameData,
        status: { abstractGameState: "Preview", detailedState: "Postponed" },
      },
    };
    const provider = new MlbProvider(fixtureFetch(scheduleWithLiveGame, postFeed));
    const game = await provider.getCurrentGame("brewers");
    expect(game?.status).toBe("postponed");
  });
});
