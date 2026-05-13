import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RichComposer } from "@/features/chat/presentation/rich-composer";

function getEditor(): HTMLElement {
  return screen.getByLabelText("Message");
}

function inputText(value: string): void {
  const editor = getEditor();
  fireEvent.change(editor, { target: { value } });
}

describe("RichComposer", () => {
  it("opens upward command menu when typing at sign", () => {
    render(<RichComposer disabled={false} isSending={false} onSend={vi.fn()} />);

    inputText("@");

    expect(screen.getByText("@GoPlanAI")).toBeDefined();
    expect(screen.getByRole("menu")).toBeDefined();
  });

  it("enter selects GoPlanAI while menu is open", () => {
    const onSend = vi.fn();
    render(<RichComposer disabled={false} isSending={false} onSend={onSend} />);

    inputText("@");
    fireEvent.keyDown(getEditor(), { key: "Enter" });

    expect(screen.getByText("@GoPlanAI")).toBeDefined();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("manual GoPlanAI mention sends normalized mention first", () => {
    const onSend = vi.fn();
    render(<RichComposer disabled={false} isSending={false} onSend={onSend} />);

    inputText("plan day 1 @GoPlanAI");
    fireEvent.keyDown(getEditor(), { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("@GoPlanAI plan day 1");
  });

  it("empty AI prompt shows inline error and does not send", () => {
    const onSend = vi.fn();
    render(<RichComposer disabled={false} isSending={false} onSend={onSend} />);

    inputText("@GoPlanAI");
    fireEvent.keyDown(getEditor(), { key: "Enter" });

    expect(screen.getByText("Bạn muốn hỏi GoPlanAI điều gì?")).toBeDefined();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("limits AI prompt text so the sent backend payload stays within 2000 characters", () => {
    const onSend = vi.fn();
    render(<RichComposer disabled={false} isSending={false} onSend={onSend} />);

    inputText(`@GoPlanAI ${"a".repeat(2000)}`);
    fireEvent.keyDown(getEditor(), { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    const sent = onSend.mock.calls[0][0] as string;
    expect(sent).toHaveLength(2000);
    expect(sent).toBe(`@GoPlanAI ${"a".repeat(1990)}`);
  });

  it("backspace removes an empty GoPlanAI token", () => {
    render(<RichComposer disabled={false} isSending={false} onSend={vi.fn()} />);

    inputText("@");
    fireEvent.keyDown(getEditor(), { key: "Enter" });
    fireEvent.keyDown(getEditor(), { key: "Backspace" });

    expect(screen.queryByText("@GoPlanAI")).toBeNull();
  });
});
