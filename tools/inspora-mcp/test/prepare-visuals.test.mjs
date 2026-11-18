import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {chooseStill,sheet} from '../prepare-visuals.mjs';

// A synthetic interface: panels, text-like bars and a card grid.
const layout = (width,height,shift=0) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#f4f1ea"/><rect x="0" y="0" width="${width}" height="36" fill="#1d1d1f"/>
  ${Array.from({length:12},(_,i)=>`<rect x="${24+shift}" y="${60+i*26}" width="${120+(i*37)%140}" height="8" fill="#333"/>`).join('')}
  ${Array.from({length:6},(_,i)=>`<rect x="${330+(i%3)*95-shift}" y="${70+Math.floor(i/3)*150}" width="80" height="120" rx="8" fill="${['#e4572e','#29335c','#f3a712'][i%3]}"/>`).join('')}
</svg>`);

async function frames(directory,width,height) {
  const sharpFrame = await sharp(layout(width,height)).png().toBuffer();
  const other = await sharp(layout(width,height,90)).png().toBuffer();
  const sequence = [
    await sharp({create:{width,height,channels:3,background:'#f4f1ea'}}).png().toBuffer(), // intro card
    await sharp(sharpFrame).blur(6).png().toBuffer(), // motion-blurred entrance
    await sharp(other).composite([{input:await sharp(sharpFrame).removeAlpha().ensureAlpha(0.5).png().toBuffer()}]).png().toBuffer(), // cross-fade
    ...Array(6).fill(sharpFrame), // the settled, representative state
    await sharp({create:{width,height,channels:3,background:'#f4f1ea'}}).composite([{input:Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${width/2-40}" y="${height/2-10}" width="80" height="20" fill="#333"/></svg>`)}]).png().toBuffer(), // near-empty state
    sharpFrame, sharpFrame,
  ];
  const result = [];
  for (const [i,bytes] of sequence.entries()) {
    const file = path.join(directory,`frame-${String(i).padStart(3,'0')}.png`);
    await fs.writeFile(file,bytes);
    result.push({file,time:i*0.5});
  }
  return result;
}

test('the still is the first sharp, settled frame rather than a blurred, cross-faded or near-empty one', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'inspora-still-'));
  try {
    const sample = await frames(directory,640,400);
    assert.equal((await chooseStill(sample)).time,1.5);
    assert.equal((await chooseStill(sample)).time,1.5, 'selection is deterministic');
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

// A tall page: a sparse hero over dense card sections, viewed through a 640x400 window.
const page = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="2400">
  <rect width="100%" height="100%" fill="#f4f1ea"/><rect width="640" height="36" fill="#1d1d1f"/>
  <rect x="48" y="120" width="380" height="44" fill="#1d1d1f"/><rect x="48" y="180" width="300" height="44" fill="#1d1d1f"/>
  <rect x="48" y="260" width="140" height="36" rx="18" fill="#e4572e"/>
  ${Array.from({length:120},(_,i)=>`<rect x="${24+(i%6)*102}" y="${440+Math.floor(i/6)*96}" width="90" height="84" rx="6" fill="${['#29335c','#e4572e','#f3a712','#333'][i%4]}"/><rect x="${32+(i%6)*102}" y="${452+Math.floor(i/6)*96}" width="60" height="6" fill="#fff"/>`).join('')}
</svg>`);

async function recording(directory,offsets) {
  const tall = await sharp(page).png().toBuffer();
  const result = [];
  for (const [i,top] of offsets.entries()) {
    const file = path.join(directory,`frame-${String(i).padStart(3,'0')}.png`);
    await (top<0 ? sharp({create:{width:640,height:400,channels:3,background:'#f4f1ea'}}) :
      sharp(tall).extract({left:0,top,width:640,height:400})).png().toFile(file);
    result.push({file,time:i*0.5});
  }
  return result;
}

test('website stills come from the opening hero, before the page scrolls', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'inspora-hero-'));
  try {
    // A blank loader, the settled hero, then a steady scroll through the dense sections.
    const scroll = await recording(directory,[-1,0,0,0,0,140,280,420,560,700,840,980,1120,1260,1400,1540,1680,1820,1960,2000]);
    assert.equal((await chooseStill(scroll,{hero:true})).time,0.5);
    assert.ok((await chooseStill(scroll)).time>=2.5,'the generic score alone prefers a dense section');
    // When the opening window has nothing acceptable, the whole clip is used.
    const blank = await recording(await fs.mkdtemp(path.join(directory,'blank-')),[-1,-1,-1,-1,-1,-1,420,420,420,420]);
    assert.equal((await chooseStill(blank,{hero:true})).time,3);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

test('sheet tiles follow the frame aspect ratio', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'inspora-sheet-'));
  try {
    const wide = await frames(directory,640,400);
    const overview = await sharp(await sheet([...wide,...wide,...wide.slice(0,6)],6)).metadata();
    assert.equal(overview.width,1566);
    assert.ok(overview.height<1000,'30 landscape samples fit in five short rows: '+overview.height);
    const tall = await frames(await fs.mkdtemp(path.join(directory,'tall-')),400,640);
    const detail = await sharp(await sheet(tall,3)).metadata();
    assert.ok(detail.height<=1568 && detail.width<1200,'portrait tiles narrow instead of padding: '+detail.width);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

test('buildVisualPack is deterministic, keyed like the MCP reads it, and rejects media it can never prepare', async () => {
  const {buildVisualPack, VisualPackRejected} = await import('../prepare-visuals.mjs');
  const {visualManifest, visualManifestKey, visualAssetKey, visualSha} = await import('../visuals.mjs');
  const {execFile} = await import('node:child_process');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'inspora-pack-'));
  try {
    const image = path.join(directory,'source.png');
    await sharp(layout(800,500)).png().toFile(image);
    const row = {id:'00000000-0000-4000-8000-000000000101',kind:'design',media:[{type:'image',url:'https://media.inspora.design/posts/a.png',width:800,height:500}]};
    const first = await buildVisualPack(row,{file:image,source:row.media[0].url},path.join(directory,'one'));
    const second = await buildVisualPack(row,{file:image,source:row.media[0].url},path.join(directory,'two'));
    assert.equal(first.key,visualManifestKey(row));
    visualManifest.parse(first.manifest);
    assert.deepEqual(first.manifest,second.manifest);
    for (const asset of first.assets) {assert.equal(asset.key,visualAssetKey(row,asset.item)); assert.equal(visualSha(asset.bytes),asset.item.sha256);}
    await assert.rejects(buildVisualPack(row,{file:image,source:'https://example.com/a.png'},directory),VisualPackRejected);

    // A short generated clip exercises the motion path: still, overview and detail sheets.
    const clip = path.join(directory,'clip.mp4');
    await new Promise((resolve,reject)=>execFile('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=640x360:rate=24:duration=3','-pix_fmt','yuv420p',clip],error=>error?reject(error):resolve()));
    const video = {id:'00000000-0000-4000-8000-000000000102',kind:'design',media:[{type:'video',url:'https://media.inspora.design/posts/b.mp4',poster:'https://media.inspora.design/posts/b.webp',width:640,height:360}]};
    const motion = await buildVisualPack(video,{file:clip,source:video.media[0].url},path.join(directory,'three'));
    assert.deepEqual(motion.manifest.assets.map(item=>item.role),['still','overview','detail-1','detail-2','detail-3']);
    assert.equal(motion.manifest.duration,3);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});
