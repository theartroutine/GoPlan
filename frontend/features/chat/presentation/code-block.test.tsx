import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock hljs to avoid CSS loading issues in jsdom
vi.mock("highlight.js", () => ({
  default: {
    highlight: vi.fn((code: string) => ({ value: code })),
  },
}));

import { CodeBlock } from "@/features/chat/presentation/code-block";

describe("CodeBlock", () => {
  it("renders the language label", () => {
    render(<CodeBlock language="python" code="print('hello')" />);
    expect(screen.getByText("python")).toBeInTheDocument();
  });

  it("shows 'code' label when language is empty", () => {
    render(<CodeBlock language="" code="something" />);
    expect(screen.getByText("code")).toBeInTheDocument();
  });

  it("renders the code content", () => {
    render(<CodeBlock language="bash" code="npm install" />);
    expect(screen.getByText("npm install")).toBeInTheDocument();
  });

  it("calls clipboard.writeText with the code on Copy click", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<CodeBlock language="bash" code="npm install" />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("npm install");
  });

  it("shows 'Copied' text after clicking copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<CodeBlock language="bash" code="npm install" />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });
});
