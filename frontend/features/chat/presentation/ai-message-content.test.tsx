import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiMessageContent } from "@/features/chat/presentation/ai-message-content";

describe("AiMessageContent", () => {
  it("renders **text** as <strong>", () => {
    render(<AiMessageContent content="**bold text**" />);
    expect(document.querySelector("strong")?.textContent).toBe("bold text");
  });

  it("renders *text* as <em>", () => {
    render(<AiMessageContent content="*italic text*" />);
    expect(document.querySelector("em")?.textContent).toBe("italic text");
  });

  it("converts ## heading to <strong> — no <h2> in DOM", () => {
    render(<AiMessageContent content="## Section Title" />);
    expect(document.querySelector("h2")).toBeNull();
    expect(document.querySelector("strong")?.textContent).toBe("Section Title");
  });

  it("converts # heading to <strong> — no <h1> in DOM", () => {
    render(<AiMessageContent content="# Big Title" />);
    expect(document.querySelector("h1")).toBeNull();
    expect(document.querySelector("strong")?.textContent).toBe("Big Title");
  });

  it("renders links with target=_blank and rel=noopener noreferrer", () => {
    render(<AiMessageContent content="[Click here](https://example.com)" />);
    const link = screen.getByRole("link", { name: "Click here" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders fenced code block using CodeBlock (shows language label and code)", () => {
    render(<AiMessageContent content={"```bash\nnpm install\n```"} />);
    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("npm install")).toBeInTheDocument();
  });

  it("strips <script> tags — XSS prevention", () => {
    render(<AiMessageContent content={'<script>alert("xss")</script>hello'} />);
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });

  it("does not render markdown images", () => {
    render(<AiMessageContent content="![tracking pixel](https://example.com/pixel.png)" />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByAltText("tracking pixel")).toBeNull();
  });

  it("strips raw image tags", () => {
    render(<AiMessageContent content={'<img src="https://example.com/pixel.png" alt="pixel">hello'} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });
});
