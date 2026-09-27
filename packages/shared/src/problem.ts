import { z } from 'zod';

// RFC 9457 problem details, the body of every API error response.
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
