/** Copy Editor — Discord mesaj önizlemesi (panel tarafında birebir render). */

export interface DiscordPreviewEmbed {
  title?: string;
  description?: string;
  color?: number;
  footer?: { text: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  image?: { url: string };
  thumbnail?: { url: string };
}

export interface DiscordPreviewButton {
  label: string;
  style?: 'primary' | 'secondary' | 'success' | 'danger' | 'link';
  emoji?: string;
  disabled?: boolean;
}

export interface DiscordPreviewAttachment {
  url: string;
  alt?: string;
  filename?: string;
}

export interface DiscordPreviewPayload {
  content?: string;
  embeds?: DiscordPreviewEmbed[];
  components?: DiscordPreviewButton[][];
  attachments?: DiscordPreviewAttachment[];
}

export type CopyPreviewKind = 'message' | 'embed' | 'embed-description' | 'composite';
