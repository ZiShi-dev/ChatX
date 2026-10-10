import { useEffect, useRef, useState } from 'react';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { IonIcon } from '@ionic/react';
import { attachOutline, cameraOutline, checkmark, closeOutline, documentOutline, folderOutline, happyOutline, imagesOutline, send } from 'ionicons/icons';
import PermissionDialog from '../common/PermissionDialog';
import EmojiPanel from './EmojiPanel';
import Avatar from '../common/Avatar';
import EmojiText from '../common/EmojiText';
import { adminFetch } from '../../lib/adminApi';
import { isServerId } from '../../lib/home';
import { activeMention, EVERYONE_HANDLE } from '../../lib/mention';
import { clipFileName, VIDEO_BYTES_MAX } from '../../lib/chatFile';
import { fitChatImage, fitChatImageFromSources } from '../../lib/chatImage';
import { prepareMedia } from '../../lib/mediaPreparation';
import { expectedImageSize, expectedVideoSize, formatBytes, messagePreview } from '../../lib/media';
import { useDataSaver } from '../../hooks/useDataSaver';
import { StorageAccess, type StorageFile } from '../../lib/storageAccess';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUserStore } from '../../stores/userStore';
import type { User } from '../../types/user';

const EVERYONE: User = {
  id: EVERYONE_HANDLE,
  username: EVERYONE_HANDLE,
  displayName: 'الجميع',
  role: 'member',
  status: 'online',
  bio: '',
  color: '#3d9b84',
};

type AccessKind = 'photos' | 'files' | 'folder' | 'camera';

const ACCESS_COPY: Record<AccessKind, { title: string; body: string }> = {
  photos: {
    title: 'الصور والفيديو',
    body: 'اسمح لأندرويد بالوصول إلى الصور والفيديو حتى ترسلها في المحادثة.',
  },
  files: {
    title: 'الملفات',
    body: 'اسمح لأندرويد بالوصول إلى الملفات حتى ترسلها في المحادثة.',
  },
  folder: {
    title: 'المجلدات',
    body: 'اسمح لأندرويد بالوصول إلى المجلدات حتى ترسل ملفاتها في المحادثة.',
  },
  camera: {
    title: 'الكاميرا',
    body: 'اسمح لأندرويد باستخدام الكاميرا حتى تلتقط صورة وترسلها في المحادثة.',
  },
};

const accessKey = (kind: AccessKind) => `chatx-access-${kind}`;

function accessGranted(kind: AccessKind) {
  return localStorage.getItem(accessKey(kind)) === 'granted';
}

const drafts = new Map<string, string>();
const EMPTY_USERS: User[] = [];
const EMPTY_IDS: string[] = [];

type MessageComposerProps = {
  conversationId: string;
};

type Attachment = {
  id: string;
  kind: 'image' | 'video' | 'file';
  name: string;
  size: number;
  previewUrl?: string;
  displayUrl?: string;
};

type PickedLike = StorageFile & { blob?: Blob };

function sourceUrl(file: PickedLike) {
  if (file.webPath) return file.webPath;
  if (file.blob) return URL.createObjectURL(file.blob);
  if (file.path) return Capacitor.convertFileSrc(file.path);
  return undefined;
}

function kindOf(name: string, mimeType = ''): Attachment['kind'] {
  const lower = name.toLowerCase();
  if (mimeType.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/.test(lower)) return 'image';
  if (mimeType.startsWith('video/') || /\.(mp4|webm|mov|mkv|3gp)$/.test(lower)) return 'video';
  return 'file';
}

export default function MessageComposer({ conversationId }: MessageComposerProps) {
  const sendMessage = useChatStore((state) => state.sendMessage);
  const sendImage = useChatStore((state) => state.sendImage);
  const sendVideo = useChatStore((state) => state.sendVideo);
  const sendFile = useChatStore((state) => state.sendFile);
  const editMessage = useChatStore((state) => state.editMessage);
  const cancelEdit = useChatStore((state) => state.cancelEdit);
  const cancelReply = useChatStore((state) => state.cancelReply);
  const currentUserId = useAuthStore((state) => state.currentUser.id);
  const roomType = useChatStore((state) => state.conversations.find((item) => item.id === conversationId)?.type ?? 'private');
  const participantIds = useChatStore((state) => state.conversations.find((item) => item.id === conversationId)?.participantIds ?? EMPTY_IDS);
  const editStamp = useChatStore((state) => {
    if (!state.editingId) return '';
    const message = state.messages.find((item) => item.id === state.editingId && item.conversationId === conversationId);
    return message ? `${message.id}\u0000${message.text ?? ''}` : '';
  });
  const replyStamp = useChatStore((state) => {
    const target = state.replyingTo;
    if (!target || target.conversationId !== conversationId) return '';
    const message = state.messages.find((item) => item.id === target.messageId);
    if (!message) return '';
    return `${message.id}\u0000${message.senderId}\u0000${messagePreview(message, message.senderId === currentUserId)}`;
  });
  const editSplit = editStamp.indexOf('\u0000');
  const editing = editSplit < 0 ? undefined : { id: editStamp.slice(0, editSplit), text: editStamp.slice(editSplit + 1) };
  const replySplit = replyStamp.indexOf('\u0000');
  const replySenderSplit = replySplit < 0 ? -1 : replyStamp.indexOf('\u0000', replySplit + 1);
  const replying = replySenderSplit < 0 ? undefined : {
    id: replyStamp.slice(0, replySplit),
    senderId: replyStamp.slice(replySplit + 1, replySenderSplit),
    preview: replyStamp.slice(replySenderSplit + 1),
  };
  const users = useUserStore((state) => state.users);
  const replyingAuthor = replying ? users.find((user) => user.id === replying.senderId)?.displayName ?? '' : '';
  const showTyping = useSettingsStore((state) => state.showTyping);
  const setTyping = useChatStore((state) => state.setTyping);
  const imageQuality = useSettingsStore((state) => state.imageQuality);
  const videoQuality = useSettingsStore((state) => state.videoQuality);
  const dataSaver = useDataSaver();
  const setImageQuality = useSettingsStore((state) => state.setImageQuality);
  const setVideoQuality = useSettingsStore((state) => state.setVideoQuality);
  const [draft, setDraft] = useState('');
  const [cursor, setCursor] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [accessAsk, setAccessAsk] = useState<AccessKind | null>(null);
  const [pickerError, setPickerError] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const attachmentsRef = useRef(attachments);
  const roomRef = useRef(conversationId);
  attachmentsRef.current = attachments;
  roomRef.current = conversationId;
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  const editingRef = useRef(editing);
  draftRef.current = draft;
  editingRef.current = editing;
  const mediaRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const token = roomType !== 'private' ? activeMention(draft, cursor) : null;
  const members = token ? users.filter((user) => participantIds.includes(user.id) && user.id !== currentUserId) : EMPTY_USERS;
  const mentionQuery = token?.query.toLocaleLowerCase('en') ?? '';
  const people = token
    ? members.filter((user) => {
      if (!mentionQuery) return true;
      return user.username.toLocaleLowerCase('en').includes(mentionQuery)
        || user.displayName.toLocaleLowerCase('en').includes(mentionQuery);
    })
    : [];
  const showEveryone = Boolean(
    token && (!mentionQuery || EVERYONE_HANDLE.includes(mentionQuery) || 'الجميع'.includes(mentionQuery)),
  );
  const matches = showEveryone ? [EVERYONE, ...people] : people;
  const activeMatch = Math.min(mentionIndex, Math.max(matches.length - 1, 0));

  const writing = showTyping && (draft.trim().length > 0 || attachments.length > 0);
  useEffect(() => {
    if (isServerId(currentUserId) && isServerId(conversationId)) return;
    const mine = currentUserId;
    const dropMine = () => {
      const current = useChatStore.getState().typingByConversation[conversationId] ?? [];
      if (!current.includes(mine)) return;
      setTyping(conversationId, current.filter((userId) => userId !== mine));
    };
    if (!writing) {
      dropMine();
      return;
    }
    const current = useChatStore.getState().typingByConversation[conversationId] ?? [];
    if (!current.includes(mine)) setTyping(conversationId, [...current, mine]);
    const timer = window.setTimeout(dropMine, 4000);
    return () => window.clearTimeout(timer);
  }, [conversationId, currentUserId, setTyping, writing]);
  useEffect(() => {
    if (!isServerId(currentUserId) || !isServerId(conversationId)) return;
    let alive = true;
    const send = (on: boolean) => {
      if (!alive && on) return;
      void adminFetch(`/api/rooms/${conversationId}/typing`, { method: 'POST', body: { on } }).catch(() => undefined);
    };
    send(writing);
    if (!writing) return () => { alive = false; };
    const timer = window.setInterval(() => send(true), 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      void adminFetch(`/api/rooms/${conversationId}/typing`, { method: 'POST', body: { on: false } }).catch(() => undefined);
    };
  }, [conversationId, currentUserId, writing]);

  const resizeField = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    const next = Math.min(Math.max(field.scrollHeight, 44), 120);
    field.style.height = `${next}px`;
  };

  useEffect(() => {
    const key = `${currentUserId}:${conversationId}`;
    setDraft(drafts.get(key) ?? '');
    window.requestAnimationFrame(resizeField);
    return () => {
      attachmentsRef.current.forEach((item) => {
        if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
      });
      if (editingRef.current) return;
      drafts.set(key, draftRef.current);
    };
  }, [conversationId, currentUserId]);

  useEffect(() => { setAttachments([]); setSavingEdit(false); }, [conversationId, currentUserId]);

  useEffect(() => {
    if (!editing) return;
    setDraft(editing.text ?? '');
    attachmentsRef.current.forEach((item) => {
      if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
    });
    setAttachments([]);
    setMenuOpen(false);
    setEmojiOpen(false);
    window.requestAnimationFrame(resizeField);
  }, [editing?.id]);

  useEffect(() => {
    if (!replying) return;
    setMenuOpen(false);
    setEmojiOpen(false);
    fieldRef.current?.focus();
  }, [replying?.id]);

  useEffect(() => {
    if (!emojiOpen) return;
    const closeForField = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement && target.classList.contains('composer-input')) setEmojiOpen(false);
    };
    document.addEventListener('focusin', closeForField);
    if (!Capacitor.isNativePlatform()) return () => document.removeEventListener('focusin', closeForField);
    let dropped = false;
    let handle: { remove: () => Promise<void> } | undefined;
    void Keyboard.addListener('keyboardDidShow', () => {
      const active = document.activeElement;
      if (active instanceof Element && active.closest('.emoji-panel')) return;
      setEmojiOpen(false);
    }).then((listener) => {
      if (dropped) void listener.remove();
      else handle = listener;
    });
    return () => {
      dropped = true;
      document.removeEventListener('focusin', closeForField);
      void handle?.remove();
    };
  }, [emojiOpen]);

  const openPicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.value = '';
    input.click();
  };

  const inputFor = (kind: AccessKind) => {
    if (kind === 'photos') return mediaRef.current;
    if (kind === 'folder') return folderRef.current;
    return fileRef.current;
  };

  const cancelled = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    return /cancel|abort/i.test(message);
  };

  const pickNative = async (kind: AccessKind) => {
    const access = await StorageAccess.requestAccess();
    if (!access.granted) {
      localStorage.removeItem(accessKey(kind));
      setPickerError('يلزم السماح بالوصول إلى الملفات من إعدادات الهاتف.');
      setAccessAsk(kind);
      return;
    }
    if (kind === 'photos') {
      const result = await FilePicker.pickMedia({ limit: 10 });
      addPicked(result.files);
      return;
    }
    if (kind === 'files') {
      const result = await FilePicker.pickFiles({ limit: 10 });
      addPicked(result.files);
      return;
    }
    const directory = await FilePicker.pickDirectory();
    const listed = await StorageAccess.listDirectory({ path: directory.path });
    if (!listed.files.length) {
      setPickerError('هذا المجلد لا يحتوي على ملفات.');
      return;
    }
    addPicked(listed.files);
  };

  const openSystemPicker = (kind: AccessKind) => {
    setMenuOpen(false);
    if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
      void pickNative(kind).catch((error: unknown) => {
        if (cancelled(error)) return;
        setPickerError('تعذر فتح الملفات.');
      });
      return;
    }
    openPicker(inputFor(kind));
  };

  const askAccess = (kind: AccessKind) => {
    setPickerError('');
    setMenuOpen(false);
    if (accessGranted(kind)) {
      openSystemPicker(kind);
      return;
    }
    setAccessAsk(kind);
  };

  const allowAccess = () => {
    if (!accessAsk) return;
    const kind = accessAsk;
    setAccessAsk(null);
    if (kind === 'camera') {
      void openCamera(true);
      return;
    }
    localStorage.setItem(accessKey(kind), 'granted');
    openSystemPicker(kind);
  };

  const addPicked = (files: PickedLike[]) => {
    if (!files.length) return;
    const accepted = acceptFiles(files, (file) => kindOf(file.name, file.mimeType));
    const next = accepted.map((file) => {
      const kind = kindOf(file.name, file.mimeType);
      const previewUrl = sourceUrl(file);
      return {
        id: crypto.randomUUID(),
        kind,
        name: clipFileName(file.name || 'fichier'),
        size: file.size > 0 ? file.size : 0,
        previewUrl,
      };
    });
    appendAttachments(next);
    setMenuOpen(false);
  };

  function acceptFiles<T extends { size: number }>(files: T[], kindFor: (file: T) => Attachment['kind']): T[] {
    const available = Math.max(0, 10 - attachmentsRef.current.length);
    let videos = attachmentsRef.current.filter((item) => item.kind === 'video').length;
    const accepted = files.filter((file) => {
      const kind = kindFor(file);
      const limit = kind === 'file' ? 262_144 : kind === 'video' ? VIDEO_BYTES_MAX : 20 * 1024 * 1024;
      if (file.size <= 0 || file.size > limit) return false;
      if (kind === 'video' && (dataSaver || videos >= 1)) return false;
      if (kind === 'video') videos += 1;
      return true;
    }).slice(0, available);
    if (files.some((file) => kindFor(file) === 'video') && dataSaver) setPickerError('لا يمكن إرسال فيديو أثناء توفير البيانات أو الاتصال الضعيف.');
    else if (accepted.length !== files.length) setPickerError('يمكن اختيار 10 مرفقات كحد أقصى، وفيديو واحد حتى 8 MB. الصور حتى 20 MB والملفات حتى 256 KB.');
    return accepted;
  }

  function appendAttachments(next: Attachment[]) {
    attachmentsRef.current = [...attachmentsRef.current, ...next];
    setAttachments(attachmentsRef.current);
    for (const item of next.filter((item) => item.kind === 'image')) {
      void prepareMedia(async () => {
        if (!attachmentsRef.current.some((attachment) => attachment.id === item.id)) return;
        const thumbnail = item.previewUrl ? await fitChatImage(item.previewUrl, 'saver') : null;
        if (!attachmentsRef.current.some((attachment) => attachment.id === item.id)) return;
        if (!thumbnail) throw new Error('invalid_image');
        setAttachments((current) => current.map((attachment) => attachment.id === item.id ? { ...attachment, displayUrl: thumbnail.url } : attachment));
      }).catch(() => {
        if (!attachmentsRef.current.some((attachment) => attachment.id === item.id)) return;
        removeAttachment(item.id);
        setPickerError('تعذر قراءة الصورة أو أنها كبيرة جدًا. اختر صورة أصغر.');
      });
    }
  }

  const openCamera = async (confirmed = false) => {
    if (attachmentsRef.current.length >= 10) { setPickerError('يمكن اختيار 10 مرفقات كحد أقصى.'); return; }
    setPickerError('');
    setMenuOpen(false);
    try {
      if (Capacitor.isNativePlatform()) {
        const current = await Camera.checkPermissions();
        if (!confirmed && current.camera !== 'granted' && current.camera !== 'limited') {
          setAccessAsk('camera');
          return;
        }
        if (current.camera !== 'granted' && current.camera !== 'limited') {
          const asked = await Camera.requestPermissions({ permissions: ['camera'] });
          if (asked.camera !== 'granted' && asked.camera !== 'limited') {
            setPickerError('يلزم السماح باستخدام الكاميرا من إعدادات الهاتف.');
            setMenuOpen(true);
            return;
          }
        }
      }
      const quality = imageQuality === 'original' ? 90 : imageQuality === 'medium' ? 70 : 45;
      const photo = await Camera.takePhoto({
        quality,
        targetWidth: imageQuality === 'saver' ? 640 : 960,
        targetHeight: imageQuality === 'saver' ? 640 : 960,
        saveToGallery: false,
        correctOrientation: true,
      });
      const previewUrl = photo.webPath || (photo.thumbnail ? `data:image/jpeg;base64,${photo.thumbnail}` : undefined);
      if (!previewUrl) return;
      let size = 0;
      try {
        size = (await fetch(previewUrl).then((response) => response.blob())).size;
      } catch {
        size = 0;
      }
      appendAttachments([
        {
          id: crypto.randomUUID(),
          kind: 'image',
          name: `camera-${Date.now()}.jpg`,
          size,
          previewUrl,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/cancel/i.test(message)) return;
      setPickerError('تعذر فتح الكاميرا.');
      setMenuOpen(true);
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = acceptFiles([...list], (file) => kindOf(file.name, file.type)).map((file) => {
      const kind = kindOf(file.name, file.type);
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      return {
        id: crypto.randomUUID(),
        kind,
        name: clipFileName(relative || file.name),
        size: file.size,
        previewUrl: URL.createObjectURL(file),
      };
    });
    appendAttachments(next);
    setMenuOpen(false);
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const insertMention = (user: User) => {
    const field = fieldRef.current;
    const end = cursor;
    const current = activeMention(draft, end);
    if (!current) return;
    const next = `${draft.slice(0, current.start)}@${user.username} ${draft.slice(end)}`;
    const place = current.start + user.username.length + 2;
    setDraft(next);
    setCursor(place);
    setMentionIndex(0);
    window.requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(place, place);
      resizeField();
    });
  };

  const insertEmoji = (emoji: string) => {
    const field = fieldRef.current;
    const start = field?.selectionStart ?? cursor;
    const end = field?.selectionEnd ?? start;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    const place = start + emoji.length;
    setDraft(next);
    setCursor(place);
    window.requestAnimationFrame(() => {
      field?.setSelectionRange(place, place);
      resizeField();
    });
  };

  const holdKeyboard = () => {
    const field = fieldRef.current;
    if (!field) return;
    const restore = () => {
      if (roomRef.current !== conversationId || !field.isConnected) return;
      field.focus({ preventScroll: true });
    };
    restore();
    window.requestAnimationFrame(restore);
    window.setTimeout(restore, 80);
  };

  const submit = async () => {
    if (savingEdit) return;
    if (matches.length > 0) {
      insertMention(matches[activeMatch]);
      return;
    }
    const text = draft.trim();
    if (editing) {
      if (!text) return;
      setSavingEdit(true);
      const saved = await editMessage(editing.id, text);
      setSavingEdit(false);
      if (!saved || roomRef.current !== conversationId || useAuthStore.getState().currentUser.id !== currentUserId) return;
      drafts.delete(`${currentUserId}:${conversationId}`);
      setDraft('');
      setEmojiOpen(false);
      if (fieldRef.current) fieldRef.current.style.height = 'auto';
      holdKeyboard();
      return;
    }
    if (!text && attachments.length === 0) return;
    const queue = attachments.slice();
    if (text) sendMessage(conversationId, text);
    for (const item of queue) {
      if (item.kind === 'image') {
        const source = item.displayUrl || item.previewUrl;
        let previewUrl = item.previewUrl;
        let fileSize = item.size;
        if (source) {
          try {
            const fitted = await prepareMedia(() => fitChatImageFromSources(source, imageQuality));
            if (fitted) {
              previewUrl = fitted.url;
              fileSize = fitted.bytes;
            }
          } catch {
            setPickerError('تعذر تجهيز الصورة. أعد المحاولة.');
            return;
          }
        }
        if (!previewUrl) {
          setPickerError('تعذر قراءة الصورة.');
          return;
        }
        sendImage(conversationId, imageQuality, { fileName: item.name, fileSize, previewUrl });
        continue;
      }
      const payload = { fileName: item.name, fileSize: item.size, previewUrl: item.previewUrl };
      if (item.kind === 'video') sendVideo(conversationId, videoQuality, payload);
      else sendFile(conversationId, payload);
    }
    attachmentsRef.current = [];
    setDraft('');
    setAttachments([]);
    for (const item of queue) {
      if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
    }
    setEmojiOpen(false);
    if (fieldRef.current) fieldRef.current.style.height = 'auto';
    holdKeyboard();
  };

  const canSend = !savingEdit && Boolean(draft.trim() || (!editing && attachments.length));

  return (
    <>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {replying && !editing && (
          <div className="edit-banner">
            <div className="edit-quote">
              <strong>الرد على {replyingAuthor || 'عضو'}</strong>
              <p><EmojiText text={replying.preview} /></p>
            </div>
            <button type="button" className="edit-close" aria-label="إلغاء الرد" onClick={() => cancelReply()}>
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        )}
        {editing && (
          <div className="edit-banner">
            <div className="edit-quote">
              <strong>تعديل الرسالة</strong>
              <p>{editing.text}</p>
            </div>
            <button
              type="button"
              className="edit-close"
              aria-label="إلغاء التعديل"
              onClick={() => {
                cancelEdit();
                setDraft('');
                if (fieldRef.current) fieldRef.current.style.height = 'auto';
              }}
            >
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        )}
        {menuOpen && !editing && (
          <div className="attach-tray" role="menu">
            <button type="button" className="attach-tile" onClick={() => askAccess('photos')}>
              <span className="attach-glyph photos"><IonIcon icon={imagesOutline} /></span>
              الصور
            </button>
            <button type="button" className="attach-tile" onClick={() => void openCamera()}>
              <span className="attach-glyph camera"><IonIcon icon={cameraOutline} /></span>
              الكاميرا
            </button>
            <button type="button" className="attach-tile" onClick={() => askAccess('files')}>
              <span className="attach-glyph file"><IonIcon icon={documentOutline} /></span>
              ملف
            </button>
            <button type="button" className="attach-tile" onClick={() => askAccess('folder')}>
              <span className="attach-glyph folder"><IonIcon icon={folderOutline} /></span>
              مجلد
            </button>
          </div>
        )}
        {pickerError && <p className="attach-error">{pickerError}</p>}
        {attachments.some((item) => item.kind === 'image' || item.kind === 'video') && (
          <div className="quality-card">
            {attachments.some((item) => item.kind === 'image') && (
              <QualityChoices
                label="جودة الصورة"
                original={attachments.find((item) => item.kind === 'image')?.size ?? 0}
                expected={expectedImageSize(imageQuality)}
                maximum
                value={imageQuality}
                options={[
                  { id: 'saver', label: 'توفير البيانات' },
                  { id: 'medium', label: 'متوسطة' },
                  { id: 'original', label: 'عالية' },
                ]}
                onChange={setImageQuality}
              />
            )}
            {attachments.some((item) => item.kind === 'video') && !isServerId(conversationId) && (
              <QualityChoices
                label="جودة الفيديو"
                original={attachments.find((item) => item.kind === 'video')?.size ?? 0}
                expected={expectedVideoSize(videoQuality)}
                value={videoQuality}
                options={[
                  { id: '480', label: '480p' },
                  { id: '720', label: '720p' },
                  { id: 'original', label: 'الأصلية' },
                ]}
                onChange={setVideoQuality}
              />
            )}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="attach-strip">
            {attachments.map((item) => (
              <div key={item.id} className="attach-thumb">
                {item.displayUrl && item.kind === 'image' ? (
                  <img src={item.displayUrl} alt="" loading="lazy" decoding="async" />
                ) : item.previewUrl && item.kind === 'video' ? (
                  <video src={item.previewUrl} muted playsInline preload="metadata" />
                ) : (
                  <span className="attach-file">
                    <IonIcon icon={documentOutline} />
                    <em>{item.name}</em>
                  </span>
                )}
                <button type="button" className="attach-remove" aria-label="إزالة" onClick={() => removeAttachment(item.id)}>
                  <IonIcon icon={closeOutline} />
                </button>
                <span className="attach-size">{formatBytes(item.size)}</span>
              </div>
            ))}
          </div>
        )}
        {matches.length > 0 && (
          <div className="mention-list" role="listbox">
            {matches.map((user, index) => (
              <button
                key={user.id}
                type="button"
                className={index === activeMatch ? 'is-on' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(user)}
              >
                <Avatar name={user.displayName} color={user.color} size={32} src={user.avatarUrl} />
                <span>
                  <strong dir="auto">@{user.username}</strong>
                  <em>{user.id === EVERYONE_HANDLE ? 'إشعار للجميع' : user.displayName}</em>
                </span>
              </button>
            ))}
          </div>
        )}
        {emojiOpen && <EmojiPanel onPick={insertEmoji} onClose={() => { setEmojiOpen(false); fieldRef.current?.focus(); }} />}
        <div className="composer-bar">
          <div className="composer-field">
            <button
              type="button"
              className={emojiOpen ? 'composer-icon is-on' : 'composer-icon'}
              aria-label="إيموجي"
              aria-expanded={emojiOpen}
              onClick={() => {
                setMenuOpen(false);
                if (!emojiOpen) {
                  fieldRef.current?.blur();
                  if (Capacitor.isNativePlatform()) void Keyboard.hide();
                }
                setEmojiOpen((open) => !open);
              }}
            >
              <IonIcon icon={happyOutline} />
            </button>
            <textarea
              ref={fieldRef}
              className="composer-input"
              rows={1}
              dir="auto"
              value={draft}
              placeholder="اكتب رسالة"
              enterKeyHint="send"
              onChange={(event) => {
                setDraft(event.target.value);
                setCursor(event.target.selectionStart ?? event.target.value.length);
                setMentionIndex(0);
                resizeField();
              }}
              onFocus={() => setEmojiOpen(false)}
              onSelect={(event) => setCursor(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={(event) => {
                if (matches.length > 0 && event.key === 'ArrowDown') {
                  event.preventDefault();
                  setMentionIndex((index) => (index + 1) % matches.length);
                  return;
                }
                if (matches.length > 0 && event.key === 'ArrowUp') {
                  event.preventDefault();
                  setMentionIndex((index) => (index - 1 + matches.length) % matches.length);
                  return;
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <button
              type="button"
              className={menuOpen ? 'composer-icon open' : 'composer-icon'}
              aria-label={menuOpen ? 'إغلاق' : 'مرفق'}
              aria-expanded={menuOpen}
              disabled={Boolean(editing)}
              onClick={() => {
                setEmojiOpen(false);
                setMenuOpen((open) => !open);
              }}
            >
              <IonIcon icon={menuOpen ? closeOutline : attachOutline} />
            </button>
            {!editing && !draft.trim() && attachments.length === 0 && (
              <button
                type="button"
                className="composer-icon"
                aria-label="الكاميرا"
                onClick={() => {
                  setMenuOpen(false);
                  setEmojiOpen(false);
                  void openCamera();
                }}
              >
                <IonIcon icon={cameraOutline} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className={editing ? 'composer-send is-edit' : 'composer-send'}
            disabled={!canSend}
            aria-label={editing ? 'حفظ' : 'إرسال'}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={(event) => event.preventDefault()}
          >
            <IonIcon icon={editing ? checkmark : send} />
          </button>
        </div>
      </form>
      {accessAsk && (
        <PermissionDialog
          title={ACCESS_COPY[accessAsk].title}
          body={ACCESS_COPY[accessAsk].body}
          allowLabel="السماح"
          onAllow={allowAccess}
          onLater={() => setAccessAsk(null)}
        />
      )}
      <input
        ref={mediaRef}
        className="picker-input"
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(event) => addFiles(event.target.files)}
      />
      <input
        ref={fileRef}
        className="picker-input"
        type="file"
        multiple
        onChange={(event) => addFiles(event.target.files)}
      />
      <input
        ref={folderRef}
        className="picker-input"
        type="file"
        multiple
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(event) => addFiles(event.target.files)}
      />
    </>
  );
}

function QualityChoices<T extends string>({
  label,
  original,
  expected,
  maximum = false,
  value,
  options,
  onChange,
}: {
  label: string;
  original: number;
  expected: number;
  maximum?: boolean;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="quality-block">
      <strong>{label}</strong>
      <p>الحجم الأصلي: {formatBytes(original)}</p>
      <p>بعد الضغط: {maximum ? 'بحد أقصى' : 'حوالي'} {formatBytes(expected)}</p>
      <div className="setting-choices" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            className={value === option.id ? 'is-on' : undefined}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
