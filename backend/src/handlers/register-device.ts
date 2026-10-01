import { randomBytes, createHash, randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { loadConfig } from "../config.js";
import type { DeviceRecord } from "../domain/game-state.js";
import { DeviceRepository } from "../lib/repositories.js";

interface RegisterBody {
  device_id?: string;
  team_id?: string;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const config = loadConfig();
  const devices = new DeviceRepository(config);

  let body: RegisterBody;
  try {
    body = event.body ? (JSON.parse(event.body) as RegisterBody) : {};
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const teamId = body.team_id?.trim();
  if (!teamId) return json(400, { error: "team_id_required" });

  const deviceId = body.device_id?.trim() || randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date().toISOString();

  const record: DeviceRecord = {
    device_id: deviceId,
    team_id: teamId,
    token_hash: tokenHash,
    created_at: now,
    last_seen_at: null,
  };
  await devices.put(record);

  return json(200, { device_id: deviceId, team_id: teamId, token });
}

function json(status: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
