// These aliases interpret familiar design vocabulary. Explicit subjects also accept
// arbitrary phrases, so the supported subjects are not limited to this dictionary.
const concepts = [
  ['card', 'design', ['ui card', 'interface card', 'card component', 'dashboard card']],
  ['payment card', 'design', ['credit card', 'debit card', 'bank card', 'visa card']],
  ['playing card', 'design', ['poker card', 'game card']],
  ['gift card', 'design', []],
  ['business card', 'design', ['visiting card']],
  ['dashboard', 'design', ['admin panel', 'analytics screen', 'analytics overview']],
  ['navigation', 'design', ['nav', 'navbar', 'navigation bar', 'bottom nav', 'tab bar', 'sidebar']],
  ['button', 'design', ['cta button']],
  ['form', 'design', []],
  ['login', 'design', ['sign in', 'signin', 'log in', 'sign up', 'signup', 'login form', 'sign in form']],
  ['checkout', 'design', ['checkout flow', 'checkout form']],
  ['onboarding', 'design', ['welcome flow']],
  ['pricing', 'design', ['pricing plan', 'plan selector', 'plan picker']],
  ['pricing table', 'design', ['plan comparison table']],
  ['table', 'design', ['data table', 'data grid']],
  ['chart', 'design', ['graph', 'data visualization']],
  ['calendar', 'design', ['date picker', 'datepicker']],
  ['search interface', 'design', ['search bar', 'search field', 'search input', 'search box']],
  ['dialog', 'design', ['modal', 'popup', 'pop up']],
  ['menu', 'design', ['context menu', 'dropdown', 'drop down']],
  ['notification', 'design', ['toast', 'alert']],
  ['tooltip', 'design', ['popover']],
  ['accordion', 'design', ['disclosure']],
  ['carousel', 'design', []],
  ['toggle', 'design', ['switch control']],
  ['slider', 'design', ['range control']],
  ['input', 'design', ['text field', 'input field']],
  ['player', 'design', ['media player', 'audio player', 'video player']],
  ['timeline', 'design', []],
  ['progress', 'design', ['progress indicator', 'progress bar', 'status control', 'loading indicator', 'loader']],
  ['cursor', 'design', []],
  ['chat', 'design', ['conversation interface', 'messaging interface']],
  ['upload', 'design', ['file uploader', 'file upload']],
  ['hero', 'web', ['hero section', 'hero area']],
  ['landing page', 'web', ['homepage', 'home page']],
  ['portfolio', 'web', []],
  ['poster', 'design', []],
  ['packaging', 'design', ['package design']],
  ['book cover', 'design', ['album cover', 'cover art']],
  ['brand identity', 'design', ['branding', 'visual identity', 'brand system']],
  ['illustration', 'design', []],
  ['wordmark', 'logo', []],
  ['monogram', 'logo', []],
  ['logo', 'logo', []],
  ['icon', 'icon', ['app icon', 'application icon']],
  ['website', 'website', ['web site']],
];

const stop = new Set('i me my a an the for of in on to with and or is are that this find show give want need looking inspiration some please from similar alternatives like can could would should it its using use design designs designing website websites logo logos icon icons app apps work works example examples result results only no not without ui interface'.split(' '));
const wordAliases = new Map([['minimalist', 'minimal'], ['minimalism', 'minimal'], ['geometrical', 'geometric']]);

function words(text) {
  return (String(text ?? '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []).map(word => {
    if (wordAliases.has(word)) return wordAliases.get(word);
    if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (/(?:ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
    return word;
  });
}

export const tokens = text => [...new Set(words(text).filter(word => word.length > 1 && !stop.has(word)))];
const normalized = text => words(text).join(' ');
const aliases = new Map(concepts.flatMap(([subject, , alternatives]) => [subject, ...alternatives].map(alias => [normalized(alias), subject])));
const families = new Map(concepts.map(([subject, family]) => [subject, family]));
const pattern = new RegExp('(?:^| )(' + [...aliases.keys()].sort((a, b) => b.length - a.length).join('|') + ')(?= |$)', 'g');

function subjectsIn(text) {
  return [...new Set([...normalized(text).matchAll(pattern)].map(match => aliases.get(match[1])))];
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
  const prepared = {
    sourceText: row.text,
    terms: new Set(tokens(row.text)),
    titleTerms: new Set(tokens(row.title)),
    primaryTerms: new Set(tokens(primaryText)),
    denseLayout: hasDenseLayout(visibleText),
    primarySubjects: new Set([...subjectsIn(primaryText), ...subjectsIn([row.category, ...(row.categories ?? [])].join(' '))]),
    mentionedSubjects: new Set([...subjectsIn(visibleText), ...subjectsIn([row.category, ...(row.categories ?? [])].join(' '))]),
  };
  for (const subject of prepared.mentionedSubjects) {
    for (const term of tokens(subject)) prepared.terms.add(term);
  }
  // A record's archive kind is reliable evidence for these broad subjects.
  if (['logo', 'icon', 'website'].includes(row.kind)) {
    prepared.primarySubjects.add(row.kind);
    prepared.mentionedSubjects.add(row.kind);
  }
  documents.set(row, prepared);
  return prepared;
}

export function queryIntent(args, positive, contextVocabulary) {
  let subjects = args.subjects?.map(subject => aliases.get(normalized(subject)) ?? normalized(subject));
  if (!subjects) {
    const head = positive.split(/\b(?:with|featuring|containing|for)\b/i, 1)[0];
    const all = subjectsIn(positive);
    const specific = all.filter(subject => !['website', 'logo', 'icon'].includes(subject));
    subjects = specific.length ? specific : all;
    const headSubjects = subjectsIn(head).filter(subject => subjects.includes(subject));
    if (headSubjects.length && !/\b(?:and|or)\b/i.test(head)) subjects = headSubjects.slice(-1);
  }
  const scope = args.subject_scope ?? (/\bwebsites?\b.*\b(?:with|featuring|containing)\b/i.test(positive) ? 'contains' : 'primary');
  const queryTerms = tokens(positive);
  const context = args.context ? tokens(args.context) : queryTerms.filter(term => contextVocabulary.has(term) && !subjects.some(subject => tokens(subject).includes(term)));
  const inferredFamilies = [...new Set(subjects.map(subject => families.get(subject)).filter(Boolean))];
  const kinds = [...new Set(inferredFamilies.flatMap(family => family === 'web' ? ['design', 'website'] : family))];
  const lowDensity = /\b(?:simple|simpler|sparse|spacious|uncluttered|minimal(?:ist)?|less dense|lower density|low density)\b/i.test(positive);
  return {subjects, subject_scope: scope, context, kinds, lowDensity};
}

export function subjectEvidence(document, intent) {
  const subjectSet = intent.subject_scope === 'contains' ? document.mentionedSubjects : document.primarySubjects;
  const termSet = intent.subject_scope === 'contains' ? document.terms : document.primaryTerms;
  return intent.subjects.filter(subject => {
    if (families.has(subject)) return subjectSet.has(subject);
    const required = tokens(subject);
    return required.length > 0 && required.every(term => termSet.has(term));
  });
}
