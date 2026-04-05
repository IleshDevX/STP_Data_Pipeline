import { createClient } from '@supabase/supabase-js';
import { SENSOR_METADATA, SensorData, SensorSection, StatusFlag } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Initialize Supabase client
// If keys are missing or invalid, we'll use mock data
const createSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project')) {
    return null;
  }
  
  try {
    // Basic URL validation
    new URL(supabaseUrl);
    return createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.warn('Invalid Supabase URL provided, falling back to mock data:', err);
    return null;
  }
};

export const supabase = createSupabaseClient();

const EXCLUDED_SENSORS = new Set(['Anomaly_Events']);

const isExcludedSensor = (sensorName: string): boolean => EXCLUDED_SENSORS.has(sensorName);

type RawSensorRow = {
  id: number | string;
  date_text: string;
  time_text: string;
  sensor_name: string;
  value: number | string;
  status_flag: StatusFlag;
};

const FALLBACK_SECTION_BY_PREFIX: Array<[string, SensorSection]> = [
  ['Influent', 'Influent'],
  ['Aeration', 'Aeration'],
  ['MLSS', 'Biological'],
  ['SRT', 'Biological'],
  ['FM_', 'Biological'],
  ['Ammonia', 'Nitrogen Removal'],
  ['Nitrification', 'Nitrogen Removal'],
  ['Denitrification', 'Nitrogen Removal'],
  ['Biofilm', 'IFAS Biofilm'],
  ['Sludge', 'Sludge'],
  ['Chemical', 'Chemical & Disinfection'],
  ['Chlorine', 'Chemical & Disinfection'],
  ['Effluent', 'Effluent'],
  ['Digester', 'Digestion'],
  ['Equipment', 'System'],
];

const resolveFallbackSection = (sensorName: string): SensorSection => {
  const found = FALLBACK_SECTION_BY_PREFIX.find(([prefix]) => sensorName.startsWith(prefix));
  return found?.[1] ?? 'System';
};

const pad = (value: number): string => String(value).padStart(2, '0');

const toDateText = (timestamp: Date): string => {
  const day = pad(timestamp.getDate());
  const month = pad(timestamp.getMonth() + 1);
  const year = timestamp.getFullYear();
  return `${day}/${month}/${year}`;
};

const toTimeText = (timestamp: Date): string => {
  const hour = pad(timestamp.getHours());
  const minute = pad(timestamp.getMinutes());
  const second = pad(timestamp.getSeconds());
  return `${hour}:${minute}:${second}`;
};

const resolveThresholdBounds = (metadata: { min: number; max: number; thresholdMin?: number; thresholdMax?: number }) => {
  const range = metadata.max - metadata.min;
  if (range <= 0) {
    return {
      minThreshold: metadata.min,
      maxThreshold: metadata.max,
    };
  }

  const margin = range * 0.1;
  const minThreshold = metadata.thresholdMin ?? (metadata.min + margin);
  const maxThreshold = metadata.thresholdMax ?? (metadata.max - margin);

  return {
    minThreshold,
    maxThreshold,
  };
};

const deriveStatusFromThreshold = (
  value: number,
  metadata: { min: number; max: number; thresholdMin?: number; thresholdMax?: number } | null,
  originalStatus: StatusFlag,
): StatusFlag => {
  if (!metadata) {
    return originalStatus;
  }

  const { minThreshold, maxThreshold } = resolveThresholdBounds(metadata);

  if (value < minThreshold || value > maxThreshold) {
    return 'FAULT';
  }

  return 'NORMAL';
};

const toSensorData = (row: RawSensorRow): SensorData => {
  const metadata = SENSOR_METADATA[row.sensor_name];
  const resolvedMetadata = metadata ?? {
    name: row.sensor_name,
    section: resolveFallbackSection(row.sensor_name),
    unit: 'unit',
    description: row.sensor_name.replace(/_/g, ' '),
    min: 0,
    max: 0,
  };
  const numericValue = Number(row.value);
  const statusFromThreshold = deriveStatusFromThreshold(numericValue, metadata ?? null, row.status_flag);

  return {
    id: String(row.id),
    date: row.date_text,
    time: row.time_text,
    sensor_name: row.sensor_name,
    value: numericValue,
    status_flag: statusFromThreshold,
    unit: resolvedMetadata.unit,
    section: resolvedMetadata.section,
    description: resolvedMetadata.description,
  };
};

/**
 * Mock data generator for development when Supabase is not configured
 */
export const generateMockSensorData = (
  sensorName: string,
  count: number = 1,
  referenceTimestamp: Date = new Date(),
): SensorData[] => {
  if (isExcludedSensor(sensorName)) {
    return [];
  }

  const metadata = SENSOR_METADATA[sensorName];
  const data: SensorData[] = [];
  const now = new Date(referenceTimestamp.getTime());

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now.getTime() - i * 60000); // 1 minute intervals
    const value = metadata.min + Math.random() * (metadata.max - metadata.min);
    const status: StatusFlag = Math.random() > 0.95 ? 'FAULT' : 'NORMAL';

    data.push({
      id: `${sensorName}-${i}`,
      date: toDateText(timestamp),
      time: toTimeText(timestamp),
      sensor_name: sensorName,
      value: parseFloat(value.toFixed(2)),
      status_flag: status,
      unit: metadata.unit,
      section: metadata.section,
      description: metadata.description
    });
  }

  return data;
};

export const fetchLatestSensorData = async (): Promise<SensorData[]> => {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('sensor_data_raw')
      .select('id, date_text, time_text, sensor_name, value, status_flag')
      .order('id', { ascending: false })
      .limit(2000);

    if (error) throw error;

    const rows = (data as RawSensorRow[]) ?? [];
    const latestBySensor = new Map<string, RawSensorRow>();
    for (const row of rows) {
      if (isExcludedSensor(row.sensor_name)) {
        continue;
      }
      if (!latestBySensor.has(row.sensor_name)) {
        latestBySensor.set(row.sensor_name, row);
      }
    }

    return Array.from(latestBySensor.values()).map(toSensorData);
  } catch (err) {
    console.error('Error fetching latest data:', err);
    return [];
  }
};

export const fetchSensorSnapshotAt = async (
  dateText: string,
  timeText: string,
): Promise<SensorData[]> => {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('sensor_data_raw')
      .select('id, date_text, time_text, sensor_name, value, status_flag')
      .eq('date_text', dateText)
      .eq('time_text', timeText)
      .order('id', { ascending: true });

    if (error) throw error;

    const rows = (data as RawSensorRow[]) ?? [];
    return rows
      .filter((row) => !isExcludedSensor(row.sensor_name))
      .map(toSensorData);
  } catch (err) {
    console.error(`Error fetching snapshot for ${dateText} ${timeText}:`, err);
    return [];
  }
};

export const fetchHistoricalSensorData = async (
  sensorName: string,
  anchorId?: number,
  samples: number = 60,
): Promise<SensorData[]> => {
  if (isExcludedSensor(sensorName)) {
    return [];
  }

  if (!supabase) {
    return [];
  }

  try {
    let query = supabase
      .from('sensor_data_raw')
      .select('id, date_text, time_text, sensor_name, value, status_flag')
      .eq('sensor_name', sensorName)
      .order('id', { ascending: false })
      .limit(samples);

    if (typeof anchorId === 'number' && Number.isFinite(anchorId)) {
      query = query.lte('id', anchorId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data as RawSensorRow[]) ?? [];
    return rows.map(toSensorData).reverse();
  } catch (err) {
    console.error(`Error fetching historical data for ${sensorName}:`, err);
    return [];
  }
};
