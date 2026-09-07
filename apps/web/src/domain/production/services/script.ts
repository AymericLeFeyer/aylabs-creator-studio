import { marked } from 'marked';

/** Débit de lecture à voix haute, en mots par minute. Un script se lit, il ne se survole pas. */
const WORDS_PER_MINUTE = 150;

/**
 * Le script est stocké en **HTML**, plus en markdown.
 *
 * La bascule est venue d'un besoin que le markdown ne sait pas exprimer : la **couleur**.
 * Surligner en rouge la phrase qu'on doit absolument dire, mettre l'appel à l'action en
 * vert, n'a aucune syntaxe markdown — et l'inventer (`==texte==`, balises brutes) aurait
 * produit un dialecte qu'aucun autre outil ne relit.
 *
 * Les scripts déjà écrits, eux, sont du markdown. Ils sont convertis **à l'ouverture** et
 * non par une migration en base : une migration réécrirait des centaines de lignes en une
 * transaction sans que personne ne puisse relire le résultat, là où une conversion à
 * l'affichage se voit immédiatement et ne s'écrit qu'au premier enregistrement.
 */
const HTML_BLOCK = /<(p|h[1-6]|ul|ol|li|blockquote|pre|table|hr|div|br|span|strong|em)[\s>/]/i;

/**
 * Les cases à cocher de GFM (`- [ ] à faire`) sortent de `marked` en liste à puces
 * portant un `<input type="checkbox">`. TipTap, lui, reconnaît une liste de tâches à ses
 * attributs `data-type` : sans cette reprise, la case serait effacée à l'ouverture et il
 * ne resterait qu'une puce — le texte survit, la notion de « fait » non.
 */
const promoteTaskLists = (html: string): string => {
  if (typeof DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const list of doc.querySelectorAll('ul')) {
    const items = [...list.children].filter((item) =>
      item.querySelector(':scope > input[type="checkbox"]'),
    );
    if (items.length === 0) continue;

    list.setAttribute('data-type', 'taskList');
    for (const item of items) {
      const box = item.querySelector(':scope > input[type="checkbox"]');
      item.setAttribute('data-type', 'taskItem');
      item.setAttribute('data-checked', box?.hasAttribute('checked') ? 'true' : 'false');
      box?.remove();
    }
  }
  return doc.body.innerHTML;
};

/** Un script vide n'a ni balise ni markdown : ne rien convertir évite un `<p></p>` parasite. */
export const toEditorHtml = (stored: string): string => {
  const text = stored.trim();
  if (text === '') return '';
  if (HTML_BLOCK.test(text)) return stored;
  return promoteTaskLists(marked.parse(text, { async: false, gfm: true, breaks: false }));
};

/**
 * L'éditeur enregistre `<p></p>` pour un document vide : le renvoyer tel quel ferait
 * passer une fiche vierge pour une fiche remplie partout où l'on teste `script !== ''`.
 */
export const fromEditorHtml = (html: string): string =>
  html === '<p></p>' || html.trim() === '' ? '' : html;

/**
 * Le compteur affiche la **durée de lecture** plutôt qu'un nombre de caractères : c'est la
 * seule mesure qui compte quand on écrit pour être dit à l'oral.
 */
export const scriptStats = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = words / WORDS_PER_MINUTE;
  return {
    words,
    duration:
      words === 0
        ? '—'
        : minutes < 1
          ? `${Math.round(minutes * 60)} s`
          : `${Math.round(minutes)} min`,
  };
};
