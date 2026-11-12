import fs from 'node:fs';
import {sourceUrl,feedHeaders} from './sync.mjs';

export function connection(args=process.argv,env=process.env) {
  const at=args.indexOf('--connection');
  const config=at<0?{url:env.INSPORA_CATALOG_URL,token:env.INSPORA_CATALOG_TOKEN}:JSON.parse(fs.readFileSync(args[at+1],'utf8'));
  if(Object.keys(config).some(key=>!['url','token'].includes(key)))throw Error('Unexpected catalog connection setting');
  if(!config.url)return null;
  feedHeaders(config.token);
  return {url:sourceUrl(config.url),token:config.token};
}
