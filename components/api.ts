/* Browser-side helper for calling the Hub API with JSON. */
export type ApiResult<T = Record<string, unknown>> = {
  ok: boolean; status: number; data: T & { error?: string; fields?: Record<string, string> };
};

export async function callApi<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'No connection. Check the network and try again.' } as T & { error: string } };
  }
}
