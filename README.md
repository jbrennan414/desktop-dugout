# Desktop Dugout

A desktop 3D-printed replica of Fenway Park's Green Monster manual scoreboard. Pulls live MLB game state over Wi-Fi and drives seven-segment digits behind a slat-style diffuser.

## Repo layout

```
desktop-dugout/
├── backend/     # Score fan-out service (AWS: API Gateway + Lambda + DynamoDB)
└── firmware/    # ESP32 firmware (not yet scaffolded)
```

Backend is scaffolded first so firmware can talk to a real endpoint from day one.

## Getting started (backend)

```
cd backend
npm install
npm run build      # tsc typecheck
npm test           # vitest
npm run synth      # cdk synth (offline, no AWS calls)
```

See `backend/README.md` for the full backend guide.

## Domain

`desktopdugout.com` — production API will live at `api.desktopdugout.com`. DNS/certs not yet wired.

## Region

All AWS resources deploy to `us-west-2`.
