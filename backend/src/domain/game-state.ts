export type GameStatus =
  | "no_game_today"
  | "scheduled"
  | "pre_game"
  | "live"
  | "mid_inning"
  | "final"
  | "postponed"
  | "delayed";

export type InningHalf = "top" | "bottom";

export interface LinescoreInning {
  inning: number;
  home: number | null;
  away: number | null;
}

export interface GameState {
  team_id: string;
  game_id: string | null;
  status: GameStatus;

  balls: number;
  strikes: number;
  outs: number;

  inning: number | null;
  half: InningHalf | null;

  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;

  hits_home: number;
  hits_away: number;
  errors_home: number;
  errors_away: number;

  linescore: LinescoreInning[];

  updated_at: string;
}

export interface DeviceRecord {
  device_id: string;
  team_id: string;
  token_hash: string;
  created_at: string;
  last_seen_at: string | null;
}

export interface DeviceStateResponse {
  game: GameState;
  next_poll_ms: number;
}
