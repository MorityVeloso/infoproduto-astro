const VARIANT_KEY = '__ab_variant';
const SID_KEY     = '__sid';
const UTM_KEY     = '__utms';
const UTM_KEYS    = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export function getVariant(): string {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${VARIANT_KEY}=([^;]+)`));
    return m ? m[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

let _fallbackSid: string | null = null;

export function getOrCreateSessionId(): string {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    _fallbackSid ??= crypto.randomUUID();
    return _fallbackSid;
  }
}

export function getUtmParams(): Record<string, string> {
  try {
    const params   = new URLSearchParams(window.location.search);
    const utms: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const val = params.get(key);
      if (val) utms[key] = val;
    }
    if (Object.keys(utms).length > 0) {
      const stored = localStorage.getItem(UTM_KEY);
      const storedUtms = (stored && typeof JSON.parse(stored) === 'object' && !Array.isArray(JSON.parse(stored)))
        ? (JSON.parse(stored) as Record<string, string>)
        : {};
      const merged = { ...storedUtms, ...utms };
      localStorage.setItem(UTM_KEY, JSON.stringify(merged));
      return merged;
    }
    const stored = localStorage.getItem(UTM_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}
