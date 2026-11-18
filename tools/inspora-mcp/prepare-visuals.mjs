import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {eligible} from './catalog.mjs';
import {mediaFingerprint} from './enrichment.mjs';
import {
  publicMediaUrl, visualAssetKey, visualManifest, visualManifestKey, visualSha, VISUAL_MAX_EDGE,
} from './visuals.mjs';

const run = promisify(execFile);
const sourceBytes = 128_000_000;
const sourcePixels = 12_000_000;
const frameCount = 30;
const background = '#191a1f';
sharp.concurrency(2);

async function ffmpeg(args) {
  await run('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin',...args], {
    timeout:90_000, maxBuffer:256_000, windowsHide:true,
  });
}

async function writeAsset(directory,row,role,rendered,limit,timecodes) {
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
  const target = path.join(directory,visualAssetKey(row,item));
  await fs.writeFile(target,bytes);
  return item;
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

async function motionAssets(row,file,directory,temp) {
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

  // The sheets below keep every sample in chronological order; only the still is chosen.
  const best = await chooseStill(frames,{hero:row.kind==='website'});
  const assets = [
    await writeAsset(directory,row,'still',await assetStill(row,best.file),220_000,[best.time]),
    await writeAsset(directory,row,'overview',await sheet(frames,6),140_000,frames.map(frame=>frame.time)),
  ];
  for (let offset=0;offset<frames.length;offset+=12) {
    const page = frames.slice(offset,offset+12);
    assets.push(await writeAsset(directory,row,'detail-'+(offset/12+1),await sheet(page,3),180_000,page.map(frame=>frame.time)));
  }
  return {assets,duration:Number(duration.toFixed(3))};
}

async function prepare(row,input,directory) {
  const extension = path.extname(input.file).toLowerCase();
  const isVideo = ['.mp4','.mov','.webm'].includes(extension);
  const medium = row.media?.find(media => publicMediaUrl(input.source) &&
    (media.url === input.source || media.poster === input.source));
  if (!medium || medium.type === 'favicon' ||
      (isVideo && !(medium.url===input.source && ['recording','video'].includes(medium.type))) ||
      (!isVideo && !['.png','.jpg','.jpeg','.webp'].includes(extension))) {
    throw Error('Input must represent a current first-party still or recording in the eligible work');
  }
  const stat = await fs.stat(input.file);
  if (!stat.isFile() || stat.size>sourceBytes) throw Error('Media exceeds the local input limit');
  const target = path.join(directory,visualManifestKey(row));
  await fs.mkdir(path.dirname(target),{recursive:true});
  const built = isVideo ? await withFrames(directory,temp=>motionAssets(row,input.file,directory,temp)) :
    {assets:[await writeAsset(directory,row,'still',await assetStill(row,input.file),220_000)]};
  const manifest = visualManifest.parse({version:1,workId:row.id,mediaFingerprint:mediaFingerprint(row),...built});
  // Publish the manifest after its content-addressed files are complete.
  const draft=target+'.'+process.pid+'.tmp';
  await fs.writeFile(draft,JSON.stringify(manifest));
  await fs.rename(draft,target);
  return manifest;
}

async function withFrames(directory,work) {
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
