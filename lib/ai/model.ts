// The one OpenAI model every feature uses. Change it here; context limits and
// cost estimates below must match the model's published spec and pricing.
export const AI_MODEL = "gpt-6-sol";

export const AI_CONTEXT_LIMIT = 1_050_000;

// USD per 1M tokens. Requests with more than 272K input tokens are billed at
// 2x input and 1.5x output for the whole request.
const PRICING = { input: 2, output: 10 };
const LONG_CONTEXT_TOKENS = 272_000;

export function estimateCostUSD(inputTokens: number, outputTokens: number) {
  const long = inputTokens > LONG_CONTEXT_TOKENS;
  return {
    inputUSD: (inputTokens / 1e6) * PRICING.input * (long ? 2 : 1),
    outputUSD: (outputTokens / 1e6) * PRICING.output * (long ? 1.5 : 1),
  };
}
