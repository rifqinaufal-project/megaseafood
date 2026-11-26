"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchBusiness } from "@/src/domain/global-search";
import { useBusiness } from "@/src/shell/business-provider";
import { searchResultHref } from "@/src/shell/search-href";
import { Badge } from "@/src/ui/Badge";
import { Dialog } from "@/src/ui/Dialog";
import { EmptyState } from "@/src/ui/EmptyState";
import { cx } from "@/src/ui/cx";

type CommandSearchProps = { open: boolean; onClose: () => void };

export function CommandSearch({ open, onClose }: CommandSearchProps) {
  const router = useRouter();
  const { state } = useBusiness();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(
    () =>
      searchBusiness(state, query).flatMap((result) => {
        const href = searchResultHref(result);
        return href ? [{ result, href }] : [];
      }),
    [state, query],
  );
  const current = Math.min(active, Math.max(results.length - 1, 0));

  const close = () => {
    setQuery("");
    setActive(0);
    onClose();
  };

  const choose = (href: string) => {
    close();
    router.push(href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(current - 1, 0));
    } else if (event.key === "Enter" && results[current]) {
      event.preventDefault();
      choose(results[current].href);
    }
  };

  const trimmed = query.trim();

  return (
    <Dialog open={open} onClose={close} title="Cari" size="lg">
      <input
        type="search"
        aria-label="Cari produk, restoran, invoice, batch, atau catatan"
        placeholder="Cari produk, restoran, invoice, batch…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-2xl border border-border bg-surface-2 px-4 text-sm text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-primary"
      />

      {trimmed === "" ? (
        <p className="flex items-center gap-2 px-1 text-sm text-text-muted">
          <Search size={14} aria-hidden />
          Ketik nama, nomor invoice, atau nomor batch. Gunakan panah untuk memilih, Enter untuk membuka.
        </p>
      ) : results.length === 0 ? (
        <EmptyState title="Tidak ada hasil" description={`Tidak ada data yang cocok dengan "${trimmed}".`} />
      ) : (
        <ul aria-label="Hasil pencarian" className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
          {results.map(({ result, href }, index) => (
            <li key={`${href}-${index}`}>
              <button
                type="button"
                onClick={() => choose(href)}
                aria-current={index === current ? "true" : undefined}
                className={cx(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left",
                  index === current ? "bg-primary-soft" : "hover:bg-surface-2",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-text">{result.title}</span>
                  <span className="truncate text-xs text-text-muted">{result.detail}</span>
                </span>
                <Badge>{result.kind}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
