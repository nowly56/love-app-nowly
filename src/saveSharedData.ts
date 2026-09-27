import { api } from './api';
import type { SessionSnapshot } from './api';
import type { AppData } from './data';

const resources = ['books', 'memories', 'dates', 'plans'] as const;
type RecordItem = NonNullable<AppData[typeof resources[number]]>[number];
const equal = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export async function saveSharedData(current: SessionSnapshot, next: AppData): Promise<SessionSnapshot> {
  const keys = [...new Set([...Object.keys(current.data), ...Object.keys(next)])] as (keyof AppData)[];
  const changed = keys.filter(key => !equal(current.data[key], next[key]));
  if (!changed.length) return current;
  const kind = resources.find(key => changed.length === 1 && changed[0] === key);
  if (kind) {
    const before: RecordItem[] = current.data[kind] || [];
    const after: RecordItem[] = next[kind] || [];
    const oldById = new Map(before.map(item => [item.id, item]));
    const newById = new Map(after.map(item => [item.id, item]));
    const edits = after.filter(item => !equal(oldById.get(item.id), item));
    const removed = before.filter(item => !newById.has(item.id));
    if (edits.length + removed.length === 1) {
      const record = edits[0] || removed[0];
      const previous = oldById.get(record.id);
      const method = removed.length ? 'DELETE' : previous ? 'PATCH' : 'POST';
      // A title or date edit must not upload the unchanged photograph again.
      const item = previous && !removed.length
        ? Object.fromEntries(Object.entries(record).filter(([key,value]) => !equal(value, (previous as unknown as Record<string,unknown>)[key])))
        : record;
      const result = await api<{revision:number; item?:RecordItem; deletedId?:string}>(
        `/api/${kind}${method === 'POST' ? '' : `/${encodeURIComponent(record.id)}`}`,
        { revision:current.revision, ...(method === 'DELETE' ? {} : {item}) }, method,
      );
      const records = result.item ? (previous ? before.map(old => old.id === record.id ? result.item! : old) : [...before,result.item]) : before.filter(old => old.id !== result.deletedId);
      return {...current, revision:result.revision, data:{...current.data, [kind]:records}};
    }
  }
  // Relationship settings and legacy multi-record operations retain their atomic save.
  return api<SessionSnapshot>('/api/data', {revision:current.revision, data:next});
}
