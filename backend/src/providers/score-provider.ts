import type { GameState } from "../domain/game-state.js";

export interface ScoreProvider {
  readonly name: string;
  getCurrentGame(teamId: string): Promise<GameState | null>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
