import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AvatarSection } from "@/features/account/presentation/avatar-section";

const authMock = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

const avatarHookMock = vi.hoisted(() => ({
  useUpdateAvatar: vi.fn(),
}));

vi.mock("@/features/auth/application/auth-context", () => authMock);
vi.mock("@/features/account/application/use-update-avatar", () => avatarHookMock);

describe("AvatarSection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMock.useAuth.mockReturnValue({
      user: {
        id: "user-1",
        email: "owner@example.com",
        first_name: "Quang",
        last_name: "Minh",
        display_name: "Quang Minh",
        identify_name: "quangminh",
        identify_code: "ABC123",
        identify_tag: "quangminh#ABC123",
        avatar_url: "/media/avatars/a.webp",
        email_verified: true,
        is_profile_completed: true,
        requires_profile_setup: false,
      },
    });
  });

  it("shows the avatar mutation error when remove fails", () => {
    const remove = vi.fn().mockResolvedValue(false);
    avatarHookMock.useUpdateAvatar.mockReturnValue({
      remove,
      uploading: false,
      error: "Could not remove avatar.",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AvatarSection />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    expect(screen.getByText("Could not remove avatar.")).toBeInTheDocument();
  });
});
