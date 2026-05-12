import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

import { CodeBlock } from "@/features/chat/presentation/code-block";

const markdownComponents: Components = {
  h1: ({ children }) => <strong>{children}</strong>,
  h2: ({ children }) => <strong>{children}</strong>,
  h3: ({ children }) => <strong>{children}</strong>,
  h4: ({ children }) => <strong>{children}</strong>,
  h5: ({ children }) => <strong>{children}</strong>,
  h6: ({ children }) => <strong>{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    if (React.isValidElement(child)) {
      // react-markdown doesn't export typed props for code elements,
      // so Record<string, unknown> is the safest narrowing available here.
      const props = child.props as Record<string, unknown>;
      const className = typeof props.className === "string" ? props.className : "";
      const code = props.children;
      const language = /language-(\w+)/.exec(className)?.[1] ?? "";
      return (
        <CodeBlock language={language} code={String(code ?? "").trimEnd()} />
      );
    }
    return <pre>{children}</pre>;
  },
  code: ({ children }) => (
    <code className="rounded bg-black/8 px-1 py-0.5 font-mono text-[12px]">
      {children}
    </code>
  ),
};

type Props = { content: string };

export function AiMessageContent({ content }: Props) {
  return (
    <div className="space-y-1.5 text-sm [&_li]:my-0.5 [&_ol]:ml-4 [&_ol]:list-decimal [&_ul]:ml-4 [&_ul]:list-disc">
      <ReactMarkdown
        remarkRehypeOptions={{ allowDangerousHtml: true }}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
