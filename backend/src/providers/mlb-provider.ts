import type {
  GameState,
  GameStatus,
  InningHalf,
  LinescoreInning,
} from "../domain/game-state.js";
import { ProviderError, type ScoreProvider } from "./score-provider.js";

const SCHEDULE_BASE = "https://statsapi.mlb.com/api/v1";
const LIVE_BASE = "https://statsapi.mlb.com/api/v1.1";
const LOOKBACK_DAYS = 7;

const TEAM_IDS: Record<string, number> = {
  // AL East
  orioles: 110, redsox: 111, yankees: 147, rays: 139, bluejays: 141,
  // AL Central
  whitesox: 145, guardians: 114, tigers: 116, royals: 118, twins: 142,
  // AL West
  astros: 117, angels: 108, athletics: 133, mariners: 136, rangers: 140,
  // NL East
  braves: 144, marlins: 146, mets: 121, phillies: 143, nationals: 120,
  // NL Central
  cubs: 112, reds: 113, brewers: 158, pirates: 134, cardinals: 138,
  // NL West
  diamondbacks: 109, rockies: 115, dodgers: 119, padres: 135, giants: 137,
};

interface ScheduleResponse {
  dates: Array<{
    date: string;
    games: Array<{
      gamePk: number;
      status?: { abstractGameState?: string; detailedState?: string };
    }>;
  }>;
}

interface LiveFeed {
  gamePk: number;
  gameData: {
    status: { abstractGameState?: string; detailedState?: string };
    teams: {
      home: { abbreviation?: string; teamName?: string };
      away: { abbreviation?: string; teamName?: string };
    };
  };
  liveData?: {
    linescore?: {
      currentInning?: number;
      inningHalf?: string;
      inningState?: string;
      balls?: number;
      strikes?: number;
      outs?: number;
      innings?: Array<{
        num: number;
        home?: { runs?: number };
        away?: { runs?: number };
      }>;
      teams?: {
        home?: { runs?: number; hits?: number; errors?: number };
        away?: { runs?: number; hits?: number; errors?: number };
      };
    };
  };
}

type Fetcher = typeof fetch;

export class MlbProvider implements ScoreProvider {
  readonly name = "mlb";

  constructor(
    private readonly fetchFn: Fetcher = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getCurrentGame(teamId: string): Promise<GameState | null> {
    const slug = teamId.toLowerCase().replace(/[^a-z]/g, "");
    const mlbId = TEAM_IDS[slug];
    if (!mlbId) return null;

    // Query a rolling window ending today, so we can fall back to the most
    // recent completed game when today has nothing scheduled.
    const end = this.easternDate();
    const start = this.easternDateOffset(-LOOKBACK_DAYS);
    const scheduleUrl = `${SCHEDULE_BASE}/schedule?sportId=1&teamId=${mlbId}&startDate=${start}&endDate=${end}`;
    const schedule = await this.getJson<ScheduleResponse>(scheduleUrl);

    const games = schedule.dates.flatMap((d) => d.games);
    if (games.length === 0) {
      return this.noGameState(teamId);
    }

    const chosen = pickBestGame(games);
    if (!chosen) return this.noGameState(teamId);

    const feedUrl = `${LIVE_BASE}/game/${chosen.gamePk}/feed/live`;
    const feed = await this.getJson<LiveFeed>(feedUrl);

    return this.parseFeed(teamId, feed);
  }

  private parseFeed(teamId: string, feed: LiveFeed): GameState {
    const status = mapStatus(feed);
    const ls = feed.liveData?.linescore;
    const home = feed.gameData.teams.home;
    const away = feed.gameData.teams.away;

    const innings: LinescoreInning[] = (ls?.innings ?? []).map((inn) => ({
      inning: inn.num,
      home: inn.home?.runs ?? null,
      away: inn.away?.runs ?? null,
    }));
    while (innings.length < 9) {
      innings.push({ inning: innings.length + 1, home: null, away: null });
    }

    const isLive = status === "live";

    return {
      team_id: teamId,
      game_id: String(feed.gamePk),
      status,
      balls: isLive ? ls?.balls ?? 0 : 0,
      strikes: isLive ? ls?.strikes ?? 0 : 0,
      outs: isLive ? ls?.outs ?? 0 : 0,
      inning: ls?.currentInning ?? null,
      half: mapHalf(ls?.inningHalf),
      home_team: home.abbreviation ?? home.teamName ?? "",
      away_team: away.abbreviation ?? away.teamName ?? "",
      home_score: ls?.teams?.home?.runs ?? 0,
      away_score: ls?.teams?.away?.runs ?? 0,
      hits_home: ls?.teams?.home?.hits ?? 0,
      hits_away: ls?.teams?.away?.hits ?? 0,
      errors_home: ls?.teams?.home?.errors ?? 0,
      errors_away: ls?.teams?.away?.errors ?? 0,
      linescore: innings,
      updated_at: this.now().toISOString(),
    };
  }

  private noGameState(teamId: string): GameState {
    return {
      team_id: teamId,
      game_id: null,
      status: "no_game_today",
      balls: 0,
      strikes: 0,
      outs: 0,
      inning: null,
      half: null,
      home_team: "",
      away_team: "",
      home_score: 0,
      away_score: 0,
      hits_home: 0,
      hits_away: 0,
      errors_home: 0,
      errors_away: 0,
      linescore: [],
      updated_at: this.now().toISOString(),
    };
  }

  private easternDate(): string {
    return this.formatEastern(this.now());
  }

  private easternDateOffset(offsetDays: number): string {
    const base = this.now();
    const shifted = new Date(base.getTime() + offsetDays * 86_400_000);
    return this.formatEastern(shifted);
  }

  private formatEastern(d: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchFn(url, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new ProviderError(`MLB StatsAPI ${res.status} on ${url}`);
    }
    return (await res.json()) as T;
  }
}

function pickBestGame(
  games: Array<{ gamePk: number; status?: { abstractGameState?: string } }>,
): { gamePk: number } | undefined {
  // Priority: a game in progress → the most recent completed game → a scheduled game.
  // Preview loses to Final so we keep showing the last game until the next one actually starts.
  const live = games.find((g) => g.status?.abstractGameState === "Live");
  if (live) return live;
  const finals = games.filter((g) => g.status?.abstractGameState === "Final");
  if (finals.length > 0) return finals[finals.length - 1];
  const preview = games.find((g) => g.status?.abstractGameState === "Preview");
  if (preview) return preview;
  return games[games.length - 1];
}

function mapStatus(feed: LiveFeed): GameStatus {
  const abstract = feed.gameData.status.abstractGameState ?? "";
  const detailed = (feed.gameData.status.detailedState ?? "").toLowerCase();

  if (detailed.includes("postponed")) return "postponed";
  if (detailed.includes("delayed") || detailed.includes("rain")) return "delayed";

  switch (abstract) {
    case "Preview":
      return detailed.includes("warmup") ? "pre_game" : "scheduled";
    case "Live": {
      const inningState = feed.liveData?.linescore?.inningState;
      if (inningState === "Middle" || inningState === "End") return "mid_inning";
      return "live";
    }
    case "Final":
      return "final";
    default:
      return "scheduled";
  }
}

function mapHalf(mlb: string | undefined): InningHalf | null {
  if (mlb === "Top") return "top";
  if (mlb === "Bottom") return "bottom";
  return null;
}
