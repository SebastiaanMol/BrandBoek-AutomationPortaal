import type { ProcessAttachment, ProcessAttachmentTarget } from "@/data/processData";

export function removeAttachmentsForTarget(
  attachments: ProcessAttachment[] | undefined,
  target: ProcessAttachmentTarget,
): ProcessAttachment[] {
  return (attachments ?? []).filter((attachment) => !(attachment.attachedTo.kind === target.kind && attachment.attachedTo.id === target.id));
}
