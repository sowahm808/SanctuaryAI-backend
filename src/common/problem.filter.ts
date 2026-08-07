import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { requestContext } from "./request-context";
import { FirestoreRequestError, isMissingFirestoreIndex } from "../database/firestore-request.error";
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const firestoreStatus = exception instanceof FirestoreRequestError
      ? (["UNAVAILABLE", "DEADLINE_EXCEEDED"].includes(exception.firebaseStatus ?? "") || isMissingFirestoreIndex(exception)
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR)
      : undefined;
    const status = firestoreStatus ?? (
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR
    );
    const value = exception instanceof FirestoreRequestError
      ? this.firestoreProblem(exception)
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

  private firestoreProblem(error: FirestoreRequestError): { code: string; message: string } {
    if (isMissingFirestoreIndex(error)) return {
      code: "firestore_index_not_ready",
      message: "This data view is temporarily unavailable while its database index is being prepared.",
    };
    if (error.firebaseStatus === "DEADLINE_EXCEEDED") return {
      code: "firestore_timeout",
      message: "The data service did not respond in time.",
    };
    if (error.firebaseStatus === "UNAVAILABLE") return {
      code: "firestore_unavailable",
      message: "The data service is temporarily unavailable.",
    };
    if (error.firebaseStatus === "INVALID_ARGUMENT") return {
      code: "firestore_invalid_server_query",
      message: "The server generated an invalid data request.",
    };
    return {
      code: "firestore_request_failed",
      message: "The data request could not be completed.",
    };
  }
}
