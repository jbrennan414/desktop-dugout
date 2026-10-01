export interface RuntimeConfig {
  devicesTable: string;
  gameStatesTable: string;
  region: string;
}

export function loadConfig(): RuntimeConfig {
  return {
    devicesTable: required("DEVICES_TABLE"),
    gameStatesTable: required("GAME_STATES_TABLE"),
    region: process.env.AWS_REGION ?? "us-west-2",
  };
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}
