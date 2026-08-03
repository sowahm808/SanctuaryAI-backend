import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { requestContext } from "./request-context";
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const supplied = req.header("x-correlation-id");
    const correlationId =
      supplied && /^[0-9a-f-]{36}$/i.test(supplied) ? supplied : randomUUID();
    res.setHeader("x-correlation-id", correlationId);
    requestContext.run({ correlationId }, next);
  }
}
