import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { requestContext } from "./request-context";
import { FirestoreRequestError } from "../database/firestore-request.error";
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const firestoreStatus = exception instanceof FirestoreRequestError
      ? (["UNAVAILABLE", "DEADLINE_EXCEEDED"].includes(exception.firebaseStatus ?? "") ||
          (exception.firebaseStatus === "FAILED_PRECONDITION" && /index/i.test(exception.message))
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR)
      : undefined;
    const status = firestoreStatus ?? (
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR
    );
    const value = exception instanceof FirestoreRequestError
      ? {
          code: status === 503 ? "firestore_unavailable" : "firestore_request_failed",
          message: status === 503
            ? "The data service is temporarily unavailable."
            : "The server generated an invalid data request.",
        }
      :
      exception instanceof HttpException
        ? exception.getResponse()
        : "An unexpected error occurred";
    const detail =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "detail" in value && typeof value.detail === "string"
          ? value.detail
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
        correlationId: "correlationId" in body && typeof body.correlationId === "string" ? body.correlationId : requestContext.getStore()?.correlationId,
        validation: "validation" in body && Array.isArray(body.validation) ? body.validation : messages.map((message) => ({
          field: message.split(" ", 1)[0] ?? "request",
          code: "invalid",
          message,
        })),
      });
  }
}
