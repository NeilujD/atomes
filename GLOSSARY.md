# Atomes

A personal library tracker for one reader: what they own, what they have read, and which series have new volumes they don't have yet.

Each term gives the French word the UI uses for it (`_French_`), so a term reads the same on every screen.

## Library

**Library**:
Everything the reader owns or has read, across all their devices.
_Avoid_: Collection, catalogue, bookshelf
_French_: Bibliothèque

**Work**:
A story or text, independent of how it was published (e.g. "Dune", "One Piece volume 12").
_Avoid_: Book, title
_French_: Œuvre

**Edition**:
A specific publication of a Work, usually identified by an ISBN (publisher, language, format).
_Avoid_: Version, release, book
_French_: Édition

**Copy**:
A physical item the reader owns, which is an instance of an Edition. One Copy can contain several Works (an omnibus covering Volumes 1–3). It holds the day the reader got it, when known.
_Avoid_: Book, item, possession
_French_: Exemplaire

**Loan**:
The lending of a Copy to someone, from the day it leaves until it comes back. A Copy with an open Loan is lent; past Loans stay as the Copy's history.
_Avoid_: Lent To, borrowing
_French_: Prêt

**Catalog**:
The shared reference of Works, Editions, Series and their release dates that readers' Libraries point to. It belongs to no single reader.
_Avoid_: Database, book index
_French_: Catalogue

## Reading

**Reading Status**:
Where the reader stands with a Work: *unread*, *reading*, *read* or *abandoned*. It belongs to the Work, not to a Copy, and it can exist without any Copy (borrowed, library, ebook, or a Copy the reader no longer has). It holds the day the reader started the Work and the day they finished it, when known.
_Avoid_: Progress, state
_French_: Statut de lecture

**Label**:
A word the reader attaches to Works or to a Series to group and filter them by theme or category (e.g. Sci-fi, Manga, To re-read). A Label on a Series applies to every Work of that Series, including Volumes added later. Labels are personal and Private by default; the Catalog may suggest some from a Work's subjects.
_Avoid_: Tag, genre, category, shelf
_French_: Étiquette

**Owned-Unread**:
A Work the reader has at least one Copy of and whose Reading Status is *unread*.
_Avoid_: Backlog, to-read pile, TBR
_French_: Possédé non lu

## Series

**Series**:
An ordered set of Works published as numbered or sequential Volumes (manga, comics, novel sagas).
_Avoid_: Saga, collection, franchise
_French_: Série

**Volume**:
A Work's position within a Series.
_Avoid_: Tome, issue, book
_French_: Tome

**Edition Line**:
A Series as published by one publisher, in one language and format (e.g. One Piece, Glénat, French, standard). The reader collects a Series in one Edition Line at a time and may switch from a given Volume onward. The app names an Edition Line by its publisher and the years of its Editions (e.g. Glénat · 1993–2000), so two editions of one publisher read apart.
_Avoid_: Collection, imprint, version

**Series Correction**:
A reader's fix of the Catalog: the Series or Volume number of an Edition, or a new Series made by hand. It serves every reader of the instance, and a Catalog fill never overwrites it.
_Avoid_: Override, edit, manual Series
_French_: Correction de série

**Followed Series**:
A Series, in a given Edition Line, that the app watches for New Volumes. A Series becomes followed automatically when the reader marks one of its Volumes read.
_Avoid_: Subscription, watchlist
_French_: Série suivie

**Dropped Series**:
A Series the reader has deliberately stopped following. It is separate from abandoning a Volume: abandoning one suggests dropping the Series but doesn't do it. Saying no to new Volume alerts during Series Onboarding also drops the Series, so marking a Volume read later does not follow it.
_Avoid_: Unfollowed, cancelled, abandoned series
_French_: Série arrêtée

**New Volume**:
A Volume of a Followed Series released in the reader's Edition Line after they followed the Series, that they don't own. A Volume they are behind on is on To Buy, but is not a New Volume.
_Avoid_: Release, update, new tome
_French_: Nouveau tome

**Upcoming Volume**:
A Volume of a Followed Series that has been announced with a date in the reader's Edition Line but isn't in shops yet.
_Avoid_: Pre-order, announcement
_French_: Tome à paraître

**Release Report**:
A reader's statement that a Volume is out, or is announced for a date, in a given Edition Line. It adds that information to the Catalog for everyone.
_Avoid_: Submission, tip, announcement
_French_: Signalement de parution

**Missing Volume**:
A Volume of a Followed Series, earlier than the latest one the reader owns, that they don't own and have not read. A Volume the reader read but no longer owns is not missing.
_Avoid_: Gap, hole
_French_: Tome manquant

## Buying

**To Buy**:
The reader's list of Editions they intend to acquire: the Volumes of Followed Series that are in shops in the reader's Edition Line and that they don't own, plus the Editions added by hand. The Volumes of Followed Series appear on it automatically: the Missing Volumes and every Volume after the latest one owned that the reader has not read. Upcoming Volumes do not.
_Avoid_: Wishlist, shopping list, want-to-read
_French_: À acheter

## Visibility

**Private**:
Visible only to the reader. Every part of the Library is Private unless the reader shares it.
_Avoid_: Hidden, secret
_French_: Privé

**Shared**:
Deliberately made visible to anyone. The reader shares by category (for example Reading Statuses) and can keep individual Works Private inside a Shared category. Copies, Loans and To Buy are never Shared. Sharing needs a linked AT Protocol Account.
_Avoid_: Public, published
_French_: Partagé

## Account

**Account**:
What a reader signs in to on an Atomes instance. It holds the reader's Library, and the reader reaches it with an email address, a linked AT Protocol Account, or both.
_Avoid_: User, profile, member
_French_: Compte

**Sign-in Code**:
A short number sent to the reader's email address, which proves that the address is theirs. It works once and for a few minutes.
_Avoid_: Password, OTP, verification code, magic link
_French_: Code de connexion

**AT Protocol Account**:
An account on the AT Protocol network (for example a Bluesky account) that a reader may link to their Account. It is a second way to sign in, and it is where Shared records are published.
_Avoid_: PDS, DID, handle (in text shown to the reader)
_French_: Compte AT Protocol

**Invite**:
A link, made by an Admin of an Atomes instance or by a reader, that lets one person create an Account. It works once, for 14 days. A reader makes one in Settings, and only one person can create an Account with the Invites of a reader; an Admin has no limit.
_Avoid_: Allow-list, access code, referral
_French_: Invitation

**Operator**:
The person who runs an Atomes instance and answers for it: the data controller that the Privacy notice names. The operator has the server, so they can read every Library it keeps.
_Avoid_: Owner, host, publisher (for the person who runs the instance)
_French_: Opérateur

**Admin**:
An Account with the role that opens the admin panel. An Admin makes Invites with no limit, adds and deletes Accounts, and sees how each Account uses the instance. The operator makes the first Admin with a script; an Admin can grant the role to another Account.
_Avoid_: Owner, moderator, superuser, staff
_French_: Administrateur

**Account Reference**:
The short code that names an Account in the admin panel, in place of its email address or its AT Protocol Account. It never changes, and it does not say who the reader is.
_Avoid_: Account code (a Sign-in Code is a different thing), pseudonym, user ID
_French_: Référence de compte

**Admin Log**:
The list of what Admins did in the admin panel and with the role script: who, when, which action, and on which Account or Invite. It keeps no copy of the data, and a line stays 12 months.
_Avoid_: Audit trail, history, activity log
_French_: Journal d’administration

## Capture

**Quick Add**:
Adding a Copy to the Library right after acquiring it, mainly by scanning the ISBN barcode, with cover recognition as a fallback.
_Avoid_: Import, scan-in
_French_: Ajout rapide

**Shelf Check**:
The answer to "do I have this book?" (usually in a shop): whether the reader already owns it, has read it, or is missing it from a Series. It starts from a scan of the barcode, a typed ISBN, or an Edition picked in Search (the two modes of Check a book, Scan and Search). The scan and the typed ISBN must work offline. When the reader buys the book, a Shelf Check ends in a Quick Add; when they want it, in To Buy.
_Avoid_: Lookup, in-store mode
_French_: Vérification en rayon

**Series Onboarding**:
The step after Quick Add of a Volume (or "I have it" in Search) whose Series the reader neither follows nor dropped, when the app asks which of its Volumes the reader already owns. Volumes already in the Library show as kept.
_Avoid_: Series import, bulk add
_French_: Ajout d'une série

**Search**:
The step from words to a Work to an Edition, when the reader has no ISBN: finding a Work, a Series or an Author by title or author words. A Work shows once, under any of its titles, old or new, in any language ("Dix petits nègres" finds "Ils étaient dix"). The reader opens it and picks one of its Editions, which gets the Shelf Check answer; from there it goes to To Buy or, when they have it, becomes a Copy, the same way Quick Add does. It is the Search mode of Check a book, and needs a connection.
_Avoid_: Lookup, browse
_French_: Recherche

**Preferred Language**:
The language of the Editions that Search shows to the reader. It follows the app language until the reader changes it, and can be "All languages". When the words searched are a title in another language, Search also shows the Editions in that language, apart.
_Avoid_: Book language, reading language, locale
_French_: Langue préférée
