import {z} from 'zod';
import {enrichmentSchema} from './enrichment.mjs';

const date=z.string().refine(value=>Number.isFinite(Date.parse(value)));
const labels=z.array(z.string().max(100)).max(50);
const media=z.object({type:z.enum(['image','video','recording','favicon']),url:z.string().max(2000),poster:z.string().max(2000).nullable().optional(),alt:z.string().max(2000).nullable().optional(),width:z.number().nullable().optional(),height:z.number().nullable().optional(),preview:z.unknown().optional()}).strict();
const row=z.object({id:z.string().uuid(),kind:z.enum(['design','website','logo','icon']),slug:z.string().min(1).max(200),title:z.string().max(500),description:z.string().max(10000).nullable(),tagline:z.string().max(2000).nullable().optional(),creator_name:z.string().max(500),creator_username:z.string().max(200).nullable().optional(),category:z.string().max(100),industries:labels,styles:labels,colors:labels,categories:labels,themes:labels,technologies:labels,industry:z.string().max(1000),shape:z.string().max(200),source_url:z.string().max(2000).nullable(),status:z.string().max(30),published_at:date.nullable(),updated_at:date,creator_updated_at:date,creator_visible:z.boolean(),media:z.array(media).max(50).nullable()}).strict();
export const feedSchema=z.object({version:z.literal(1),catalog:z.object({capturedAt:date,rows:z.array(row).max(10000)}).strict(),enrichment:enrichmentSchema}).strict();
