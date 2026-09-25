import type { AppData } from './data';

export type SessionSnapshot = {
  user: { id: string; email: string | null; telegram?: boolean };
  data: AppData;
  revision: number;
  spaceId: string;
  recoveryCode?: string;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Blizhe-Client': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(result?.error || 'Не удалось выполнить действие. Попробуйте ещё раз.', response.status);
    if (!result) throw new ApiError('Сервер не вернул данные. Попробуйте обновить страницу.', 502);
    return result as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Нет связи с приложением. Проверьте Wi-Fi и попробуйте ещё раз.', 0);
  } finally { clearTimeout(timeout); }
}
