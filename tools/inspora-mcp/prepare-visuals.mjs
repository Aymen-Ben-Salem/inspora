import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {mediaFingerprint} from './enrichment.mjs';
import {
  publicMediaUrl, visualAssetKey, visualManifest, visualManifestKey, visualSha, VISUAL_MAX_EDGE,
  DENSE_SHEETS_MAX, DENSE_FRAMES_PER_SHEET,
} from './visuals.mjs';

const run = promisify(execFile);
const sourceBytes = 128_000_000;
const sourcePixels = 12_000_000;
const frameCount = 30;
const background = '#191a1f';
sharp.concurrency(2);

// The hosted container runs on a fraction of a vCPU, so it allows a longer decode; output is unaffected.
const ffmpegTimeout = Number(process.env.VISUAL_FFMPEG_TIMEOUT_MS) || 90_000;
async function ffmpeg(args) {
  await run('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin',...args], {
    timeout:ffmpegTimeout, maxBuffer:256_000, windowsHide:true,
  });
}

async function renderAsset(row,role,rendered,limit,timecodes) {
  // Lower JPEG quality first; dense sheets (grain, noise, fine gradients) may also need smaller dimensions.
  const {width:full} = await sharp(rendered).metadata();
  let bytes;
  fit: for (const scale of [1,0.85,0.7]) {
    for (const quality of [86,76,65,53,42]) {
      bytes = await sharp(rendered).resize({width:Math.round(full*scale)}).jpeg({quality,mozjpeg:true}).toBuffer();
      if (bytes.length <= limit) break fit;
    }
  }
  if (bytes.length > limit) throw Error(role + ' exceeds the image budget even at reduced dimensions');
  const {width,height} = await sharp(bytes).metadata();
  const item = {role,width,height,bytes:bytes.length,sha256:visualSha(bytes),...(timecodes?{timecodes}:{})};
  return {item,bytes,key:visualAssetKey(row,item)};
}

async function assetStill(row,file) {
  const identity = ['logo','icon'].includes(row.kind);
  const canvas = identity ? 1024 : VISUAL_MAX_EDGE;
  const still = sharp(file,{limitInputPixels:sourcePixels}).autoOrient()
    .flatten({background}).resize({width:canvas,height:canvas,fit:'inside',withoutEnlargement:true});
  const {data,info} = await still.png().toBuffer({resolveWithObject:true});
  if (!identity) return data;
  return sharp({create:{width:canvas,height:canvas,channels:3,background}}).composite([{
    input:data,left:Math.floor((canvas-info.width)/2),top:Math.floor((canvas-info.height)/2),
  }]).png().toBuffer();
}

// Measure a frame on a small greyscale copy: grey-level entropy (information),
// Laplacian variance (sharpness), the share of an 8x8 grid with edges (coverage,
// low for near-empty states) and contrast (near-uniform frames).
async function frameFeatures(file) {
  const {data,info} = await sharp(file).removeAlpha().greyscale()
    .resize({width:256,height:256,fit:'inside'}).raw().toBuffer({resolveWithObject:true});
  const {width,height} = info, n = data.length, histogram = new Float64Array(256);
  let sum=0, squares=0;
  for (const value of data) {histogram[value]++; sum+=value; squares+=value*value;}
  let entropy=0;
  for (const count of histogram) if (count) entropy -= count/n*Math.log2(count/n);
  const grid=8, cells=new Float64Array(grid*grid), cellPixels=new Float64Array(grid*grid);
  let lsum=0, lsquares=0, m=0;
  for (let y=1;y<height-1;y++) for (let x=1;x<width-1;x++) {
    const i=y*width+x, l=4*data[i]-data[i-1]-data[i+1]-data[i-width]-data[i+width];
    lsum+=l; lsquares+=l*l; m++;
    const cell=Math.floor(y*grid/height)*grid+Math.floor(x*grid/width);
    cells[cell]+=Math.abs(l); cellPixels[cell]++;
  }
  const mean=sum/n;
  return {
    grey:data, width, height,
    entropy:entropy/8,
    sharpness:m ? lsquares/m-(lsum/m)**2 : 0,
    coverage:cells.filter((total,i)=>cellPixels[i] && total/cellPixels[i]>=3).length/(grid*grid),
    contrast:Math.sqrt(Math.max(0,squares/n-mean*mean)),
  };
}

const difference = (a,b) => {let total=0; for (let i=0;i<a.length;i++) total+=Math.abs(a[i]-b[i]); return total/a.length;};
const median = values => {const sorted=[...values].sort((a,b)=>a-b); return sorted.length ? sorted[sorted.length>>1] : 0;};

// Vertical page shift between two greyscale frames, as a fraction of the frame height: the offset at which
// the later frame best matches the earlier one moved up (positive = scrolled down). It
// counts only when it explains the change far better than no shift, so animation in
// place reads as 0. Shifts keep at least half the frame overlapping (smaller overlaps
// match blank margins spuriously); every 2nd row and 4th column keeps the search cheap.
function verticalShift(a,b) {
  const {width,height} = a;
  const diff = dy => {
    let total=0, n=0;
    for (let y=Math.max(0,-dy);y<Math.min(height,height-dy);y+=2) for (let x=0;x<width;x+=4) {
      total+=Math.abs(a.grey[(y+dy)*width+x]-b.grey[y*width+x]); n++;
    }
    return total/n;
  };
  const still = diff(0);
  let best=0, bestDiff=still;
  for (let dy=2;dy<=Math.floor(height/2);dy++) for (const shift of [dy,-dy]) {
    const d = diff(shift);
    if (d<bestDiff) {best=shift; bestDiff=d;}
  }
  return still>2 && bestDiff<0.5*still ? best/height : 0;
}

/**
 * Score every frame for still selection. The score rewards information, sharpness
 * relative to the clip's sharpest frame, edge coverage and typicality (resemblance to
 * the rest of the clip, low for end cards, footers and loading states); it penalises
 * frames that differ from both neighbours far more than the clip's usual frame-to-frame
 * change (mid-transition), near-uniform frames and, progressively, the second half,
 * where footers, end cards and loop-backs usually sit. With {scroll:true} it also
 * returns the vertical page shift between consecutive frames.
 */
export async function stillScores(frames,{scroll=false}={}) {
  const measured = [];
  for (const frame of frames) measured.push(await frameFeatures(frame.file));
  const comparable = measured.every(item => item.grey.length===measured[0].grey.length);
  const steps = comparable ? measured.slice(1).map((item,i)=>difference(measured[i].grey,item.grey)) : [];
  const usualStep = median(steps);
  const maxSharpness = Math.max(...measured.map(item=>item.sharpness),1e-9);
  const distance = measured.map((item,i)=>comparable && frames.length>1 ?
    measured.reduce((total,other,j)=>i===j ? total : total+difference(item.grey,other.grey),0)/(frames.length-1) : 0);
  const [near,far] = [Math.min(...distance),Math.max(...distance)];
  const scores = measured.map((item,i)=>{
    const change = i>0 && i<steps.length ? Math.min(steps[i-1],steps[i]) : 0;
    const parts = {
      entropy:item.entropy,
      sharpness:Math.sqrt(item.sharpness/maxSharpness),
      coverage:item.coverage,
      typicality:far>near ? (far-distance[i])/(far-near) : 1,
      transition:Math.min(1,Math.max(0,change-usualStep)/(usualStep+4)),
      uniform:item.contrast<8 ? 1 : 0,
      late:frames.length>1 ? Math.max(0,i/(frames.length-1)-0.5)*2 : 0,
    };
    const score = 0.2*parts.entropy + 0.3*parts.sharpness + 0.3*parts.coverage + 0.2*parts.typicality -
      0.5*parts.transition - parts.uniform - 0.3*parts.late;
    return {score,...parts};
  });
  const shifts = scroll && comparable ? measured.slice(1).map((item,i)=>verticalShift(measured[i],item)) : [];
  return {scores,shifts};
}

/**
 * Choose the representative still from chronological frames. Endpoints are skipped when
 * possible. With {hero:true} (website scroll recordings) candidates are limited to the
 * opening hero: the first run of acceptable frames, so leading loaders are skipped and
 * the run stops at the first real scroll (a downward shift of at least an eighth of the
 * viewport, or two consecutive downward shifts), at the first unacceptable frame (which
 * also ends scroll-jacked heroes that fade or wipe into the next section without moving)
 * and after a quarter of the clip. Acceptable means not near-uniform, some edge coverage,
 * not mid-transition and at least half the clip's best score (rejects branded loaders).
 * The first frame is eligible, since a recording starts on the hero. Without an acceptable
 * frame the whole clip is used. Ties keep the earliest frame.
 */
export async function chooseStill(frames,{hero=false}={}) {
  const {scores,shifts} = await stillScores(frames,{scroll:hero});
  const indexes = frames.map((_,i)=>i);
  const interior = indexes.filter(i=>frames.length<=2 || (i>0 && i<frames.length-1));
  const best = list => list.reduce((pick,i)=>pick===undefined || scores[i].score>scores[pick].score+1e-9 ? i : pick,undefined);
  let pick;
  if (hero) {
    const top = Math.max(...interior.map(i=>scores[i].score));
    const acceptable = i => !scores[i].uniform && scores[i].coverage>=0.15 && scores[i].transition<0.5 && scores[i].score>=0.5*top;
    const start = indexes.find(acceptable);
    if (start!==undefined) {
      let end = Math.min(frames.length-1,start+Math.floor((frames.length-1)/4));
      for (let i=start;i<end;i++) {
        if (shifts[i]>=0.125 || shifts[i]>0 && shifts[i+1]>0 || !acceptable(i+1)) {end=i; break;}
      }
      pick = best(indexes.slice(start,end+1));
    }
  }
  pick ??= best(interior);
  return frames[pick];
}

// Size tiles from the frames' aspect ratio, so 16:10 recordings are not letterboxed into near-square cells.
export async function sheet(frames,columns) {
  const rows = Math.ceil(frames.length/columns);
  const labels = 22;
  const {width:frameWidth,height:frameHeight} = await sharp(frames[0].file).metadata();
  let width = Math.floor(VISUAL_MAX_EDGE/columns);
  let height = Math.min(Math.round((width-4)*frameHeight/frameWidth)+labels+4,Math.floor(VISUAL_MAX_EDGE/rows));
  // Height-bound (portrait) tiles narrow to the picture instead of padding it sideways.
  width = Math.min(width,Math.max(120,Math.ceil((height-labels-4)*frameWidth/frameHeight)+4));
  const tiles = [];
  for (const [i,frame] of frames.entries()) {
    const thumbnail = await sharp(frame.file).resize({
      width:width-4,height:height-labels-4,fit:'contain',background,withoutEnlargement:true,
    }).png().toBuffer();
    const left = (i%columns)*width;
    const top = Math.floor(i/columns)*height;
    const timestamp = frame.time.toFixed(2) + ' s';
    const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${labels}"><text x="8" y="17" fill="white" font-size="15" font-family="sans-serif">${timestamp}</text></svg>`);
    tiles.push({input:thumbnail,left:left+2,top:top+2},{input:caption,left,top:top+height-labels});
  }
  return sharp({create:{width:width*columns,height:height*rows,channels:3,background}}).composite(tiles).png().toBuffer();
}

// Dense motion sheets: decode up to 8 frames per second, collapse static holds, then page
// the kept frames 16 to a sheet. A sheet stays within about 1.15 megapixels, the size a
// Claude client keeps without downscaling, so each tile is shown at its prepared size.
export const DENSE_FPS = 8;
const DENSE_DECODE_MAX = 240;
const DENSE_EDGE = 720;
const SHEET_PIXELS = 1_150_000;
// A frame repeats the last kept one when no 8x8 cell of a 128x128 grey copy changes by more
// than this mean grey level (0-255). The largest cell change, not the frame mean, so a moving
// cursor or a small badge counts; encoder noise on a held frame stays around 1-2.
export const HOLD_THRESHOLD = 5;
const CELL = 8, GRID = 128/CELL;
export function cellChange(a, b) {
  let most = 0;
  for (let cy = 0; cy < GRID; cy++) for (let cx = 0; cx < GRID; cx++) {
    let total = 0;
    for (let y = cy*CELL; y < (cy+1)*CELL; y++) for (let x = cx*CELL; x < (cx+1)*CELL; x++) total += Math.abs(a[y*128+x]-b[y*128+x]);
    if (total > most) most = total;
  }
  return most/(CELL*CELL);
}

async function greyThumb(file) {
  const {data} = await sharp(file).removeAlpha().greyscale()
    .resize({width:128,height:128,fit:'fill'}).raw().toBuffer({resolveWithObject:true});
  return data;
}

/**
 * Keep frames that change from the last kept frame, so a hold collapses to its first frame.
 * The frame just before a change is also kept (the end of the hold, where motion starts),
 * as is the last frame. Returns the kept frames in order.
 */
export async function collapseHolds(frames, threshold = HOLD_THRESHOLD) {
  if (frames.length <= 2) return frames;
  const grey = [];
  for (const frame of frames) grey.push(await greyThumb(frame.file));
  const keep = new Set([0]);
  let last = 0;
  for (let i = 1; i < frames.length; i++) {
    if (cellChange(grey[last],grey[i]) <= threshold) continue;
    if (i - 1 > last) keep.add(i - 1);
    keep.add(i);
    last = i;
  }
  keep.add(frames.length - 1);
  return [...keep].sort((a,b) => a - b).map(i => frames[i]);
}

/** Thin an over-long kept sequence evenly in time, keeping both ends, so the timeline is never truncated. */
export function thinFrames(frames, limit) {
  if (frames.length <= limit) return frames;
  const step = (frames.length - 1) / (limit - 1);
  return Array.from({length:limit},(_,i) => frames[Math.round(i*step)]);
}

/** Columns for a sheet of n tiles of the given aspect: the layout with the largest tiles within the edge and pixel limits. */
export function denseLayout(n, aspect, labels = 22) {
  let best;
  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n/columns);
    // Largest tile picture (w x h, h = w/aspect) such that the sheet fits every limit.
    let w = Math.min(VISUAL_MAX_EDGE/columns - 4, (VISUAL_MAX_EDGE/rows - labels - 4)*aspect);
    const pixels = (w + 4)*columns*((w/aspect) + labels + 4)*rows;
    if (pixels > SHEET_PIXELS) w *= Math.sqrt(SHEET_PIXELS/pixels) * 0.98;
    w = Math.floor(w);
    if (!best || w > best.w) best = {columns, rows, w, h:Math.floor(w/aspect)};
  }
  return best;
}

export async function denseSheet(frames, labels = 22) {
  const {width:frameWidth,height:frameHeight} = await sharp(frames[0].file).metadata();
  const {columns,rows,w,h} = denseLayout(DENSE_FRAMES_PER_SHEET, frameWidth/frameHeight, labels);
  const tileW = w + 4, tileH = h + labels + 4;
  const tiles = [];
  for (const [i,frame] of frames.entries()) {
    const picture = await sharp(frame.file).resize({width:w,height:h,fit:'contain',background}).png().toBuffer();
    const left = (i%columns)*tileW, top = Math.floor(i/columns)*tileH;
    const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${labels}"><text x="6" y="17" fill="white" font-size="15" font-family="sans-serif">${frame.time.toFixed(2)} s</text></svg>`);
    tiles.push({input:picture,left:left+2,top:top+2},{input:caption,left,top:top+h+4});
  }
  // Only the rows in use, so a short last sheet is not padded with empty rows.
  const used = Math.ceil(frames.length/columns);
  return sharp({create:{width:tileW*Math.min(columns,frames.length),height:tileH*Math.min(rows,used),channels:3,background}}).composite(tiles).png().toBuffer();
}

// A website recording is a page scroll: its sections, not micro-timing, so fewer sheets suffice.
const denseLimit = row => (row.kind === 'website' ? 6 : DENSE_SHEETS_MAX)*DENSE_FRAMES_PER_SHEET;
// A clip that plays one cycle several times (an idle shimmer, a looping loader) is reported
// with its period, and its dense sheets cover one cycle. The period is the first lag of at least
// one second, seen at least twice, where frames match their counterpart one lag later as
// closely as consecutive frames match each other (0.75x the usual step) and far more closely
// than at other lags (0.3x the mean). Nearly static clips are left to collapseHolds.
export async function loopFrames(frames, fps) {
  const min = Math.ceil(fps);
  if (frames.length < 2*min + 1) return null;
  const grey = [];
  for (const frame of frames) grey.push(await sharp(frame.file).greyscale().resize({width:64,height:64,fit:'inside'}).raw().toBuffer());
  if (grey.some(item => item.length !== grey[0].length)) return null;
  const diff = (a,b) => {let total=0; for (let i=0;i<a.length;i++) total+=Math.abs(a[i]-b[i]); return total/a.length;};
  const step = grey.slice(1).reduce((sum,item,i) => sum + diff(grey[i],item),0)/(grey.length-1);
  if (step < 0.1) return null;
  const lags = [];
  for (let lag = min; lag <= Math.floor(grey.length/2); lag++) {
    let total = 0;
    for (let i = 0; i + lag < grey.length; i++) total += diff(grey[i],grey[i+lag]);
    lags.push(total/(grey.length-lag));
  }
  if (lags.length < 2) return null;
  const mean = lags.reduce((a,b) => a + b,0)/lags.length;
  // A true repeat matches nearly pixel for pixel: under 0.2% of pixels may change by more than
  // 20 grey levels, so a cycle that differs in small details (another selected option) is no loop.
  const repeats = lag => {let changed=0, total=0; for (let i = 0; i + lag < grey.length; i++) for (let p = 0; p < grey[i].length; p++) {if (Math.abs(grey[i][p]-grey[i+lag][p]) > 20) changed++; total++;} return changed/total < 0.002;};
  const k = lags.findIndex((d,i) => d <= 0.75*step && d <= 0.3*mean && (i === 0 || d <= lags[i-1]) && (i === lags.length-1 || d <= lags[i+1]) && repeats(i + min));
  return k < 0 ? null : k + min;
}

async function denseFrames(file, duration, temp, limit) {
  const fps = Number(Math.min(DENSE_FPS, DENSE_DECODE_MAX/duration).toFixed(3));
  const directory = path.join(temp,'dense');
  await fs.mkdir(directory);
  await ffmpeg(['-protocol_whitelist','file,pipe','-i',file,'-map','0:v:0','-an',
    '-vf',`fps=${fps}:start_time=0,scale=w=${DENSE_EDGE}:h=${DENSE_EDGE}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-frames:v',String(DENSE_DECODE_MAX),'-q:v','3','-threads','2',path.join(directory,'d-%04d.jpg')]);
  const decoded = (await fs.readdir(directory)).filter(name => /^d-\d{4}\.jpg$/.test(name)).sort().map((name,i) => ({
    file:path.join(directory,name), time:Number((i/fps).toFixed(3)),
  }));
  const loop = await loopFrames(decoded, fps);
  const kept = thinFrames(await collapseHolds(loop ? decoded.slice(0, loop + 1) : decoded), limit);
  return {fps, decoded:decoded.length, kept, ...(loop ? {loopSeconds:Number((loop/fps).toFixed(2))} : {})};
}

// Dominant colours: pixels of 96 px copies (transparent ones excluded; for motion, evenly
// spaced frames) are binned at 4 bits per channel. Seeds are chosen greedily by pixel count
// times distance from earlier seeds (so a small but distinct accent gets its own seed), refined
// by weighted k-means in CIELAB, and clusters within a just-noticeable difference are merged.
// Deterministic for the same input.
const srgbLinear = c => {c /= 255; return c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4;};
const labF = t => t > 216/24389 ? Math.cbrt(t) : (24389/27*t + 16)/116;
function lab([r,g,b]) {
  const [R,G,B] = [r,g,b].map(srgbLinear);
  const x = (0.4124*R + 0.3576*G + 0.1805*B)/0.95047, y = 0.2126*R + 0.7152*G + 0.0722*B, z = (0.0193*R + 0.1192*G + 0.9505*B)/1.08883;
  const [fx,fy,fz] = [x,y,z].map(labF);
  return [116*fy - 16, 500*(fx - fy), 200*(fy - fz)];
}
const distance2 = (a,b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
const hex = rgb => '#' + rgb.map(v => Math.round(Math.min(255,Math.max(0,v))).toString(16).padStart(2,'0')).join('');
// A strongly coloured accent (CIELAB chroma 30+) is kept from a 0.3% share: a red badge or an
// orange button is small but defines the scheme.
const PALETTE_SEEDS = 12, PALETTE_MIN_SHARE = 0.015, PALETTE_ACCENT_SHARE = 0.003, PALETTE_ACCENT_CHROMA = 30, PALETTE_MERGE = 15**2;
const chroma = rgb => {const [,a,b] = lab(rgb); return Math.hypot(a,b);};

export async function samplePalette(inputs) {
  const bins = new Map();
  let total = 0;
  for (const input of [inputs].flat()) {
    const {data,info} = await sharp(input,{limitInputPixels:sourcePixels}).autoOrient().ensureAlpha()
      .resize({width:96,height:96,fit:'inside'}).raw().toBuffer({resolveWithObject:true});
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i+3] < 128) continue;
      const key = (data[i]>>4)<<8 | (data[i+1]>>4)<<4 | data[i+2]>>4;
      const bin = bins.get(key) ?? {key,count:0,sum:[0,0,0]};
      bin.count++; bin.sum[0] += data[i]; bin.sum[1] += data[i+1]; bin.sum[2] += data[i+2];
      bins.set(key,bin); total++;
    }
  }
  if (total < 16) return undefined;
  const points = [...bins.values()].sort((a,b) => a.key - b.key).map(bin => {
    const rgb = bin.sum.map(v => v/bin.count);
    return {rgb,lab:lab(rgb),count:bin.count};
  });
  const seeds = [points.reduce((best,p) => p.count > best.count ? p : best).lab];
  while (seeds.length < Math.min(PALETTE_SEEDS,points.length)) {
    let pick = null, score = 0;
    for (const p of points) {
      const value = p.count*Math.min(40**2,Math.min(...seeds.map(seed => distance2(p.lab,seed))));
      if (value > score) {score = value; pick = p;}
    }
    if (!pick) break;
    seeds.push(pick.lab);
  }
  let centres = seeds, assignment = [];
  for (let pass = 0; pass < 8; pass++) {
    assignment = points.map(p => centres.reduce((best,c,i) => distance2(p.lab,c) < distance2(p.lab,centres[best]) ? i : best,0));
    centres = centres.map((c,i) => {
      let weight = 0; const sum = [0,0,0];
      points.forEach((p,j) => {if (assignment[j] === i) {weight += p.count; for (let k = 0; k < 3; k++) sum[k] += p.lab[k]*p.count;}});
      return weight ? sum.map(v => v/weight) : c;
    });
  }
  const clusters = centres.map((_,i) => {
    let count = 0; const sum = [0,0,0];
    points.forEach((p,j) => {if (assignment[j] === i) {count += p.count; for (let k = 0; k < 3; k++) sum[k] += p.rgb[k]*p.count;}});
    return {rgb:count ? sum.map(v => v/count) : [0,0,0], count};
  }).filter(cluster => cluster.count).sort((a,b) => b.count - a.count);
  const merged = [];
  for (const cluster of clusters) {
    const near = merged.find(other => distance2(lab(other.rgb),lab(cluster.rgb)) < PALETTE_MERGE);
    if (!near) {merged.push({...cluster}); continue;}
    const sum = near.count + cluster.count;
    near.rgb = near.rgb.map((v,c) => (v*near.count + cluster.rgb[c]*cluster.count)/sum);
    near.count = sum;
  }
  // Merging can raise a later cluster's count, so the order is settled after it.
  const main = merged.filter(cluster => cluster.count/total >= PALETTE_MIN_SHARE).sort((a,b) => b.count - a.count);
  // An edge blend between two main colours (anti-aliasing around a mark) is not an accent.
  const blend = rgb => {
    const c = lab(rgb), labs = main.map(cluster => lab(cluster.rgb));
    return labs.some((p,i) => labs.slice(i+1).some(q => {
      const d = [0,1,2].map(k => q[k]-p[k]), length2 = d.reduce((sum,v) => sum + v*v,0) || 1;
      const t = Math.min(1,Math.max(0,[0,1,2].reduce((sum,k) => sum + (c[k]-p[k])*d[k],0)/length2));
      return distance2(c,[0,1,2].map(k => p[k] + t*d[k])) < 10**2;
    }));
  };
  const accents = merged.filter(cluster => cluster.count/total < PALETTE_MIN_SHARE && cluster.count/total >= PALETTE_ACCENT_SHARE &&
    chroma(cluster.rgb) >= PALETTE_ACCENT_CHROMA && !blend(cluster.rgb));
  // Accents take the last places, so the top of the palette always reflects coverage.
  const colours = [...main.slice(0,6-Math.min(2,accents.length)),...accents.slice(0,2)].slice(0,6)
    .map(cluster => ({hex:hex(cluster.rgb), share:Number((cluster.count/total).toFixed(3))}));
  return colours.length ? colours : undefined;
}

async function motionAssets(row,file,temp) {
  const {stdout} = await run('ffprobe', [
    '-v','error','-protocol_whitelist','file,pipe','-select_streams','v:0',
    '-show_entries','format=duration:stream=width,height','-of','json',file,
  ],{timeout:15_000,maxBuffer:256_000,windowsHide:true});
  const metadata = JSON.parse(stdout);
  const duration = Number(metadata.format?.duration);
  const {width,height} = metadata.streams?.[0] ?? {};
  if (!(duration>0 && duration<=120 && width>0 && height>0 && width*height<=sourcePixels)) {
    throw Error('Video exceeds the preparation limits or has no video stream');
  }

  // Decode once at even intervals. Timestamp labels refer to this sampled timeline.
  const fps = frameCount/duration;
  await ffmpeg(['-protocol_whitelist','file,pipe','-i',file,'-map','0:v:0','-an',
    '-vf',`fps=${fps}:start_time=0,scale=w=1280:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-frames:v',String(frameCount),'-threads','2',path.join(temp,'frame-%03d.png')]);
  const frames = (await fs.readdir(temp)).filter(name=>/^frame-\d{3}\.png$/.test(name)).sort().map((name,i)=>({
    file:path.join(temp,name),time:Number((i/fps).toFixed(3)),
  }));
  if (frames.length<2) throw Error('Too few decoded frames');

  // The overview keeps every even sample in chronological order; only the still is chosen.
  const best = await chooseStill(frames,{hero:row.kind==='website'});
  const assets = [
    await renderAsset(row,'still',await assetStill(row,best.file),220_000,[best.time]),
    await renderAsset(row,'overview',await sheet(frames,6),140_000,frames.map(frame=>frame.time)),
  ];
  const dense = await denseFrames(file,duration,temp,denseLimit(row));
  for (let offset=0;offset<dense.kept.length;offset+=DENSE_FRAMES_PER_SHEET) {
    const page = dense.kept.slice(offset,offset+DENSE_FRAMES_PER_SHEET);
    assets.push(await renderAsset(row,'dense-'+(offset/DENSE_FRAMES_PER_SHEET+1),await denseSheet(page),200_000,page.map(frame=>frame.time)));
  }
  return {assets,duration:Number(duration.toFixed(3)),palette:await samplePalette(frames.map(frame=>frame.file)),
    motion:{fps:dense.fps,decoded:dense.decoded,kept:dense.kept.length,...(dense.loopSeconds ? {loop_seconds:dense.loopSeconds} : {})}};
}

/** Thrown for media that can never be prepared (wrong type, over the limits); retrying cannot help. */
export class VisualPackRejected extends Error {}

/**
 * Build a work's visual pack from a local copy of its first-party media. Returns the
 * manifest and each content-addressed asset ({key,item,bytes}); writes nothing except
 * temporary frames inside workDir. The CLI below and the hosted container both use it,
 * so the same inputs and tool versions give byte-identical packs.
 */
export async function buildVisualPack(row,input,workDir) {
  const extension = path.extname(input.file).toLowerCase();
  const isVideo = ['.mp4','.mov','.webm'].includes(extension);
  const medium = row.media?.find(media => publicMediaUrl(input.source) &&
    (media.url === input.source || media.poster === input.source));
  if (!medium || medium.type === 'favicon' ||
      (isVideo && !(medium.url===input.source && ['recording','video'].includes(medium.type))) ||
      (!isVideo && !['.png','.jpg','.jpeg','.webp'].includes(extension))) {
    throw new VisualPackRejected('Input must represent a current first-party still or recording in the eligible work');
  }
  const stat = await fs.stat(input.file);
  if (!stat.isFile() || stat.size>sourceBytes) throw new VisualPackRejected('Media exceeds the local input limit');
  let built;
  try {
    built = isVideo ? await withFrames(workDir,temp=>motionAssets(row,input.file,temp)) :
      {assets:[await renderAsset(row,'still',await assetStill(row,input.file),220_000)],palette:await samplePalette(input.file)};
  } catch (error) {
    // Limits, missing streams and undecodable media are properties of the media itself.
    if (/exceeds|limits|no video stream|Too few decoded frames|Input file|unsupported image format|Invalid data/i.test(error.message ?? '') && !error.killed) {
      throw new VisualPackRejected(error.message);
    }
    throw error;
  }
  const manifest = visualManifest.parse({version:2,workId:row.id,mediaFingerprint:mediaFingerprint(row),
    ...(built.duration!==undefined?{duration:built.duration}:{}),...(built.palette?{palette:built.palette}:{}),
    ...(built.motion?{motion:built.motion}:{}),assets:built.assets.map(asset=>asset.item)});
  return {key:visualManifestKey(row),manifest,assets:built.assets};
}

async function prepare(row,input,directory) {
  const target = path.join(directory,visualManifestKey(row));
  await fs.mkdir(path.dirname(target),{recursive:true});
  const pack = await buildVisualPack(row,input,directory);
  for (const asset of pack.assets) await fs.writeFile(path.join(directory,asset.key),asset.bytes);
  // Publish the manifest after its content-addressed files are complete.
  const draft=target+'.'+process.pid+'.tmp';
  await fs.writeFile(draft,JSON.stringify(pack.manifest));
  await fs.rename(draft,target);
  return pack.manifest;
}

async function withFrames(directory,work) {
  await fs.mkdir(directory,{recursive:true});
  const temp = await fs.mkdtemp(path.join(directory,'frames-'));
  try {return await work(temp);}
  finally {
    if (path.dirname(temp) === directory && path.basename(temp).startsWith('frames-')) {
      await fs.rm(temp,{recursive:true,force:true});
    }
  }
}

// Run as a command; importing the module (tests) only exposes the helpers above.
if (import.meta.main) {
  const [indexFile,inputFile,out] = process.argv.slice(2);
  if (!out || process.argv.length!==5) {
    throw Error('Usage: node prepare-visuals.mjs <catalog-index.json> <local-inputs.json> <data-directory>/visuals');
  }
  const {eligible} = await import('./catalog.mjs');
  const directory = path.resolve(out);
  const index = JSON.parse(await fs.readFile(indexFile,'utf8'));
  const inputs = JSON.parse(await fs.readFile(inputFile,'utf8'));
  if (!Array.isArray(inputs) || !inputs.length || inputs.length>100 || new Set(inputs.map(input=>input.id)).size!==inputs.length) {
    throw Error('Supply 1 to 100 unique work inputs per run');
  }
  const rows = new Map(index.rows.filter(row=>eligible(row)).map(row=>[row.id,row]));
  for (const input of inputs) {
    const row = rows.get(input.id);
    if (!row) throw Error('Work is not eligible in the supplied index: '+input.id);
    const file = path.resolve(path.dirname(inputFile),input.file);
    const manifest = await prepare(row,{...input,file},directory);
    console.log(JSON.stringify({workId:row.id,title:row.title,duration:manifest.duration,
      images:manifest.assets.map(({role,width,height,bytes,timecodes})=>({role,width,height,bytes,samples:timecodes?.length}))}));
  }
}
