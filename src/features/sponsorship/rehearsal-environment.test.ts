import {describe,expect,it} from 'vitest';
import {assertDataOperationEnvironment,runtimeDataEnvironmentFromValues} from '../../../scripts/lib/environment-fingerprint';
import {assertStripeObjectMode,assertStripeSecretKey,stripePaymentMode} from './payment-environment';

const fixture = {
 DATA_ENVIRONMENT:'rehearsal',VERCEL_ENV:'preview',RELEASE_REHEARSAL_TARGET:'sponsorship-fixture',
 DATABASE_URL:'postgresql://fixture:secret@ep-wandering-morning-as7pv0j5-pooler.c-4.eu-central-1.aws.neon.tech/sponsorship_ticket01_cd37dc92154a4946a50035dfd68bfef4',
 DATABASE_URL_UNPOOLED:'postgresql://fixture:secret@ep-wandering-morning-as7pv0j5.c-4.eu-central-1.aws.neon.tech/sponsorship_ticket01_cd37dc92154a4946a50035dfd68bfef4',
 R2_BUCKET_NAME:'inspora-media-rehearsal-20260929',R2_SUBMISSIONS_BUCKET_NAME:'inspora-submissions-rehearsal-20260929',
 R2_PUBLIC_BASE_URL:'https://pub-7fe6254d6647460f89db9822e4fa619a.r2.dev',
 STRIPE_REHEARSAL_ACCOUNT_ID:'acct_1USgzLRtLZ8OUdCw',STRIPE_SECRET_KEY:'sk_test_fixture',
 STRIPE_SPONSOR_PRICE_ID:'price_1USyKfRtLZ8OUdCwu4GCQLKg',STRIPE_SPONSOR_ONE_TIME_PRICE_ID:'price_1USyKfRtLZ8OUdCwwD9uLes8',
 STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID:'bpc_1USyKfRtLZ8OUdCw8YGYtf26',SPONSORSHIP_LIVE_PAYMENTS_ENABLED:'false',
};
describe('explicit release TEST rehearsal',()=>{
 it('permits only the designated existing fixture with the rehearsal bucket pair',()=>{
  expect(()=>assertDataOperationEnvironment(runtimeDataEnvironmentFromValues(fixture))).not.toThrow();
  expect(stripePaymentMode(fixture)).toBe('test');expect(()=>assertStripeSecretKey(fixture)).not.toThrow();
  expect(()=>assertStripeObjectMode({livemode:false},fixture)).not.toThrow();
  expect(()=>assertStripeObjectMode({livemode:true},fixture)).toThrow();
 });
 it('also supports the exact working release database without changing its existing guard',()=>{
  const release={...fixture,RELEASE_REHEARSAL_TARGET:'release',
   DATABASE_URL:'postgresql://fixture:secret@ep-raspy-morning-aszy572t-pooler.c-4.eu-central-1.aws.neon.tech/phase3_production_restore',
   DATABASE_URL_UNPOOLED:'postgresql://fixture:secret@ep-raspy-morning-aszy572t.c-4.eu-central-1.aws.neon.tech/phase3_production_restore'};
  expect(stripePaymentMode(release)).toBe('test');
  expect(()=>stripePaymentMode({...release,DATABASE_URL:release.DATABASE_URL.replace('phase3_production_restore','neondb')})).toThrow();
 });
 it.each([
  {DATA_ENVIRONMENT:'production'},{DATA_ENVIRONMENT:'preview'},{VERCEL_ENV:'production'},{VERCEL_ENV:''},
  {RELEASE_REHEARSAL_TARGET:'anything'},
  {DATABASE_URL:fixture.DATABASE_URL.replace('sponsorship_ticket01_cd37dc92154a4946a50035dfd68bfef4','neondb')},
  {DATABASE_URL_UNPOOLED:fixture.DATABASE_URL_UNPOOLED.replace('ep-wandering-morning-as7pv0j5','ep-plain-glade-aswp1anv')},
  {R2_BUCKET_NAME:'inspora-media-preview'},{R2_SUBMISSIONS_BUCKET_NAME:'inspora-submissions-production'},
  {R2_PUBLIC_BASE_URL:'https://www.inspora.design'},
  {STRIPE_REHEARSAL_ACCOUNT_ID:'acct_other'},{STRIPE_SPONSOR_PRICE_ID:'price_live'},
  {STRIPE_SPONSOR_ONE_TIME_PRICE_ID:''},{STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID:'bpc_other'},
 ])('rejects altered target or provider binding %j',change=>{
  expect(()=>stripePaymentMode({...fixture,...change})).toThrow();
 });
 it('rejects live credentials/activation and keeps unmarked rehearsal billing disabled',()=>{
  expect(()=>assertStripeSecretKey({...fixture,STRIPE_SECRET_KEY:'sk_live_fixture'})).toThrow();
  expect(()=>assertStripeSecretKey({...fixture,SPONSORSHIP_LIVE_PAYMENTS_ENABLED:'true'})).toThrow();
  expect(()=>stripePaymentMode({...fixture,RELEASE_REHEARSAL_TARGET:''})).toThrow();
 });
});
