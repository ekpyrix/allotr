import { errorCodeMessage, t } from '../messages/t.ts';
import { ApiError } from './api.ts';

export interface ProblemMessage {
  /** One sentence for the whole failure. */
  message: string;
  /** Messages per invalid field, keyed by the last segment of its path. */
  fields: Record<string, string>;
}

/** What to tell the user about a failed request. */
export function describeProblem(error: unknown): ProblemMessage {
  if (!(error instanceof ApiError))
    return { message: t('errors.network'), fields: {} };
  const { problem } = error;

  const byCode =
    problem.code === undefined ? undefined : errorCodeMessage(problem.code);
  if (byCode !== undefined) return { message: byCode, fields: {} };

  const issues = problem.errors ?? [];
  if (issues.length > 0) {
    const fields: Record<string, string> = {};
    for (const issue of issues) fields[fieldName(issue.path)] ??= issue.message;
    const [first] = issues;
    const message =
      issues.length === 1 && first !== undefined
        ? t('errors.fieldProblem', {
            field: fieldLabel(fieldName(first.path)),
            message: first.message,
          })
        : t('errors.validationSummary', { count: issues.length });
    return { message, fields };
  }

  if (problem.detail !== undefined)
    return { message: problem.detail, fields: {} };
  if (error.status === 404)
    return { message: t('errors.notFound'), fields: {} };
  if (error.status === 409)
    return { message: t('errors.conflict'), fields: {} };
  if (error.status === 429) return { message: t('errors.tooMany'), fields: {} };
  return {
    message: t('errors.unexpected', {
      status: error.status,
      title: problem.title,
    }),
    fields: {},
  };
}

export function errorMessage(error: unknown): string {
  return describeProblem(error).message;
}

// Validation paths are dotted (`postings.0.amount`) or JSON Pointers.
function fieldName(path: string): string {
  return path.split(/[./]/).filter(Boolean).pop() ?? path;
}

function fieldLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
