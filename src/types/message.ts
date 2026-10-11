export type MessageType = 'text' | 'image' | 'video' | 'link' | 'file';

export type MessageStatus = 'pending' | 'sending' | 'sent' | 'failed';

export type MediaState = 'remote' | 'downloading' | 'cached';

export type LinkPreviewState = 'notLoaded' | 'loading' | 'loaded';

export interface MessageMedia {
  fileName?: string;
  fileSize: number;
  width?: number;
  height?: number;
  duration?: number;
  localPreviewUrl?: string;
  state: MediaState;
}

export interface MessageLink {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  preview: LinkPreviewState;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  text?: string;
  media?: MessageMedia;
  link?: MessageLink;
  status: MessageStatus;
  uploadProgress?: number;
  downloadProgress?: number;
  downloadFailed?: boolean;
  /** Le fichier n’est plus sur le serveur (ex. après 24 h) et n’est pas en cache local. */
  mediaExpired?: boolean;
  createdAt: string;
  editedAt?: string;
  deletedForEveryone?: boolean;
  replyToId?: string;
  reactions?: MessageReaction[];
  event?: boolean;
  sendAttempts?: number;
  retryAt?: number;
  retryable?: boolean;
  prepared?: boolean;
  /** Room key id of an end-to-end sealed message; its media bytes must be decrypted too. */
  sealedKey?: string;
  locked?: boolean;
}
