import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("returns focus to the message editor after sending with the button", async () => {
    const onSend = vi.fn().mockResolvedValue("ok");
    render(<RichComposer disabled={false} isSending={false} onSend={onSend} />);

    inputText("hello");
    const sendButton = screen.getByRole("button", { name: "Send message" });
    sendButton.focus();
    fireEvent.click(sendButton);

    await waitFor(() => expect(onSend).toHaveBeenCalledWith("hello"));
    await waitFor(() => expect(getEditor()).toHaveFocus());
  });

  it("keeps the AI prompt in the composer when the send is blocked", async () => {
    const onSend = vi.fn().mockResolvedValue("blocked");
    render(<RichComposer disabled={false} isSending={false} onSend={onSend} />);

    inputText("@GoPlanAI tạo lịch ngày 2");
    fireEvent.keyDown(getEditor(), { key: "Enter" });

    expect(await screen.findByText("@GoPlanAI")).toBeDefined();
    expect(getEditor()).toHaveValue("tạo lịch ngày 2");
  });

  it("empty AI prompt shows inline error and does not send", () => {
    const onSend = vi.fn();
    render(<RichComposer disabled={false} isSending={false} onSend={onSend} />);

    inputText("@GoPlanAI");
    fireEvent.keyDown(getEditor(), { key: "Enter" });

    expect(screen.getByText("What would you like to ask GoPlanAI?")).toBeDefined();
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
