import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchEngine} from '../search.mjs';
import {normalizeRows} from '../catalog.mjs';
import {work, embed, vector} from './fixtures.mjs';

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
    assert.deepEqual(result.results.map(row => row.id), [target.id], query);
    assert.equal(result.insufficient_matches, true);
  }
});

test('main subjects outrank background mentions and every continuation retains admission rules', async () => {
  const dashboards = Array.from({length: 9}, (_, index) => ({
    ...work(index + 1), title: 'Analytics dashboard ' + index,
    description: 'A clean dashboard organizes analytics and progress.',
  }));
  const background = {...work(20), title: 'Floating navigation', description: 'A clean navigation bar overlays an analytics dashboard.'};
  const logo = {...work(21, 'logo'), title: 'Fitness identity', description: 'A clean fitness logo.', industry: 'Fitness'};
  const e = engine([...dashboards, background, logo]);
  const first = await e.search({query: 'clean fitness dashboard'});
  assert.equal(first.results.length, 6);
  const second = await e.search({cursor: first.next_cursor});
  assert.equal(second.results.length, 3);
  assert.deepEqual(new Set([...first.results, ...second.results].map(row => row.id)), new Set(dashboards.map(row => row.id)));
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
    assert.deepEqual((await e.search({query})).results.map(row => row.id), [rows[0].id]);
  }
  assert.deepEqual((await e.search({query: 'clean payment cards'})).results.map(row => row.id), [rows[2].id]);
  assert.deepEqual((await e.search({query: 'clean playing cards'})).results.map(row => row.id), [rows[1].id]);
  assert.deepEqual((await e.search({query: 'clean login'})).results.map(row => row.id), [rows[4].id]);
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
  const boards = Array.from({length: 8}, (_, index) => ({
    ...work(index + 1), title: 'Kanban board ' + index,
    description: 'A clean kanban board organizes customer tasks.',
  }));
  const e = engine([...boards, {...work(20), title: 'Clean poster', description: 'A clean poster for a software company.'}]);
  const first = await e.search({query: 'clean customer workflow', subjects: ['kanban board'], kinds: ['design']});
  assert.equal(first.results.length, 6);
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
  assert.match(result.results[1].reason, /fitness.*unverified/i);
  assert.equal(result.results[1].match, 'alternative');
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
  assert.deepEqual(new Set(result.results.map(row => row.id)), new Set([rows[1].id, rows[2].id]));
  const references = await e.search({reference_url: rows[1].url});
  assert.ok(references.results.some(row => row.id === rows[2].id));
  assert.ok(references.results.every(row => row.id !== rows[1].id));
});

test('old ranked continuations expire after the search algorithm changes', async () => {
  const e = engine(Array.from({length: 8}, (_, index) => ({...work(index + 1), title: 'Clean card', description: 'A clean profile card.'})));
  const first = await e.search({query: 'clean cards'});
  delete e.cursors.get(first.next_cursor).searchRevision;
  await assert.rejects(e.search({cursor: first.next_cursor}), /CURSOR_EXPIRED/);
});
