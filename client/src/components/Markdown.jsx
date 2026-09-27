// Rendu markdown minimal et sûr (aucun HTML injecté) pour les fiches de cours.
import { Fragment } from 'react';

function inline(text, keyBase = 'i') {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|~~([^~]+)~~|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[2]) out.push(<strong key={key}>{inline(m[2], key)}</strong>);
    else if (m[3]) out.push(<em key={key}>{inline(m[3], key)}</em>);
    else if (m[4]) out.push(<code key={key}>{m[4]}</code>);
    else if (m[5]) out.push(<s key={key}>{m[5]}</s>);
    else if (m[6]) out.push(<a key={key} href={m[7]} target="_blank" rel="noreferrer">{m[6]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const splitRow = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

export default function Markdown({ source }) {
  if (!source) return <p className="muted">Pas de fiche de cours pour cette notion.</p>;
  const lines = source.replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,4})\s+(.*)/.exec(l))) {
      const H = `h${Math.min(m[1].length + 2, 6)}`;
      blocks.push(<H key={i}>{inline(m[2], `h${i}`)}</H>);
      i++;
    } else if (/^```/.test(l)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={i}><code>{code.join('\n')}</code></pre>);
    } else if (/^---+\s*$/.test(l)) {
      blocks.push(<hr key={i} />);
      i++;
    } else if (/^\s*\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)).map(splitRow);
      const [head, ...rest] = body;
      blocks.push(
        <div className="table-wrap" key={i}>
          <table className="md-table">
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `t${i}${j}`)}</th>)}</tr></thead>
            <tbody>{rest.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `t${i}${ri}${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '').replace(/^\[( |x)\]\s*/, (s, c) => (c === 'x' ? '☑ ' : '☐ ')));
        i++;
      }
      const L = ordered ? 'ol' : 'ul';
      blocks.push(<L key={i}>{items.map((it, j) => <li key={j}>{inline(it, `l${i}${j}`)}</li>)}</L>);
    } else if (/^>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={i}>{inline(q.join(' '), `q${i}`)}</blockquote>);
    } else {
      const p = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*\||\s*([-*]|\d+\.)\s|>)/.test(lines[i])) p.push(lines[i++]);
      if (!p.length) { p.push(lines[i]); i++; }
      blocks.push(<p key={i}>{p.map((x, j) => <Fragment key={j}>{j > 0 && <br />}{inline(x, `p${i}${j}`)}</Fragment>)}</p>);
    }
  }
  return <div className="markdown">{blocks}</div>;
}
