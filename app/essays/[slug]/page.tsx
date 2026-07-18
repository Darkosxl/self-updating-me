import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { getEssay, getEssays } from "@/lib/essays";

export function generateStaticParams() {
  return getEssays().map(({ slug }) => ({ slug }));
}

export default async function EssayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const essay = getEssay(slug);
  if (!essay) notFound();

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="container mx-auto px-4 md:px-6 max-w-3xl py-20">
        <Link
          href="/essays"
          className="text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
        >
          ← Essays
        </Link>
        <article
          className="prose prose-neutral dark:prose-invert mt-10 max-w-none
          prose-headings:tracking-tight"
          dangerouslySetInnerHTML={{ __html: marked.parse(essay.content) }}
        />
      </div>
    </main>
  );
}
