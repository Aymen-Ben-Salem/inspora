import "server-only";
import {
  createPrivateStagingKey,
  createPrivateSubmissionStorage,
  requirePrivateConfiguration,
} from "./private-submissions";

export function createSponsorStagingKey(
  ownerUserId: string,
  uploadId: string,
  contentType: string,
) {
  return createPrivateStagingKey({
    ownerUserId,
    uploadId,
    contentType,
    namespace: "sponsorships",
  });
}
export function createPrivateSponsorStorage(
  deps: Parameters<typeof createPrivateSubmissionStorage>[0],
) {
  return createPrivateSubmissionStorage({ ...deps, namespace: "sponsorships" });
}
export function privateSponsorStorage() {
  return requirePrivateConfiguration("sponsorships");
}
