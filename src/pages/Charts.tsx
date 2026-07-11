import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useData } from '../lib/DataContext';
import { MOOD_LABELS, MOOD_ORDER, moodToScore } from '../lib/constants';

const COLORS = {
  ph: '#E8A23D',
  ammonia: '#B85C4A',
  nitrite: '#5C8A6C',
  nitrate: '#C9A876',
  tds: '#EDF3EE',
  temperature: '#E8A23D',
};

// Cycled through for however many numeric custom fields a tank defines.
const CUSTOM_FIELD_COLORS = ['#E8A23D', '#5C8A6C', '#C9A876', '#B85C4A', '#3F6B4F', '#EDF3EE'];

export default function Charts() {
  const { activeTank } = useData();
  if (!activeTank) return null;

  const logs = [...activeTank.logs].reverse(); // chronological order
  const numericFields = activeTank.customFields.filter((f) => f.type === 'number');
  // Boolean fields chart the same way numeric ones do — translated to 0/1
  // on the way in, same as the Log page already translates them to "Yes"/
  // "No" for display. Only the Y axis and tooltip read back out as words
  // instead of digits.
  const booleanFields = activeTank.customFields.filter((f) => f.type === 'boolean');

  // `index` is the position key for every chart's X axis — guaranteed unique,
  // unlike the formatted date string. Two entries logged the same day both
  // show "Jul 8"; recharts' hover lookup matches the axis label back to a
  // data row, and with a duplicate label it always resolves to the *first*
  // matching row regardless of which point the cursor is actually over. The
  // cursor itself still renders in the right pixel position (that's plain
  // scale math), but the data behind it was wrong. Keying position on a
  // unique index sidesteps the collision entirely; `date` is kept purely
  // for display, via tickFormatter on the axis and read fresh from each
  // point's own row inside the tooltip.
  const chartData = logs.map((l, index) => {
    const row: Record<string, string | number | undefined> = {
      index,
      week: l.weekLabel,
      date: new Date(l.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      ph: l.params?.ph,
      ammonia: l.params?.ammonia,
      nitrite: l.params?.nitrite,
      nitrate: l.params?.nitrate,
      tds: l.params?.tds,
      temperature: l.params?.temperature,
      mood: moodToScore(l.mood),
    };
    for (const f of numericFields) {
      const val = l.customValues?.[f.id];
      row[f.id] = typeof val === 'number' ? val : undefined;
    }
    for (const f of booleanFields) {
      const val = l.customValues?.[f.id];
      // Unset is the same as "No" for charting purposes — it's the baseline,
      // not a gap. There's no meaningful difference between "logged No" and
      // "never touched it, so it's still No" once the tank has established
      // that the field can be true at all.
      row[f.id] = val === true ? 1 : 0;
    }
    return row;
  });

  const formatIndexAsDate = (i: number) => (chartData[i]?.date as string) ?? '';
  const allIndices = chartData.map((_, i) => i);

  // Each chart checks only the fields it actually plots, so logging just
  // temperature (say) doesn't leave the Nitrogen or pH/TDS cards rendering
  // mostly-empty — they simply don't show until they have their own data.
  const hasNitrogenData = chartData.some(
    (d) => d.ammonia !== undefined || d.nitrite !== undefined || d.nitrate !== undefined
  );
  const hasPhTdsData = chartData.some((d) => d.ph !== undefined || d.tds !== undefined);
  const hasTemperatureData = chartData.some((d) => d.temperature !== undefined);
  const hasCustomData = numericFields.some((f) => chartData.some((d) => d[f.id] !== undefined));
  const hasMoodData = chartData.some((d) => d.mood !== undefined);
  const chartedBooleanFields = booleanFields.filter((f) =>
    chartData.some((d) => d[f.id] === 1)
  );

  if (
    !hasNitrogenData &&
    !hasPhTdsData &&
    !hasTemperatureData &&
    !hasCustomData &&
    !hasMoodData &&
    chartedBooleanFields.length === 0
  ) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <h2 className="font-display text-2xl font-semibold mb-2">Parameters</h2>
        <p className="text-foam-dim">
          Log water parameters (and any tracking fields this tank uses) in your weekly
          entries and they'll chart themselves here — this is where you'll actually see
          the nitrogen cycle happen.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div>
        <h2 className="font-display text-2xl font-semibold">Parameters over time</h2>
        <p className="text-sm text-foam-dim">Tracking the cycle and stability, week by week.</p>
      </div>

      {hasNitrogenData && (
        <ChartCard title="Nitrogen cycle (ppm)">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3F6B4F33" />
            <XAxis
              dataKey="index"
              type="number"
              domain={[0, Math.max(chartData.length - 1, 0)]}
              ticks={allIndices}
              tickFormatter={formatIndexAsDate}
              stroke="#C9D6CE"
              fontSize={11}
            />
            <YAxis stroke="#C9D6CE" fontSize={11} />
            <Tooltip content={DarkTooltip} isAnimationActive={false} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="ammonia" name="NH₃" stroke={COLORS.ammonia} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="nitrite" name="NO₂" stroke={COLORS.nitrite} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="nitrate" name="NO₃" stroke={COLORS.nitrate} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      )}

      {hasPhTdsData && (
        <ChartCard title="pH & TDS">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3F6B4F33" />
            <XAxis
              dataKey="index"
              type="number"
              domain={[0, Math.max(chartData.length - 1, 0)]}
              ticks={allIndices}
              tickFormatter={formatIndexAsDate}
              stroke="#C9D6CE"
              fontSize={11}
            />
            <YAxis stroke="#C9D6CE" fontSize={11} />
            <Tooltip content={DarkTooltip} isAnimationActive={false} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="ph" name="pH" stroke={COLORS.ph} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="tds" name="TDS" stroke={COLORS.tds} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      )}

      {hasTemperatureData && (
        <ChartCard title="Temperature (°F)">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3F6B4F33" />
            <XAxis
              dataKey="index"
              type="number"
              domain={[0, Math.max(chartData.length - 1, 0)]}
              ticks={allIndices}
              tickFormatter={formatIndexAsDate}
              stroke="#C9D6CE"
              fontSize={11}
            />
            <YAxis stroke="#C9D6CE" fontSize={11} domain={['dataMin - 2', 'dataMax + 2']} />
            <Tooltip content={DarkTooltip} isAnimationActive={false} />
            <Line type="monotone" dataKey="temperature" name="Temp °F" stroke={COLORS.temperature} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      )}

      {hasMoodData && (
        <ChartCard title="Tank status over time">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3F6B4F33" />
            <XAxis
              dataKey="index"
              type="number"
              domain={[0, Math.max(chartData.length - 1, 0)]}
              ticks={allIndices}
              tickFormatter={formatIndexAsDate}
              stroke="#C9D6CE"
              fontSize={11}
            />
            <YAxis
              stroke="#C9D6CE"
              fontSize={11}
              domain={[1, 4]}
              ticks={[1, 2, 3, 4]}
              tickFormatter={(v: number) => MOOD_LABELS[MOOD_ORDER[v - 1]].split(' ')[0]}
              width={36}
            />
            <Tooltip content={MoodTooltip} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="mood"
              name="Status"
              stroke={COLORS.ph}
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ChartCard>
      )}

      {chartedBooleanFields.length > 0 && (
        <ChartCard title="Yes / No tracking">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3F6B4F33" />
            <XAxis
              dataKey="index"
              type="number"
              domain={[0, Math.max(chartData.length - 1, 0)]}
              ticks={allIndices}
              tickFormatter={formatIndexAsDate}
              stroke="#C9D6CE"
              fontSize={11}
            />
            <YAxis
              stroke="#C9D6CE"
              fontSize={11}
              domain={[0, 1]}
              ticks={[0, 1]}
              tickFormatter={(v: number) => (v === 1 ? 'Yes' : 'No')}
              width={36}
            />
            <Tooltip content={BooleanTooltip} isAnimationActive={false} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {chartedBooleanFields.map((f, i) => (
              <Line
                key={f.id}
                type="stepAfter"
                dataKey={f.id}
                name={f.label}
                stroke={CUSTOM_FIELD_COLORS[i % CUSTOM_FIELD_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartCard>
      )}

      {hasCustomData && (
        <ChartCard title="Tracked counts">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3F6B4F33" />
            <XAxis
              dataKey="index"
              type="number"
              domain={[0, Math.max(chartData.length - 1, 0)]}
              ticks={allIndices}
              tickFormatter={formatIndexAsDate}
              stroke="#C9D6CE"
              fontSize={11}
            />
            <YAxis stroke="#C9D6CE" fontSize={11} allowDecimals={false} />
            <Tooltip content={DarkTooltip} isAnimationActive={false} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {numericFields.map((f, i) => (
              <Line
                key={f.id}
                type="monotone"
                dataKey={f.id}
                name={f.label}
                stroke={CUSTOM_FIELD_COLORS[i % CUSTOM_FIELD_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartCard>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="card p-5">
      <h3 className="font-display text-lg font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={260}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

// Both variants below share DarkTooltip's row-lookup logic (read the date
// off the hovered point's own data, not the axis label) but need to turn
// their numeric values back into words — mood scores back into status
// labels, 0/1 back into No/Yes — rather than showing the raw number.
function MoodTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  const dateLabel = row?.date ?? '';
  const score = row?.mood;
  if (score === undefined || score === null) return null;
  const label = MOOD_LABELS[MOOD_ORDER[score - 1]];

  return (
    <div className="bg-deepwater-2 border border-moss/40 rounded-md px-3 py-2 text-xs font-mono">
      <p className="text-sand mb-1">{dateLabel}</p>
      <p style={{ color: COLORS.ph }}>{label}</p>
    </div>
  );
}

function BooleanTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  const dateLabel = row?.date ?? '';

  const entries = payload.filter((p: any) => p.value !== undefined && p.value !== null);
  if (entries.length === 0) return null;

  return (
    <div className="bg-deepwater-2 border border-moss/40 rounded-md px-3 py-2 text-xs font-mono">
      <p className="text-sand mb-1">{dateLabel}</p>
      {entries.map((p: any, i: number) => (
        <p key={`${p.dataKey ?? p.name ?? 'entry'}-${i}`} style={{ color: p.color }}>
          {p.name}: {p.value === 1 ? 'Yes' : 'No'}
        </p>
      ))}
    </div>
  );
}

function DarkTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;

  // Pull the date from the hovered row's own underlying data object
  // (`payload[i].payload`) rather than trusting the axis `label` prop —
  // with an index-keyed axis, `label` is now the numeric index, and this
  // guarantees we're reading the exact row that's actually hovered rather
  // than anything derived from a value that could collide across rows.
  const row = payload[0]?.payload;
  const dateLabel = row?.date ?? '';

  const entries = payload
    .filter((p: any) => p.value !== undefined && p.value !== null)
    .map((p: any) => ({
      ...p,
      displayValue: Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value,
    }));

  if (entries.length === 0) return null;

  return (
    <div className="bg-deepwater-2 border border-moss/40 rounded-md px-3 py-2 text-xs font-mono">
      <p className="text-sand mb-1">{dateLabel}</p>
      {entries.map((p: any, i: number) => (
        <p key={`${p.dataKey ?? p.name ?? 'entry'}-${i}`} style={{ color: p.color }}>
          {p.name}: {String(p.displayValue)}
        </p>
      ))}
    </div>
  );
}
