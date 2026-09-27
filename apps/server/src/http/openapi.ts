import { problemDetailsSchema } from '@allotr/shared';
import type { ZodType } from 'zod';

export function json<T extends ZodType>(schema: T, description: string) {
  return { description, content: { 'application/json': { schema } } };
}

export function problemResponse(description: string) {
  return {
    description,
    content: { 'application/problem+json': { schema: problemDetailsSchema } },
  };
}

export const unauthenticated = problemResponse('Not signed in.');
export const forbidden = problemResponse(
  'Not allowed, or two-factor enrolment is required first.',
);
