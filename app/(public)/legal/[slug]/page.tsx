import Link from "next/link";
import { notFound } from "next/navigation";
import { brand } from "@/config/company/brand";
import { getLegalPage, legalPages } from "@/config/company/legal";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return legalPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = getLegalPage(slug);
  if (!page) return { title: "Not found" };
  return {
    title: `${page.title} · ${brand.shortName}`,
    description: page.intro.slice(0, 160),
  };
}

export default async function LegalPageRoute({ params }: Props) {
  const { slug } = await params;
  const page = getLegalPage(slug);
  if (!page) notFound();

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-slate-100 via-white to-amber-50/40">
      <header className="border-b border-border/80 bg-white/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/login" className="text-sm font-semibold text-navy">
            {brand.name}
          </Link>
          <nav className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {legalPages.map((p) => (
              <Link
                key={p.slug}
                href={`/legal/${p.slug}`}
                className={
                  p.slug === page.slug
                    ? "font-medium text-navy"
                    : "hover:text-navy"
                }
              >
                {p.title}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Updated {page.updatedAt}
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-navy">
          {page.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {page.intro}
        </p>

        <div className="mt-8 space-y-8">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-base font-semibold text-navy">
                {section.heading}
              </h2>
              <div className="mt-2 space-y-2">
                {section.paragraphs.map((p) => (
                  <p
                    key={p.slice(0, 40)}
                    className="text-sm leading-relaxed text-foreground/90"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          Draft office policy for portal use. Signed engagement letters and
          vakalatnama control the advocate–client relationship for each matter.
        </p>
      </main>
    </div>
  );
}
