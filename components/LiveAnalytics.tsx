'use client';

// The church's numbers over time, for a pastor on a Tuesday morning.
//
// WHO THIS IS FOR. Somebody who uses a spreadsheet occasionally and has never
// opened a BI tool, who has ten minutes before a meeting and needs to be able
// to say what is happening. So: a headline they can read at a glance, one chart
// they can point at, the two averages a spreadsheet would give them, and a
// button that produces a file they can attach to an email.
//
// ONE AXIS, THREE LINES, NEVER MORE. Three counts of the same kind of thing
// (events per week) share one scale honestly. A second y-axis would let any two
// lines be made to tell any story, which is the single most common way a chart
// lies, and it is not available here at all.
//
// THE PALETTE WAS VALIDATED, NOT CHOSEN. See lib/live/analytics.ts: run through
// the dataviz checker for lightness, chroma, colour-vision separation and
// contrast against the surface. The brand's gold failed twice and is not used
// for a line. Every line also carries a direct label and a legend, so identity
// never rests on colour alone.

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as live from '@/lib/live/analytics';
import { Button, Card } from '@/components/ui';

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Could not load the numbers.';

const WINDOWS = [
  { weeks: 6, label: '6 weeks' },
  { weeks: 12, label: '3 months' },
  { weeks: 26, label: '6 months' },
];

function download(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A stat tile. A number somebody reads, not a chart with one bar. */
function Kpi({ n, label, hint, tone = 'plain' }: {
  n: number | string; label: string; hint?: string; tone?: 'plain' | 'good' | 'watch';
}) {
  const bg = tone === 'good' ? 'bg-green-50' : tone === 'watch' ? 'bg-amber-50' : 'bg-gray-50';
  const ink = tone === 'good' ? 'text-green-800' : tone === 'watch' ? 'text-amber-900' : 'text-navy';
  return (
    <div className={`rounded-xl ${bg} p-4`}>
      <p className={`text-3xl font-extrabold ${ink}`}>{n}</p>
      <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/**
 * The chart.
 *
 * Plain SVG rather than a charting library: one dependency that ships to every
 * phone in a congregation, for three polylines, is a poor trade. Marks follow
 * the spec that matters here: 2px lines, markers big enough to hit, a recessive
 * grid, and no number printed on every point.
 */
function Lines({ labels, series, hovered, onHover }: {
  labels: string[];
  series: live.Series[];
  hovered: number | null;
  onHover: (i: number | null) => void;
}) {
  const W = 720;
  const H = 240;
  const PAD = { top: 16, right: 16, bottom: 28, left: 34 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const peak = Math.max(1, ...series.flatMap((s) => s.points));
  // A round ceiling, so the axis reads 0 / 3 / 6 rather than 0 / 3.5 / 7.
  const top = Math.max(2, Math.ceil(peak / 2) * 2);
  const x = (i: number) => PAD.left + (labels.length < 2 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  // Every other label on a narrow window, so they never collide.
  const step = labels.length > 14 ? 4 : labels.length > 8 ? 2 : 1;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[560px]"
        role="img"
        aria-label={`Weekly church activity: ${series.map((s) => s.label).join(', ')}`}
        onMouseLeave={() => onHover(null)}
      >
        {/* Grid: recessive, three lines, never competing with the data. */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left} x2={W - PAD.right}
              y1={PAD.top + plotH * f} y2={PAD.top + plotH * f}
              stroke="#E4E9F0" strokeWidth={1}
            />
            <text
              x={PAD.left - 8} y={PAD.top + plotH * f + 4}
              textAnchor="end" fontSize={11} fill="#8892A0"
            >
              {Math.round(top * (1 - f))}
            </text>
          </g>
        ))}

        {labels.map((l, i) => (i % step === 0 ? (
          <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#8892A0">{l}</text>
        ) : null))}

        {/* The week under the pointer. Drawn behind the lines. */}
        {hovered !== null && (
          <line
            x1={x(hovered)} x2={x(hovered)} y1={PAD.top} y2={PAD.top + plotH}
            stroke="#1E2A4A" strokeOpacity={0.25} strokeWidth={1}
          />
        )}

        {series.map((s) => (
          <g key={s.key}>
            <polyline
              points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none" stroke={s.colour} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round"
            />
            {/* A ring in the surface colour, so overlapping points stay
                separable where two lines cross. */}
            {s.points.map((v, i) => (
              <circle
                key={i} cx={x(i)} cy={y(v)} r={hovered === i ? 5 : 3.5}
                fill={s.colour} stroke="#fff" strokeWidth={1.5}
              />
            ))}
          </g>
        ))}

        {/* Hit areas wider than the marks. */}
        {labels.map((l, i) => (
          <rect
            key={`hit-${l}-${i}`}
            x={x(i) - plotW / Math.max(1, labels.length) / 2}
            y={PAD.top} width={plotW / Math.max(1, labels.length)} height={plotH}
            fill="transparent"
            onMouseEnter={() => onHover(i)}
          />
        ))}
      </svg>
    </div>
  );
}

export function LiveAnalytics({ churchName }: { churchName?: string | null }) {
  const [weeks, setWeeks] = useState(12);
  const [data, setData] = useState<live.Analytics | null>(null);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState<number | null>(null);
  const [howTo, setHowTo] = useState(false);

  const load = useCallback(async () => {
    try { setData(await live.churchAnalytics(weeks)); setError(''); }
    catch (cause) { setError(message(cause)); }
  }, [weeks]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.labels.map((label, i) => ({
      week: label,
      ...Object.fromEntries(data.series.map((s) => [s.label, s.points[i] ?? 0])),
    }));
  }, [data]);

  if (error) {
    return <Card className="p-5"><p className="text-sm text-red-800">{error}</p></Card>;
  }
  if (!data) return <Card className="p-5"><p className="text-gray-400">Working out the numbers…</p></Card>;

  const slug = `${(churchName || 'church').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-analytics-${new Date().toISOString().slice(0, 10)}`;

  const exportCsv = () => {
    const head = ['Week', ...data.series.map((s) => s.label)];
    const body = data.labels.map((label, i) => [label, ...data.series.map((s) => s.points[i] ?? 0)]);
    const stats = [
      [],
      ['Summary over', `${weeks} weeks`],
      ['Measure', 'Total', 'Average per week', 'Middle week'],
      ...data.series.map((s) => [
        s.label, live.total(s.points),
        live.mean(s.points).toFixed(1), live.median(s.points),
      ]),
    ];
    download(
      `${slug}.csv`,
      [head, ...body, ...stats].map((r) => r.map(cell).join(',')).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy">📈 How the church is going</h2>
            <p className="mt-1 text-sm text-gray-500">
              Counted every week. Nobody&rsquo;s name, message or prayer appears here.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.weeks}
                type="button"
                onClick={() => setWeeks(w.weeks)}
                className={`tap-sm rounded-xl px-3 py-1.5 text-sm font-bold ${
                  weeks === w.weeks ? 'bg-navy text-white' : 'bg-gray-100 text-navy hover:bg-gray-200'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* THE HEADLINE. Four numbers, and the one that means somebody is being
            ignored is coloured when it is not zero. */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi n={data.now.explorers} label="Explorers" hint="Approved and in the church" />
          <Kpi n={data.now.guides} label="Guides" hint="Carrying at least one person" />
          <Kpi n={data.now.graduated} label="Graduated" hint="Sent to disciple others" tone="good" />
          <Kpi
            n={data.now.unpaired}
            label="Waiting for a Guide"
            hint={data.now.unpaired ? 'Pair these first' : 'Everybody is paired'}
            tone={data.now.unpaired ? 'watch' : 'good'}
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-navy">Week by week</h3>
          <button
            type="button"
            onClick={() => setHowTo((v) => !v)}
            className="text-sm font-semibold text-navy underline underline-offset-2"
          >
            {howTo ? 'Hide how to read this' : 'How to read this'}
          </button>
        </div>

        {/* INSTRUCTIONS, WRITTEN FOR SOMEBODY WHO DOES NOT DO THIS FOR A LIVING.
            Hidden by default so it does not shout at the person who already
            knows, one tap away for the person who does not. */}
        {howTo && (
          <div className="mt-3 space-y-2 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            <p><strong>Each point is one week.</strong> The line on the far right is the week you are in, so it is always partly finished and always looks low. Compare the two before it.</p>
            <p><strong>The three lines answer three questions:</strong></p>
            <ul className="list-disc space-y-1 pl-5">
              {data.series.map((s) => (
                <li key={s.key}>
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                    style={{ backgroundColor: s.colour }}
                  />
                  <strong>{s.label}.</strong> {s.meaning}
                </li>
              ))}
            </ul>
            <p><strong>Average and middle week.</strong> The average is the total shared out over the weeks. The middle week is the one in the centre when you line them up. When they differ a lot, one unusual week is pulling the average, and the middle week is closer to an ordinary one.</p>
            <p><strong>A flat line is not a failure.</strong> A church of forty is not supposed to be busy every week. What is worth acting on is <em>Waiting for a Guide</em> above zero, and a month of nothing at all.</p>
          </div>
        )}

        {/* Legend, always. Identity never rests on colour alone. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {data.series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-sm font-semibold text-gray-600">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.colour }} />
              {s.label}
            </span>
          ))}
        </div>

        <div className="mt-2">
          <Lines labels={data.labels} series={data.series} hovered={hovered} onHover={setHovered} />
        </div>

        {hovered !== null && (
          <p className="mt-1 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <strong>Week of {data.labels[hovered]}:</strong>{' '}
            {data.series.map((s) => `${s.label} ${s.points[hovered] ?? 0}`).join(' · ')}
          </p>
        )}

        {/* THE TABLE IS NOT OPTIONAL. It is what makes the chart readable to a
            screen reader, to somebody who cannot separate the colours, and to
            anybody who just wants the number. */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <caption className="sr-only">Weekly totals, and the average and middle week for each measure</caption>
            <thead>
              <tr>
                <th className="border-b border-gray-200 p-2 text-left font-bold text-navy">Measure</th>
                <th className="border-b border-gray-200 p-2 text-right font-bold text-navy">Total</th>
                <th className="border-b border-gray-200 p-2 text-right font-bold text-navy">Average a week</th>
                <th className="border-b border-gray-200 p-2 text-right font-bold text-navy">Middle week</th>
                <th className="border-b border-gray-200 p-2 text-right font-bold text-navy">Last full week</th>
              </tr>
            </thead>
            <tbody>
              {data.series.map((s) => {
                const w = live.weekOnWeek(s.points);
                return (
                  <tr key={s.key}>
                    <td className="border-b border-gray-100 p-2">
                      <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: s.colour }} />
                      {s.label}
                    </td>
                    <td className="border-b border-gray-100 p-2 text-right font-semibold">{live.total(s.points)}</td>
                    <td className="border-b border-gray-100 p-2 text-right">{live.mean(s.points).toFixed(1)}</td>
                    <td className="border-b border-gray-100 p-2 text-right">{live.median(s.points)}</td>
                    <td className="border-b border-gray-100 p-2 text-right">
                      {w.latest}
                      {w.pct !== null && (
                        <span className={`ml-1 text-xs font-semibold ${w.pct > 0 ? 'text-green-700' : w.pct < 0 ? 'text-amber-800' : 'text-gray-400'}`}>
                          {w.pct > 0 ? '+' : ''}{w.pct}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-lg font-bold text-navy">Take it with you</h3>
        <p className="mt-1 text-sm text-gray-500">
          The same numbers, in a file you can open in Excel or Google Sheets, or
          print for a board meeting.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="gold" onClick={exportCsv}>Download as CSV</Button>
          {/* PRINT RATHER THAN A GENERATED PDF. Every browser and every phone
              can print to PDF, and the print dialog lets somebody choose the
              paper and the margins. A PDF we generate would be one fixed
              layout, and one more thing to keep looking right. */}
          <Button variant="ghost" onClick={() => window.print()}>Print or save as PDF</Button>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          The CSV opens in Excel, Google Sheets, Numbers and LibreOffice. It has
          one row per week, then the totals and averages underneath. Nobody&rsquo;s
          name is in it.
        </p>
        <p className="sr-only">{rows.length} weeks of data are available in the table above.</p>
      </Card>
    </div>
  );
}
