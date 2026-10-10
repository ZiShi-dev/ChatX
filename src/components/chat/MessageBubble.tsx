import MediaViewer from './MediaViewer';
import './MessageMedia.css';
import './MentionGesture.css';
import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon, IonModal } from '@ionic/react';
import { alertCircleOutline, arrowUndoOutline, arrowUpOutline, atOutline, banOutline, bookmark, bookmarkOutline, checkmarkDoneOutline, checkmarkOutline, closeOutline, copyOutline, createOutline, documentOutline, downloadOutline, informationCircleOutline, peopleOutline, play, timeOutline, trashOutline } from 'ionicons/icons';
import Avatar from '../common/Avatar';
import EmojiText from '../common/EmojiText';
import { conversationTitle, formatMessageTime, formatNotificationTime } from '../../lib/conversation';
import { isServerId } from '../../lib/home';
import { toSavedEntry } from '../../lib/saved';
import { previewImage, textParts, siteHost } from '../../lib/link';
import { isSafeExternalUrl } from '../../lib/url';
import { useDataSaver } from '../../hooks/useDataSaver';
import { formatBytes, formatDuration, messagePreview } from '../../lib/media';
import { mentionPieces, mentionTone } from '../../lib/mention';
import EmojiPanel from './EmojiPanel';
import { groupReactions, QUICK_REACTIONS } from '../../lib/reactions';
import type { ReceiptRow } from '../../lib/readReceipts';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useNetworkStore } from '../../stores/networkStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSavedStore } from '../../stores/savedStore';
import { useUserStore } from '../../stores/userStore';
import type { Message } from '../../types/message';
import type { User } from '../../types/user';

const NO_SEEN_USERS: User[] = [];
const NO_RECEIPTS: ReceiptRow[] = [];

type MessageBubbleProps = {
  message: Message;
  mine: boolean;
  showAuthor: boolean;
  group?: boolean;
  direct?: boolean;
  directSeen?: boolean;
  groupSeen?: boolean;
  seenHere?: User[];
  receiptRows?: ReceiptRow[];
  author?: User;
  spotlight?: boolean;
  onOpenProfile?: (user: User) => void;
};

function StatusMark({ message, seen }: { message: Message; seen?: boolean }) {
  if (!message || message.status === 'sent') {
    return (
      <span className={seen ? 'status-mark seen' : 'status-mark'} aria-label={seen ? 'شوهدت' : 'تم الإرسال'}>
        <IonIcon icon={seen ? checkmarkDoneOutline : checkmarkOutline} />
      </span>
    );
  }
  if (message.status === 'pending') {
    return (
      <span className="status-mark" aria-label="في انتظار الإرسال">
        <IonIcon icon={timeOutline} /> في انتظار الإرسال
      </span>
    );
  }
  if (message.status === 'sending') {
    return (
      <span className="status-mark" aria-label="جارٍ الإرسال">
        <IonIcon icon={arrowUpOutline} />
        {typeof message.uploadProgress === 'number' ? ` ${message.uploadProgress}%` : ' جارٍ الإرسال'}
      </span>
    );
  }
  return (
    <span className="status-mark failed" aria-label="فشل الإرسال">
      <IonIcon icon={alertCircleOutline} />
    </span>
  );
}

function LoadRing({ progress }: { progress: number }) {
  const shown = Math.min(100, Math.max(0, Math.round(progress)));
  const radius = 20;
  const length = 2 * Math.PI * radius;
  const offset = length * (1 - shown / 100);
  return (
    <span className="media-ring" aria-label={`${shown}%`}>
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle className="track" cx="26" cy="26" r={radius} />
        <circle
          className="value"
          cx="26"
          cy="26"
          r={radius}
          strokeDasharray={length}
          strokeDashoffset={offset}
        />
      </svg>
      <strong dir="ltr">{shown}%</strong>
    </span>
  );
}

function MediaBlock({ message }: { message: Message }) {
  const downloadMedia = useChatStore((state) => state.downloadMedia);
  const dataSaver = useDataSaver();
  const autoImages = useSettingsStore((state) => state.autoDownloadImages);
  const autoVideos = useSettingsStore((state) => state.autoDownloadVideos);
  const [open, setOpen] = useState(false);
  const media = message.media;

  useEffect(() => {
    if (!media || media.state !== 'remote' || message.downloadFailed) return;
    if (dataSaver) return;
    if (message.type === 'image' && autoImages) downloadMedia(message.id);
    if (message.type === 'video' && autoVideos) downloadMedia(message.id);
  }, [autoImages, autoVideos, dataSaver, downloadMedia, media, message.downloadFailed, message.id, message.type]);
  if (!media) return null;
  const ready = media.state === 'cached';
  const progress = message.downloadProgress ?? message.uploadProgress;
  const busy = typeof progress === 'number';
  const poster = media.localPreviewUrl;
  const playable = ready && message.type === 'video' && poster && !poster.endsWith('.svg') && !poster.startsWith('data:image/');
  const ratio = media.width && media.height ? `${media.width} / ${media.height}` : undefined;
  const layout = () => {
    window.dispatchEvent(new CustomEvent('chatx-thread-layout', { detail: { conversationId: message.conversationId } }));
  };

  return (
    <>
      <div className={`media-card ${message.type}`}>
        <button
          type="button"
          className="media-open"
          aria-label={ready ? (message.type === 'video' ? 'تشغيل' : 'عرض') : 'تحميل'}
          onClick={() => (ready ? setOpen(true) : downloadMedia(message.id))}
        >
          {playable ? <video className="media-preview" src={poster} muted playsInline preload="metadata" onLoadedData={layout} style={ratio ? { aspectRatio: ratio } : undefined} /> : poster ? (
            <img className={ready ? 'media-preview' : 'media-preview is-held'} src={poster} alt="" decoding="async" loading="lazy" onLoad={layout} style={ratio ? { aspectRatio: ratio } : undefined} />
          ) : (
            <span className="media-placeholder" style={ratio ? { aspectRatio: ratio } : undefined} />
          )}
          {(!ready || busy) && (
            <span className="media-fetch">
              {busy ? (
                <LoadRing progress={progress ?? 0} />
              ) : (
                <IonIcon icon={downloadOutline} />
              )}
              {!busy && <small dir="ltr">{formatBytes(media.fileSize)}</small>}
              {busy && media.fileSize > 0 && (progress ?? 0) < 100 && (
                <small className="media-left" dir="ltr">{formatBytes(Math.max(0, media.fileSize * (1 - (progress ?? 0) / 100)))}</small>
              )}
            </span>
          )}
          {message.type === 'video' && ready && !busy && (
            <span className="media-play"><IonIcon icon={play} /></span>
          )}
          {message.type === 'video' && <span className="media-duration">{formatDuration(media.duration ?? 0)}</span>}
        </button>
        {message.downloadFailed && media.state !== 'cached' && !busy && (
          <p className="media-error">
            تعذر تنزيل الملف
            <button type="button" onClick={() => downloadMedia(message.id)}>إعادة المحاولة</button>
          </p>
        )}
      </div>
      {open && <MediaViewer messageId={message.id} conversationId={message.conversationId} onClose={() => setOpen(false)} />}
    </>
  );
}

const NO_DIRECTORY: User[] = [];

function MessageText({ text, username, onOpenProfile }: { text: string; username: string; onOpenProfile?: (user: User) => void }) {
  const users = useUserStore((state) => (text.includes('@') ? state.users : NO_DIRECTORY));
  return (
    <p className="bubble-text">
      {textParts(text).map((part, index) => {
        const candidate = /^https?:\/\//.test(part) ? part.replace(/[),.;!?]+$/, '') : '';
        const url = candidate && isSafeExternalUrl(candidate) ? candidate : '';
        if (url) {
          const tail = part.slice(url.length);
          return (
            <span key={index}>
              <a className="bubble-url" href={url} dir="ltr" target="_blank" rel="noreferrer">{url}</a>
              {tail}
            </span>
          );
        }
        const names = [...users.map((user) => user.username), 'everyone'];
        return mentionPieces(part, names).map((piece, pieceIndex) => {
          if (!piece.handle) return <span key={`${index}-${pieceIndex}`}><EmojiText text={piece.text} /></span>;
          const handle = piece.handle;
          const person = users.find((user) => user.username.toLowerCase() === handle);
          const tone = handle === 'everyone' ? 'is-everyone' : handle === username.toLowerCase() ? 'is-direct' : '';
          if (person && onOpenProfile) {
            return (
              <button
                key={`${index}-${pieceIndex}`}
                type="button"
                className={tone ? `bubble-mention ${tone}` : 'bubble-mention'}
                dir="auto"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenProfile(person);
                }}
              >
                {piece.text}
              </button>
            );
          }
          return <span key={`${index}-${pieceIndex}`} className={tone ? `bubble-mention ${tone}` : 'bubble-mention'} dir="auto">{piece.text}</span>;
        });
      })}
    </p>
  );
}

function LinkBlock({ message }: { message: Message }) {
  const loadLinkPreview = useChatStore((state) => state.loadLinkPreview);
  const network = useNetworkStore((state) => state.network);
  const dataSaver = useDataSaver();
  const [imageFailed, setImageFailed] = useState(false);
  const link = message.link;
  useEffect(() => {
    if (dataSaver || link?.preview !== 'notLoaded' || network === 'offline') return;
    loadLinkPreview(message.id);
  }, [dataSaver, link?.preview, loadLinkPreview, message.id, network]);
  if (!link) return null;
  const host = siteHost(link.url);
  const image = imageFailed ? '' : (link.image || previewImage(link.url));
  if (link.preview !== 'loaded') {
    if (dataSaver) {
      return (
        <button type="button" className="wa-preview link-hold" onClick={() => loadLinkPreview(message.id)}>
          <span className="wa-copy">
            <span className="wa-host" dir="ltr">{host}</span>
            <strong>تحميل المعاينة</strong>
          </span>
        </button>
      );
    }
    return (
      <div className="wa-preview loading" aria-hidden="true">
        {image && <span className="wa-image pending" />}
        <span className="wa-copy">
          <span className="wa-line" />
          <span className="wa-line short" />
        </span>
      </div>
    );
  }
  if (!isSafeExternalUrl(link.url)) {
    return (
      <div className="wa-preview">
        <span className="wa-copy">
          <strong>{link.title || host}</strong>
        </span>
      </div>
    );
  }
  return (
    <a className="wa-preview" href={link.url} target="_blank" rel="noreferrer">
      {image && !dataSaver && <img className="wa-image" src={image} alt="" onError={() => setImageFailed(true)} />}
      <span className="wa-copy">
        <span className="wa-host">{host}</span>
        <strong>{link.title || host}</strong>
        {link.description && <em>{link.description}</em>}
      </span>
    </a>
  );
}

function AimMark({ tone }: { tone: 'reply' | 'direct' | 'everyone' }) {
  const icon = tone === 'reply' ? arrowUndoOutline : tone === 'everyone' ? peopleOutline : atOutline;
  const label = tone === 'reply' ? 'رد على رسالتك' : tone === 'direct' ? 'موجّه إليك' : 'للجميع';
  return (
    <p className={`aim-mark ${tone}`}>
      <IonIcon icon={icon} />
      <span>{label}</span>
    </p>
  );
}

function ReplyQuote({ messageId }: { messageId: string }) {
  const quote = useChatStore((state) => {
    const target = state.messages.find((item) => item.id === messageId);
    if (!target) return '';
    const raw = target.deletedForEveryone ? 'تم حذف هذه الرسالة' : messagePreview(target);
    return `${target.senderId}\n${raw.replace(/\s+/g, ' ').trim()}`;
  });
  const split = quote.indexOf('\n');
  const senderId = split < 0 ? '' : quote.slice(0, split);
  const preview = split < 0 ? 'تم حذف هذه الرسالة' : quote.slice(split + 1);
  const authorName = useUserStore((state) => (
    senderId ? state.users.find((user) => user.id === senderId)?.displayName ?? 'عضو' : 'عضو'
  ));
  const [missing, setMissing] = useState(false);

  const jump = () => {
    const node = document.getElementById(`msg-${messageId}`);
    if (!node) {
      setMissing(true);
      window.setTimeout(() => setMissing(false), 2200);
      return;
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('is-target');
    window.setTimeout(() => node.classList.remove('is-target'), 1400);
  };

  return (
    <span className="reply-wrap">
      <button type="button" className="reply-ref" onClick={jump} onPointerDown={(event) => event.stopPropagation()}>
        <strong>{authorName}</strong>
        <em><EmojiText text={preview} /></em>
      </button>
      {missing && <span className="reply-missing" role="status">الرسالة الأصلية أقدم من الرسائل المحملة</span>}
    </span>
  );
}

function PersonButton({ user, onOpen }: { user: User; onOpen?: (user: User) => void }) {
  const avatar = <Avatar name={user.displayName} color={user.color} size={32} src={user.avatarUrl} />;
  if (!onOpen) return avatar;
  return (
    <button
      type="button"
      className="bubble-person"
      aria-label={user.displayName}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(user);
      }}
    >
      {avatar}
    </button>
  );
}

function PersonName({ user, onOpen }: { user: User; onOpen?: (user: User) => void }) {
  if (!onOpen) return <p className="bubble-author">{user.displayName}</p>;
  return (
    <button
      type="button"
      className="bubble-author"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(user);
      }}
    >
      {user.displayName}
    </button>
  );
}

function MessageBubble({ message, mine, showAuthor, group = false, direct = false, directSeen = false, groupSeen = false, seenHere = NO_SEEN_USERS, receiptRows = NO_RECEIPTS, author, spotlight = false, onOpenProfile }: MessageBubbleProps) {
  const currentUserId = useAuthStore((state) => state.currentUser.id);
  const username = useAuthStore((state) => state.currentUser.username);
  const replyToMe = useChatStore((state) => {
    if (!message.replyToId || message.senderId === currentUserId) return false;
    const parent = state.messages.find((item) => item.id === message.replyToId);
    return Boolean(parent && parent.senderId === currentUserId);
  });
  const tone = replyToMe ? 'reply' : message.text ? mentionTone(message.text, username) : null;
  const downloadMedia = useChatStore((state) => state.downloadMedia);
  const retryMessage = useChatStore((state) => state.retryMessage);
  const cancelMessage = useChatStore((state) => state.cancelMessage);
  const beginEdit = useChatStore((state) => state.beginEdit);
  const beginReply = useChatStore((state) => state.beginReply);
  const deleteForEveryone = useChatStore((state) => state.deleteForEveryone);
  const toggleReaction = useChatStore((state) => state.toggleReaction);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const users = useUserStore((state) => (reactionsOpen ? state.users : NO_DIRECTORY));
  const saved = useSavedStore((state) => state.entries.some((item) => item.userId === currentUserId && item.messageId === message.id));
  const toggleSaved = useSavedStore((state) => state.toggle);
  const mediaSending = (message.type === 'image' || message.type === 'video' || message.type === 'file') && (message.status === 'sending' || message.status === 'pending');
  const [infoOpen, setInfoOpen] = useState(false);
  const [seenOpen, setSeenOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const lastTap = useRef(0);
  const suppressClick = useRef(false);
  const bornSending = useRef(mine && (message.status === 'pending' || message.status === 'sending'));
  const stackRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  const swipeIconRef = useRef<HTMLSpanElement>(null);
  const drag = useRef({ x: 0, y: 0, pointerId: -1, active: false, locked: false });
  const failed = mine && message.status === 'failed';
  const canEdit = mine && !message.deletedForEveryone && (message.type === 'text' || message.type === 'link');
  const canReply = !message.deletedForEveryone;
  const canManage = mine && !message.deletedForEveryone;
  const canOpenMenu = canReply;
  const canSeeReceipts = Boolean((group || direct) && mine && message.status === 'sent' && !message.deletedForEveryone);
  const seenRows = receiptRows.filter((row) => row.seen);
  const seenCount = seenRows.length;

  const clearHold = () => window.clearTimeout(holdTimer.current);

  const paintSwipe = (progress: number, dragging: boolean) => {
    const shift = Math.min(92, Math.max(0, progress));
    const rtl = document.documentElement.dir === 'rtl';
    if (shiftRef.current) {
      shiftRef.current.style.transition = dragging ? 'none' : 'transform 180ms ease';
      shiftRef.current.style.transform = `translateX(${rtl ? -shift : shift}px)`;
    }
    if (swipeIconRef.current) {
      const amount = Math.min(1, shift / 64);
      swipeIconRef.current.style.opacity = String(amount);
      swipeIconRef.current.style.transform = `translateY(-50%) scale(${0.55 + amount * 0.45})`;
      swipeIconRef.current.classList.toggle('is-armed', shift >= 64);
    }
  };

  const openMenu = () => {
    if (!canOpenMenu) return;
    suppressClick.current = true;
    setMoreOpen(false);
    setMenuOpen(true);
  };

  const reactWith = (emoji: string) => {
    toggleReaction(message.id, emoji);
    setMenuOpen(false);
    setMoreOpen(false);
  };

  const mineEmoji = message.reactions?.find((item) => item.userId === currentUserId)?.emoji;
  const reactionGroups = groupReactions(message.reactions);
  const reactionTotal = message.reactions?.length ?? 0;

  const copyMessage = () => {
    if (message.text) void navigator.clipboard?.writeText(message.text);
    setMenuOpen(false);
  };

  const keepMessage = () => {
    const conversation = useChatStore.getState().conversations.find((item) => item.id === message.conversationId);
    const directory = useUserStore.getState().users;
    if (!conversation) return;
    const senderName = author?.displayName ?? directory.find((user) => user.id === message.senderId)?.displayName ?? 'عضو';
    const entry = toSavedEntry(message, currentUserId, conversationTitle(conversation, currentUserId, directory), senderName);
    if (entry) toggleSaved(entry);
    setMenuOpen(false);
  };

  const menu = menuOpen
    ? createPortal(
        <div className="app-scrim sheet" onClick={() => setMenuOpen(false)}>
          <div className="app-sheet" role="menu" onClick={(event) => event.stopPropagation()}>
            <span className="app-handle" />
            <div className="reaction-bar" role="group" aria-label="تفاعل">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={mineEmoji === emoji ? 'is-on' : undefined}
                  aria-label={emoji}
                  aria-pressed={mineEmoji === emoji}
                  onClick={() => reactWith(emoji)}
                >
                  <EmojiText text={emoji} />
                </button>
              ))}
              <button type="button" className="reaction-more-toggle" aria-label="المزيد" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
                +
              </button>
            </div>
            {moreOpen && <EmojiPanel selected={mineEmoji} onPick={reactWith} />}
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); beginReply(message.id); }}>
              <span>رد</span>
              <IonIcon icon={arrowUndoOutline} />
            </button>
            <button type="button" role="menuitem" onClick={keepMessage}>
              <span>{saved ? 'إلغاء الحفظ' : 'حفظ'}</span>
              <IonIcon icon={saved ? bookmark : bookmarkOutline} />
            </button>
            {canEdit && (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); beginEdit(message.id); }}>
                <span>تعديل</span>
                <IonIcon icon={createOutline} />
              </button>
            )}
            {message.text && (
              <button type="button" role="menuitem" onClick={copyMessage}>
                <span>نسخ</span>
                <IonIcon icon={copyOutline} />
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setInfoOpen(true); }}>
              <span>معلومات</span>
              <IonIcon icon={informationCircleOutline} />
            </button>
            {failed && (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); retryMessage(message.id); }}>
                <span>إعادة المحاولة</span>
                <IonIcon icon={arrowUpOutline} />
              </button>
            )}
            {mine && (message.status === 'pending' || message.status === 'sending') && (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); cancelMessage(message.id); }}>
                <span>إلغاء</span>
                <IonIcon icon={closeOutline} />
              </button>
            )}
            {canManage && (
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                <span>حذف</span>
                <IonIcon icon={trashOutline} />
              </button>
            )}
            {canSeeReceipts && seenCount > 0 && (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setSeenOpen(true); }}>
                <span>المشاهدات</span>
                <IonIcon icon={checkmarkDoneOutline} />
              </button>
            )}
            <button type="button" className="cancel" onClick={() => setMenuOpen(false)}>إلغاء</button>
          </div>
        </div>,
        document.body,
      )
    : null;

  const receipts = seenOpen && seenCount > 0
    ? createPortal(
        <div className="app-scrim sheet" onClick={() => setSeenOpen(false)}>
          <div className="app-sheet seen-sheet" role="dialog" aria-labelledby={`seen-title-${message.id}`} onClick={(event) => event.stopPropagation()}>
            <span className="app-handle" />
            <h2 id={`seen-title-${message.id}`}>المشاهدات</h2>
            <p>{`شاهدها ${seenCount}`}</p>
            <ul>
              {seenRows.map((row) => (
                <li key={row.user.id}>
                  <Avatar name={row.user.displayName} color={row.user.color} size={36} src={row.user.avatarUrl} />
                  <div>
                    <strong>{row.user.displayName}</strong>
                    <span className="is-on">{row.seenAt ? `شاهد ${formatNotificationTime(row.seenAt)}` : 'شاهد'}</span>
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className="cancel" onClick={() => setSeenOpen(false)}>إغلاق</button>
          </div>
        </div>,
        document.body,
      )
    : null;

  const confirm = confirmDelete
    ? createPortal(
        <div className="wa-scrim center" onClick={() => setConfirmDelete(false)}>
          <div className="account-dialog" role="alertdialog" aria-labelledby={`delete-title-${message.id}`} onClick={(event) => event.stopPropagation()}>
            <h2 id={`delete-title-${message.id}`}>حذف الرسالة؟</h2>
            <p className="account-warn">ستختفي هذه الرسالة عند الجميع.</p>
            <div className="account-actions">
              <button type="button" onClick={() => setConfirmDelete(false)}>إلغاء</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  deleteForEveryone(message.id);
                  setConfirmDelete(false);
                }}
              >
                حذف
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  if (message.deletedForEveryone) {
    return (
      <div id={`msg-${message.id}`} className={`bubble-stack ${mine ? 'mine' : 'theirs'}`}>
        <div className="bubble-row">
          {showAuthor && !mine && author && <PersonButton user={author} onOpen={onOpenProfile} />}
          <div className="bubble deleted">
            {message.replyToId && <ReplyQuote messageId={message.replyToId} />}
            {showAuthor && !mine && author && <PersonName user={author} onOpen={onOpenProfile} />}
            <p className="deleted-line">
              <IonIcon icon={banOutline} />
              <span>{mine ? 'لقد حذفت هذه الرسالة' : 'تم حذف هذه الرسالة'}</span>
            </p>
            <span className="bubble-time">{formatMessageTime(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={stackRef}
      id={`msg-${message.id}`}
      className={`bubble-stack ${mine ? 'mine' : 'theirs'}${menuOpen ? ' is-picked' : ''}${direct && canSeeReceipts ? ' is-receipt' : ''}${spotlight ? ' is-target' : ''}${reactionTotal > 0 ? ' has-reactions' : ''}${bornSending.current ? ' is-new' : ''}`}
      onContextMenu={(event) => {
        if (!canOpenMenu) return;
        event.preventDefault();
        openMenu();
      }}
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (!canReply || event.button !== 0 || !(target instanceof Element) || !target.closest('.bubble-mention, .reply-ref')) return;
        // Start on interactive references before their handlers consume the event.
        event.stopPropagation();
        clearHold();
        suppressClick.current = false;
        drag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, active: true, locked: false };
        holdTimer.current = window.setTimeout(openMenu, 480);
      }}
      onPointerDown={(event) => {
        if (!canReply || event.button !== 0) return;
        suppressClick.current = false;
        drag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, active: true, locked: false };
        holdTimer.current = window.setTimeout(openMenu, 480);
      }}
      onPointerMove={(event) => {
        if (!drag.current.active || event.pointerId !== drag.current.pointerId) return;
        const dx = event.clientX - drag.current.x;
        const dy = event.clientY - drag.current.y;
        const rtl = document.documentElement.dir === 'rtl';
        const progress = rtl ? -dx : dx;
        if (!drag.current.locked) {
          if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
            clearHold();
            drag.current.active = false;
            return;
          }
          if (progress < 10) return;
          drag.current.locked = true;
          clearHold();
          try {
            stackRef.current?.setPointerCapture(event.pointerId);
          } catch {
            /* le pointeur peut déjà être relâché */
          }
        }
        paintSwipe(progress, true);
      }}
      onPointerUp={(event) => {
        clearHold();
        if (!drag.current.active || event.pointerId !== drag.current.pointerId) return;
        const dx = event.clientX - drag.current.x;
        const rtl = document.documentElement.dir === 'rtl';
        const progress = rtl ? -dx : dx;
        const reply = drag.current.locked && progress >= 64;
        const moved = Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y);
        const now = Date.now();
        const doubleTap = !drag.current.locked && moved < 12 && now - lastTap.current < 280;
        if (drag.current.locked) suppressClick.current = true;
        drag.current.active = false;
        drag.current.locked = false;
        paintSwipe(0, false);
        if (reply) beginReply(message.id);
        else if (doubleTap) {
          lastTap.current = 0;
          suppressClick.current = true;
          toggleReaction(message.id, '❤️');
        } else if (moved < 12) {
          lastTap.current = now;
        }
      }}
      onPointerCancel={() => {
        clearHold();
        drag.current.active = false;
        drag.current.locked = false;
        paintSwipe(0, false);
      }}
      onPointerLeave={() => {
        if (!drag.current.locked) clearHold();
      }}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
      onClick={(event) => {
        if (!direct || !canSeeReceipts) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest('a, button')) return;
        setSeenOpen(true);
      }}
    >
      <span ref={swipeIconRef} className="swipe-reply" aria-hidden="true">
        <IonIcon icon={arrowUndoOutline} />
      </span>
      <div ref={shiftRef} className="swipe-shift">
      <div className="bubble-row">
      {failed && (
        <button type="button" className="retry-mark" aria-label="إعادة المحاولة" onClick={() => retryMessage(message.id)}>
          <IonIcon icon={alertCircleOutline} />
        </button>
      )}
      {showAuthor && !mine && author && <PersonButton user={author} onOpen={onOpenProfile} />}
      <div className={['bubble', tone ? `is-${tone}` : '', message.link ? 'has-link' : '', message.type === 'image' || message.type === 'video' ? 'has-media' : '', mediaSending ? 'is-sending' : ''].filter(Boolean).join(' ')}>
        {tone && tone !== 'reply' && <AimMark tone={tone} />}
        {showAuthor && !mine && author && <PersonName user={author} onOpen={onOpenProfile} />}
        {message.replyToId && <ReplyQuote messageId={message.replyToId} />}
        {message.link && <LinkBlock message={message} />}
        {message.type === 'text' && message.text && <MessageText text={message.text} username={username} onOpenProfile={onOpenProfile} />}
        {message.type === 'link' && <MessageText text={message.text || message.link?.url || ''} username={username} onOpenProfile={onOpenProfile} />}
        {(message.type === 'image' || message.type === 'video') && <MediaBlock message={message} />}
        {message.type === 'file' && message.media && (
          <button
            type="button"
            className="file-card"
            onClick={() => {
              const media = message.media;
              if (!media) return;
              if (media.state === 'cached' && media.localPreviewUrl) {
                const link = document.createElement('a');
                link.href = media.localPreviewUrl;
                link.download = media.fileName || 'fichier';
                link.rel = 'noopener';
                link.click();
                return;
              }
              downloadMedia(message.id);
            }}
          >
            <IonIcon icon={documentOutline} />
            <div>
              <strong dir="auto">{message.media.fileName}</strong>
              <span>{formatBytes(message.media.fileSize)}</span>
            </div>
          </button>
        )}
        {message.type === 'file' && message.downloadFailed && (
          <p className="media-error">تعذر تنزيل الملف</p>
        )}
        <span className="bubble-time">
          {saved && (
            <IonIcon className="saved-mark" icon={bookmark} aria-label="محفوظة" />
          )}
          {message.editedAt && <span className="edited-mark">تم التعديل</span>}
          {formatMessageTime(message.createdAt)}
          {mine && !failed && <StatusMark message={message} seen={canSeeReceipts && ((direct && directSeen) || (group && groupSeen))} />}
          {mine && mediaSending && (
            <button type="button" className="media-cancel" onClick={() => cancelMessage(message.id)}>
              إلغاء
            </button>
          )}
        </span>
        {reactionTotal > 0 && (
          <button
            type="button"
            className={mineEmoji ? 'reaction-pill is-mine' : 'reaction-pill'}
            aria-label={`${reactionTotal} تفاعل`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setReactionsOpen(true);
            }}
          >
            {reactionGroups.map((group) => (
              <span key={group.emoji}><EmojiText text={group.emoji} /></span>
            ))}
            {reactionTotal > 1 && <small>{reactionTotal}</small>}
          </button>
        )}
      </div>
      </div>
      {failed && (
        <button type="button" className="retry-caption" onClick={() => retryMessage(message.id)}>
          فشل الإرسال · إعادة المحاولة
        </button>
      )}
      {seenHere.length > 0 && (
        <button
          type="button"
          className="seen-faces"
          aria-label={`شاهدها ${seenHere.map((user) => user.displayName).join('، ')}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setSeenOpen(true)}
        >
          {seenHere.slice(0, 3).map((user) => (
            <Avatar key={user.id} name={user.displayName} color={user.color} size={18} src={user.avatarUrl} />
          ))}
          {seenHere.length > 3 && <span className="seen-more">+{seenHere.length - 3}</span>}
        </button>
      )}
      </div>
      {reactionsOpen && createPortal(
        <div className="app-scrim sheet" onClick={() => setReactionsOpen(false)}>
          <div className="app-sheet" role="dialog" aria-label="التفاعلات" onClick={(event) => event.stopPropagation()}>
            <span className="app-handle" />
            <p className="notify-heading">التفاعلات</p>
            <ul className="reaction-people">
              {(message.reactions ?? []).map((item) => {
                const person = users.find((user) => user.id === item.userId);
                const own = item.userId === currentUserId;
                return (
                  <li key={`${item.userId}-${item.emoji}`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!own) return;
                        toggleReaction(message.id, item.emoji);
                        setReactionsOpen(false);
                      }}
                    >
                      <Avatar name={person?.displayName ?? 'عضو'} color={person?.color ?? '#3d9b84'} size={36} src={person?.avatarUrl} />
                      <span>
                        <strong>{own ? 'أنت' : person?.displayName ?? 'عضو'}</strong>
                        {own && <small>اضغط لإزالة التفاعل</small>}
                      </span>
                      <em><EmojiText text={item.emoji} /></em>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="cancel" onClick={() => setReactionsOpen(false)}>إغلاق</button>
          </div>
        </div>,
        document.body,
      )}
      {menu}
      {infoOpen && createPortal(
        <div className="app-scrim sheet" onClick={() => setInfoOpen(false)}>
          <div className="app-sheet" role="dialog" onClick={(event) => event.stopPropagation()}>
            <span className="app-handle" />
            <p className="notify-heading">معلومات الرسالة</p>
            <p className="mute-title">{author?.displayName ?? (mine ? 'أنت' : 'عضو')}</p>
            <p className="group-block-note">{formatMessageTime(message.createdAt)}</p>
            <p>{message.status === 'pending' ? 'في انتظار الإرسال' : message.status === 'sending' ? 'جارٍ الإرسال' : message.status === 'failed' ? 'فشل الإرسال' : 'تم الإرسال'}</p>
            <button type="button" className="cancel" onClick={() => setInfoOpen(false)}>إغلاق</button>
          </div>
        </div>,
        document.body,
      )}
      {receipts}
      {confirm}
    </div>
  );
}

export default memo(MessageBubble);
