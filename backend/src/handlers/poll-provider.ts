import { loadConfig } from "../config.js";
import { getProvider } from "../providers/factory.js";
import { GameStateRepository } from "../lib/repositories.js";

const DEFAULT_TEAMS = ["BOS"];

export async function handler(): Promise<{
  polled: number;
  updated: number;
  preserved: number;
}> {
  const config = loadConfig();
  const provider = getProvider();
  const games = new GameStateRepository(config);

  const registered = await games.listAllTeams();
  const teams = registered.length > 0 ? registered : DEFAULT_TEAMS;

  let updated = 0;
  let preserved = 0;
  for (const teamId of teams) {
    try {
      const state = await provider.getCurrentGame(teamId);
      if (!state) continue;
      // Preserve the last real game state until a new game appears on the schedule.
      if (state.status === "no_game_today") {
        preserved += 1;
        continue;
      }
      await games.put(state);
      updated += 1;
    } catch (err) {
      console.error(`poll_failed team=${teamId}`, err);
    }
  }

  return { polled: teams.length, updated, preserved };
}
