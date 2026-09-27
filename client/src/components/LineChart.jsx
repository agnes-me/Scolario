// Graphique en courbe minimaliste (SVG), sans dépendance. Le repère suit la largeur réelle
// du conteneur pour garder un texte lisible sur mobile comme sur grand écran.
import { useEffect, useRef, useState } from 'react';

function useLargeur(defaut = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(defaut);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export default function LineChart(props) {
  const [ref, largeur] = useLargeur();
  return <div ref={ref}><Courbe {...props} W={largeur} /></div>;
}

function Courbe({ points, cible = [], height = 200, unite = '', labelX = (x) => x, W }) {
  if (!points?.length) return <p className="muted">Pas encore de données.</p>;
  const H = height;
  const pad = { l: 40, r: 16, t: 14, b: 30 };
  const ys = [...points.map((p) => p.y), ...cible.map((c) => c.y)];
  const maxY = Math.max(10, ...ys) * 1.1;
  const n = points.length;
  const x = (i) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v) => H - pad.b - (v / maxY) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 90))));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="chart-label">{t}</text>
        </g>
      ))}
      {cible.map((c) => (
        <g key={`${c.label}-${c.y}`}>
          <line x1={pad.l} x2={W - pad.r} y1={y(c.y)} y2={y(c.y)} className="chart-cible" />
          <text x={pad.l + 6} y={y(c.y) - 4} className="chart-label chart-cible-label">{c.label} : {c.y}</text>
        </g>
      ))}
      <path d={path} className="chart-line" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.y)} r="4" className="chart-dot"><title>{`${labelX(p.x)} : ${p.y} ${unite}`}</title></circle>
          {(i % step === 0 || i === n - 1) && (
            <text x={x(i)} y={H - 10} textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="chart-label">{labelX(p.x)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
