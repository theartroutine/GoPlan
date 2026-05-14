import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { UserAvatar } from "@/shared/ui/user-avatar";

beforeAll(() => {
  // Radix Avatar probes images via the global Image constructor before
  // rendering <img>. In jsdom the network never resolves, so we stub the
  // constructor to fire the 'load' event synchronously when src is assigned.
  class StubImage {
    private listeners: Record<string, Array<() => void>> = {};
    addEventListener(event: string, cb: () => void) {
      (this.listeners[event] ||= []).push(cb);
    }
    removeEventListener(event: string, cb: () => void) {
      this.listeners[event] = (this.listeners[event] ?? []).filter((c) => c !== cb);
    }
    set src(_: string) {
      queueMicrotask(() => {
        (this.listeners["load"] ?? []).forEach((cb) => cb());
      });
    }
  }
  (globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;
});

describe("UserAvatar", () => {
  it("renders initials fallback when avatar_url is null", () => {
    render(
      <UserAvatar
        user={{
          avatar_url: null,
          display_name: "Dương Minh",
          identify_tag: "minh#ABCDEF",
        }}
      />
    );
    expect(screen.getByText("DM")).toBeInTheDocument();
  });

  it("seeds gradient by identify_tag, not display_name", () => {
    const { container: a } = render(
      <UserAvatar
        user={{
          avatar_url: null,
          display_name: "Alice One",
          identify_tag: "shared#STABLE",
        }}
      />
    );
    const { container: b } = render(
      <UserAvatar
        user={{
          avatar_url: null,
          display_name: "Bob Two",
          identify_tag: "shared#STABLE",
        }}
      />
    );
    const fallbackA = a.querySelector('[data-slot="avatar-fallback"]');
    const fallbackB = b.querySelector('[data-slot="avatar-fallback"]');
    expect(fallbackA?.className).toEqual(fallbackB?.className);
  });

  it("renders AvatarImage when avatar_url provided", async () => {
    render(
      <UserAvatar
        user={{
          avatar_url: "/media/avatars/2026/05/abc.webp",
          display_name: "Dương Minh",
          identify_tag: "minh#ABCDEF",
        }}
      />
    );
    const img = await waitFor(() => screen.getByRole("img", { name: "Dương Minh" }));
    expect(img.getAttribute("src")).toBe("/media/avatars/2026/05/abc.webp");
  });
});
