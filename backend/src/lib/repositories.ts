import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { RuntimeConfig } from "../config.js";
import type { DeviceRecord, GameState } from "../domain/game-state.js";
import { docClient } from "./dynamo.js";

export class DeviceRepository {
  constructor(private readonly config: RuntimeConfig) {}

  async put(device: DeviceRecord): Promise<void> {
    await docClient().send(
      new PutCommand({
        TableName: this.config.devicesTable,
        Item: device,
      }),
    );
  }

  async get(deviceId: string): Promise<DeviceRecord | null> {
    const result = await docClient().send(
      new GetCommand({
        TableName: this.config.devicesTable,
        Key: { device_id: deviceId },
      }),
    );
    return (result.Item as DeviceRecord | undefined) ?? null;
  }
}

export class GameStateRepository {
  constructor(private readonly config: RuntimeConfig) {}

  async put(state: GameState): Promise<void> {
    await docClient().send(
      new PutCommand({
        TableName: this.config.gameStatesTable,
        Item: state,
      }),
    );
  }

  async get(teamId: string): Promise<GameState | null> {
    const result = await docClient().send(
      new GetCommand({
        TableName: this.config.gameStatesTable,
        Key: { team_id: teamId },
      }),
    );
    return (result.Item as GameState | undefined) ?? null;
  }

  async listAllTeams(): Promise<string[]> {
    const result = await docClient().send(
      new ScanCommand({
        TableName: this.config.gameStatesTable,
        ProjectionExpression: "team_id",
      }),
    );
    return (result.Items ?? []).map((item) => item.team_id as string);
  }
}
