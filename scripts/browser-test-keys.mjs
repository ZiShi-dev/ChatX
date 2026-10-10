/** Configure a synthetic browser account for tests that start after key setup. */
export async function prepareTestIdentity(page, owner, savePublicKey) {
  const publicKey = await page.evaluate(async owner => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const publicKey = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('chatx-keys-v1', 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('keys')) request.result.createObjectStore('keys', { keyPath: 'key' }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').put({ key: `id:${owner}`, privateKey: pair.privateKey, publicKey }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close(); return publicKey;
  }, owner);
  if (savePublicKey) await savePublicKey(publicKey);
  else await page.route('**/api/keys', route => route.fulfill({ json: { publicKey, backup: { salt: 'a'.repeat(22), iv: 'a'.repeat(16), data: 'a'.repeat(32), iterations: 100000 } } }));
  await page.reload();
  const later = page.getByRole('button', { name: 'ليس الآن', exact: true });
  if (await later.count()) await later.click();
}
