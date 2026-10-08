import type { CSSProperties, ReactNode } from "react";

interface PrintPaperProps {
  /** Start on a new printed page. */
  breakBefore?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}

/** One A4 sheet: a white page preview on screen, plain flow content when printed. */
export function PrintPaper({ breakBefore, style, children }: PrintPaperProps) {
  return (
    <section
      style={style}
      className={[
        "print-doc mx-auto box-border min-h-[297mm] w-[210mm] shrink-0 p-[12mm] shadow-lg",
        "print:m-0 print:min-h-0 print:w-auto print:p-0 print:shadow-none",
        breakBefore ? "break-before-page" : "",
      ].join(" ")}
    >
      {children}
    </section>
  );
}
