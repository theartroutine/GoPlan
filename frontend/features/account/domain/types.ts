export type UpdateProfilePayload = {
  first_name: string;
  last_name: string;
};

export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
};

export type AccountErrorCode =
  | "INVALID_CURRENT_PASSWORD"
  | "WEAK_PASSWORD"
  | "SAME_PASSWORD"
  | "AVATAR_TOO_LARGE"
  | "AVATAR_INVALID_FORMAT"
  | "AVATAR_DIMENSIONS_TOO_LARGE"
  | "AVATAR_STORAGE_DELETE_FAILED"
  | "THROTTLED";

export type AccountErrorBody = {
  detail: string;
  error_code?: AccountErrorCode;
};
