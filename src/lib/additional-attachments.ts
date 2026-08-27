export interface ComposeAdditionalAttachment {
  id: string;
  storagePath: string;
  linked: boolean;
}

export function temporaryComposeAttachments<T extends ComposeAdditionalAttachment>(
  items: T[],
): T[] {
  return items.filter((item) => !item.linked);
}
