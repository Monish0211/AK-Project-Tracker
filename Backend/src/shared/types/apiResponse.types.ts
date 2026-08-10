/**
 * The one JSON envelope every endpoint responds with — success and error
 * responses are always shaped the same way so the frontend never needs a
 * per-endpoint parsing special case.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
}
