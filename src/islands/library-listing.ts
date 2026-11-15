// The reading of the Library that the Home and Library screens share: the
// reader's records (and their Labels, for the Library), with the Catalog
// Editions of their books. A fresh listing (src/lib/space/fresh-listing.ts)
// shows the copy on this device first, then the store's answer.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Edition } from '../lib/catalog/catalog';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { listLabels, type Label } from '../lib/library/label';
import { loadLibrary, waitingCount } from '../lib/library/library';
import type { Library } from '../lib/library/model';
import type { Saved } from '../lib/library/records';
import { isNetworkFailure } from '../lib/network';
import { freshListing } from '../lib/space/fresh-listing';
import { spaceErrorMessage, type Space } from '../lib/space/space';
import { toast } from '../lib/toast';

// Where a screen reads from: the reader's Library store and the Catalog.
export interface ListingSources {
  // Undefined when signed out.
  open(): Promise<Space | undefined>;
  editions(isbns: string[]): Promise<Map<string, Edition>>;
}

export interface Listed {
  library: Library;
  // Empty unless the screen asks for Labels.
  labels: Saved<Label>[];
}

export interface LibraryListing {
  // Undefined until the first read.
  read: Listed | undefined;
  // In place of the books when there are none to show (signed out, or the first read failed).
  message: string | undefined;
  // Catalog answers kept for this visit, so an offline reload keeps the titles.
  editions: Map<string, Edition>;
  space: Space | undefined;
  // After a save: the Catalog's new answers (Move to Series), then the store again.
  refresh: (moved?: Edition[]) => Promise<void>;
}

export function useLibraryListing(sources: ListingSources, { labels = false }: { labels?: boolean } = {}): LibraryListing {
  const [read, setRead] = useState<Listed>();
  const [message, setMessage] = useState<string>();
  const editions = useRef(new Map<string, Edition>());
  const loaded = useRef(false);
  const space = useRef<Space | undefined>(undefined);
  const listing = useRef<{ refresh: () => Promise<void> } | undefined>(undefined);

  useEffect(() => {
    // No network: the connection status says it, and the listing tries again.
    function fail(error: unknown) {
      const network = isNetworkFailure(error);
      if (network) reportNetwork(false);
      if (!loaded.current) setMessage(spaceErrorMessage(error));
      else if (!network) toast(spaceErrorMessage(error), { error: true });
    }

    async function start() {
      const own = await sources.open();
      // No session: the gate (AppShell) is sending the visitor to the sign-in screen.
      if (!own) return;
      space.current = own;
      listing.current = freshListing(
        async () => {
          const [records, listed] = await Promise.all([loadLibrary(own), labels ? listLabels(own) : { records: [], stale: false }]);
          await askCatalog(records.library);
          return { library: records.library, labels: listed.records, stale: records.stale || listed.stale, waiting: await waitingCount(own) };
        },
        (fresh) => {
          // Stale: the store did not answer, so this is the copy on this device.
          reportNetwork(!fresh.stale);
          reportWaiting(fresh.waiting);
          loaded.current = true;
          setMessage(undefined);
          setRead({ library: fresh.library, labels: fresh.labels });
        },
        fail,
      );
      await listing.current.refresh();
    }

    // The Editions of the Copies and Reading Statuses, when not asked yet. One
    // the Catalog cannot answer for now shows its ISBN, and is asked again on the next read.
    async function askCatalog(library: Library) {
      const isbns = [...library.copies, ...library.readingStatuses].map(({ value }) => value.isbn);
      const unknown = isbns.filter((isbn) => !editions.current.has(isbn));
      for (const [isbn, edition] of await sources.editions(unknown)) editions.current.set(isbn, edition);
    }

    start().catch(fail);
  }, [sources, labels]);

  const refresh = async (moved: Edition[] = []) => {
    for (const edition of moved) editions.current.set(edition.isbn, edition);
    await listing.current?.refresh();
  };

  return { read, message, editions: editions.current, space: space.current, refresh };
}
