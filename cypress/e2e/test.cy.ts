const user = { id: '11111111-1111-4111-8111-111111111111', username: 'alice', displayName: 'Alice', role: 'member', bio: '', status: 'online', color: '#4d7ea8' };
const roomId = '00000000-0000-4000-8000-000000000001';
const room = { id: roomId, type: 'global', name: 'ChatX', participantIds: [user.id], unreadCount: 0, createdAt: '2026-10-09T12:00:00Z' };
const messages = Array.from({ length: 60 }, (_, index) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`, conversationId: roomId, senderId: user.id, text: `Message ${index + 1}`, type: index === 59 ? 'image' : 'text', fileSize: index === 59 ? 3 : undefined, createdAt: new Date(Date.now() - 60_000).toISOString(), deleted: false }));

function fixtureApi() {
  cy.intercept('/api/**', (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/image')) throw new Error('Data saver must not fetch images automatically');
    if (url.pathname === '/api/home') return request.reply({ conversations: [room], users: [user] });
    if (url.pathname === '/api/profile') return request.reply({ user });
    if (url.pathname.endsWith('/messages') && request.method === 'GET') return request.reply({ messages: url.searchParams.has('beforeId') ? messages.slice(0, 30) : messages.slice(30), readers: [], hasMore: !url.searchParams.has('beforeId') });
    if (url.pathname === '/api/notifications') return request.reply({ notifications: [], unreadCount: 0 });
    if (url.pathname === '/api/saved') return request.reply({ saved: [], hasMore: false });
    if (url.pathname === '/api/presence') return request.reply({ users: [], ok: true });
    return request.reply({ ok: true });
  });
}
function visitChat() {
  fixtureApi();
  cy.visit(`/chat/${roomId}`, { onBeforeLoad(win) {
    Object.defineProperty(win.Notification, 'permission', { configurable: true, get: () => 'granted' });
    win.localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: user, accounts: [user] }));
    win.localStorage.setItem('chatx.settings', JSON.stringify({ dataSaver: true }));
  } });
}

describe('production mobile interface', () => {
  it('renders the signed-out page with registered Ionic components', () => {
    cy.viewport(320, 568); cy.visit('/'); cy.contains('ChatX');
    cy.get('ion-content').should('have.class', 'hydrated');
  });
  it('loads older server pages and leaves images behind the data saver', () => {
    cy.viewport(320, 568); visitChat(); cy.contains('Message 31');
    cy.get('ion-content').should('have.class', 'hydrated');
    cy.contains('تحميل رسائل أقدم').click(); cy.contains('Message 1');
    cy.get('[id^="msg-"]').should('have.length.at.most', 120);
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(320));
  });
  it('keeps an offline text send across a reload', () => {
    cy.viewport(360, 640); visitChat(); cy.get('textarea').should('be.visible');
    cy.window().then((win) => {
      Object.defineProperty(win.navigator, 'onLine', { configurable: true, get: () => false });
      win.dispatchEvent(new Event('offline'));
    });
    cy.get('textarea').type('Offline durable message{enter}');
    cy.window().should((win) => {
      const snapshot = JSON.parse(win.localStorage.getItem(`chatx.chat.v1.${user.id}`) || '{}');
      expect(snapshot.messages.some((item: { text: string; status: string }) => item.text === 'Offline durable message' && item.status === 'pending')).to.equal(true);
    });
    cy.reload(); cy.contains('Offline durable message');
  });
});
