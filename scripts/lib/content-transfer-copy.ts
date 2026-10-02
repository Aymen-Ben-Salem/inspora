import { CopyObjectCommand } from "@aws-sdk/client-s3";

/** R2 checks destination absence at commit, independently of the source ETag pin. */
export function conditionalPreviewCopy(object: { key: string; sourceEtag: string; origin?: string }, sourceBucket: string, destinationBucket: string, staged?: { key: string; etag: string }) {
  if ((sourceBucket === destinationBucket && !staged) || object.origin === "preview") throw new Error("Transfer server copy target rejected.");
  const command = new CopyObjectCommand({ Bucket: destinationBucket, Key: object.key, CopySource: `${sourceBucket}/${(staged?.key ?? object.key).split("/").map(encodeURIComponent).join("/")}`, CopySourceIfMatch: staged?.etag ?? object.sourceEtag, MetadataDirective: "COPY" });
  command.middlewareStack.add(next => async args => {
    (args.request as { headers: Record<string, string> }).headers["cf-copy-destination-if-none-match"] = "*";
    return next(args);
  }, { step: "build", name: "previewCopyNoOverwrite" });
  return command;
}
