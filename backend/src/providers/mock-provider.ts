import type { GameState } from "../domain/game-state.js";
import type { ScoreProvider } from "./score-provider.js";

type Fixture = "pre_game" | "live_early" | "live_late" | "final" | "no_game";

export interface MockProviderOptions {
  fixture?: Fixture;
  now?: () => Date;
}

export class MockProvider implements ScoreProvider {
  readonly name = "mock";
  private readonly fixture: Fixture;
  private readonly now: () => Date;

  constructor(options: MockProviderOptions = {}) {
    this.fixture = options.fixture ?? "live_early";
    this.now = options.now ?? (() => new Date());
  }

  async getCurrentGame(teamId: string): Promise<GameState | null> {
    if (this.fixture === "no_game") return null;
    return this.buildFixture(teamId, this.fixture);
  }

  private buildFixture(teamId: string, fixture: Exclude<Fixture, "no_game">): GameState {
    const home = teamId.toUpperCase();
    const away = home === "NYY" ? "BOS" : "NYY";
    const base: GameState = {
      team_id: teamId,
      game_id: `mock-${teamId}-${fixture}`,
      status: "live",
      balls: 0,
      strikes: 0,
      outs: 0,
      inning: 1,
      half: "top",
      home_team: home,
      away_team: away,
      home_score: 0,
      away_score: 0,
      hits_home: 0,
      hits_away: 0,
      errors_home: 0,
      errors_away: 0,
      linescore: Array.from({ length: 9 }, (_, i) => ({
        inning: i + 1,
        home: null,
        away: null,
      })),
      updated_at: this.now().toISOString(),
    };

    switch (fixture) {
      case "pre_game":
        return { ...base, status: "pre_game", inning: null, half: null };

      case "live_early":
        return {
          ...base,
          status: "live",
          inning: 3,
          half: "bottom",
          balls: 2,
          strikes: 1,
          outs: 1,
          home_score: 1,
          away_score: 0,
          hits_home: 3,
          hits_away: 2,
          linescore: base.linescore.map((row) => {
            if (row.inning === 1) return { ...row, away: 0, home: 0 };
            if (row.inning === 2) return { ...row, away: 0, home: 1 };
            if (row.inning === 3) return { ...row, away: 0, home: null };
            return row;
          }),
        };

      case "live_late":
        return {
          ...base,
          status: "live",
          inning: 8,
          half: "top",
          balls: 3,
          strikes: 2,
          outs: 2,
          home_score: 4,
          away_score: 3,
          hits_home: 8,
          hits_away: 7,
          errors_home: 1,
          errors_away: 0,
        };

      case "final":
        return {
          ...base,
          status: "final",
          inning: 9,
          half: "bottom",
          balls: 0,
          strikes: 0,
          outs: 3,
          home_score: 5,
          away_score: 4,
          hits_home: 10,
          hits_away: 8,
        };
    }
  }
}
