import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders Markdown produced by the chat assistant — GFM tables, lists,
 * code, emphasis — styled for the OMA chat bubble.
 *
 * Raw HTML is intentionally not rendered (no rehype-raw), so the
 * LLM-generated content stays XSS-safe.
 */
const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h3 className="mt-3 mb-1 text-base font-bold first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="mt-3 mb-1 text-sm font-bold first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mt-2.5 mb-1 text-sm font-bold first:mt-0">{children}</h5>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[var(--color-accent)] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-black/20 pl-3 text-black/60">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-black/10" />,
  code: ({ children }) => (
    <code className="rounded-[2px] bg-black/[0.06] px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto border border-black/10 bg-black/[0.04] p-2.5 text-xs [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-xs">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <table className="my-2 block w-full overflow-x-auto border-collapse text-xs">
      {children}
    </table>
  ),
  th: ({ children }) => (
    <th className="border border-black/15 px-2 py-1 text-left font-bold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-black/15 px-2 py-1 align-top">{children}</td>
  ),
};

export default function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
