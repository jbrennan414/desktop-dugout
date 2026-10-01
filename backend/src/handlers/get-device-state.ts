import { createHash, timingSafeEqual } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { loadConfig } from "../config.js";
import { nextPollMs } from "../domain/cadence.js";
import type { DeviceStateResponse } from "../domain/game-state.js";
import { DeviceRepository, GameStateRepository } from "../lib/repositories.js";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const config = loadConfig();
  const devices = new DeviceRepository(config);
  const games = new GameStateRepository(config);

  const deviceId = event.pathParameters?.id?.trim();
  if (!deviceId) return json(400, { error: "missing_device_id" });

  const token = extractBearer(event.headers?.authorization ?? event.headers?.Authorization);
  if (!token) return json(401, { error: "missing_token" });

  const device = await devices.get(deviceId);
  if (!device) return json(404, { error: "unknown_device" });

  const providedHash = createHash("sha256").update(token).digest();
  const expectedHash = Buffer.from(device.token_hash, "hex");
  if (
    providedHash.length !== expectedHash.length ||
    !timingSafeEqual(providedHash, expectedHash)
  ) {
    return json(401, { error: "bad_token" });
  }

  const game = await games.get(device.team_id);
  if (!game) return json(503, { error: "state_unavailable" });

  const response: DeviceStateResponse = {
    game,
    next_poll_ms: nextPollMs(game),
  };
  return json(200, response);
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}

function json(status: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
