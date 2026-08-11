import { supabase } from './supabase';
const BASE = import.meta.env.VITE_API_BASE_URL !== undefined
  ? import.meta.env.VITE_API_BASE_URL
  : import.meta.env.DEV
  ? 'http://localhost:4000'
  : '';

async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Read as text first so a non-JSON response (e.g. an HTML error page from the
  // server or a proxy) yields a clear message instead of "Unexpected token '<'".
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.status === 413
        ? 'File is too large for the server to accept. Try splitting it into smaller files.'
        : `Server returned a non-JSON response (HTTP ${res.status}). Is the backend running and up to date?`
    );
  }

  if (!res.ok) throw new Error(json.error || `Request failed: ${res.status}`);
  return json;
}

export const api = {
  get:    (path)         => request(path),
  post:   (path, body)   => request(path, { method: 'POST',   body }),
  put:    (path, body)   => request(path, { method: 'PUT',    body }),
  patch:  (path, body)   => request(path, { method: 'PATCH',  body }),
  delete: (path)         => request(path, { method: 'DELETE' }),
};

// ── SKU helpers ───────────────────────────────────────────────────────────────
export const skuApi = {
  list:           (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
    return api.get(`/api/skus${qs ? `?${qs}` : ''}`);
  },
  get:            (id)          => api.get(`/api/skus/${id}`),
  meta:           ()            => api.get('/api/skus/meta'),
  create:         (body)        => api.post('/api/skus', body),
  update:         (id, body)    => api.put(`/api/skus/${id}`, body),
  archive:        (id)          => api.patch(`/api/skus/${id}/archive`, {}),

  checklist:      (id)          => api.get(`/api/skus/${id}/checklist`),
  addCheckItem:   (id, item)    => api.post(`/api/skus/${id}/checklist`, { checklist_item: item }),
  toggleCheckItem:(skuId, itemId, is_complete) =>
                                   api.patch(`/api/skus/${skuId}/checklist/${itemId}`, { is_complete }),
  deleteCheckItem:(skuId, itemId) => api.delete(`/api/skus/${skuId}/checklist/${itemId}`),

  history:        (id)          => api.get(`/api/skus/${id}/history`),
  updateMappings: (id, mappings)=> api.put(`/api/skus/${id}/mappings`, { mappings }),
};

export const platformApi = {
  list: () => api.get('/api/platforms'),
};

export const brandApi = {
  list: () => api.get('/api/brands'),
};

export const inventoryApi = {
  list:         (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null && v !== '')).toString();
    return api.get(`/api/inventory${qs ? `?${qs}` : ''}`);
  },
  alerts:       ()             => api.get('/api/inventory/alerts'),
  aging:        ()             => api.get('/api/inventory/aging'),
  summary:      ()             => api.get('/api/inventory/summary'),
  create:       (body)         => api.post('/api/inventory', body),
  update:       (id, body)     => api.patch(`/api/inventory/${id}`, body),
  setThreshold: (skuId, thr)   => api.patch(`/api/inventory/threshold/${skuId}`, { threshold: thr }),
};

export const warehouseApi = {
  list:   ()        => api.get('/api/inventory/warehouses'),
  create: (body)    => api.post('/api/inventory/warehouses', body),
  update: (id, b)   => api.put(`/api/inventory/warehouses/${id}`, b),
  delete: (id)      => api.delete(`/api/inventory/warehouses/${id}`),
};

export const salesApi = {
  cities:          ()             => api.get('/api/sales/cities'),
  accounts:        ()             => api.get('/api/sales/accounts'),
  actuals:         (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null && v !== '')).toString();
    return api.get(`/api/sales/actuals${qs ? `?${qs}` : ''}`);
  },
  comparison:      (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null && v !== '')).toString();
    return api.get(`/api/sales/comparison${qs ? `?${qs}` : ''}`);
  },
  accountsSummary: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null && v !== '')).toString();
    return api.get(`/api/sales/accounts-summary${qs ? `?${qs}` : ''}`);
  },
};

export const targetApi = {
  list:   (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null && v !== '')).toString();
    return api.get(`/api/targets${qs ? `?${qs}` : ''}`);
  },
  create: (body)    => api.post('/api/targets', body),
  update: (id, b)   => api.put(`/api/targets/${id}`, b),
  delete: (id)      => api.delete(`/api/targets/${id}`),
};

function qs(params) {
  return new URLSearchParams(Object.entries(params).filter(([,v]) => v != null && v !== '')).toString();
}

export const analyticsApi = {
  velocity:    (p) => api.get(`/api/analytics/velocity?${qs(p)}`),
  slowMovers:  (p) => api.get(`/api/analytics/slow-movers?${qs(p)}`),
  brandSales:  (p) => api.get(`/api/analytics/brand-sales?${qs(p)}`),
  platforms:   (p) => api.get(`/api/analytics/platform-comparison?${qs(p)}`),
  dateCompare: (p) => api.get(`/api/analytics/date-comparison?${qs(p)}`),
};

export const profitabilityApi = {
  platformSettings: ()         => api.get('/api/profitability/platform-settings'),
  updatePlatform:   (id, body) => api.patch(`/api/profitability/platform-settings/${id}`, body),
  skuProfit:        (p)        => api.get(`/api/profitability/sku?${qs(p)}`),
  roas:             (p)        => api.get(`/api/profitability/roas?${qs(p)}`),
  highBurn:         (p)        => api.get(`/api/profitability/high-burn?${qs(p)}`),
};

export const priceTestApi = {
  list:    ()         => api.get('/api/price-tests'),
  create:  (body)     => api.post('/api/price-tests', body),
  update:  (id, body) => api.patch(`/api/price-tests/${id}`, body),
  delete:  (id)       => api.delete(`/api/price-tests/${id}`),
  results: (id)       => api.get(`/api/price-tests/${id}/results`),
};

export const integrationsApi = {
  list:     ()             => api.get('/api/integrations'),
  save:     (plat, body)   => api.post(`/api/integrations/${plat}`, body),
  toggle:   (plat, enable) => api.patch(`/api/integrations/${plat}/toggle`, { is_enabled: enable }),
  syncNow:  (plat)         => api.post(`/api/integrations/${plat}/sync`),
};
