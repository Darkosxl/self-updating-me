import Link from "next/link";
import { getEssays } from "@/lib/essays";

export const metadata = { title: "Essays — Cem Berke Arslan" };

export default function EssaysPage() {
  const essays = getEssays();

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="container mx-auto px-4 md:px-6 max-w-3xl py-20">
        <Link
          href="/"
          className="text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
        >
          ← Home
        </Link>
        <h1 className="text-4xl font-bold tracking-tighter mt-6 mb-10">
          Essays
        </h1>
        {essays.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-400">
            Nothing here yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {essays.map((essay) => (
              <li key={essay.slug}>
                <Link
                  href={`/essays/${essay.slug}`}
                  className="text-lg font-semibold underline-offset-4 hover:underline"
                >
                  {essay.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
