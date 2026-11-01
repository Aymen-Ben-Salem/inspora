import {afterEach, expect, it, vi} from 'vitest';
import type {Post} from '@/domain/post';

vi.mock('react',()=>({useEffect:(effect:()=>void)=>effect(),useRef:()=>({current:null})}));
vi.mock('@/analytics/client',()=>({captureAnalyticsEvent:vi.fn()}));
import {captureAnalyticsEvent} from '@/analytics/client';
import {PostAnalytics} from './post-analytics';
import {WorkAnalytics} from './work-analytics';

afterEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();});

it('gives both design event formats the same memory session so the server counts one view',()=>{
  vi.stubGlobal('window',Object.assign(new EventTarget(),{location:{pathname:'/posts/fixture'}}));
  const id='22222222-2222-4222-8222-222222222222';
  PostAnalytics({post:{id,category:'web',creator:{id:'11111111-1111-4111-8111-111111111111',name:'Fixture'},slug:'fixture',title:'Fixture'} as Post});
  WorkAnalytics({workId:id,workKind:'design'});
  const calls=vi.mocked(captureAnalyticsEvent).mock.calls;
  const legacy=calls.find(call=>call[0]==='post opened')?.[1];
  const unified=calls.find(call=>call[0]==='work opened')?.[1];
  expect(legacy).toMatchObject({post_id:id,work_session_key:expect.any(String)});
  expect(unified).toMatchObject({work_id:id,work_kind:'design',work_session_key:legacy&&'work_session_key' in legacy?legacy.work_session_key:undefined});
});
