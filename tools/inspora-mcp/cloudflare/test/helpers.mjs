import {AccessState} from '../access-state.mjs';
export class Bucket {
  values=new Map();reads=0;
  async get(key){this.reads++;const value=this.values.get(key);return value===undefined?null:{size:new TextEncoder().encode(value).length,json:async()=>JSON.parse(value)};}
  async put(key,value){this.values.set(key,value);}
}

export class Storage {
  values=new Map();pending=Promise.resolve();alarmAt=null;
  async get(key){return structuredClone(this.values.get(key));}
  async put(key,value){this.values.set(key,structuredClone(value));}
  async delete(key){return this.values.delete(key);}
  async list({prefix}){return new Map([...this.values].filter(([key])=>key.startsWith(prefix)));}
  async setAlarm(at){this.alarmAt=at;}
  async getAlarm(){return this.alarmAt;}
  async transaction(fn){const result=this.pending.then(()=>fn(this));this.pending=result.catch(()=>{});return result;}
}

export class Namespace {
  objects=new Map();
  idFromName(name){return name;}
  get(name){
    if(!this.objects.has(name))this.objects.set(name,new AccessState({storage:new Storage()}));
    const instance=this.objects.get(name);
    return {fetch:(url,init)=>instance.fetch(new Request(url,init))};
  }
}
