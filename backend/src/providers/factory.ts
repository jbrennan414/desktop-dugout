import { MlbProvider } from "./mlb-provider.js";
import { MockProvider } from "./mock-provider.js";
import type { ScoreProvider } from "./score-provider.js";

export function getProvider(): ScoreProvider {
  const kind = process.env.SCORE_PROVIDER ?? "mock";
  switch (kind) {
    case "mock":
      return new MockProvider({
        fixture: (process.env.MOCK_FIXTURE as never) ?? "live_early",
      });
    case "mlb":
      return new MlbProvider();
    default:
      throw new Error(`Unknown SCORE_PROVIDER: ${kind}`);
  }
}
