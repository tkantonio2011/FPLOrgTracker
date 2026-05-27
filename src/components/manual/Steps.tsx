import { Children, isValidElement, type ReactNode } from "react";

interface StepsProps {
  children: ReactNode;
}

interface StepProps {
  title: string;
  children: ReactNode;
}

/**
 * Step container. Renders each `<Step>` child as a numbered list item with
 * the step number, the step title, and the step body.
 *
 * Built without `<ol>` semantics deliberately — we render the number inline
 * for visual emphasis. Screen readers consume the headings as a list.
 */
export function Steps({ children }: StepsProps) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <div className="not-prose my-6 space-y-6">
      {items.map((child, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr] gap-x-4 items-start">
          <div className="w-8 h-8 rounded-full bg-[#37003c] text-white flex items-center justify-center font-bold text-sm shrink-0">
            {i + 1}
          </div>
          <div>{child}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * A single step inside `<Steps>`. The body is rendered as flowing prose
 * (so authors can embed `<AnnotatedImage>` or `<Callout>` inside).
 */
export function Step({ title, children }: StepProps) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900 mb-1">{title}</h3>
      <div className="prose prose-slate prose-sm max-w-none">{children}</div>
    </div>
  );
}
