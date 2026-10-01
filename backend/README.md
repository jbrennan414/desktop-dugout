# Desktop Dugout — Backend

Fan-out service that polls a score data provider on behalf of many scoreboards and hands cached `GameState` to devices over a small HTTP API.

## Architecture

```
[Score provider]
      |
      v  (EventBridge every 1 min)
[PollProvider Lambda] --write--> [GameStates table (DynamoDB)]
                                          ^
                                          |
[Device] --GET /devices/{id}/state--> [GetDeviceState Lambda]
[Device] --POST /devices/register---> [RegisterDevice Lambda] --write--> [Devices table]
```

The device never talks to the provider directly. The `SCORE_PROVIDER` env var picks the implementation behind the `ScoreProvider` interface — currently `mock` only.

## Layout

```
backend/
├── src/
│   ├── domain/         # GameState types + poll-cadence rules (pure, testable)
│   ├── providers/      # ScoreProvider interface + MockProvider + factory
│   ├── handlers/       # Lambda entry points (register, get-state, poll)
│   ├── lib/            # DynamoDB client + repositories
│   └── config.ts       # Runtime env parsing
├── infra/              # CDK app + stack
└── test/               # Vitest unit tests
```

## Local dev

```
npm install
npm run build      # tsc typecheck (no emit — Lambdas are bundled by CDK)
npm test           # vitest — cadence + mock provider
npm run lint
npm run synth      # cdk synth to ./cdk.out (offline; no AWS calls)
```

## Deploy (when ready)

```
export AWS_REGION=us-west-2
npx cdk bootstrap aws://<account>/us-west-2   # once per account+region
npm run deploy
```

After deploy, the HTTP API URL is in the stack output. Point devices at it.

## HTTP API

### `POST /devices/register`

Request:
```json
{ "device_id": "optional-uuid", "team_id": "BOS" }
```
Response:
```json
{ "device_id": "…", "team_id": "BOS", "token": "…" }
```
Store the token on the device (NVS). Only the SHA-256 hash of the token is stored server-side.

### `GET /devices/{id}/state`

Headers: `Authorization: Bearer <token>`

Response:
```json
{
  "game": { "status": "live", "balls": 2, "strikes": 1, ... },
  "next_poll_ms": 7000
}
```

`next_poll_ms` is the backend's advice on when the device should poll next. Firmware should treat it as a hint, not a contract.

## Provider swap

Add a new implementation in `src/providers/`, register it in `factory.ts`, set `SCORE_PROVIDER` in the Lambda env. Populate `desktop-dugout/provider-api-key` in Secrets Manager first if the new provider needs credentials.

## Domain / DNS

Production API will live at `api.desktopdugout.com`. Custom domain + ACM cert wiring is deferred until a real provider is picked.
