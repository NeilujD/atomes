// Search (glossary; ADR 0021), the Search mode of Check a book
// (src/pages/check.astro, which renders it): the reader types title words,
// opens a Work, and picks one of its Editions. The page then looks the ISBN
// up and shows the Shelf Check answer, as after a scan. Only the words leave
// the device, to the Atomes server; the results are not kept.
import { useEffect, useState } from "preact/hooks";
import type { FoundAnswer } from "../lib/catalog/client";
import {
  nativeLanguageName,
  type PreferredLanguage,
} from "../lib/catalog/languages";
import type {
  EditionResult,
  EditionSection,
  EditionsFound,
  WorkResult,
} from "../lib/catalog/search";
import { reportNetwork } from "../lib/connection";
import { t } from "../lib/i18n/i18n";
import { languageName } from "../lib/library/model";
import { isNetworkFailure } from "../lib/network";

export interface Sources {
  find(words: string): Promise<FoundAnswer<WorkResult[]>>;
  // `language`: the Preferred Language, which picks the Editions shown.
  editions(
    work: WorkResult,
    language: PreferredLanguage,
  ): Promise<FoundAnswer<EditionsFound>>;
}

export interface SearchProps {
  sources: Sources;
  // The Preferred Language of this device (Settings), or "all".
  preferred: PreferredLanguage;
  // The words of the address (`q`): searched at once, so a reload keeps the results.
  words?: string;
  // The words of each search, for the address.
  onWords: (words: string) => void;
  // Looks the Edition up and opens its Shelf Check answer; gives why it could not.
  onPick: (isbn: string) => Promise<string | undefined>;
  // To Scan mode: Search needs a connection, a scan does not.
  onScan: () => void;
}

export function Search({
  sources,
  preferred,
  words: given = "",
  onWords,
  onPick,
  onScan,
}: SearchProps) {
  const [words, setWords] = useState(given);
  const [works, setWorks] = useState<WorkResult[]>();
  const [work, setWork] = useState<WorkResult>();
  const [found, setFound] = useState<EditionsFound>();
  // Why the last search or pick did not work; the words stay in the box.
  const [problem, setProblem] = useState<{ text: string; offline: boolean }>();
  const [busy, setBusy] = useState(false);
  // The Edition whose answer is coming.
  const [picking, setPicking] = useState<string>();

  const say = (
    key: "search.offline" | "add.sources-down" | "auth.session-ended",
  ) => setProblem({ text: t(key), offline: key === "search.offline" });

  // A source answer, or undefined with the problem shown.
  async function ask<T>(
    question: () => Promise<FoundAnswer<T>>,
  ): Promise<T | undefined> {
    setProblem(undefined);
    if (!navigator.onLine) {
      say("search.offline");
      return undefined;
    }
    setBusy(true);
    try {
      const answer = await question();
      if ("found" in answer) return answer.found;
      say("signedOut" in answer ? "auth.session-ended" : "add.sources-down");
    } catch (error) {
      const offline = isNetworkFailure(error);
      if (offline) reportNetwork(false);
      say(offline ? "search.offline" : "add.sources-down");
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  async function search(typed: string) {
    if (!typed) return;
    const answer = await ask(() => sources.find(typed));
    if (!answer) return;
    setWorks(answer);
    setWork(undefined);
    setFound(undefined);
  }

  // The words of the address, once.
  useEffect(() => {
    void search(given.trim());
  }, []);

  async function open(row: WorkResult) {
    const answer = await ask(() => sources.editions(row, preferred));
    if (!answer) return;
    setWork(row);
    setFound(answer);
  }

  async function pick(isbn: string) {
    setProblem(undefined);
    setBusy(true);
    setPicking(isbn);
    try {
      const why = await onPick(isbn);
      if (why) setProblem({ text: why, offline: false });
    } finally {
      setBusy(false);
      setPicking(undefined);
    }
  }

  return (
    <div class="search">
      <form
        class="search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const typed = words.trim();
          onWords(typed);
          void search(typed);
        }}
        noValidate
      >
        <label class="search-label" for="search-words">
          {t("search.label")}
        </label>
        <div class="search-row">
          <input
            class="field"
            id="search-words"
            type="search"
            enterKeyHint="search"
            maxLength={300}
            autoComplete="off"
            value={words}
            aria-describedby="search-problem"
            onInput={(event) => setWords(event.currentTarget.value)}
          />
          <button
            class="button button-main"
            type="submit"
            disabled={busy}
            aria-busy={busy && !work ? "true" : undefined}
          >
            {t("search.submit")}
          </button>
        </div>
        <p
          class="search-hint"
          id="search-problem"
          data-error={problem ? "" : undefined}
          aria-live="polite"
        >
          {problem?.text ?? t("search.hint")}
        </p>
        {problem?.offline && (
          <button class="button search-scan" type="button" onClick={onScan}>
            {t("add.scan")}
          </button>
        )}
      </form>

      {work && found ? (
        <section class="search-group" aria-labelledby="search-work">
          <button
            class="button button-quiet search-back"
            type="button"
            onClick={() => setWork(undefined)}
          >
            {t("search.back")}
          </button>
          <h2 class="search-work-title" id="search-work">
            {work.title}
          </h2>
          <p class="search-hint">
            {[work.authors.join(", "), work.year].filter(Boolean).join(" · ")}
          </p>
          {found.editions.length === 0 ? (
            <p class="search-hint">{t("search.no-editions")}</p>
          ) : (
            found.sections.map((section) => (
              <EditionList
                key={section.language}
                section={section}
                busy={busy}
                picking={picking}
                onPick={(isbn) => void pick(isbn)}
              />
            ))
          )}
          {found.noIsbn > 0 && (
            <p class="search-hint">{t("search.no-isbn", found.noIsbn)}</p>
          )}
        </section>
      ) : (
        works && (
          <section class="search-group" aria-label={t("search.works")}>
            {works.length === 0 ? (
              <p class="search-hint">{t("search.nothing")}</p>
            ) : (
              <ul class="card search-list">
                {works.map((row) => (
                  <li class="search-item" key={row.id}>
                    <button
                      class="search-pick"
                      type="button"
                      disabled={busy}
                      onClick={() => void open(row)}
                    >
                      <span class="search-title">{row.title}</span>
                      <span class="search-line">
                        {[row.authors.join(", "), row.year]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      )}
    </div>
  );
}

// The Editions of one language, under its name in itself ("Français"); the
// language of the words searched says so, and tags each row. All languages:
// one list, no heading, each row tagged.
function EditionList({
  section,
  busy,
  picking,
  onPick,
}: {
  section: EditionSection;
  busy: boolean;
  picking: string | undefined;
  onPick: (isbn: string) => void;
}) {
  const name = section.language && nativeLanguageName(section.language);
  const heading = name && (section.matches ? t("search.matches", name) : name);
  const tagged = !section.language || section.matches;
  return (
    <>
      {heading && <h3 class="small-heading search-section">{heading}</h3>}
      {section.editions.length === 0 ? (
        <p class="search-hint">{t("search.none-in-language")}</p>
      ) : (
        <ul
          class="card search-list"
          aria-label={heading || t("search.editions")}
        >
          {section.editions.map((each) => (
            <EditionRow
              key={each.isbn}
              edition={each}
              tagged={tagged}
              busy={busy}
              picking={picking === each.isbn}
              onPick={() => onPick(each.isbn)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

// One Edition, as printed; a tap shows its Shelf Check answer.
function EditionRow({
  edition,
  tagged,
  busy,
  picking,
  onPick,
}: {
  edition: EditionResult;
  tagged: boolean;
  busy: boolean;
  picking: boolean;
  onPick: () => void;
}) {
  const line = [edition.year, edition.publisher, edition.collection]
    .filter(Boolean)
    .join(" · ");
  const tag = tagged && languageName(edition);
  return (
    <li class="search-item">
      <button
        class="search-pick"
        type="button"
        disabled={busy}
        aria-busy={picking ? "true" : undefined}
        onClick={onPick}
      >
        <span class="search-title">{edition.title}</span>
        {tag && <span class="chip search-tag">{tag}</span>}
        <span class="search-line">{line}</span>
        <span class="search-hint">{t("book.isbn", edition.isbn)}</span>
      </button>
    </li>
  );
}
