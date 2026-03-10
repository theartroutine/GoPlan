export type AuthUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  identify_name: string | null;
  identify_code: string | null;
  identify_tag: string | null;
  is_profile_completed: boolean;
  requires_profile_setup: boolean;
};

export type BffAuthResponse = {
  user: AuthUser;
  access_token: string;
};

export type BffRegisterResponse = {
  detail: string;
  email: string;
};

export type FieldErrors = Record<string, string[]>;

export type AuthState = {
  user: AuthUser | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated" | "pending_profile";
};

export type AuthAction =
  | { type: "AUTH_LOADING" }
  | { type: "AUTH_SUCCESS"; user: AuthUser }
  | { type: "AUTH_PENDING_PROFILE"; user: AuthUser }
  | { type: "AUTH_PROFILE_COMPLETED"; user: AuthUser }
  | { type: "AUTH_LOGOUT" };
