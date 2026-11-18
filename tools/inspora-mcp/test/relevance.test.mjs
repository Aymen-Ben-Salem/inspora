import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {work, embed, vector, evidencedIds, admitted} from './fixtures.mjs';

function engine(works) {
  const capturedAt = new Date().toISOString();
  const rows = normalizeRows({capturedAt, rows: works}).map(row => ({...row, vector: vector()}));
  return new SearchEngine({snapshotId: 'subject-regression', capturedAt, rows}, {embed});
}

test('subject evidence is required across component, web, print and brand requests', async () => {
  const cases = [
    ['minimal clean cards', 'Profile card', 'A minimal clean profile card expands to show account details.'],
    ['clean dashboards', 'Analytics dashboard', 'A clean analytics dashboard organizes revenue and activity.'],
    ['minimal navigation', 'Navigation bar', 'A minimal navigation bar switches between sections.'],
    ['clean checkout', 'Checkout flow', 'A clean checkout flow collects delivery and payment details.'],
    ['minimal posters', 'Festival poster', 'A minimal festival poster pairs type with a geometric illustration.'],
    ['clean packaging', 'Tea packaging', 'Clean tea packaging combines a wordmark and a leaf motif.'],
    ['minimal hero sections', 'Product hero', 'A minimal hero section introduces a product.'],
  ];
  for (const [query, title, description] of cases) {
    const target = {...work(1), title, description};
    const wrongSubject = {...work(2), title: 'Minimal clean sculpture', description: 'A clean minimal sculpture in a gallery.'};
    const wrongKind = {...work(3, 'icon'), title: 'Minimal clean icon', description: 'A minimal clean geometric app icon.'};
    const result = await engine([target, wrongSubject, wrongKind]).search({query});
    // An inferred subject ranks: works without it follow, reported with subject evidence none.
    assert.deepEqual(evidencedIds(result), [target.id], query);
    assert.equal(result.results[0].id, target.id, query);
    assert.ok(result.results.every(row => row.id === target.id || row.match === 'brief' && row.evidence.subject.matched_as === 'none'), query);
    assert.equal(result.insufficient_matches, true);
  }
});

test('main subjects outrank background mentions and every continuation retains admission rules', async () => {
  const dashboards = Array.from({length: 13}, (_, index) => ({
    ...work(index + 1), title: 'Analytics dashboard ' + index,
    description: 'A clean dashboard organizes analytics and progress.',
  }));
  const background = {...work(20), title: 'Floating navigation', description: 'A clean navigation bar overlays an analytics dashboard.'};
  const logo = {...work(21, 'logo'), title: 'Fitness identity', description: 'A clean fitness logo.', industry: 'Fitness'};
  const e = engine([...dashboards, background, logo]);
  const first = await e.search({query: 'clean fitness dashboard'});
  assert.equal(first.results.length, 10);
  const second = await e.search({cursor: first.next_cursor});
  assert.equal(evidencedIds(second).length, 3);
  assert.deepEqual(new Set([...evidencedIds(first), ...evidencedIds(second)]), new Set(dashboards.map(row => row.id)));
  assert.equal(second.next_cursor, null);
});

test('card meanings, plurals and subject aliases remain distinct', async () => {
  const rows = [
    {...work(1), title: 'Profile cards', description: 'Clean profile cards with account details.'},
    {...work(2), title: 'Playing card', description: 'A clean playing card dissolves into particles.'},
    {...work(3), title: 'Visa card', description: 'A clean payment card has a brushed metal finish.'},
    {...work(4), title: 'Gift card page', description: 'A clean gift-card page uses flowers and lettering.'},
    {...work(5), title: 'Sign-in form', description: 'A clean sign-in form presents account fields.'},
  ];
  const e = engine(rows);
  for (const query of ['clean cards', 'clean card designs', 'clean UI cards']) {
    assert.deepEqual(evidencedIds(await e.search({query})), [rows[0].id]);
  }
  assert.deepEqual(evidencedIds(await e.search({query: 'clean payment cards'})), [rows[2].id]);
  assert.deepEqual(evidencedIds(await e.search({query: 'clean playing cards'})), [rows[1].id]);
  assert.deepEqual(evidencedIds(await e.search({query: 'clean login'})), [rows[4].id]);
});

test('explicit kinds, mixed requests and containing a feature are supported', async () => {
  const rows = [
    {...work(1, 'logo'), title: 'Clean wordmark', description: 'A clean wordmark for a studio.'},
    {...work(2, 'website'), title: 'Clean studio', description: 'A clean studio website includes project cards in its gallery.'},
    {...work(3), title: 'Clean card', description: 'A clean UI card presents a project.'},
  ];
  const e = engine(rows);
  assert.deepEqual((await e.search({query: 'clean logos'})).results.map(row => row.id), [rows[0].id]);
  assert.deepEqual((await e.search({query: 'clean websites'})).results.map(row => row.id), [rows[1].id]);
  assert.deepEqual(new Set((await e.search({query: 'clean logos and websites'})).results.map(row => row.id)), new Set([rows[0].id, rows[1].id]));
  const containing = await e.search({query: 'clean websites with cards'});
  assert.deepEqual(containing.results.map(row => row.id), [rows[1].id]);
  assert.equal(containing.interpreted_query.subject_scope, 'contains');
});

test('open-ended explicit subjects work beyond the inferred vocabulary and bind to cursors', async () => {
  const boards = Array.from({length: 12}, (_, index) => ({
    ...work(index + 1), title: 'Kanban board ' + index,
    description: 'A clean kanban board organizes customer tasks.',
  }));
  const e = engine([...boards, {...work(20), title: 'Clean poster', description: 'A clean poster for a software company.'}]);
  const first = await e.search({query: 'clean customer workflow', subjects: ['kanban board'], kinds: ['design']});
  assert.equal(first.results.length, 10);
  await assert.rejects(e.search({cursor: first.next_cursor, subjects: ['poster']}), /MISMATCH/);
  await assert.rejects(e.search({cursor: first.next_cursor, subject_scope: 'contains'}), /MISMATCH/);
  await assert.rejects(e.search({cursor: first.next_cursor, context: 'finance'}), /MISMATCH/);
  assert.equal((await e.search({cursor: first.next_cursor})).results.length, 2);
});

test('context improves ranking and alternatives disclose unsupported context', async () => {
  const generic = {...work(1), title: 'Clean dashboard', description: 'A clean dashboard displays sales metrics.'};
  const fitness = {...work(2), title: 'Activity overview', description: 'A dashboard summarizes fitness and recovery.', industries: ['Fitness']};
  const result = await engine([generic, fitness]).search({query: 'clean dashboard', context: 'fitness'});
  assert.equal(result.results[0].id, fitness.id);
  // Both show the subject; context evidence orders them and is reported per result.
  assert.deepEqual(result.results.map(row => row.match), ['subject', 'subject']);
  assert.deepEqual(result.results[0].evidence.context, {matched: ['fitness']});
  assert.deepEqual(result.results[1].evidence.context, {unverified: ['fitness']});
  assert.match(result.results[1].reason, /Subject dashboard \(literal in title, description\)\. Context fitness unverified/);
});

test('hidden-note scenery cannot override an identified subject and raw reference requests still work', async () => {
  const capturedAt = new Date().toISOString();
  const rows = normalizeRows({capturedAt, rows: [
    {...work(1), title: 'Action button', description: 'A circular action button opens a small menu.'},
    {...work(2), title: 'Revenue dashboard', description: 'A clean revenue dashboard presents financial metrics.'},
    {...work(3), title: 'Sales dashboard', description: 'A clean sales dashboard presents financial metrics.'},
  ]}).map(row => ({...row, vector: vector()}));
  rows[0].searchOnly = 'The visible dashboard has pale cards and small controls.';
  rows[0].text += ' ' + rows[0].searchOnly;
  const e = new SearchEngine({snapshotId: 'notes', capturedAt, rows}, {embed});
  const result = await e.search({query: 'clean dashboard'});
  assert.deepEqual(new Set(evidencedIds(result)), new Set([rows[1].id, rows[2].id]));
  const references = await e.search({reference_url: rows[1].url});
  assert.ok(references.results.some(row => row.id === rows[2].id));
  assert.ok(references.results.every(row => row.id !== rows[1].id));
});

test('old ranked continuations expire after the search algorithm changes', async () => {
  const e = engine(Array.from({length: 12}, (_, index) => ({...work(index + 1), title: 'Clean card', description: 'A clean profile card.'})));
  const first = await e.search({query: 'clean cards'});
  delete e.cursors.get(first.next_cursor).searchRevision;
  await assert.rejects(e.search({cursor: first.next_cursor}), /CURSOR_EXPIRED/);
});

// Revision 10: a density cue read from free text ranks instead of filtering (only explicit
// arguments are hard); a contradicting dense layout comes last and says why.
test('simpler refinements rank contradictory layouts last without filling sparse results', async () => {
  const dense = {...work(1), title: 'Finance dashboard', description: 'A dense finance dashboard packs many small charts and compact data tables into a multi-column desktop layout.', styles: ['Minimal']};
  const simple = {...work(2), title: 'Finance overview', description: 'A simple finance dashboard uses a spacious single-column layout, large text and a few key metrics.'};
  const unrelated = {...work(3), title: 'Glossy orb animation', description: 'A simple orb on a sparse background with generous whitespace.'};
  const e = engine([dense, simple, unrelated]);
  assert.equal((await e.search({query: 'clean finance dashboard designs'})).results.length, 2);
  for (const preference of ['simple', 'simpler', 'minimal', 'less dense', 'uncluttered']) {
    const result = await e.search({query: `${preference} finance dashboard designs for a small laptop screen`});
    assert.deepEqual(result.results.map(row => row.id), [simple.id, dense.id], preference);
    assert.match(result.results[1].reason, /denser than requested/);
    assert.equal(result.results[1].evidence.dense_layout, true);
    assert.equal(result.interpreted_query.derived_constraints.density, 'low');
    assert.equal(result.insufficient_matches, true);
    assert.equal(result.next_cursor, null);
  }
  const sparse = await engine([dense, unrelated]).search({query: 'simpler finance dashboard designs'});
  assert.deepEqual(sparse.results.map(row => row.id), [dense.id], 'the unrelated orb is never padded in');
  assert.equal(sparse.exhausted, true);
});

test('layout contradictions use prose evidence across subjects, including hidden notes, and rank last', async () => {
  for (const subject of ['dashboard', 'landing page', 'kanban board']) {
    const capturedAt = new Date().toISOString();
    const rows = normalizeRows({capturedAt, rows: [
      {...work(1), title: subject, description: `A ${subject} organizes the content.`, styles: ['Minimal']},
      {...work(2), title: subject, description: `A ${subject} uses an open layout and a dense grain texture.`},
      {...work(3), title: subject, description: `A ${subject} has a spacious layout rather than a dense interface.`},
    ]}).map(row => ({...row, vector: vector()}));
    rows[0].searchOnly = 'The workspace has a dense table of records and a cluttered interface.';
    rows[0].text += ' ' + rows[0].searchOnly;
    const e = new SearchEngine({snapshotId: subject, capturedAt, rows}, {embed});
    const result = await e.search({query: `simple ${subject}`, subjects: [subject]});
    assert.deepEqual(new Set(result.results.slice(0, 2).map(row => row.id)), new Set([rows[1].id, rows[2].id]), subject);
    assert.equal(result.results[2].id, rows[0].id);
    assert.match(result.results[2].reason, /denser than requested/);
    const broad = await e.search({query: subject, subjects: [subject]});
    assert.equal(broad.results.length, 3, 'ordinary subject searches retain dense layouts');
  }
});

test('direction discovery can retrieve direct references across kinds and nearby functional work anywhere in the catalog',async()=>{
  const noise=Array.from({length:40},(_,i)=>({...work(i+1,'website'),title:'Technology studio '+i,description:'A software studio website uses cream panels and orange type.'}));
  const coffee=[
    {...work(50,'logo'),title:'Coffee wordmark',description:'Rounded coffee lettering over pouring espresso.'},
    {...work(51,'icon'),title:'Coffee dripper',description:'A metallic coffee dripper with an amber stream.'},
    {...work(52),title:'Coffee receipt',description:'A coffee receipt card shows an itemized order.'},
  ];
  const foodSite={...work(53,'website'),title:'Food store',description:'A food website organizes product packs and illustrated ingredients into distinct sections.'};
  const foodDesign={...work(54),title:'Delivery progress',description:'A food delivery card shows preparation, packing and delivered states.'};
  const e=engine([...noise,...coffee,foodSite,foodDesign]);
  const direct=await e.search({query:'coffee',required_terms:['coffee']});
  assert.deepEqual(new Set(direct.results.map(row=>row.id)),new Set(coffee.map(row=>row.id)));
  assert.deepEqual(direct.search_coverage.matching_by_kind,{logo:1,icon:1,design:1});
  const adjacent=await e.search({query:'food',kinds:['website','design'],required_terms:['food']});
  assert.deepEqual(new Set(adjacent.results.map(row=>row.id)),new Set([foodSite.id,foodDesign.id]));
  assert.equal(adjacent.search_coverage.catalog_works,45);
  assert.equal(adjacent.search_coverage.filtered_works,2);
  assert.equal(adjacent.insufficient_matches,true);
  const exact=await e.search({query:'coffee websites',required_terms:['coffee']});
  assert.equal(exact.results.length,0,'an exact website request must not be padded with coffee identity or unrelated websites');
});

test('editorial field labels alone cannot qualify a result while real typography evidence remains searchable',async()=>{
  const capturedAt=new Date().toISOString();
  const rows=normalizeRows({capturedAt,rows:[
    {...work(1,'website'),title:'Generic service',description:'A service site presents account information.'},
    {...work(2,'website'),title:'Expressive typography',description:'An expressive typography study with oversized lettering.'},
    {...work(3,'website'),title:'Typographic study',description:'Typography: a playful exploration of type.'},
  ]}).map(row=>({...row,vector:vector()}));
  rows[0].searchOnly='Typography: Standard sans-serif body text and small labels.';
  rows[0].text+=' '+rows[0].searchOnly;
  const e=new SearchEngine({snapshotId:'field-labels',capturedAt,rows},{embed});
  const result=await e.search({query:'expressive typography websites'});
  assert.ok(!admitted(result).some(row=>row.id===rows[0].id),'a structural heading is not visual subject evidence');
  assert.ok(result.results.some(row=>row.id===rows[1].id));
  assert.ok(result.results.some(row=>row.id===rows[2].id),'public prose remains searchable, including headings');
});
