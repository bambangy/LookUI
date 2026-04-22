function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function fromB64(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function randomIv() {
  return crypto.getRandomValues(new Uint8Array(12));
}

function bytesToB64(bytes) {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function b64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(secret, salt) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Create a secure localStorage helper with optional encryption.
 * @param {Object} [opts={}]
 * @returns {{ set: Function, get: Function, remove: Function, has: Function, clear: Function, keys: Function }}
 */
export function lkStorage(opts = {}) {
  const options = {
    namespace: 'look',
    secret: '',
    encrypted: true,
    useSession: false,
    ...opts,
  };

  const store = options.useSession ? window.sessionStorage : window.localStorage;
  const hasCrypto = typeof crypto !== 'undefined' && !!crypto.subtle;
  const canEncrypt = Boolean(options.secret) && options.encrypted && hasCrypto;

  function getKey(key) {
    return `${options.namespace}:${key}`;
  }

  async function encode(value) {
    const raw = JSON.stringify(value);

    if (!canEncrypt) {
      return `plain:${toB64(raw)}`;
    }

    const iv = randomIv();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(options.secret, salt);
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(raw),
    );

    return `enc:${bytesToB64(salt)}:${bytesToB64(iv)}:${bytesToB64(new Uint8Array(cipher))}`;
  }

  async function decode(payload) {
    if (!payload) return null;

    if (payload.startsWith('plain:')) {
      const raw = fromB64(payload.slice(6));
      return JSON.parse(raw);
    }

    if (!payload.startsWith('enc:')) {
      throw new Error('Look.lkStorage: invalid payload format.');
    }

    if (!canEncrypt) {
      throw new Error('Look.lkStorage: cannot decrypt without a secret.');
    }

    const [, saltB64, ivB64, dataB64] = payload.split(':');
    const salt = b64ToBytes(saltB64);
    const iv = b64ToBytes(ivB64);
    const data = b64ToBytes(dataB64);
    const key = await deriveKey(options.secret, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);

    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function set(key, value) {
    const encoded = await encode(value);
    store.setItem(getKey(key), encoded);
    return value;
  }

  async function get(key, fallback = null) {
    const payload = store.getItem(getKey(key));
    if (payload == null) return fallback;

    try {
      const value = await decode(payload);
      return value ?? fallback;
    } catch (err) {
      return fallback;
    }
  }

  function remove(key) {
    store.removeItem(getKey(key));
  }

  function has(key) {
    return store.getItem(getKey(key)) != null;
  }

  function clear() {
    const prefix = `${options.namespace}:`;
    const allKeys = Object.keys(store);
    allKeys.forEach((k) => {
      if (k.startsWith(prefix)) {
        store.removeItem(k);
      }
    });
  }

  function keys() {
    const prefix = `${options.namespace}:`;
    return Object.keys(store)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }

  return {
    set,
    get,
    remove,
    has,
    clear,
    keys,
  };
}

