// Keep model, pooling and document preparation together. MiniLM vectors cannot be reused.
export const MODEL = Object.freeze({name:'@cf/baai/bge-small-en-v1.5',dimensions:384,pooling:'cls',preparation:'utf8-400-mean-v1'});
const encoder = new TextEncoder();

export function chunks(text) {
  const out=[];let part='',bytes=0;
  for(const character of String(text)) {
    const size=encoder.encode(character).length;
    if(bytes+size>400){out.push(part);part='';bytes=0;}
    part+=character;bytes+=size;
  }
  if(part)out.push(part);
  return out.length?out:[' '];
}

export function unit(vector) {
  if(!Array.isArray(vector)||vector.length!==MODEL.dimensions||vector.some(value=>!Number.isFinite(value)))throw Error('EMBEDDING_INVALID');
  const length=Math.sqrt(vector.reduce((sum,value)=>sum+value*value,0));
  if(!length)throw Error('EMBEDDING_INVALID');
  return vector.map(value=>value/length);
}

export function createEmbed(ai) {
  return async texts=>{
    const documents=texts.map(chunks),flat=documents.flat(),vectors=[];
    for(let offset=0;offset<flat.length;offset+=32) {
      const batch=flat.slice(offset,offset+32);
      const result=await ai.run(MODEL.name,{text:batch,pooling:MODEL.pooling});
      if(result.data?.length!==batch.length)throw Error('EMBEDDING_INVALID');
      vectors.push(...result.data.map(unit));
    }
    let offset=0;
    return documents.map(parts=>{
      const mean=Array(MODEL.dimensions).fill(0);
      for(const part of parts){const vector=vectors[offset++],weight=encoder.encode(part).length;for(let i=0;i<mean.length;i++)mean[i]+=vector[i]*weight;}
      return unit(mean);
    });
  };
}
