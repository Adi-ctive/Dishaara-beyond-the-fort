// Leaderboard: real raahis ranked by points, this week or all time. Moderators are not ranked.
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { api, apiOn, type LeaderRow } from '../../api';
import { Avatar } from '../../art/Avatars';
import { useStore } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';
import { LayerPage, Seg } from '../../ui/Layer';

const MEDAL = ['🥇', '🥈', '🥉'];

export function Leaderboard() {
  const { s } = useStore();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const [board, setBoard] = useState<{ rows: LeaderRow[]; myRank: number | null; players: number } | null>(null);
  useEffect(() => {
    if (!apiOn()) return;
    setBoard(null);
    api.leaderboard(period).then((b) => setBoard(b ?? { rows: [], myRank: null, players: 0 }));
  }, [period, s.points]);

  return (
    <LayerPage title={hi ? 'लीडरबोर्ड' : 'Leaderboard'}>
      <Seg value={period} onChange={setPeriod} options={[{ v: 'week', label: hi ? 'इस हफ़्ते' : 'This week' }, { v: 'all', label: hi ? 'अब तक' : 'All time' }]} />
      {!apiOn() && <p className="muted">{hi ? 'लीडरबोर्ड के लिए सर्वर चाहिए।' : 'The leaderboard needs the server.'}</p>}
      {board && board.myRank && (
        <div className="card my-rank">
          <b>#{board.myRank}</b> <span>{hi ? `${board.players} राहियों में` : `of ${board.players} raahis`}</span>
        </div>
      )}
      <ol className="leaders">
        {board?.rows.map((r, i) => (
          <motion.li key={r.id} className={`leader${r.me ? ' me' : ''}${i < 3 ? ' top' : ''}`} initial={{ x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
            <span className="leader-rank">{MEDAL[i] ?? r.rank}</span>
            <Avatar id={r.avatar ?? 'peacock'} frame={r.frame ?? undefined} size={42} />
            <span className="grow">
              <b>{r.name}{r.me ? (hi ? ' (आप)' : ' (you)') : ''}</b>
              <small className="muted">{hi ? 'लेवल' : 'Level'} {r.level} · {r.stamps} {hi ? 'स्टैम्प' : 'stamps'}</small>
            </span>
            <b className="leader-pts">{r.points}</b>
          </motion.li>
        ))}
      </ol>
      {board && !board.rows.length && <p className="muted center-text">{hi ? 'अभी कोई नहीं। पहला स्टैम्प लेकर सबसे ऊपर पहुँचें!' : 'Nobody yet. Collect the first stamp and take the top spot!'}</p>}
    </LayerPage>
  );
}
