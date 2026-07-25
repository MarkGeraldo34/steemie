const X_PROFILE_URL_RE = /^https?:\/\/(www\.)?(twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?(\?.*)?$/i;

export const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => <h1 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />,
  h2: (props: React.ComponentProps<'h2'>) => <h2 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />,
  h3: (props: React.ComponentProps<'h3'>) => <h3 className="mt-2 mb-1 text-sm font-semibold first:mt-0" {...props} />,
  p: (props: React.ComponentProps<'p'>) => <p className="mb-2 text-sm leading-relaxed last:mb-0" {...props} />,
  ul: (props: React.ComponentProps<'ul'>) => <ul className="mb-2 list-disc space-y-0.5 pl-5 text-sm last:mb-0" {...props} />,
  ol: (props: React.ComponentProps<'ol'>) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 text-sm last:mb-0" {...props} />,
  strong: (props: React.ComponentProps<'strong'>) => <strong className="font-semibold" {...props} />,
  a: ({ href, ...props }: React.ComponentProps<'a'>) => {
    const isProfileLink = !!href && X_PROFILE_URL_RE.test(href);
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={
          isProfileLink
            ? 'font-semibold text-brand hover:underline'
            : 'text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent'
        }
        {...props}
      />
    );
  },
  table: (props: React.ComponentProps<'table'>) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: (props: React.ComponentProps<'th'>) => (
    <th className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-left font-medium" {...props} />
  ),
  td: (props: React.ComponentProps<'td'>) => <td className="border border-zinc-200 px-2 py-1" {...props} />,
  code: (props: React.ComponentProps<'code'>) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs" {...props} />
  ),
};
