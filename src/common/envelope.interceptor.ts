import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map, Observable } from "rxjs";
import { requestContext } from "./request-context";
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_c: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => ({
        data,
        meta: {},
        correlationId: requestContext.getStore()?.correlationId,
      })),
    );
  }
}
