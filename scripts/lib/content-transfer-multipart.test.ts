import { describe, expect, it, vi } from "vitest";
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, CopyObjectCommand, DeleteObjectCommand, AbortMultipartUploadCommand, type S3Client } from "@aws-sdk/client-s3";
import { putViaPreviewStaging } from "./content-transfer-multipart";

describe("bounded preview multipart staging", () => {
  it.each([false, true])("assembles numbered parts, conditionally copies, and preserves final key on collision=%s", async collision => {
    const commands: any[] = [];
    const send = vi.fn(async command => {
      commands.push(command);
      expect(command.input.Bucket).toBe("preview");
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: "upload" };
      if (command instanceof UploadPartCommand) return { ETag: '"part' + command.input.PartNumber + '"' };
      if (command instanceof CompleteMultipartUploadCommand) return { ETag: '"assembled"' };
      if (command instanceof CopyObjectCommand && collision) throw { $metadata: { httpStatusCode: 412 } };
      return {};
    });
    const bytes = Buffer.alloc(11 * 1024 * 1024, 1);
    const result = await putViaPreviewStaging({ client: { send } as unknown as S3Client, bucket: "preview", key: "posts/final.mp4", bytes, assertTarget: vi.fn() });
    expect(result).toBe(collision ? "already-exists" : "copied");
    const start = commands.find(c => c instanceof CreateMultipartUploadCommand)!;
    expect(start.input.Key).toMatch(/^phase2-transfer-staging\/[a-f0-9-]+$/);
    const complete = commands.find(c => c instanceof CompleteMultipartUploadCommand)!;
    expect(complete.input.MultipartUpload!.Parts!.map((p:any) => p.PartNumber)).toEqual([1, 2, 3]);
    const copy = commands.find(c => c instanceof CopyObjectCommand)!;
    expect(copy.input.Key).toBe("posts/final.mp4");
    expect(copy.input.CopySourceIfMatch).toBe('"assembled"');
    expect(commands.filter(c => c instanceof DeleteObjectCommand).map(c => c.input.Key)).toEqual([start.input.Key]);
    expect(commands.some(c => c instanceof AbortMultipartUploadCommand)).toBe(false);
  });
  it("aborts only its own incomplete staging upload after a part failure", async () => {
    const commands:any[]=[];
    const send=vi.fn(async command=>{commands.push(command);if(command instanceof CreateMultipartUploadCommand)return {UploadId:"upload"};if(command instanceof UploadPartCommand)throw Error("part failed");return {};});
    await expect(putViaPreviewStaging({client:{send}as unknown as S3Client,bucket:"preview",key:"final",bytes:Buffer.alloc(1),assertTarget:vi.fn()})).rejects.toThrow("part failed");
    expect(commands.some(c=>c instanceof CopyObjectCommand)).toBe(false);
    expect(commands.filter(c=>c instanceof AbortMultipartUploadCommand)).toHaveLength(1);
    expect(commands.some(c=>c instanceof DeleteObjectCommand)).toBe(false);
  });
  it("rejects the target before any request", async () => {
    const send=vi.fn();
    await expect(putViaPreviewStaging({client:{send}as unknown as S3Client,bucket:"preview",key:"final",bytes:Buffer.alloc(1),assertTarget:()=>{throw Error("wrong target");}})).rejects.toThrow("wrong target");
    expect(send).not.toHaveBeenCalled();
  });
});
