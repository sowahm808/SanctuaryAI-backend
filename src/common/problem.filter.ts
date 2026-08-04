import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { requestContext } from "./request-context";
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const value =
      exception instanceof HttpException
        ? exception.getResponse()
        : "An unexpected error occurred";
    const detail =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "message" in value && typeof value.message === "string"
          ? value.message
          : "The request could not be completed.";
    const body = typeof value === "object" && value !== null ? value : {};
    const messages = "message" in body && Array.isArray(body.message)
      ? body.message.filter((message): message is string => typeof message === "string")
      : [];
    const code =
      "code" in body && typeof body.code === "string"
        ? body.code.toLowerCase()
        : status === 401
          ? "auth_invalid_credential"
          : status === 403
            ? "auth_forbidden"
            : status === 400
              ? "invalid_request"
            : status === 422
              ? "validation_failed"
              : "request_failed";
    response
      .status(status)
      .type("application/problem+json")
      .json({
        code,
        detail,
        correlationId: requestContext.getStore()?.correlationId,
        validation: messages.map((message) => ({
          field: message.split(" ", 1)[0] ?? "request",
          code: "invalid",
          message,
        })),
      });
  }
}
