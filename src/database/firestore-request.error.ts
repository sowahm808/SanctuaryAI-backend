export interface FirebaseFailure {
  httpStatus: number;
  firebaseStatus?: string;
  firebaseCode?: number;
  firebaseMessage: string;
  firebaseDetails?: unknown;
}

/** Internal provider failure. It must never be serialized directly to an API client. */
export class FirestoreRequestError extends Error implements FirebaseFailure {
  readonly name = "FirestoreRequestError";

  constructor(
    readonly httpStatus: number,
    readonly firebaseStatus: string | undefined,
    readonly firebaseCode: number | undefined,
    readonly firebaseMessage: string,
    readonly firebaseDetails?: unknown,
    options?: ErrorOptions,
  ) {
    super(firebaseMessage, options);
  }
}
