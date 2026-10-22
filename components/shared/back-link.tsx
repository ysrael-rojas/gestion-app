import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Enlace "Volver" de las páginas de comprobantes. */
export function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Volver
    </Link>
  );
}
