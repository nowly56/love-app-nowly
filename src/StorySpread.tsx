import { Heart, Plus } from 'lucide-react';
import type { Memory } from './data';
import { formatDate } from './data';

type Props = { memories: Memory[]; page: number; turn: { to: number; direction: number } | null; onAdd: () => void };
export default function StorySpread({ memories, page, turn, onAdd }: Props) {
  const leaf = (index: number, side: 'left' | 'right') => {
    const memory = memories[index];
    if (side === 'left') return <div className={`story-photo-page ${memory ? '' : 'story-blank-page'}`}>{memory ? <img src={memory.image} alt={memory.title} draggable={false} /> : <><Heart size={40} strokeWidth={1.1} /><span>SINCE US</span></>}</div>;
    return <div className="story-copy-page"><small>СТРАНИЦА {String(index + 1).padStart(2, '0')}</small><h2>{memory?.title || 'Здесь будет ваша история'}</h2><p>{memory?.note || (!memory ? 'Сохраните момент, к которому хочется возвращаться.' : '')}</p>{memory ? <span>{formatDate(memory.date)}{memory.location && ` · ${memory.location}`}</span> : <button className="story-blank-add" onClick={onAdd}><Plus size={15} />Добавить момент</button>}</div>;
  };
  const forward = !turn || turn.direction > 0;
  return <div className={`story-spread ${turn ? 'is-turning' : ''}`} aria-label={`Страница ${page + 1}`}>
    {leaf(turn && !forward ? turn.to : page, 'left')}
    {leaf(turn && forward ? turn.to : page, 'right')}
    {turn && <div className={`story-turning-leaf ${forward ? 'turn-forward' : 'turn-backward'}`} aria-hidden="true" inert>
      <div className="leaf-face leaf-front">{leaf(page, forward ? 'right' : 'left')}</div>
      <div className="leaf-face leaf-back" />
    </div>}
  </div>;
}
