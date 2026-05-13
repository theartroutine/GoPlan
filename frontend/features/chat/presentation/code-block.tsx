"use client";

import hljs from "highlight.js";
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  language: string;
  code: string;
};

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false);

  const highlightedHtml = useMemo(() => {
    if (!language) return null;
    try {
      return hljs.highlight(code, { language }).value;
    } catch {
      return null;
    }
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl bg-[#1e1e2e]">
      <div className="flex items-center justify-between bg-[#181825] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wide text-white/30">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy"}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
        >
          {copied ? <Check size={10} strokeWidth={2.5} /> : <Copy size={10} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pb-3 pt-2 text-[12px] leading-relaxed">
        {highlightedHtml ? (
          <code
            className={`language-${language} hljs`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <code className="hljs">{code}</code>
        )}
      </pre>
    </div>
  );
}
