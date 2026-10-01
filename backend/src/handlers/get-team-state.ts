import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { loadConfig } from "../config.js";
import { nextPollMs } from "../domain/cadence.js";
import { GameStateRepository } from "../lib/repositories.js";
import { getProvider } from "../providers/factory.js";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const config = loadConfig();
  const games = new GameStateRepository(config);

  const teamId = event.pathParameters?.teamId?.trim().toLowerCase();
  if (!teamId) return json(400, { error: "missing_team_id" });

  let game = await games.get(teamId);

  if (!game) {
    const provider = getProvider();
    game = await provider.getCurrentGame(teamId);
    if (game) await games.put(game);
  }

  if (!game) {
    return json(404, { error: "no_game", team_id: teamId });
  }

  return json(200, {
    game,
    next_poll_ms: nextPollMs(game),
  });
}

function json(status: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body, null, 2),
  };
}
