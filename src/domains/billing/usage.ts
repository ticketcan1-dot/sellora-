import { z } from "zod";
export const billingUsageSchema = z.object({
  ai_calls: z.coerce.number().nonnegative(),
  messages: z.coerce.number().nonnegative(),
  input_tokens: z.coerce.number().nonnegative(),
  output_tokens: z.coerce.number().nonnegative(),
});
export function estimateUsageCost(
  usage: { input_tokens: number; output_tokens: number },
  inputRate: string | undefined,
  outputRate: string | undefined,
) {
  if (
    inputRate === undefined ||
    outputRate === undefined ||
    inputRate === "" ||
    outputRate === ""
  )
    return null;
  const input = Number(inputRate),
    output = Number(outputRate);
  if (
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input < 0 ||
    output < 0
  )
    return null;
  return (usage.input_tokens * input + usage.output_tokens * output) / 1000000;
}
