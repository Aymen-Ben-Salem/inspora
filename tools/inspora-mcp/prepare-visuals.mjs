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
  const {width,height} = await sharp(rendered).metadata();
  let bytes;
  for (const quality of [86,76,65,53,42]) {
    bytes = await sharp(rendered).jpeg({quality,mozjpeg:true}).toBuffer();
    if (bytes.length <= limit) break;
  }
  if (bytes.length > limit) throw Error(role + ' exceeds the image budget at its prepared dimensions');
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

async function sheet(frames,columns) {
  const rows = Math.ceil(frames.length/columns);
  const width = Math.floor(VISUAL_MAX_EDGE/columns);
  const height = Math.min(width+21,Math.floor(VISUAL_MAX_EDGE/rows));
  const labels = 22;
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

  // Prefer a visually informative frame among the interior samples. Excluding
  // the endpoints avoids many title cards and fade-ins, and preserves chronology below.
  let best=frames[1], bestEntropy=-1;
  for (const frame of frames.length>2?frames.slice(1,-1):frames) {
    const {entropy} = await sharp(frame.file).resize({width:256}).stats();
    if (entropy>bestEntropy) {best=frame;bestEntropy=entropy;}
  }
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
