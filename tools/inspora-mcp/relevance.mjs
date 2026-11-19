import {englishWords} from './english-words.mjs';
// These aliases interpret familiar design vocabulary. Explicit subjects also accept
// arbitrary phrases, so the supported subjects are not limited to this dictionary.
const concepts = [
  ['card', 'design', ['ui card', 'interface card', 'card component', 'dashboard card']],
  ['payment card', 'design', ['credit card', 'debit card', 'bank card', 'visa card']],
  ['playing card', 'design', ['poker card', 'game card']],
  ['gift card', 'design', []],
  ['business card', 'design', ['visiting card']],
  ['dashboard', 'design', ['admin panel', 'analytics screen', 'analytics overview']],
  ['navigation', 'design', ['nav', 'navbar', 'navigation bar', 'nav bar', 'navigation menu', 'nav menu', 'menu bar', 'dock', 'app dock']],
  // A fourth entry names the broader concept: a sidebar is navigation, but navigation
  // evidence alone is only partial evidence for a sidebar.
  ['sidebar', 'design', ['side nav', 'side navigation', 'sidebar menu'], 'navigation'],
  ['tab bar', 'design', ['bottom nav', 'bottom navigation', 'bottom tab bar', 'tabbar'], 'navigation'],
  ['button', 'design', ['cta button']],
  ['form', 'design', []],
  ['login', 'design', ['sign in', 'signin', 'log in', 'sign up', 'signup', 'login form', 'sign in form']],
  ['checkout', 'design', ['checkout flow', 'checkout form']],
  ['payment', 'design', ['payment interface', 'payment flow', 'payment form', 'payment screen', 'payment link', 'payment status']],
  ['money transfer', 'design', ['send money', 'transfer money', 'money transfer flow'], 'payment'],
  ['receipt', 'design', ['invoice receipt'], 'payment'],
  ['onboarding', 'design', ['welcome flow']],
  ['pricing', 'design', ['pricing plan', 'payment plan', 'plan selector', 'plan picker']],
  ['pricing table', 'design', ['plan comparison table']],
  ['table', 'design', ['data table', 'data grid']],
  ['chart', 'design', ['graph', 'data visualization']],
  ['calendar', 'design', []],
  ['date picker', 'design', ['datepicker', 'calendar picker', 'date range picker', 'date selector']],
  ['search interface', 'design', ['search bar', 'search field', 'search input', 'search box']],
  ['dialog', 'design', ['modal', 'popup', 'pop up']],
  ['menu', 'design', ['context menu', 'dropdown', 'drop down']],
  ['notification', 'design', ['toast', 'alert']],
  ['tooltip', 'design', ['popover']],
  ['accordion', 'design', ['disclosure']],
  ['carousel', 'design', []],
  ['toggle', 'design', ['switch control', 'toggle switch', 'switch']],
  ['slider', 'design', ['range control']],
  ['input', 'design', ['text field', 'text input', 'input field', 'input bar', 'text box', 'prompt bar', 'prompt field', 'prompt box', 'composer', 'message composer']],
  ['player', 'design', ['media player', 'audio player', 'video player']],
  // A music interface with playback controls is a music player, whatever its object (a cassette
  // stack, a track list); it is a player for "player" requests too.
  ['music player', 'design', ['music interface', 'music streaming interface', 'track list', 'tracklist', 'now playing'], 'player'],
  ['timeline', 'design', []],
  ['progress', 'design', ['progress indicator', 'progress bar', 'status control', 'loading indicator', 'loader', 'loading animation', 'loading spinner', 'spinner']],
  // An AI thinking state is a kind of loading state: it evidences progress, not the reverse.
  ['thinking', 'design', ['thinking state', 'thinking indicator', 'thinking animation', 'typing indicator'], 'progress'],
  ['cursor', 'design', []],
  ['chat', 'design', ['conversation interface', 'messaging interface']],
  ['upload', 'design', ['file uploader', 'file upload']],
  // Standard gesture vocabulary: a drop zone or drop target is drag-and-drop evidence; dragging
  // alone (a slider handle) is the broader drag gesture.
  ['drag', 'design', ['dragging', 'dragged', 'drag gesture']],
  ['drag and drop', 'design', ['drag drop', 'drop zone', 'dropzone', 'drop target', 'drop area', 'draggable', 'drag to reorder', 'drag and drop interaction'], 'drag'],
  ['hero', 'web', ['hero section', 'hero area']],
  ['landing page', 'web', ['homepage', 'home page']],
  ['portfolio', 'web', []],
  ['poster', 'design', []],
  ['packaging', 'design', ['package design']],
  ['book cover', 'design', ['album cover', 'cover art']],
  ['brand identity', 'design', ['branding', 'visual identity', 'brand system']],
  ['illustration', 'design', []],
  // A character with a face or body (a mascot) appears in logos, icons and designs alike, so it
  // implies no work kind. Abstract and letter senses of "character" are masked (see senseMasks).
  ['character', null, ['mascot', 'mascot character', 'character mascot', 'brand mascot', 'cartoon character']],
  // A food or drinks menu is another sense of "menu" (see senses), never a navigation menu.
  ['food menu', 'design', ['restaurant menu', 'cafe menu', 'drink menu', 'drinks menu', 'coffee menu', 'wine menu', 'menu card', 'menu board']],
  ['wordmark', 'logo', []],
  ['monogram', 'logo', []],
  ['logo', 'logo', []],
  ['icon', 'icon', ['app icon', 'application icon']],
  ['website', 'website', ['web site']],
];

// Function words, request phrasing, work kinds and filler (vague evaluatives such as
// cool or nice, hedges such as kinda, provenance such as built with) carry no visual evidence.
const stop = new Set(('i me my a an the for of in on to with and or is are that this find show give want need looking inspiration some please from similar alternatives like can could would should it its using use design designs designing website websites logo logos icon icons app apps work works example examples result results only no not without ui interface ' +
  'but so something anything sth smth stuff thing things kinda sorta kind really very just also maybe vibe vibes vibey feel feeling look style styled aesthetic cool nice awesome amazing great good beautiful lovely best built made created make create based idea ideas inspo inspired').split(' '));
const wordAliases = new Map([['saas', 'saas'], ['paas', 'paas'], ['iaas', 'iaas'], ['minimalist', 'minimal'], ['minimalism', 'minimal'], ['geometrical', 'geometric']]);

// A negating prefix forms one word with what it negates, so "sans-serif" or "sans serif"
// is never read as serif and "non-profit" never as profit.
const negated = text => text.replace(/(?<![\p{L}\p{N}])(sans|non|anti)[\s-]+(?=\p{L})/gu, '$1').replace(/(?<![\p{L}\p{N}])(no|un)-(?=\p{L})/gu, '$1');

function words(text) {
  return (negated(String(text ?? '').toLowerCase().normalize('NFKC')).match(/[\p{L}\p{N}]+/gu) ?? []).map(word => {
    if (wordAliases.has(word)) return wordAliases.get(word);
    if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (/(?:ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
    return word;
  });
}

// Inflections of a requested base word ("send" also matches sending/sent-style forms
// "sending", "sended"; "dark" matches "darker"). Matching only expands the request: a
// requested "booking" never matches "book". A form that is a noun of its own in the
// English vocabulary (it has a plural there: buildings, landings, settings) is not an
// inflection of its base.
const lexicalized = form => englishWords().has(form + 's');
export function inflections(term) {
  const forms = new Set([term]);
  // A requested -ation noun also reaches its verb's forms (animation -> animated).
  const verb = term.slice(0, -3) + 'e';
  if (/ation$/.test(term) && term.length >= 9 && [verb, verb + 'd', verb + 's'].some(form => englishWords().has(form))) for (const form of inflections(verb)) forms.add(form);
  if (term.length < 3 || /(?:ing|ed|ation)$/.test(term) || /\d/.test(term)) return [...forms];
  const e = term.endsWith('e'), base = e ? term.slice(0, -1) : term;
  const doubled = /[^aeiou][aeiou][bdgklmnprt]$/.test(term) ? term + term.at(-1) : null;
  for (const form of [base + 'ing', e ? term + 'd' : term + 'ed', doubled && doubled + 'ing', doubled && doubled + 'ed', e ? term + 'r' : term + 'er'])
    if (form && !lexicalized(form)) forms.add(form);
  return [...forms];
}
export const hasForm = (set, term) => inflections(term).some(form => set.has(form));
const wordSet = text => new Set(words(text));

// Derivational families: words built on one English base by -ing, -er/-or, -ment, -ion,
// -ation or -ification (tracker, tracking -> track; manager, management -> manage;
// verification, verifying -> verify; invoicing -> invoice). Candidate bases have at
// least four letters. An -ing noun of its own (it has a plural: buildings,
// landings, settings) keeps its own sense, and an agent noun (-er/-or: a printer, a
// slider) meets only other derived forms, never its bare base (printer is not print).
// Candidate bases in order of preference; the first vocabulary word wins.
const undouble = stem => stem.replace(/([^aeiou])\1$/, '$1');
const suffixRules = [
  ['ification', stem => [stem + 'ify']],
  ['ation', stem => [stem + 'ate', stem + 'e', stem]],
  ['ment', stem => [stem]],
  ['ying', stem => [stem + 'y']], ['ing', stem => [stem + 'e', stem, undouble(stem)]],
  ['ied', stem => [stem + 'y']], ['ed', stem => [stem + 'e', stem, undouble(stem)]],
  ['ier', stem => [stem + 'y']], ['er', stem => [stem + 'e', stem, undouble(stem)]],
  ['or', stem => [stem + 'e', stem]],
];
const agentive = word => /(?:er|or)$/.test(word) && !word.endsWith('ier');
const baseCache = new Map();
function bases(word) {
  if (baseCache.has(word)) return baseCache.get(word);
  const found = new Set();
  if (!(word.endsWith('ing') && lexicalized(word)) && !/\d/.test(word)) {
    // Every candidate base of four or more letters: two words are related only when they
    // share one, so unattested spellings never match anything.
    const rule = suffixRules.find(([suffix]) => word.endsWith(suffix) && word.length - suffix.length >= 3);
    for (const base of rule?.[1](word.slice(0, -rule[0].length)) ?? []) if (base !== word && base.length >= 4) found.add(base);
  }
  baseCache.set(word, found);
  return found;
}
const familyCache = new Map();
// The derived relatives of a term that share one of its bases (or the term itself as a
// base), excluding the term's plain inflections (covered by inflections()).
export function derivations(term) {
  if (familyCache.has(term)) return familyCache.get(term);
  const roots = new Set([...bases(term), ...(term.length >= 4 && !(term.endsWith('ing') && lexicalized(term)) ? [term] : [])]);
  const out = new Set();
  for (const base of roots) {
    const e = base.replace(/e$/, ''), y = base.replace(/y$/, ''), ate = base.replace(/ate$/, '');
    const doubled = /[^aeiou][aeiou][bdgklmnprt]$/.test(base) ? base + base.at(-1) : base;
    for (const form of [base, e + 'ing', doubled + 'ing', base + 'ing', e + 'er', doubled + 'er', base + 'r', y + 'ier', base + 'ment', e + 'ion', base + 'ion', ate + 'ation', e + 'ation', y + 'ication', e + 'or', base + 'or', y + 'ying']) {
      if (form === term) continue;
      // An agent noun never reaches its bare base, nor a bare base an agent noun; an -ing
      // form reaches its bare base only through derivationBases (a booking is no book).
      if (form === base ? agentive(term) || term.endsWith('ing') : !bases(form).has(base) || term === base && agentive(form)) continue;
      out.add(form);
    }
  }
  familyCache.set(term, [...out]);
  return familyCache.get(term);
}
// Inflections plus derivational relatives.
export const hasFamily = (set, term) => hasForm(set, term) || derivations(term).some(form => set.has(form));
// For an absence claim only: any relative, including a bare base (printing -> print).
export const familyForms = term => [...new Set([...inflections(term), ...derivations(term), ...bases(term)])];
// Candidate bases of a derived word (invoicing -> invoice), for callers that attest them.
export const derivationBases = term => [...bases(term)];

export const tokens = text => [...new Set(words(text).filter(word => word.length > 1 && !stop.has(word)))];
export const normalizedPhrase = text => words(text).join(' ');
const normalized = normalizedPhrase;
const aliases = new Map(concepts.flatMap(([subject, , alternatives]) => [subject, ...alternatives].map(alias => [normalized(alias), subject])));
const families = new Map(concepts.map(([subject, family]) => [subject, family]));
// A concept that is another sense of a concept's head word: chosen when a cue word of that
// sense appears in the request (a restaurant menu), and evidenced in a work when the head
// word shares a sentence with a cue word (a menu card listing dishes and prices).
const senses = [
  {concept: 'food menu', head: 'menu', cues: new Set('food restaurant cafe coffee drink beverage dining dish meal cuisine bakery bistro eatery brunch dinner lunch breakfast cocktail wine pizza burger sushi'.split(' '))},
];
// A head word inside these compounds names a different thing than the bare word: a folder
// tab is no interface tab, a visual language no spoken language. Literal subject evidence
// skips the head word there (see unitsNear).
const senseCompounds = [
  {head: 'tab', modifiers: new Set('folder file index cabinet divider pull raised projecting end'.split(' '))},
  {head: 'language', modifiers: new Set('visual design brand form body motion graphic shape'.split(' '))},
];
// Abstract and letter senses of "character" ("gives the wordmark a playful character",
// "tiny characters of text") are not a depicted character; the masked word matches nothing.
const senseMasks = [
  [/\b(gives?|giving|gave|lends?|lending|lent|adds?|adding)\b([^.;:!?]*?)\b(an?)\s+((?:[\p{L}-]+,?\s+){0,4})characters?\b/giu, '$1$2$3 $4quality'],
  [/\b(ascii|text|tiny|fine|small|typed|monospaced|unicode|special|chinese|japanese|korean|latin)(\s+)characters\b/giu, '$1$2glyphs'],
  [/\bcharacters?\s+(?=(?:count|limit|set|spacing|width)s?\b)/giu, 'glyph '],
  // In typography notes "character" describes lettering.
  [/\b(?:typography|lettering|typeface|font)s?\b[^.;!?]*?\bcharacters?\b/giu, match => match.replace(/\bcharacters?\b/giu, 'quality')],
];
const maskSenses = text => senseMasks.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), String(text ?? ''));
// Motion vocabulary: on a video work, a word naming how something moves evidences an
// animation (a text that scales as it scrolls is a text animation).
// A transition (between pages or states) is a specific motion, so only these general heads qualify.
const motionHeads = new Set(['animation', 'motion']);
const motionVerbs = 'animate scale fade reveal slide morph expand collapse scroll rotate bounce zoom spin flip warp ripple typewriter unfold'.split(' ');
const parents = new Map(concepts.filter(([, , , parent]) => parent).map(([subject, , , parent]) => [subject, parent]));
const withParents = set => { for (const subject of [...set]) if (parents.has(subject)) set.add(parents.get(subject)); return set; };
const pattern = new RegExp('(?:^| )(' + [...aliases.keys()].sort((a, b) => b.length - a.length).join('|') + ')(?= |$)', 'g');
export const designVocabulary = new Set([...stop, ...aliases.keys(), ...wordAliases.values(), 'red orange yellow green blue purple pink black white gray grey brown glass clean simple spacious uncluttered dark light modern'.split(' ')].flatMap(value => words(value)));

// The words of a text with their hyphen-joined compounds ("controller-like" is one
// compound of two words). A word is bound on a side when a compound part of three or more
// letters joins it there, so "e-signature" still yields a free "signature".
function wordSpans(text) {
  const spans = [];
  for (const [token] of negated(String(text ?? '').toLowerCase().normalize('NFKC')).matchAll(/[\p{L}\p{N}]+(?:[-\u2010\u2011][\p{L}\p{N}]+)*/gu)) {
    const parts = words(token);
    parts.forEach((word, i) => spans.push({word, parts, boundLeft: parts.slice(0, i).some(part => part.length > 2), boundRight: parts.slice(i + 1).some(part => part.length > 2)}));
  }
  return spans;
}
// A phrase never starts or ends inside a hyphen-joined compound: "controller-like window
// buttons" does not supply "like", nor "add-to-calendar button" a calendar.
const subjectMentions = text => {
  const spans = wordSpans(maskSenses(text)), joined = spans.map(({word}) => word).join(' ');
  const wordAt = offset => joined.slice(0, offset).split(' ').length - 1;
  return [...(' ' + joined).slice(1).matchAll(pattern)].map(match => {
    const start = match.index + (match[0].startsWith(' ') ? 1 : 0);
    return {from: match[1], to: aliases.get(match[1]), start, end: start + match[1].length};
  }).filter(({start, end}) => !spans[wordAt(start)]?.boundLeft && !spans[wordAt(end - 1)]?.boundRight);
};
// Free words (not bound inside a compound) and the compounds, for literal subject evidence.
function compoundWords(text) {
  const spans = wordSpans(text);
  // Sentences are separated by a marker so no phrase or verb test spans a boundary.
  const sequence = String(text ?? '').split(/[.!?;:|\n]+/).flatMap((part, i) => [...(i ? ['|'] : []), ...wordSpans(part).map(({word}) => word)]);
  return {sequence, free: new Set(spans.filter(span => !span.boundLeft && !span.boundRight).map(({word}) => word)),
    compounds: [...new Map(spans.filter(span => span.parts.length > 1).map(({parts}) => [parts.join('-'), parts])).values()]};
}
const subjectsIn = text => [...new Set(subjectMentions(text).map(({to}) => to))];
export const isSubjectPhrase = phrase => aliases.has(normalized(phrase));
// A subject concept and its familiar alternative names (toggle: toggle switch).
export const subjectNames = subject => [subject, ...[...aliases].filter(([alias, to]) => to === subject && alias !== subject).map(([alias]) => alias)];
const archiveKinds = ['website', 'logo', 'icon'];
const interactionConcepts = new Set(['drag', 'drag and drop']);
// Format nouns name the container, not the subject ("welcome screen", "onboarding flow").
export const formatWords = new Set(words('screen page flow section component interface view layout widget element module block template site'));

// Weaker evidence for a multi-word subject: the familiar concepts inside it ("nav bar"
// contains navigation, "pricing table" contains pricing) and its head noun alone.
// Ranked below exact matches. Format nouns ("welcome screen") never need evidence.
// A listed concept is a distinct sense of its head noun (a payment card is not a UI card),
// so it falls back only to its modifiers (pricing table -> pricing).
export function subjectFallbacks(subject) {
  const parts = normalized(subject).split(' ').filter(Boolean);
  const inner = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j <= parts.length; j++) {
    const concept = j - i < parts.length ? aliases.get(parts.slice(i, j).join(' ')) : undefined;
    if (concept && concept !== subject && !archiveKinds.includes(concept) && !(families.has(subject) && j === parts.length)) inner.push(concept);
  }
  // Each remaining specific word ("booking" in "booking form", "animation" in "logo
  // animation") is weaker, generic evidence; the caller confirms it semantically.
  const specific = subjectTerms(subject);
  const covered = new Set(inner.flatMap(concept => [concept, ...[...aliases].filter(([, to]) => to === concept).map(([from]) => from)]).flatMap(words));
  // Format nouns ('page' of 'page transition') are too generic to stand alone.
  const remaining = specific.length > 1 && !families.has(subject) ? specific.filter(word => !covered.has(word) && !formatWords.has(word)) : [];
  // A narrower concept falls back to its broader one (sidebar -> navigation).
  const parent = parents.has(subject) ? [parents.get(subject)] : [];
  return [...new Set([...inner, ...remaining, ...parent])].filter(fallback => fallback !== subject);
}
// A literal subject whose format head was dropped ("home screen" -> home) is a looser
// reading of the phrase, so its direct evidence needs semantic confirmation.
export const reducedSubject = subject => !families.has(subject) && subjectTerms(subject).length < words(subject).filter(word => !subjectFunctionWords.has(word)).length;
// Function, generic and format words of a literal subject need no evidence.
const subjectFunctionWords = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'for', 'to', 'in', 'on', 'ui', 'app', 'design']);
// A format noun is dropped only as the head ("welcome screen"); as a modifier it is
// the subject ("page transition", "screen recorder").
export function subjectTerms(subject) {
  const all = words(subject).filter(word => !subjectFunctionWords.has(word));
  let end = all.length;
  while (end > 1 && formatWords.has(all[end - 1])) end--;
  return all.slice(0, end);
}

// Project context can be supported by what the product does even when the
// catalog lacks its exact industry label. The phrases describe product roles.
const projectSignals = [
  {name:'developer tool', query:/\b(?:developer tools?|developer tooling|devtools?)\b/i,
    evidence:/\b(?:developer tools?|developer toolkits?|developer tooling|devtools?|api tooling|api management|code review|code[ -]editor|pull requests?|software development|(?:ai )?coding (?:assistant|infrastructure)|code snippets?|build pipeline)\b/i},
  {name:'SaaS', query:/\b(?:saas|software as a service)\b/i,
    evidence:/\b(?:saas|software as a service|software product|software platform|web app|subscription plans?|product demos?|product screenshots?|feature sections?|pricing plans?)\b/i},
];

export function projectContext(text) {
  return projectSignals.find(signal => signal.query.test(text));
}

// Finds taxonomy labels (normalized phrases, longest first) in text. A longer label
// consumes its words, so "sans serif" is not also read as "serif".
// With inflected, each label word also matches its inflections in the text ("Dark"
// matches "darker"); matched words are consumed so a longer label wins.
export function labelsIn(text, labels, inflected = false) {
  const textWords = words(text), used = new Set(), found = [];
  for (const label of labels) {
    const parts = label.split(' ');
    // 'family' also accepts derivational relatives (Animated -> animation).
    const accepts = parts.map(part => new Set(inflected === 'family' ? [...inflections(part), ...derivations(part)] : inflected ? inflections(part) : [part]));
    let hit = false;
    for (let i = 0; i + parts.length <= textWords.length; i++) {
      if (parts.every((_, j) => !used.has(i + j) && accepts[j].has(textWords[i + j]))) { hit = true; parts.forEach((_, j) => used.add(i + j)); }
    }
    if (hit) found.push(label);
  }
  return found;
}

// An alias that adds another concept ("payment form" adds form to payment) stays a
// literal subject, so a payment receipt without a form is partial evidence, not direct.
// Aliases that name the same artifact although they contain another concept word (a
// navigation menu is navigation, while a payment form adds a form to a payment).
const equivalentAliases = new Set(['navigation menu', 'nav menu', 'menu bar']);
const conceptWords = new Set([...aliases.keys()].filter(alias => !alias.includes(' ')));
export function canonicalSubject(text) {
  const value=normalized(text),exact=aliases.get(value);
  if(exact&&!equivalentAliases.has(value)&&words(value).some(word=>conceptWords.has(word)&&aliases.get(word)!==exact&&!words(exact).includes(word)))return value;
  if(exact)return exact;
  const found=subjectsIn(value);
  const remainder=value.replace(pattern,' ').split(/\s+/).filter(word=>word&&!['ui','design'].includes(word)&&!formatWords.has(word));
  if(remainder.length)return value;
  const specific=found.filter(subject=>!['website','logo','icon'].includes(subject));
  return specific.length===1?specific[0]:found.length===1?found[0]:value;
}

// Editorial descriptions normally introduce the work before describing its
// setting or supporting elements. Preserve that distinction for old catalogs too.
function subjectLead(text) {
  return String(text ?? '').split(/[.!?;\n]/, 1)[0].split(/\b(?:with|within|behind|against|beneath|above|beside|across|over|at|is|are|overlays?|overlaps?|surrounds?|features?|featuring|includes?|including|contains?|containing|shows?|showing|displays?|displaying|presents?|presenting|places?|pairs?|combines?|organizes?|arranges?|uses?|sits?|floats?|expands?|switches?|opens?|collects?|summarizes?|on (?:a|an|the)|in (?:a|an|the))\b/i, 1)[0];
}

// A Minimal style tag can coexist with a dense interface. Only explicit layout
// prose establishes this contradiction; texture density and negated claims do not.
function hasDenseLayout(text) {
  const layout = /\b(?:dense|cluttered|crowded|busy)\s+(?:(?!and\b|but\b|or\b)[\p{L}-]+\s+){0,2}(?:layout|interface|dashboard|workspace|screen|canvas|table|grid|panel)s?\b/giu;
  return [...String(text).matchAll(layout)].some(match => {
    const before = text.slice(0, match.index).split(/[.!?;\n,]/).at(-1);
    return !/\b(?:not|no|without|rather than|instead of|less|avoid\w*)\s+(?:\w+\s+){0,2}$/i.test(before)
      && !/\b(?:background|backdrop|behind|against|overlays?)\b/i.test(before);
  });
}

const documents = new WeakMap();
export function prepareDocument(row) {
  if (documents.get(row)?.sourceText === row.text) return documents.get(row);
  const visualNotes = String(row.searchOnly ?? '').split(/\bTypography\s*:/i, 1)[0];
  const introduction = [row.title, row.description].map(subjectLead).join('. ');
  // Hidden notes can supply a missing subject. Once the public introduction
  // identifies it, supporting scenery in notes cannot replace that subject.
  const primaryText = subjectsIn(introduction).length ? introduction : introduction + '. ' + subjectLead(visualNotes);
  const visibleText = [row.title, row.description, row.tagline, visualNotes].join('. ');
  // The enrichment heading is structural, not evidence of a typography subject.
  // Retain actual public prose, including a public title/heading with that word.
  const lexicalText = String(row.text ?? '').replace(/\bTypography\s*:/gi, '');
  const publicTerms = tokens([row.title, row.description, row.tagline].join(' '));
  const tags = [row.category, ...(row.categories ?? []), row.industry, ...(row.industries ?? [])];
  const prepared = {
    // Taxonomy can qualify a visible subject (an "AI" agent card) but never supplies the subject itself.
    tagTerms: new Set(words(tags.filter(Boolean).join(' '))),
    sourceText: row.text,
    terms: new Set([...tokens(lexicalText), ...publicTerms]),
    titleTerms: new Set(tokens(row.title)),
    visibleWords: compoundWords(visibleText),
    primaryTerms: new Set(tokens(primaryText)),
    // Stemmed evidence for literal subjects. Modifiers may come from industry/category
    // taxonomy (an AI agent card), never from the format category (Product, Motion).
    primaryWords: compoundWords(primaryText), publicWordSet: compoundWords([row.title, row.description, row.tagline].join('. ')),
    tagWords: wordSet([row.industry, ...(row.industries ?? []), ...(row.categories ?? [])].filter(Boolean).join(' ')),
    // Shape and theme taxonomy describe what a work depicts (an Animal mark), so they can
    // evidence a literal subject itself, not only its modifiers.
    depictionWords: wordSet([row.shape, ...(Array.isArray(row.themes) ? row.themes : [row.themes])].filter(Boolean).join(' ')),
    kind: row.kind,
    denseLayout: hasDenseLayout(visibleText),
    // Category and shape taxonomy name what a work is (a Wordmark shape is a wordmark).
    primarySubjects: withParents(new Set([...subjectsIn(primaryText), ...subjectsIn([row.category, ...(row.categories ?? []), ...String(row.shape ?? '').split(',')].join(', '))])),
    mentionedSubjects: withParents(new Set([...subjectsIn(visibleText), ...subjectsIn([row.category, ...(row.categories ?? []), ...String(row.shape ?? '').split(',')].join(', '))])),
    // Public prose alone: a fallback to supporting features never rests on hidden-note scenery.
    publicSubjects: withParents(new Set(subjectsIn([row.title, row.description, row.tagline].join('. ')))),
    publicWords: new Set(words([row.title, row.description, row.tagline].join('. '))),
    video: (row.media ?? []).some(item => ['video', 'recording'].includes(item?.type)),
  };
  // Another sense of a concept's head word (a food menu): the head word shares a sentence with
  // a cue of that sense, or the work's industry taxonomy is that sense's domain.
  const taggedCue = sense => [...prepared.tagTerms].some(term => sense.cues.has(term));
  const senseShown = (sense, text) => String(text ?? '').split(/[.!?;\n]+/).some(sentence => {
    const ws = new Set(words(sentence));
    return ws.has(sense.head) && (taggedCue(sense) || [...ws].some(word => sense.cues.has(word)));
  });
  for (const sense of senses) {
    if (senseShown(sense, primaryText)) prepared.primarySubjects.add(sense.concept);
    if (senseShown(sense, visibleText)) prepared.mentionedSubjects.add(sense.concept);
  }
  if (prepared.primarySubjects.has('date picker') ||
      (/\b(?:calendar|booking)\b/i.test(introduction) && /\b(?:selected (?:day|date|appointment)|date and time controls?)\b/i.test(visibleText))) {
    for (const set of [prepared.primarySubjects,prepared.mentionedSubjects]) {
      set.add('date picker');
      set.add('calendar');
    }
  }
  if (prepared.mentionedSubjects.has('date picker')) prepared.mentionedSubjects.add('calendar');
  // An interaction is what a motion work does, usually told after the object it moves ("a PDF
  // chip is dragged toward a drop target"), so public prose naming it is main-subject evidence.
  for (const subject of prepared.publicSubjects) if (interactionConcepts.has(subject)) prepared.primarySubjects.add(subject);
  for (const subject of prepared.mentionedSubjects) {
    for (const term of tokens(subject)) prepared.terms.add(term);
  }
  prepared.explicitLandingPage = prepared.primarySubjects.has('landing page');
  // A logo or icon whose shape taxonomy is a face, figure or animal depicts a character.
  if (['logo', 'icon'].includes(row.kind) && /\b(?:human|face|animal|character|mascot)\b/i.test(String(row.shape ?? '')))
    for (const set of [prepared.primarySubjects, prepared.mentionedSubjects]) set.add('character');
  // A record's archive kind is reliable evidence for these broad subjects.
  if (['logo', 'icon', 'website'].includes(row.kind)) {
    prepared.primarySubjects.add(row.kind);
    // Website entries are general page references even when their prose omits homepage/landing page.
    // A website is a page with a hero, so both page-format subjects are evidenced.
    if (row.kind === 'website') for (const set of [prepared.primarySubjects, prepared.mentionedSubjects]) { set.add('landing page'); set.add('hero'); }
    prepared.mentionedSubjects.add(row.kind);
  }
  documents.set(row, prepared);
  return prepared;
}

export function queryIntent(args, positive, contextVocabulary, contextPhrases=[]) {
  let subjects = args.subjects ? [...new Set(args.subjects.map(canonicalSubject))] : undefined;
  let featureOnly = false;
  if (!subjects) {
    const head = positive.split(/\b(?:with|featuring|containing|for)\b/i, 1)[0];
    const all = subjectsIn(positive);
    const specific = all.filter(subject => !['website', 'logo', 'icon'].includes(subject));
    subjects = specific.length ? specific : all;
    const headSubjects = subjectsIn(head).filter(subject => subjects.includes(subject));
    // Adjacent concepts form one compound subject ("pricing card"): the earlier concept
    // modifies the head noun instead of being dropped. Fallbacks keep each concept reachable.
    const mentions = subjectMentions(head).filter(({to}) => !archiveKinds.includes(to));
    let run = mentions.slice(-1);
    for (let i = mentions.length - 2; i >= 0 && mentions[i].end + 1 === run[0].start; i--) run = [mentions[i], ...run];
    const compound = run.length > 1 ? run.map(({to}) => to).join(' ') : '';
    if (compound && !aliases.has(compound) && run.at(-1).to === headSubjects.at(-1)) subjects = [compound];
    else if (headSubjects.length===1 || headSubjects.length && !/\b(?:and|or)\b/i.test(head)) subjects = headSubjects.slice(-1);
    else if (!headSubjects.length && subjects.length) {
      // Nothing named before the first clause: a concept read only from a "for" clause names
      // whom the work is for ("a logo for a payments brand"), not the artifact; one read only
      // from a "with/featuring/containing" clause is a feature inside the work ("an ordering
      // interface with item cards"), searched as a supporting feature.
      const parts = positive.split(/\b(with|featuring|containing|for)\b/i);
      const clauses = parts.slice(1).flatMap((marker, i) => i % 2 ? [] : [{marker: marker.toLowerCase(), concepts: subjectsIn(parts[i + 2] ?? '')}]);
      const only = (subject, test) => clauses.some(clause => clause.concepts.includes(subject)) && clauses.every(clause => !clause.concepts.includes(subject) || test(clause.marker));
      const domainOnly = subjects.filter(subject => only(subject, marker => marker === 'for'));
      featureOnly = subjects.length > domainOnly.length && subjects.filter(subject => !domainOnly.includes(subject)).every(subject => only(subject, marker => marker !== 'for'));
      if (domainOnly.length) subjects = subjects.filter(subject => !domainOnly.includes(subject));
      if (!subjects.length) subjects = subjectsIn(head);
    }
  }
  if (!args.subjects && args.kinds?.length > 1 && subjects.length && subjects.every(subject=>args.kinds.includes(subject))) {
    subjects=[...args.kinds];
  }
  // A head word with another sense takes that sense when the request names one of its cues
  // ("restaurant menu", or "menu" with a food context).
  const requestWords = new Set(words([positive, args.context ?? ''].join(' ')));
  subjects = [...new Set(subjects.map(subject => senses.find(sense => sense.head === subject && [...requestWords].some(word => sense.cues.has(word)))?.concept ?? subject))];
  // A searched kind named in the wording ("funeral home website" on a website and design
  // search) is the work itself, never a feature inside it.
  const scope = args.subject_scope ?? (featureOnly ||
    /\bwebsites?\b.*\b(?:with|featuring|containing)\b/i.test(positive) && subjects.some(s=>s!=='website'&&!(args.kinds??[]).includes(s)) ||
    !args.subjects && subjects.includes('icon') && !args.kinds?.includes('icon') && args.kinds?.some(kind => kind === 'design' || kind === 'website')
      ? 'contains' : 'primary');
  const queryTerms = tokens(positive);
  const termSequence=' '+queryTerms.join(' ')+' ';
  // Specific catalog topics named in the query retain topical admission.
  // Project roles with related evidence and explicit context stay flexible.
  const project = projectContext(positive);
  const named=[...new Set(contextPhrases.filter(phrase=>termSequence.includes(' '+phrase+' ')&&!project?.query.test(phrase)))];
  // A topic inferred from wording admits works only when it is the brief's single
  // stated domain. Explicit subjects already define admission, and "X or Y" offers
  // alternatives; in both cases the topic ranks matching works first instead.
  const offeredAsAlternative=topic=>{
    const phrase=topic.split(' ').map(word=>word.replace(/[^\p{L}\p{N}]/gu,'')+'\\w*').join('\\W+');
    return new RegExp('\\b'+phrase+'\\s+or\\b|\\bor\\s+(?:an?\\s+)?'+phrase,'iu').test(positive);
  };
  // Only the query text names a mandatory topic: a phrase that merely restates the soft
  // context ("food and drink") ranks instead.
  const contextTerms = new Set(tokens(args.context ?? ''));
  const softContext = topic => tokens(topic).every(term => contextTerms.has(term));
  const topics=args.subjects?[]:named.filter(topic=>!offeredAsAlternative(topic)&&!softContext(topic));
  const topicPreferences=named.filter(topic=>!topics.includes(topic));
  // Inferred context: single-word domain labels, or every word of a multi-word domain
  // label the query names whole ("real estate"; "personal" alone is no domain).
  const namedWords = new Set(contextPhrases.filter(phrase => termSequence.includes(' ' + phrase + ' ')).flatMap(phrase => phrase.split(' ')));
  const context = args.context ? tokens(args.context) : queryTerms.filter(term => (contextVocabulary.has(term) || namedWords.has(term)) && !subjects.some(subject => tokens(subject).includes(term)));
  const inferredFamilies = [...new Set(subjects.map(subject => families.get(subject)).filter(Boolean))];
  const kinds = [...new Set(inferredFamilies.flatMap(family => family === 'web' ? ['design', 'website'] : family))];
  const lowDensity = /\b(?:simple|simpler|sparse|spacious|uncluttered|minimal(?:ist)?|less dense|lower density|low density)\b/i.test(positive);
  const subjectAliases = [...new Map([positive,...(args.subjects??[])].flatMap(subjectMentions)
    .filter(({from,to})=>from!==to&&subjects.includes(to)).map(alias=>[alias.from,alias])).values()];
  const [projectLead, ...requestedFeatures] = positive.split(':');
  const relatedTopic = !args.subjects && requestedFeatures.some(part=>part.trim()) && topics.find(topic =>
    (' ' + tokens(projectLead).join(' ') + ' ').includes(' ' + topic + ' '));
  return {subjects, subject_scope: scope, context, topics, topicPreferences, kinds, lowDensity, subjectAliases, project, relatedTopic};
}

// Scope 'public' is the internal contains-fallback scope: mentions in public prose only.
// A literal subject is read as units: each familiar concept inside it ("credit card" ->
// payment card, met by a debit or Visa card too) and each remaining word. A word of a
// multi-word subject also matches its derivational relatives (sleep tracker ->
// sleep-tracking, file manager -> file-management).
function subjectUnits(subject) {
  const required = subjectTerms(subject);
  // A mention spanning the whole phrase is the literal subject itself ("payment form"
  // kept literal because form adds a concept), so its words stay separate units.
  const mentions = subjectMentions(subject).filter(({from, to}) => to !== subject && !archiveKinds.includes(to) && from !== normalized(subject));
  const covered = new Set(mentions.flatMap(({from}) => words(from)));
  return [...mentions.map(({from, to}) => ({text: from, concept: to, terms: words(from).filter(term => required.includes(term))})).filter(unit => unit.terms.length),
    ...required.filter(term => !covered.has(term)).map(term => ({text: term, terms: [term]}))]
    .map(unit => ({...unit, head: unit.terms.includes(required.at(-1))}));
}
function unitShown(document, scope, unit, related, required = unit.terms) {
  const subjectSet = scope === 'public' ? document.publicSubjects : scope === 'contains' ? document.mentionedSubjects : document.primarySubjects;
  const wordsIn = scope === 'public' ? document.publicWordSet : scope === 'contains' ? document.visibleWords : document.primaryWords;
  const has = related ? hasFamily : hasForm;
  // A word inside a compound counts only when the compound's other parts belong to the same
  // subject (sleep-tracking for "sleep tracker"; never controller-like for "like button").
  const inPhrase = part => part.length <= 2 || required.some(term => has(new Set([part]), term));
  const shown = term => has(wordsIn.free, term) || has(document.depictionWords, term) ||
    wordsIn.compounds.some(parts => parts.some(part => has(new Set([part]), term)) && parts.every(inPhrase)) ||
    motionHeads.has(term) && document.video && motionVerbs.some(verb => hasForm(wordsIn.free, verb));
  // The head noun must be visible; a modifier may also come from the work's
  // industry/category taxonomy ("AI agent") or its kind ("logo animation").
  if (unit.concept && subjectSet.has(unit.concept)) return true;
  return unit.terms.every(term => shown(term) || !unit.head && (has(document.tagWords, term) || term === document.kind));
}
export function subjectEvidence(document, intent) {
  const scope = intent.subject_scope;
  const subjectSet = scope === 'public' ? document.publicSubjects : scope === 'contains' ? document.mentionedSubjects : document.primarySubjects;
  return intent.subjects.filter(subject => {
    if (families.has(subject)) return subjectSet.has(subject);
    const units = subjectUnits(subject);
    const related = subjectTerms(subject).length > 1;
    const required = subjectTerms(subject);
    return units.length > 0 && units.every(unit => unitShown(document, scope, unit, related, required)) && unitsNear(document, scope, units, related, required);
  });
}
// The units of a literal phrase found in running text must belong together: within six words
// of each other, and a head word directly followed by an article is a verb ("stacks an amount
// card", "stacks a large amount"), not the noun of the phrase (a card stack). Units evidenced only
// by taxonomy or a concept set are not positioned and skip the check.
const articles = new Set(['a', 'an', 'the', 'its', 'their']);
// Positions in a word sequence where a literal word names something else: a modifier inside a
// familiar multi-word concept ("text" of "text input" belongs to an input), or a head word
// inside a compound of another sense ("tab" of "folder tab").
const multiAliases = [...aliases].filter(([alias]) => alias.includes(' ')).map(([alias, concept]) => ({parts: alias.split(' '), concept}));
const consumedCache = new WeakMap();
function consumedPositions(sequence) {
  if (consumedCache.has(sequence)) return consumedCache.get(sequence);
  // modifiers: position -> the concepts and head words of the phrases it modifies.
  const heads = new Set(), modifiers = new Map();
  sequence.forEach((word, i) => {
    for (const {parts, concept} of multiAliases) if (parts[0] === word && parts.every((part, j) => sequence[i + j] === part))
      for (let j = 0; j < parts.length - 1; j++) modifiers.set(i + j, [...(modifiers.get(i + j) ?? []), {concept, head: parts.at(-1)}]);
    for (const compound of senseCompounds) if (word === compound.head && compound.modifiers.has(sequence[i - 1])) heads.add(i);
  });
  const consumed = {heads, modifiers};
  consumedCache.set(sequence, consumed);
  return consumed;
}
function unitsNear(document, scope, units, related, required = []) {
  const sequence = (scope === 'public' ? document.publicWordSet : scope === 'contains' ? document.visibleWords : document.primaryWords).sequence;
  const has = related ? hasFamily : hasForm;
  const consumed = consumedPositions(sequence);
  // A phrase met in the text is the requested subject itself when it names a requested concept
  // or ends in a requested word ("payment form" for a payment form, "prompt bar" for a prompt input).
  const own = new Set(units.map(unit => unit.concept).filter(Boolean));
  const elsewhere = i => (consumed.modifiers.get(i) ?? []).some(({concept, head}) => !own.has(concept) && !required.includes(head));
  const positions = [];
  for (const unit of units) {
    const words = unit.concept ? [...new Set(subjectNames(unit.concept).map(name => normalized(name).split(' ').at(-1)))] : unit.terms;
    const raw = sequence.flatMap((word, i) => words.some(term => has(new Set([word]), term)) ? [i] : []);
    // An animation shown by how something moves on a video work ("scales text as it scrolls").
    const motion = !unit.concept && document.video && unit.terms.some(term => motionHeads.has(term))
      ? sequence.flatMap((word, i) => motionVerbs.some(verb => hasForm(new Set([word]), verb)) ? [i] : []) : [];
    if (!raw.length && !motion.length) return true;
    // A literal word counts only where it names the requested thing, and a head word directly
    // followed by an article is a verb ("balances the layout"), not the noun.
    const free = unit.concept ? raw : raw.filter(i => !(unit.head ? consumed.heads.has(i) : elsewhere(i)));
    const nouns = [...(unit.head ? free.filter(i => !articles.has(sequence[i + 1])) : free), ...motion];
    if (!nouns.length) return false;
    positions.push(nouns);
  }
  if (positions.length < 2) return true;
  return positions[0].some(start => positions.every(list => list.some(i => Math.abs(i - start) <= 6)));
}
