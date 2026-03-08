import { z } from "zod";

export const A2APhase1Schema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .strict()
  .optional();

export const A2ASchema = z
  .object({
    phase1: A2APhase1Schema,
  })
  .strict()
  .optional();
