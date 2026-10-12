import BrandMark from "./BrandMark";
import CaseStrip from "./CaseStrip";

const SAMPLE = ["passed", "passed", "passed", "needs_review", "approved", "draft", "draft"];

export default function AuthLayout({ title, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(420px,1fr)_1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-semibold">
              Testwright <span className="font-medium text-primary">AI</span>
            </span>
          </div>
          <div className="space-y-5">
            <h1 className="text-[22px] font-semibold">{title}</h1>
            {children}
          </div>
          {footer && <p className="text-sm text-muted-foreground">{footer}</p>}
        </div>
      </div>
      <aside className="hidden flex-col justify-center gap-6 border-l border-border bg-card px-12 lg:flex">
        <div className="max-w-md space-y-6">
          <CaseStrip states={SAMPLE} size="lg" />
          <p className="text-[22px] leading-snug font-semibold">
            Review what the AI drafts, approve what's right, and release when the verdict says so.
          </p>
          <p className="text-sm text-muted-foreground">
            Each requirement becomes test cases you sign off, Playwright scripts that run against
            your app, and a release recommendation you can take to the release meeting.
          </p>
        </div>
      </aside>
    </div>
  );
}
