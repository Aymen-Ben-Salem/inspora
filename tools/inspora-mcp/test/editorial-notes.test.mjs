import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorialContentHash, reviewedEditorialEntries } from '../editorial-notes.mjs';
const row={id:'1c51893b-bc44-4d48-933b-e1402c74dc95',kind:'website',title:'Studio',description:'A studio website',source_url:'https://example.com',media:[{type:'favicon',url:'https://example.com/icon',width:64,height:64},{type:'recording',url:'https://example.com/video',poster:'https://example.com/poster',width:1000,height:800}]};
const note={work_id:row.id,kind:'website',content_hash:editorialContentHash(row),notes:{scope:'webpage',visualNotes:'A spacious studio website uses an asymmetric grid.',typography:null,typographyIsSubject:false},evidence:['a'.repeat(64)],reviewed_at:'2026-11-13T12:00:00Z'};
test('saved notes follow current public eligibility and reject stale source/media/classification',()=>{
 assert.equal(reviewedEditorialEntries([row],[note]).length,1);
 assert.equal(reviewedEditorialEntries([],[note]).length,0);
 for(const update of [{description:'Changed'},{colors:['Blue']},{source_url:'https://other.com'},{media:[]}])assert.equal(reviewedEditorialEntries([{...row,...update}],[note]).length,0);
 assert.equal(reviewedEditorialEntries([{...row,status:'published',updated_at:'2026-11-14T12:00:00Z'}],[note]).length,1);
});
test('normalizes missing columns and website media order across editor and public view',()=>{
 assert.equal(editorialContentHash({...row,media:[...row.media].reverse()}),editorialContentHash({...row,category:'',industries:[],styles:[],colors:[],themes:[],categories:[],industry:'',tagline:''}));
});
