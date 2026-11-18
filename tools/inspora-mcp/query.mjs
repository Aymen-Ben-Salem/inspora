import {tokens,normalizedPhrase,designVocabulary} from './relevance.mjs';
import {englishWords} from './english-words.mjs';

// Bounded Damerau-Levenshtein distance handles adjacent transpositions too.
function distance(a,b,limit) {
  if(Math.abs(a.length-b.length)>limit)return limit+1;
  let previous=Array.from({length:b.length+1},(_,i)=>i),beforePrevious;
  for(let i=1;i<=a.length;i++){
    const current=[i];
    for(let j=1;j<=b.length;j++){
      current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])current[j]=Math.min(current[j],beforePrevious[j-2]+1);
    }
    if(Math.min(...current)>limit)return limit+1;
    beforePrevious=previous;previous=current;
  }
  return previous[b.length];
}

const quoted=/"[^"\n]*"|\u201c[^\u201d\n]*\u201d|'[^'\n]+'|`[^`\n]*`/g;
const letters=/[\p{L}\p{N}]+/gu;
const normalizedWord=word=>normalizedPhrase(word);
// Common English derivational/inflectional endings. A word whose base is a real word is real too.
const suffixes=/(?:ies|es|s|ed|ing|ers?|est|ly|ally|al|ness|ments?|ity|ive|ions?|able|ful|less|ists?|isms?|i[sz]e[sd]?)$/;

// High-frequency function words of the major Latin-script languages, omitting the forms
// most common in English briefs (a, e, o, in, come, non, no, do, as, lo). Two distinct
// ones that outnumber English function words mark an untranslated brief.
const functionWords=Object.entries({
  french:'le les des du une un pour et est avec dans sur par aux au ce cette ces qui que pas plus mais sont nous vous ils elle leur tr\u00e8s comme sans entre mon notre votre de en',
  spanish:'el los las del una unos unas es con por para pero sin muy como su sus al m\u00e1s est\u00e1 son de en que',
  portuguese:'os das dos um uma \u00e9 com para por n\u00e3o mais muito como seu sua na nos nas em de que',
  italian:'il gli per con della delle dei degli del una uno \u00e8 che sono pi\u00f9 nel nella alla di da',
  german:'der die das und ist mit f\u00fcr ein eine einen einem dem den des nicht auf von zu im ich wir sie auch oder aber wie',
}).map(([language,list])=>[language,new Set(list.split(' '))]);
const englishFunctionWords=new Set('the of for with and or to in on at by is are my our your this that from as but an a it be'.split(' '));
export function untranslatedLanguage(text) {
  const words=new Set((String(text).toLowerCase().normalize('NFC').match(/\p{L}+/gu)??[]));
  const english=[...words].filter(word=>englishFunctionWords.has(word)).length;
  const [language,hits]=functionWords.map(([name,set])=>[name,[...words].filter(word=>set.has(word)).length]).sort((a,b)=>b[1]-a[1])[0];
  return hits>=2&&hits>english?language:null;
}

const rewriteRequired='QUERY_REWRITE_REQUIRED: translate search instructions into concise English, preserve constraints, quote unchanged names, and retry once. For an already-English unfamiliar subject, supply explicit subjects. This is not an empty-catalog result.';

export function prepareSearchQuery(args,df) {
  if(!args.query)return {query:'',corrections:[]};
  const original=args.query,unquoted=original.replace(quoted,part=>' '.repeat(part.length));
  if(untranslatedLanguage(unquoted))throw Error(rewriteRequired);
  const raw=unquoted.match(letters)??[],english=englishWords();
  const inVocabulary=word=>designVocabulary.has(normalizedWord(word))||df.has(normalizedWord(word))||english.has(word);
  // Real English words are never "corrected" into catalog words (patient is not payment).
  const known=word=>{
    const value=word.toLowerCase().normalize('NFKC');
    if(inVocabulary(value))return true;
    const stem=value.replace(suffixes,'');
    return stem.length>=3&&stem!==value&&[stem,stem+'e',stem+'y',stem.replace(/(.)\1$/,'$1')].some(inVocabulary);
  };
  const vocabulary=new Set([...designVocabulary,...[...df].filter(([,count])=>count>=3).map(([term])=>term)]);
  const corrections=[];
  for(const word of new Set(raw)){
    const value=word.toLowerCase().normalize('NFKC');
    if(value.length<4||known(word)||!/^[a-z]+$/i.test(value)||/^[A-Z]/.test(word))continue;
    // Edit budget grows with length: one edit below nine letters, two from nine.
    const limit=value.length>=9?2:1;let best=limit+1,choices=[];
    for(const candidate of vocabulary){
      if(candidate[0]!==value[0])continue;
      const forms=[candidate];
      if(value.endsWith('s')&&!candidate.endsWith('s'))forms.push(candidate.endsWith('y')?candidate.slice(0,-1)+'ies':candidate+'s');
      for(const form of forms){
        if(Math.abs(form.length-value.length)>limit)continue;
        const edits=distance(value,form,limit);
        if(edits<best){best=edits;choices=[form];}else if(edits===best)choices.push(form);
      }
    }
    choices=[...new Set(choices)];
    if(best<=limit&&choices.length===1)corrections.push({from:word,to:choices[0]});
  }
  const replacements=new Map(corrections.map(c=>[c.from,c.to]));
  const query=original.replace(letters,(word,index)=>unquoted.slice(index,index+word.length).trim()?replacements.get(word)??word:word);
  const meaningful=raw.filter(word=>word.length>=3);
  const nonLatin=(unquoted.match(/\p{L}/gu)??[]).some(character=>!/\p{Script=Latin}/u.test(character));
  const unexplained=meaningful.some(word=>!known(word)&&!replacements.has(word));
  // Do not label an uninterpreted request as a catalog shortage. The host already
  // has translation capability; explicit subjects preserve unfamiliar English names.
  if(nonLatin||!args.subjects&&meaningful.length>=2&&!meaningful.some(known)&&unexplained)throw Error(rewriteRequired);
  return {query,corrections};
}

export function constraints(text) {
  const negative=[];
  const positive=String(text??'').replace(/\b(?:no|not|without|excluding|exclude|avoid)\s+([^,.;!?\n]+?)(?=\s+\b(?:but|with|featuring|containing|for)\b|[,.;!?\n]|$)/giu,(_whole,phrase)=>{
    for(const term of phrase.split(/\s+(?:and|or)\s+|\s*\/\s*/i))if(term.trim())negative.push(term.trim());
    return ' ';
  });
  const colors=['red','orange','yellow','green','blue','purple','pink','black','white','gray','grey','brown'];
  const terms=new Set(tokens(positive));
  return {positive,negative,colors:colors.filter(color=>terms.has(color))};
}

export function inferKinds(query) {
  const kinds=[];
  for(const [kind,pattern] of [['icon',/\b(?:app[ -]?)?icons?\b/i],['logo',/\blogos?\b/i],['website',/\bwebsites?\b/i]])if(pattern.test(query))kinds.push(kind);
  if(!kinds.length&&/\b(?:designs?|ui|interfaces?|components?|sections?)\b/i.test(query))kinds.push('design');
  return kinds;
}
