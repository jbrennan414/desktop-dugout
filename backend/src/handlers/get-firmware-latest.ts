import type { APIGatewayProxyResultV2 } from "aws-lambda";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});

interface FirmwarePointer {
  version: string;
  sha256: string;
}

export async function handler(): Promise<APIGatewayProxyResultV2> {
  const paramName = required("FIRMWARE_POINTER_PARAM");
  const cdnHost = required("FIRMWARE_CDN_HOST");

  let pointer: FirmwarePointer;
  try {
    const result = await ssm.send(new GetParameterCommand({ Name: paramName }));
    pointer = JSON.parse(result.Parameter?.Value ?? "{}") as FirmwarePointer;
  } catch (err) {
    if (err instanceof Error && err.name === "ParameterNotFound") {
      return json(404, { error: "no_firmware_published" });
    }
    throw err;
  }

  if (!pointer.version || pointer.version === "none" || !pointer.sha256) {
    return json(404, { error: "no_firmware_published" });
  }

  return json(200, {
    version: pointer.version,
    url: `https://${cdnHost}/firmware/${pointer.version}.bin`,
    sha256: pointer.sha256,
  });
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function json(status: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=60",
    },
    body: JSON.stringify(body),
  };
}
