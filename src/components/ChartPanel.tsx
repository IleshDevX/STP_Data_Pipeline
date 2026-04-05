import React, { useMemo } from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { 
  Info
} from 'lucide-react';
import { SensorData, SENSOR_METADATA } from '../types';
import { cn } from '../lib/utils';

interface ChartPanelProps {
  data: SensorData[];
  sensorName: string;
}

const resolveThresholdBounds = (metadata?: { min: number; max: number; thresholdMin?: number; thresholdMax?: number }) => {
  if (!metadata) {
    return {
      minThreshold: undefined,
      maxThreshold: undefined,
    };
  }

  const range = metadata.max - metadata.min;
  if (range <= 0) {
    return {
      minThreshold: metadata.min,
      maxThreshold: metadata.max,
    };
  }

  const margin = range * 0.1;
  return {
    minThreshold: metadata.thresholdMin ?? (metadata.min + margin),
    maxThreshold: metadata.thresholdMax ?? (metadata.max - margin),
  };
};

export const ChartPanel: React.FC<ChartPanelProps> = ({ data, sensorName }) => {
  const metadata = SENSOR_METADATA[sensorName as keyof typeof SENSOR_METADATA];
  const unit = metadata?.unit ?? '';
  
  const analysis = useMemo(() => {
    if (!data || data.length === 0) return null;
    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const latest = values[values.length - 1];
    const previous = values.length > 1 ? values[values.length - 2] : latest;
    const trendPercent = previous === 0 ? 0 : ((latest - previous) / Math.abs(previous)) * 100;
    const status = data[data.length - 1].status_flag;
    const { minThreshold, maxThreshold } = resolveThresholdBounds(metadata);
    const breachCount = (typeof maxThreshold === 'number' && typeof minThreshold === 'number')
      ? data.filter((row) => row.value > maxThreshold || row.value < minThreshold).length
      : 0;
    const minBound = typeof minThreshold === 'number' ? Math.min(min, minThreshold) : min;
    const maxBound = typeof maxThreshold === 'number' ? Math.max(max, maxThreshold) : max;
    const span = Math.max(maxBound - minBound, 1);
    const chartMin = minBound - span * 0.12;
    const chartMax = maxBound + span * 0.12;

    return {
      min,
      max,
      avg,
      latest,
      trendPercent,
      status,
      maxThreshold,
      minThreshold,
      breachCount,
      chartMin,
      chartMax,
    };
  }, [data, metadata]);

  if (!data || data.length === 0 || !analysis) return null;

  return (
    <div className="saas-card overflow-hidden flex flex-col h-[500px]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-saas-border flex items-center bg-white">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-base font-semibold text-saas-text-primary">
              {sensorName.replace(/_/g, ' ')}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-medium text-saas-text-secondary">Historical Analysis</span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span className="text-xs font-medium text-saas-text-secondary">Last 30 samples</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 border-b border-saas-border bg-saas-sidebar/50">
        {[
          {
            label: 'Current Value',
            value: `${analysis.latest.toFixed(2)} ${unit}`,
            trend: `${analysis.trendPercent >= 0 ? '+' : ''}${analysis.trendPercent.toFixed(2)}%`,
            trendClass: analysis.trendPercent >= 0 ? 'text-emerald-600' : 'text-red-600',
          },
          {
            label: 'Max Threshold',
            value: typeof analysis.maxThreshold === 'number'
              ? `${analysis.maxThreshold.toFixed(2)} ${unit}`
              : 'N/A',
            trend: null,
          },
          {
            label: 'Min Threshold',
            value: typeof analysis.minThreshold === 'number'
              ? `${analysis.minThreshold.toFixed(2)} ${unit}`
              : 'N/A',
            trend: null,
          },
          {
            label: 'Status',
            value: analysis.status === 'FAULT' ? 'Fault' : 'Normal',
            trend: analysis.breachCount > 0 ? `${analysis.breachCount} breach${analysis.breachCount > 1 ? 'es' : ''}` : null,
            isStatus: true,
            statusClass: analysis.status === 'FAULT' ? 'text-red-600' : 'text-emerald-600',
            trendClass: analysis.breachCount > 0 ? 'text-red-600' : 'text-emerald-600',
          },
        ].map((stat, i) => (
          <div key={i} className={cn(
            "px-6 py-4 flex flex-col gap-1",
            i !== 3 && "border-r border-saas-border"
          )}>
            <span className="text-[10px] font-bold text-saas-text-secondary uppercase tracking-wider">{stat.label}</span>
            <div className="flex items-baseline gap-2">
              <span className={cn(
                "text-sm font-bold",
                stat.isStatus ? stat.statusClass : "text-saas-text-primary"
              )}>
                {stat.value}
              </span>
              {stat.trend && (
                <span className={cn("text-[10px] font-bold", stat.trendClass)}>{stat.trend}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Chart Area */}
      <div className="flex-1 p-6 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 16 }}>
            <defs>
              <linearGradient id="saasGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
            <XAxis 
              dataKey="time" 
              axisLine={false}
              tickLine={false}
              minTickGap={24}
              tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }}
              tickFormatter={(value) => String(value).slice(0, 5)}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              width={64}
              tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }}
              tickFormatter={(value) => Number(value).toFixed(1)}
              domain={[analysis.chartMin, analysis.chartMax]}
            />
            {typeof analysis.maxThreshold === 'number' && (
              <ReferenceLine
                y={analysis.maxThreshold}
                stroke="#DC2626"
                strokeDasharray="6 4"
                ifOverflow="extendDomain"
                label={{ value: `Max ${analysis.maxThreshold.toFixed(2)} ${unit}`, position: 'insideTopRight', fill: '#DC2626', fontSize: 10 }}
              />
            )}
            {typeof analysis.minThreshold === 'number' && (
              <ReferenceLine
                y={analysis.minThreshold}
                stroke="#CA8A04"
                strokeDasharray="6 4"
                ifOverflow="extendDomain"
                label={{ value: `Min ${analysis.minThreshold.toFixed(2)} ${unit}`, position: 'insideBottomRight', fill: '#CA8A04', fontSize: 10 }}
              />
            )}
            <Tooltip 
              labelFormatter={(value, payload) => {
                const row = payload?.[0]?.payload as SensorData | undefined;
                return row ? `${row.date} ${row.time}` : String(value);
              }}
              formatter={(value) => [`${Number(value ?? 0).toFixed(2)} ${unit}`, 'Value']}
              contentStyle={{ 
                backgroundColor: '#111827', 
                border: 'none', 
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: '600',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              }}
              itemStyle={{ color: '#fff' }}
              cursor={{ stroke: '#E5E7EB', strokeWidth: 2 }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#2563EB" 
              strokeWidth={2.5}
              fillOpacity={1} 
              fill="url(#saasGradient)" 
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-gray-50 border-t border-saas-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-saas-text-secondary">
          <Info className="w-3.5 h-3.5" />
          Data updated every 60 seconds
        </div>
      </div>
    </div>
  );
};
