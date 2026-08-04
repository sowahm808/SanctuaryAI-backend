import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from "@nestjs/common";
import { map, Observable } from "rxjs";
import { Reflector } from "@nestjs/core";
import { requestContext } from "./request-context";
export const RAW_RESPONSE = "raw-response";
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector = new Reflector()) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.reflector.get<boolean>(RAW_RESPONSE, context.getHandler())) {
      return next.handle();
    }
    return next.handle().pipe(
      map((data: unknown) => ({
        data,
        meta: {},
        correlationId: requestContext.getStore()?.correlationId,
      })),
    );
  }
}
