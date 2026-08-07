import { ArgumentsHost } from "@nestjs/common";
import { ProblemFilter } from "../src/common/problem.filter";
import { FirestoreRequestError, isMissingFirestoreIndex } from "../src/database/firestore-request.error";

describe("ProblemFilter Firestore classification", () => {
  const classify = (error: FirestoreRequestError) => {
    const response = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    new ProblemFilter().catch(error, host);
    return response;
  };

  it("detects a normalized FAILED_PRECONDITION missing-index error", () => {
    const error = new FirestoreRequestError(400, "FAILED_PRECONDITION", 400, "The query requires an index.");
    expect(isMissingFirestoreIndex(error)).toBe(true);
  });

  it.each([
    ["FAILED_PRECONDITION", "The query requires an index.", 503, "firestore_index_not_ready"],
    ["UNAVAILABLE", "Firestore unavailable", 503, "firestore_unavailable"],
    ["DEADLINE_EXCEEDED", "Firestore timed out", 503, "firestore_timeout"],
    ["INVALID_ARGUMENT", "Invalid structured query", 500, "firestore_invalid_server_query"],
  ])("classifies %s without exposing the provider response", (firebaseStatus, message, status, code) => {
    const response = classify(new FirestoreRequestError(400, firebaseStatus, 400, message));
    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code }));
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(message);
  });
});
