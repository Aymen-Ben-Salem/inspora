// Version 2 visual packs: dense motion sheets (holds collapsed, paged) and a sampled palette,
// with version 1 packs kept as the fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {mediaFingerprint} from '../enrichment.mjs';
import {collapseHolds,thinFrames,denseLayout,samplePalette,contentCrop} from '../prepare-visuals.mjs';
import {
  preparedVisuals,workReply,parseSheetSelection,visualManifest,visualManifestV1,visualAssetKey,visualManifestKey,visualSha,
  encodedBytes,VISUAL_MAX_EDGE,VISUAL_RESPONSE_BYTES,
} from '../visuals.mjs';

const row = {id:'00000000-0000-4000-8000-000000000201',kind:'design',title:'Island',creator:'Maker',
  media:[{type:'video',url:'https://media.inspora.design/posts/island.mp4',poster:'https://media.inspora.design/posts/island.webp'}]};
const hash = 'a'.repeat(64);
const jpeg = (size, fill = 1) => {const bytes = Buffer.alloc(size, fill); bytes[0] = 255; bytes[1] = 216; return bytes;};

test('version 2 manifests parse dense sheets in order; version 1 still parses; misordered sheets are rejected', () => {
  const base = {workId:row.id,mediaFingerprint:hash};
  const still = {role:'still',width:10,height:10,bytes:10,sha256:hash};
  const dense = n => ({role:'dense-'+n,width:10,height:10,bytes:10,sha256:hash,timecodes:[n,n+0.125]});
  assert.ok(visualManifest.parse({...base,version:2,palette:[{hex:'#ff0000',share:0.5}],motion:{fps:8,decoded:40,kept:20},assets:[still,dense(1),dense(2)]}));
  assert.ok(visualManifestV1.parse({...base,version:1,assets:[still,{...still,role:'detail-1'}]}));
  assert.throws(() => visualManifest.parse({...base,version:2,assets:[still,dense(2)]}));
  assert.throws(() => visualManifest.parse({...base,version:2,assets:[still,{...dense(1),timecodes:Array(17).fill(1)}]}));
  assert.throws(() => visualManifest.parse({...base,version:2,palette:[{hex:'red',share:1}],assets:[still]}));
  assert.notEqual(visualManifestKey(row),visualManifestKey(row,1));
  assert.match(visualManifestKey(row),/^mcp\/visuals\/v2\//);
});

async function framesFrom(directory, pictures) {
  const result = [];
  for (const [i,svg] of pictures.entries()) {
    const file = path.join(directory,`f-${String(i).padStart(3,'0')}.png`);
    await sharp(Buffer.from(svg)).png().toFile(file);
    result.push({file,time:i*0.125});
  }
  return result;
}
const scene = (x, cursor) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="100%" height="100%" fill="#eeeeee"/>
  <rect x="${x}" y="150" width="200" height="80" rx="40" fill="#111"/>${cursor === undefined ? '' : `<rect x="${cursor}" y="60" width="10" height="14" fill="#000"/>`}</svg>`;

test('holds collapse to their first and last frames, while a small cursor movement is kept', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'inspora-holds-'));
  try {
    // 0-3 hold, 4-6 the pill moves, 7-10 hold, 11-12 only a small cursor moves, 13 hold.
    const xs = [100,100,100,100,140,180,220,220,220,220,220,220,220,220];
    const cursors = [,,,,,,,,,,,300,340,340];
    const frames = await framesFrom(directory, xs.map((x,i) => scene(x,cursors[i])));
    const kept = await collapseHolds(frames);
    assert.deepEqual(kept.map(frame => frame.time/0.125),[0,3,4,5,6,10,11,12,13]);
    assert.deepEqual((await collapseHolds(frames)).map(frame => frame.file),kept.map(frame => frame.file),'deterministic');
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

test('thinning keeps both ends of the timeline and the frame limit', () => {
  const frames = Array.from({length:400},(_,i) => ({time:i/8}));
  const thin = thinFrames(frames,160);
  assert.equal(thin.length,160);
  assert.equal(thin[0].time,0);assert.equal(thin.at(-1).time,frames.at(-1).time);
  assert.equal(thinFrames(frames.slice(0,10),160).length,10);
});

test('dense sheet layouts stay within the edge and the client pixel limits for wide, square and phone frames', () => {
  for (const aspect of [16/9,1,9/19.5,1.6]) {
    const {columns,rows,w,h} = denseLayout(16,aspect);
    const width = (w+4)*columns, height = (h+26)*rows;
    assert.ok(width <= VISUAL_MAX_EDGE && height <= VISUAL_MAX_EDGE,`${aspect}: ${width}x${height}`);
    assert.ok(width*height <= 1_150_000,`${aspect}: ${width*height} pixels`);
    assert.ok(w*h >= 40_000,`${aspect}: tiles stay readable (${w}x${h})`);
  }
});

test('the palette is deterministic, keeps a small saturated accent and ignores transparent pixels', async () => {
  const picture = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#dddddd"/>
    <rect x="40" y="140" width="320" height="120" rx="60" fill="#0b0b0b"/><circle cx="90" cy="200" r="16" fill="#f21c11"/></svg>`);
  const firstPalette = await samplePalette(picture), second = await samplePalette(picture);
  assert.deepEqual(firstPalette,second);
  const first = firstPalette.colors;
  assert.equal(first[0].hex,'#dddddd');
  assert.ok(first.some(colour => colour.hex === '#0b0b0b'));
  assert.ok(first.some(colour => /^#f[0-9a-f]1/.test(colour.hex)),'red accent: '+JSON.stringify(first));
  const mark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="60" fill="#062df1"/></svg>`);
  const transparent = (await samplePalette(mark)).colors;
  assert.equal(transparent.length,1);assert.equal(transparent[0].share,1);assert.equal(transparent[0].hex,'#062df1');
});

test('sheet selections parse ranges, overview and report unknown sheets', () => {
  assert.deepEqual(parseSheetSelection('2-4',7),{sheets:[2,3,4],overview:false,invalid:[]});
  assert.deepEqual(parseSheetSelection('overview, 6-9',7),{sheets:[6,7],overview:true,invalid:['8','9']});
  assert.deepEqual(parseSheetSelection([3,1],7),{sheets:[3,1],overview:false,invalid:[]});
  assert.equal(parseSheetSelection(undefined,7),null);
});

// An in-memory v2 (and optionally v1) pack: a 60 KB still, a 120 KB overview and n dense sheets.
function store({dense = 5, denseSize = 150_000, v1 = false, v2 = true, extra = {}, motion = {}} = {}) {
  const files = new Map();
  const asset = (role, size, timecodes, version) => {
    const bytes = jpeg(size, role.length), item = {role,width:800,height:600,bytes:size,sha256:visualSha(bytes),...(timecodes ? {timecodes} : {})};
    files.set(visualAssetKey(row,item,version),bytes);
    return item;
  };
  if (v2) {
    const assets = [asset('still',60_000,[4],2),asset('overview',120_000,Array.from({length:30},(_,i) => i*0.5),2)];
    for (let n = 1; n <= dense; n++) assets.push(asset('dense-'+n,denseSize,Array.from({length:16},(_,i) => Number(((n-1)*2+i*0.125).toFixed(3))),2));
    files.set(visualManifestKey(row),Buffer.from(JSON.stringify({version:2,workId:row.id,mediaFingerprint:mediaFingerprint(row),duration:15,
      palette:[{hex:'#dedede',share:0.9},{hex:'#0b0c0a',share:0.07},{hex:'#f21c11',share:0.005}],motion:{fps:8,decoded:120,kept:dense*16,...motion},assets,...extra})));
  }
  if (v1) {
    const assets = [asset('still',50_000,[1],1),asset('overview',50_000,[0,1],1),asset('detail-1',50_000,[0,1],1)];
    files.set(visualManifestKey(row,1),Buffer.from(JSON.stringify({version:1,workId:row.id,mediaFingerprint:mediaFingerprint(row),duration:15,assets})));
  }
  return (key,limit) => {const bytes = files.get(key); return bytes && bytes.length <= limit ? bytes : null;};
}
const roles = pack => pack.images.map(image => image.item.role);

test('default study attaches the still and every dense sheet when they fit, otherwise the overview and sheets in order', async () => {
  const small = await preparedVisuals(row,store({dense:3,denseSize:100_000}),{detail:'study'});
  assert.deepEqual(roles(small),['still','dense-1','dense-2','dense-3']);
  assert.equal(small.dense.remaining,undefined);
  const large = await preparedVisuals(row,store({dense:6}),{detail:'study'});
  assert.deepEqual(roles(large),['still','overview','dense-1','dense-2','dense-3']);
  assert.equal(large.dense.remaining,'4-6');
  assert.ok(large.images.reduce((sum,image) => sum + encodedBytes(image.bytes.length),0) <= VISUAL_RESPONSE_BYTES);
  const glance = await preparedVisuals(row,store({dense:6}));
  assert.deepEqual(roles(glance),['still']);assert.equal(glance.motion_sheets,7);
  assert.equal(glance.palette.length,3);
});

test('an explicit sheet selection attaches only what it names and reports unknown sheets', async () => {
  const pages = await preparedVisuals(row,store({dense:6}),{detail:'study',sheets:'4-6'});
  assert.deepEqual(roles(pages),['dense-4','dense-5','dense-6']);
  assert.equal(pages.dense.remaining,'1-3');
  const mixed = await preparedVisuals(row,store({dense:6}),{detail:'study',sheets:'overview,9'});
  assert.deepEqual(roles(mixed),['overview']);assert.deepEqual(mixed.dense.invalid,['9']);
});

test('version 1 packs remain the fallback, and a sheet selection on them is reported as ignored', async () => {
  const fallback = await preparedVisuals(row,store({v1:true,v2:false}),{detail:'study',sheets:'2'});
  assert.deepEqual(roles(fallback),['still','overview','detail-1']);
  assert.equal(fallback.sheets_ignored,true);assert.equal(fallback.dense,undefined);
  const preferred = await preparedVisuals(row,store({v1:true,dense:2,denseSize:50_000}),{detail:'study'});
  assert.deepEqual(roles(preferred),['still','dense-1','dense-2']);
});

test('get_work replies label dense sheets, report ranges and the next request, and carry the sampled palette', async () => {
  const read = store({dense:6});
  const engine = {byId:new Map([[row.id,row]]),details:({id,detail}) => ({snapshot:{},id,title:row.title,creator:row.creator,preview:{video_url:row.media[0].url},detail})};
  const loadVisuals = (selected,options) => preparedVisuals(selected,read,options);
  const reply = await workReply(engine,[row.id],{preview:'image',detail:'glance',sheets:'2-3'},{loadVisuals});
  const data = JSON.parse(reply.content[0].text);
  assert.equal(data.detail,'study','a sheet selection implies study');
  assert.match(reply.content[1].text,/· dense-2 of 6 · t=2s–3.9s \(16 samples\)$/);
  assert.deepEqual(data.preview.study.dense_sheets.attached,[2,3]);
  assert.equal(data.preview.study.dense_sheets.ranges.length,6);
  assert.deepEqual(data.preview.study.next_request,{id:row.id,detail:'study',sheets:'1'});
  assert.equal(data.preview.study.dense_sheets.frames_per_second,8);
  assert.match(data.preview.study.note,/holds are collapsed/);
  assert.equal(data.preview.palette.colors[2].hex,'#f21c11');
  assert.match(data.preview.palette.note,/not confirmed brand colours/);
  // get_works shares one budget and ignores sheets.
  const batch = await workReply(engine,[row.id],{preview:'image',detail:'study',sheets:'5'},{loadVisuals,batch:true});
  assert.deepEqual(JSON.parse(batch.content[0].text).works[0].preview.images.map(image => image.role),['still','overview','dense-1','dense-2','dense-3']);
});

test('a clip repeating one cycle reports its period; a clip that moves on does not',async()=>{
  const {loopFrames}=await import('../prepare-visuals.mjs');
  const sharp=(await import('sharp')).default;
  const os=await import('node:os'),fsp=await import('node:fs/promises'),pathMod=await import('node:path');
  const dir=await fsp.mkdtemp(pathMod.join(os.tmpdir(),'loop-test-'));
  try{
    const frame=async(name,x)=>{const file=pathMod.join(dir,name+'.png');await sharp({create:{width:64,height:64,channels:3,background:'#202020'}}).composite([{input:{create:{width:8,height:8,channels:3,background:'#f0f0f0'}},left:x,top:28}]).png().toFile(file);return file;};
    const looping=[],moving=[];
    for(let i=0;i<40;i++){looping.push({file:await frame('l'+i,4+(i%10)*5),time:i/8});moving.push({file:await frame('m'+i,Math.min(55,i)),time:i/8});}
    assert.equal(await loopFrames(looping,8),10);
    assert.equal(await loopFrames(moving,8),null);
  }finally{await fsp.rm(dir,{recursive:true,force:true});}
});

test('a component on a plain canvas reports the canvas as background and its own colours as content', async () => {
  // A small card with dark text and a red button on a large off-white canvas: under 3% of the image.
  const picture = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200" fill="#f8f7f6"/>
    <rect x="500" y="560" width="200" height="16" fill="#111111"/><rect x="500" y="590" width="120" height="40" rx="8" fill="#e5232f"/></svg>`);
  const palette = await samplePalette(picture);
  assert.equal(palette.background.hex,'#f8f7f6');
  assert.ok(palette.background.share > 0.95);
  assert.ok(palette.content.some(colour => [1,3,5].every(i => parseInt(colour.hex.slice(i,i+2),16) < 0x30)),'dark text: '+JSON.stringify(palette.content));
  assert.ok(!palette.content.some(colour => colour.hex.startsWith('#f')),'no pink edge blends: '+JSON.stringify(palette.content));
  assert.ok(palette.content.some(colour => /^#e[0-9a-f]2/.test(colour.hex)),'red button: '+JSON.stringify(palette.content));
  assert.ok(Math.abs(palette.content.reduce((sum,colour) => sum + colour.share,0) - 1) < 0.02,'content shares are of the content area');
  // A busy image has no background split.
  const busy = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="200" height="400" fill="#1144aa"/><rect x="200" width="200" height="400" fill="#eeeeee"/></svg>`);
  const split = await samplePalette(busy);
  assert.equal(split.background,undefined);assert.equal(split.content,undefined);
});

test('dense sheets crop to where the design moves on a plain canvas, and leave full-bleed frames alone', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'crop-'));
  try {
    const frames = [];
    for (let i = 0; i < 6; i++) {
      const file = path.join(dir,'c'+i+'.png');
      await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="#fafafa"/>
        <rect x="${400+i*20}" y="300" width="150" height="120" fill="#222222"/></svg>`)).png().toFile(file);
      frames.push({file,time:i/8});
    }
    const crop = await contentCrop(frames);
    assert.ok(crop,'cropped');
    assert.ok(crop.x > 0.3 && crop.x < 0.4 && crop.x + crop.width > 0.65 && crop.x + crop.width < 0.75,JSON.stringify(crop));
    assert.ok(crop.y > 0.3 && crop.y < 0.38 && crop.y + crop.height > 0.52 && crop.y + crop.height < 0.6,JSON.stringify(crop));
    const bleed = [];
    for (let i = 0; i < 3; i++) {
      const file = path.join(dir,'b'+i+'.png');
      await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="500" height="800" fill="#123456"/><rect x="500" width="500" height="800" fill="#fafafa"/></svg>`)).png().toFile(file);
      bleed.push({file,time:i/8});
    }
    assert.equal(await contentCrop(bleed),null,'borders that are not one plain colour');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('replies carry the background and content palette and say when dense sheets are cropped', async () => {
  const read = store({dense:2,extra:{palette_background:{hex:'#f8f7f6',share:0.99},palette_content:[{hex:'#111111',share:0.6},{hex:'#e5232f',share:0.4}]},
    motion:{crop:{x:0.3,y:0.3,width:0.4,height:0.3}}});
  const engine = {byId:new Map([[row.id,row]]),details:({id,detail}) => ({snapshot:{},id,title:row.title,creator:row.creator,preview:{video_url:row.media[0].url},detail})};
  const reply = await workReply(engine,[row.id],{preview:'image',detail:'study'},{loadVisuals:(selected,options) => preparedVisuals(selected,read,options)});
  const data = JSON.parse(reply.content[0].text);
  assert.deepEqual(data.preview.palette.background,{hex:'#f8f7f6',share:0.99});
  assert.equal(data.preview.palette.content[1].hex,'#e5232f');
  assert.equal(data.preview.palette.colors,undefined);
  assert.match(data.preview.palette.note,/share of the non-background area/);
  assert.deepEqual(data.preview.study.dense_sheets.cropped_to,{x:0.3,y:0.3,width:0.4,height:0.3});
  assert.match(data.preview.study.note,/cropped to the part of the frame/);
});
