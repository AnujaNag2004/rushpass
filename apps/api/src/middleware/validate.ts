import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

type Source = 'body' | 'query' | 'params';

/** Validates and replaces req[source] with the parsed (coerced, defaulted) value. */
export function validate<S extends ZodTypeAny>(schema: S, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    (req as unknown as Record<Source, z.infer<S>>)[source] = result.data;
    next();
  };
}
