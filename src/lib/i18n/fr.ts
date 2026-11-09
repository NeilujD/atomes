// The French UI text. Domain words come from the `_French_` line of each term
// in GLOSSARY.md, in lower case inside a sentence (bibliothèque, exemplaire, tome).
// French punctuation: a no-break space (U+00A0) before ":", a narrow no-break
// space (U+202F) before "?", "!" and ";", so the sign never starts a line.
import type { en } from './en';

export const fr: typeof en = {
  // Frame (AppShell, ConnectionStatus, toasts)
  'nav.main': 'Navigation principale',
  'nav.brand': 'Atomes, Accueil',
  'nav.search': 'Chercher dans la bibliothèque',
  'nav.check-book': 'Vérifier un livre',
  'nav.home': 'Accueil',
  'nav.library': 'Bibliothèque',
  'nav.new': 'Nouveautés et à paraître',
  'nav.to-buy': 'À acheter',
  'nav.check': 'Vérifier',
  'nav.settings': 'Réglages',
  'nav.you': 'Vous',
  'nav.private': 'Privé par défaut',
  'common.close': 'Fermer',
  'connection.offline': 'Hors ligne',
  'connection.reconnect': 'Reconnecter',
  'connection.waiting': (count) => `${count} ${count > 1 ? 'enregistrements' : 'enregistrement'} en attente`,

  // Shared words and links
  'link.home': 'Aller à l’accueil',
  'link.settings': 'Aller aux réglages',
  'link.book-page': 'Ouvrir la fiche du livre',
  'book.isbn': (isbn) => `ISBN ${isbn}`,
  'book.volume': (volume) => `Tome ${volume}`,
  'status.unread': 'Pas encore',
  'status.reading': 'En cours',
  'status.read': 'Lu',
  'status.abandoned': 'Abandonné',

  // What became of a save (src/lib/library/library.ts)
  'saved.sent': 'Enregistré dans votre bibliothèque.',
  'saved.waiting': 'En attente : enregistré sur cet appareil. Il part dans votre bibliothèque dès que le serveur Atomes est joignable.',
  'saved.refused': 'Le serveur Atomes a refusé cette modification : elle n’est pas enregistrée.',

  // Errors (src/lib/space/space.ts, src/lib/auth/session.ts)
  'error.server-unreachable': 'Impossible de joindre ce serveur Atomes. Vérifiez votre connexion et réessayez.',
  'error.server-problem': (detail) => `Le serveur Atomes a un problème (${detail}). Réessayez plus tard.`,
  'error.pds-refused-request': (detail) => `Votre PDS a refusé la requête : ${detail}`,
  'error.pds-problem': (detail) => `Votre PDS a un problème (${detail}). Réessayez plus tard.`,
  'error.space-failed': 'Un problème est survenu avec votre bibliothèque. Réessayez.',

  // Sign-in (src/lib/auth/session.ts)
  'auth.type-handle': 'Saisissez votre identifiant, par exemple alice.bsky.social.',
  'auth.signed-out-data-left':
    'Déconnecté, mais certaines de vos données n’ont pas pu être effacées de cet appareil. Effacez les données de ce site dans le navigateur.',
  'auth.signed-out-server-unreached':
    'Déconnecté sur cet appareil. Le serveur Atomes n’a pas pu être joint pour y fermer la session.',
  'auth.cancelled': 'La connexion a été annulée.',
  'auth.not-allowed': 'Ce compte ne peut pas se connecter à ce serveur Atomes. Demandez à son propriétaire de l’ajouter.',
  'error.server-refused-request': (detail) => `Le serveur Atomes a refusé la requête : ${detail}`,
  'auth.session-ended': 'Votre session est terminée. Reconnectez-vous.',
  'auth.no-account': 'Aucun compte trouvé pour cet identifiant. Vérifiez l’orthographe.',
  'auth.pds-unreachable': 'Impossible de joindre votre PDS. Réessayez plus tard.',
  'auth.failed': 'La connexion a échoué. Réessayez.',

  // ISBN and camera problems (src/lib/library/ids.ts, src/lib/scan/barcode.ts)
  'isbn.not-isbn': 'Ce n’est pas l’ISBN d’un livre. Il a 13 chiffres et commence par 978 ou 979.',
  'isbn.check-digit': 'Un chiffre est faux : le dernier chiffre ne correspond pas aux autres.',
  'isbn.sheet-music': 'C’est une partition (ISMN), pas un livre.',
  'isbn.magazine': 'C’est un magazine (ISSN), pas un livre.',
  'camera.refused': 'Atomes n’a pas accès à la caméra. Saisissez l’ISBN, ou autorisez la caméra dans les réglages du navigateur.',
  'camera.no-camera': 'Aucune caméra trouvée. Saisissez l’ISBN.',
  'camera.failed': 'La caméra n’a pas démarré. Saisissez l’ISBN.',

  // Typed book details (src/lib/library/copy.ts)
  'details.no-title': 'Saisissez le titre.',
  'details.too-many-authors': '20 auteurs au plus.',
  'details.author-too-long': 'Un nom d’auteur a 64 caractères au plus.',

  // Home
  'home.title': 'Accueil',
  'home.type-isbn': 'Saisir un ISBN',
  'home.new': 'Nouveautés et à paraître',
  'home.new-empty':
    'Rien de nouveau pour l’instant. Marquez un tome comme lu et sa série est suivie : les nouveaux tomes et les tomes annoncés apparaissent ici.',
  'home.reading': 'En cours de lecture',
  'home.reading-empty': 'Aucun livre en cours.',
  'home.owned-unread': 'Possédés non lus',
  'home.owned-unread-empty': 'Les livres que vous possédez et n’avez pas lus apparaissent ici.',

  // Settings
  'settings.title': 'Réglages',
  'settings.account': 'Compte',
  'settings.atproto-account': 'Compte AT Protocol',
  'settings.checking': 'Vérification…',
  'settings.handle': 'Votre identifiant',
  'settings.sign-in': 'Se connecter',
  'settings.sign-out': 'Se déconnecter',
  'settings.signed-in-as': (handle) => `Connecté en tant que @${handle}`,
  'settings.sign-in-hint': 'Connectez-vous sur la page de votre PDS. Atomes ne voit jamais votre mot de passe.',
  'settings.display': 'Affichage',
  'settings.appearance': 'Apparence',
  'settings.language': 'Langue',
  'settings.on-this-device': 'Gardé sur cet appareil.',
  'appearance.system': 'Système',
  'appearance.light': 'Clair',
  'appearance.dark': 'Sombre',
  'language.browser': 'Navigateur',
  'language.fr': 'Français',
  'language.en': 'English',

  // Quick Add
  'add.title': 'Ajouter à votre bibliothèque',
  'add.scan': 'Scanner le code-barres',
  'add.camera-starting': 'Démarrage de la caméra…',
  'add.type-isbn': 'Saisir l’ISBN',
  'add.isbn': 'ISBN',
  'add.look-up': 'Rechercher',
  'add.isbn-hint': 'Les 13 chiffres sous le code-barres, au dos du livre.',
  'add.book': 'Livre',
  'add.type-book': 'Saisir le livre',
  'add.field-title': 'Titre',
  'add.field-authors': 'Auteurs',
  'add.authors-hint': 'Séparez plusieurs auteurs par des virgules.',
  'add.field-series': 'Série',
  'add.field-volume': 'Tome',
  'add.read-question': 'L’avez-vous lu ?',
  'add.private': 'Privé',
  'add.private-hint': 'Personne d’autre que vous ne voit ce livre. Il est privé, enregistré sur ce serveur Atomes.',
  'add.submit': 'Ajouter à la bibliothèque',
  'add.sources-down': 'Les sources de livres ne répondent pas. Réessayez plus tard.',
  'add.lookup-unreachable': 'Impossible de joindre Atomes pour rechercher le livre. Vérifiez votre connexion et réessayez.',
  'add.lookup-failed': 'Impossible de rechercher cet ISBN. Réessayez.',
  'add.unknown-isbn': (isbn) => `ISBN ${isbn}. Aucune source de livres ne le connaît encore : saisissez ce qui est sur la couverture.`,
  'add.already-have': 'Vous avez déjà ce livre. L’ajouter encore ajoute un autre exemplaire.',
  'add.sign-in': 'Connectez-vous pour ajouter des livres à votre bibliothèque.',
  'add.added': (title) => `${title} est dans votre bibliothèque.`,
  'add.looking-for-volumes': (title, series) => `${title} est enregistré. Recherche des autres tomes de ${series}…`,
  'add.no-onboarding.in-library': (series) =>
    `${series} était déjà dans votre bibliothèque : pas de question sur ses autres tomes.`,
  'add.no-onboarding.followed': (series) => `Vous suivez déjà ${series} : pas de question sur ses autres tomes.`,
  'add.no-onboarding.dropped': (series) => `Vous ne suivez plus ${series} : pas de question sur ses autres tomes.`,
  'scan.looking': 'Visez le code-barres au dos du livre.',
  'scan.stuck': 'Rien de lu pour l’instant. Tenez le livre à 20 ou 40 cm, bien éclairé, le code-barres dans le cadre.',
  'scan.no-barcodes': 'Impossible de lire les codes-barres sur cet appareil. Saisissez l’ISBN.',

  // Book page
  'book.title': 'Livre',
  'book.not-in-library': 'Pas dans votre bibliothèque',
  'book.not-in-library-text': 'Vous n’avez aucun exemplaire de ce livre, ni de statut de lecture pour lui.',
  'book.not-found': 'Livre introuvable',
  'book.bad-link': 'Ce lien ne mène pas à un livre.',
  'book.add-a-book': 'Ajouter un livre',
  'book.add-this-book': 'Ajouter ce livre',
  'book.reading-status': 'Statut de lecture',
  'book.finished-on': 'Fini le',
  'book.optional': 'Facultatif',
  'book.copies': 'Vos exemplaires',
  'book.no-copies': 'Vous n’avez aucun exemplaire de ce livre.',
  'book.add-copy': 'Ajouter un autre exemplaire',
  'book.remove': 'Retirer',
  'book.remove-copy': (isbn) => `Retirer l’exemplaire d’ISBN ${isbn}`,
  'book.lent-to': 'Prêté à',
  'book.lent-to-placeholder': 'Personne : vous l’avez',
  'book.save': 'Enregistrer',
  'book.edition-unknown': 'Édition encore inconnue',
  'book.sign-in': 'Connectez-vous pour voir votre bibliothèque.',

  // Series Onboarding
  'onboarding.title': 'Ajout d’une série',
  'onboarding.looking-up': 'Recherche de la série…',
  'onboarding.new-series': 'Nouvelle série',
  'onboarding.heading': 'Quels tomes avez-vous ?',
  'onboarding.heading-series': (series) => `Quels tomes de ${series} avez-vous ?`,
  'onboarding.intro': (series, volume) =>
    `${series}, tome ${volume}, est dans votre bibliothèque. Réglez la plage, puis touchez un tome pour combler un trou.`,
  'onboarding.own-up-to': 'J’ai les tomes 1 à',
  'onboarding.all': 'Tous',
  'onboarding.all-count': (last) => `Tous (${last})`,
  'onboarding.read-up-to': 'J’ai lu jusqu’au',
  'onboarding.same-as-owned': 'Comme possédés',
  'onboarding.one-less': 'Un de moins',
  'onboarding.one-more': 'Un de plus',
  'onboarding.tiles': 'Tomes : touchez-en un pour dire si vous l’avez ou non',
  'onboarding.tile': (volume, state, kept) =>
    `Tome ${volume}, ${{ read: 'lu', owned: 'possédé, non lu', missing: 'manquant', 'read-not-owned': 'lu, non possédé' }[state]}${kept ? ', déjà dans votre bibliothèque' : ''}`,
  'onboarding.legend-read': 'Lu',
  'onboarding.legend-owned': 'Possédé, non lu',
  'onboarding.legend-missing': 'Manquant',
  'onboarding.legend-read-not-owned': 'Lu, non possédé',
  'onboarding.known': (volumes) =>
    `Le catalogue ne connaît encore que ${volumes.length} ${volumes.length > 1 ? 'tomes' : 'tome'} de cette édition :${volumes.join(', ')}. Seuls ceux-ci reçoivent un exemplaire. Ajoutez les autres avec l’ajout rapide.`,
  'onboarding.follow': 'Me prévenir quand un nouveau tome sort',
  'onboarding.in-edition': (line) => `Dans cette édition :${line}`,
  'onboarding.in-added-edition': 'Dans l’édition que vous venez d’ajouter',
  'onboarding.skip': 'Passer',
  'onboarding.save': 'Enregistrer la série',
  'onboarding.saved': 'Enregistré.',
  'onboarding.added': (count) =>
    count > 1 ? `${count} tomes de plus sont dans votre bibliothèque.` : `${count} tome de plus est dans votre bibliothèque.`,
  'onboarding.volumes-failed':
    'Impossible d’obtenir les tomes de cette série. Votre livre est enregistré ; réessayez plus tard depuis l’ajout rapide.',
  'onboarding.no-series': 'Le catalogue ne connaît aucune série pour ce livre.',
};
