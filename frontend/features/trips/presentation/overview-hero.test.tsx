import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

import { OverviewHero } from "./overview-hero";

describe("OverviewHero", () => {
  it("renders trip name, destination, and status badge", () => {
    render(
      <OverviewHero
        tripName="Da Lat Weekend Escape"
        destination="Da Lat, Vietnam"
        coverImageUrl="https://example.com/cover.jpg"
        status="PLANNING"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Da Lat Weekend Escape" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Da Lat, Vietnam")).toBeInTheDocument();
    expect(screen.getByText(/Planning/i)).toBeInTheDocument();
  });

  it("marks decorative layers as aria-hidden", () => {
    const { container } = render(
      <OverviewHero
        tripName="Trip"
        destination="Somewhere"
        coverImageUrl={null}
        status="PLANNING"
      />,
    );
    const decoratives = container.querySelectorAll('[aria-hidden="true"]');
    expect(decoratives.length).toBeGreaterThanOrEqual(4);
  });

  it("uses cover image as alt source", () => {
    const { container } = render(
      <OverviewHero
        tripName="My Trip"
        destination="Here"
        coverImageUrl="/some.jpg"
        status="ONGOING"
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("My Trip cover");
  });
});
