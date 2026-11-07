export class LocalCache {
  bucket = '';
  expirySuffix = '__expiry';
  timeUnit = 60 * 1000;

  constructor(bucket = '', timeUnit = 60000, expirySuffix = '__expiry') {
    this.bucket = bucket ? bucket + ':' : '';
    this.expirySuffix = expirySuffix;
    this.timeUnit = timeUnit;
  }

  _prefixedKey(key: string) {
    return this.bucket + key;
  }

  setExpiryUnit(ms: number) {
    this.timeUnit = ms;
  }

  setBucket(bucketName: string) {
    this.bucket = bucketName ? bucketName + ':' : '';
  }

  clearBucket() {
    this.bucket = '';
  }

  set<T>(key: string, value: T, timeInUnits?: number) {
    try {
      const fullKey = this._prefixedKey(key);
      const item = JSON.stringify(value);
      localStorage.setItem(fullKey, item);

      if (timeInUnits != null) {
        const expiry = Date.now() + timeInUnits * this.timeUnit;
        localStorage.setItem(fullKey + this.expirySuffix, expiry.toString());
      }
      return true;
    } catch (err) {
      console.warn('Cache set failed:', err);
      return false;
    }
  }

  get<T>(key: string): T | null {
    const fullKey = this._prefixedKey(key);
    const expiry = localStorage.getItem(fullKey + this.expirySuffix);

    if (expiry && Date.now() > parseInt(expiry, 10)) {
      this.remove(key);
      return null;
    }

    const item = localStorage.getItem(fullKey);
    if (!item) return null;

    try {
      return JSON.parse(item);
    } catch (err) {
      console.warn('Cache JSON parse failed:', err);
      return null;
    }
  }

  remove(key: string) {
    const fullKey = this._prefixedKey(key);
    localStorage.removeItem(fullKey);
    localStorage.removeItem(fullKey + this.expirySuffix);
  }

  flush() {
    const prefix = this.bucket;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
  }
}
