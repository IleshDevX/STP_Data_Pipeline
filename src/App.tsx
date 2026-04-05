import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  AlertCircle, 
  Fan,
  RefreshCw,
  ChevronRight,
  X,
  Settings,
  Database,
  Zap,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { SensorData, SensorSection, SENSOR_METADATA } from './types';
import { fetchHistoricalSensorData, fetchSensorSnapshotAt } from './services/supabase';
import { SensorCard } from './components/SensorCard';
import { ChartPanel } from './components/ChartPanel';
import { cn } from './lib/utils';

const SECTIONS: SensorSection[] = [
  'Influent', 'Aeration', 'Biological', 'Nitrogen Removal', 
  'IFAS Biofilm', 'Sludge', 'Chemical & Disinfection', 
  'Effluent', 'Digestion', 'System'
];

type AppPage = 'dashboard' | 'logs' | 'settings';
type LogStatusFilter = 'ALL' | 'NORMAL' | 'FAULT';

const PAGE_LABELS: Record<AppPage, string> = {
  dashboard: 'Dashboard',
  logs: 'Logs',
  settings: 'Settings',
};

const PLAYBACK_START = new Date(2025, 8, 1, 0, 0, 0);
const PLAYBACK_END = new Date(2026, 9, 30, 23, 59, 0);
const PLAYBACK_STEP_MS = 60_000;
const PLAYBACK_STEP_SECONDS = PLAYBACK_STEP_MS / 1000;
const LOG_HISTORY_LIMIT = 8_000;

const pad = (value: number): string => value.toString().padStart(2, '0');

const toDateInputValue = (timestamp: Date): string => {
  const year = timestamp.getFullYear();
  const month = pad(timestamp.getMonth() + 1);
  const day = pad(timestamp.getDate());
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (timestamp: Date): string => {
  const hour = pad(timestamp.getHours());
  const minute = pad(timestamp.getMinutes());
  return `${hour}:${minute}`;
};

const toDisplayDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${pad(mins)}:${pad(secs)}`;
};

const toDateFromInput = (dateValue: string, timeValue: string): Date | null => {
  if (!dateValue || !timeValue) {
    return null;
  }

  const parsed = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setSeconds(0, 0);
  return parsed;
};

const clampPlaybackTime = (value: Date): Date => {
  if (value.getTime() < PLAYBACK_START.getTime()) {
    return new Date(PLAYBACK_START.getTime());
  }
  if (value.getTime() > PLAYBACK_END.getTime()) {
    return new Date(PLAYBACK_END.getTime());
  }
  return value;
};

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

const resolveThresholdBounds = (sensorName: string) => {
  const metadata = SENSOR_METADATA[sensorName];
  if (!metadata) {
    return null;
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

export default function App() {
  const [latestData, setLatestData] = useState<SensorData[]>([]);
  const [historicalData, setHistoricalData] = useState<SensorData[]>([]);
  const [selectedSensor, setSelectedSensor] = useState<string>('Influent_Flow');
  const [activePage, setActivePage] = useState<AppPage>('dashboard');
  const [activeSection, setActiveSection] = useState<SensorSection>('Influent');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logSectionFilter, setLogSectionFilter] = useState<SensorSection | 'ALL'>('ALL');
  const [logStatusFilter, setLogStatusFilter] = useState<LogStatusFilter>('ALL');
  const [logEntries, setLogEntries] = useState<SensorData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [playbackTime, setPlaybackTime] = useState<Date>(new Date(PLAYBACK_START.getTime()));
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(true);
  const [isAlertsAutoEnabled, setIsAlertsAutoEnabled] = useState(false);
  const [playbackMessage, setPlaybackMessage] = useState<string>('');
  const [isAlertPanelOpen, setIsAlertPanelOpen] = useState(false);
  const [isMotorOn, setIsMotorOn] = useState(false);
  const [isManualMotorOverride, setIsManualMotorOverride] = useState(false);
  const [jumpDate, setJumpDate] = useState<string>(toDateInputValue(PLAYBACK_START));
  const [jumpTime, setJumpTime] = useState<string>(toTimeInputValue(PLAYBACK_START));
  const [secondsUntilNextUpdate, setSecondsUntilNextUpdate] = useState<number>(PLAYBACK_STEP_SECONDS);

  useEffect(() => {
    let isCancelled = false;

    const loadSnapshotAtPlaybackTime = async () => {
      setIsLoading(true);

      const dateText = toDateText(playbackTime);
      const timeText = toTimeText(playbackTime);

      try {
        const snapshot = await fetchSensorSnapshotAt(dateText, timeText);
        if (isCancelled) {
          return;
        }

        if (snapshot.length === 0) {
          setPlaybackMessage(`No data available at ${dateText} ${timeText}. Playback paused.`);
          setIsPlaybackRunning(false);
          setLatestData([]);
          setHistoricalData([]);
          return;
        }

        setPlaybackMessage('');
        setLatestData(snapshot);
        setLogEntries((previousLogs) => {
          const existingIds = new Set(previousLogs.map((row) => row.id));
          const nextRows = snapshot.filter((row) => !existingIds.has(row.id));

          if (nextRows.length === 0) {
            return previousLogs;
          }

          const merged = [...previousLogs, ...nextRows];
          return merged.length > LOG_HISTORY_LIMIT
            ? merged.slice(merged.length - LOG_HISTORY_LIMIT)
            : merged;
        });
        setSelectedSensor((previousSelectedSensor) => (
          snapshot.some((sensor) => sensor.sensor_name === previousSelectedSensor)
            ? previousSelectedSensor
            : snapshot[0].sensor_name
        ));
      } catch (error) {
        if (!isCancelled) {
          console.error('Error loading data:', error);
          setPlaybackMessage('Unable to load Supabase data for the current playback time.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadSnapshotAtPlaybackTime();
    return () => {
      isCancelled = true;
    };
  }, [playbackTime]);

  useEffect(() => {
    if (!selectedSensor || latestData.length === 0) {
      setHistoricalData([]);
      return;
    }

    const activeSensorRow = latestData.find((sensor) => sensor.sensor_name === selectedSensor);
    if (!activeSensorRow) {
      setHistoricalData([]);
      return;
    }

    let isCancelled = false;
    const anchorId = Number(activeSensorRow.id);

    const loadSelectedSensorHistory = async () => {
      try {
        const historical = await fetchHistoricalSensorData(
          selectedSensor,
          Number.isFinite(anchorId) ? anchorId : undefined,
          30,
        );

        if (!isCancelled) {
          const anchorRow = activeSensorRow;
          const hasAnchor = historical.some((row) => row.id === anchorRow.id);
          const merged = hasAnchor
            ? historical
            : [...historical, anchorRow].sort((a, b) => Number(a.id) - Number(b.id));

          setHistoricalData(merged.slice(-30));
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error loading historical data:', error);
          setHistoricalData([]);
        }
      }
    };

    loadSelectedSensorHistory();
    return () => {
      isCancelled = true;
    };
  }, [latestData, playbackTime, selectedSensor]);

  useEffect(() => {
    if (!isPlaybackRunning) {
      return;
    }

    const timer = setInterval(() => {
      setSecondsUntilNextUpdate((previous) => (previous > 0 ? previous - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaybackRunning]);

  useEffect(() => {
    if (!isPlaybackRunning || secondsUntilNextUpdate > 0) {
      return;
    }

    if (playbackTime.getTime() >= PLAYBACK_END.getTime()) {
      return;
    }

    setPlaybackTime((currentPlaybackTime) => {
      const next = new Date(currentPlaybackTime.getTime() + PLAYBACK_STEP_MS);
      return next > PLAYBACK_END ? new Date(PLAYBACK_END.getTime()) : next;
    });
    setSecondsUntilNextUpdate(PLAYBACK_STEP_SECONDS);
  }, [isPlaybackRunning, playbackTime, secondsUntilNextUpdate]);

  useEffect(() => {
    setJumpDate(toDateInputValue(playbackTime));
    setJumpTime(toTimeInputValue(playbackTime));
  }, [playbackTime]);

  useEffect(() => {
    if (playbackTime.getTime() >= PLAYBACK_END.getTime() && isPlaybackRunning) {
      setIsPlaybackRunning(false);
      setPlaybackMessage('Reached playback end date.');
      setSecondsUntilNextUpdate(0);
    }
  }, [isPlaybackRunning, playbackTime]);

  useEffect(() => {
    if (!isAlertPanelOpen) {
      return;
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAlertPanelOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isAlertPanelOpen]);

  useEffect(() => {
    setIsAlertPanelOpen(false);
  }, [activePage]);

  const filteredSensors = useMemo(() => {
    return latestData.filter((sensor) => sensor.section === activeSection);
  }, [latestData, activeSection]);

  const sectionKpi = useMemo(() => {
    const totalSensors = filteredSensors.length;
    const faultSensors = filteredSensors.filter((sensor) => sensor.status_flag === 'FAULT').length;
    const normalSensors = totalSensors - faultSensors;
    const healthPercent = totalSensors > 0 ? Math.round((normalSensors / totalSensors) * 100) : 0;

    return {
      totalSensors,
      faultSensors,
      normalSensors,
      healthPercent,
    };
  }, [filteredSensors]);

  const logSections = useMemo(() => {
    return Array.from(new Set(logEntries.map((sensor) => sensor.section))).sort();
  }, [logEntries]);

  const parseSensorDateTime = (sensor: SensorData): number => {
    const [day, month, year] = sensor.date.split('/').map(Number);
    const [hour, minute, second] = sensor.time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, second).getTime();
  };

  const logRows = useMemo(() => {
    const term = logSearchQuery.trim().toLowerCase();

    return [...logEntries]
      .sort((a, b) => {
        const timeDiff = parseSensorDateTime(b) - parseSensorDateTime(a);
        if (timeDiff !== 0) {
          return timeDiff;
        }

        const numericA = Number(a.id);
        const numericB = Number(b.id);

        if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
          return numericB - numericA;
        }

        return String(b.id).localeCompare(String(a.id));
      })
      .filter((sensor) => {
        const matchesTerm = !term || (
          sensor.sensor_name.toLowerCase().includes(term)
          || sensor.section.toLowerCase().includes(term)
          || sensor.status_flag.toLowerCase().includes(term)
          || `${sensor.date} ${sensor.time}`.toLowerCase().includes(term)
        );

        const matchesSection = logSectionFilter === 'ALL' || sensor.section === logSectionFilter;
        const matchesStatus = logStatusFilter === 'ALL' || sensor.status_flag === logStatusFilter;

        return matchesTerm && matchesSection && matchesStatus;
      });
  }, [logEntries, logSearchQuery, logSectionFilter, logStatusFilter]);

  const activeAlerts = useMemo(() => latestData.filter((sensor) => sensor.status_flag === 'FAULT'), [latestData]);
  const faultCount = activeAlerts.length;
  const paintSensorFault = useMemo(() => (
    activeAlerts.find((sensor) => sensor.sensor_name.toLowerCase().includes('paint')) ?? null
  ), [activeAlerts]);
  const primaryAlert = paintSensorFault ?? activeAlerts[0] ?? null;
  const isCriticalAlert = Boolean(primaryAlert);
  const activeAlertName = primaryAlert ? primaryAlert.sensor_name.replace(/_/g, ' ') : 'Paint Sensor';
  const activeAlertValue = primaryAlert ? `${primaryAlert.value.toFixed(1)} ${primaryAlert.unit}` : 'Within range';
  const machineStatusLabel = isMotorOn
    ? isCriticalAlert
      ? 'Blower Active - Fault Response'
      : 'Blower Active - Manual Override'
    : isCriticalAlert
      ? 'Blower OFF - Manual Hold'
      : 'Blower OFF - Normal Condition';
  const conditionLabel = isCriticalAlert
    ? paintSensorFault
      ? 'Paint Sensor Fault'
      : `${activeAlertName} Fault`
    : 'Paint Sensor Normal';
  const conditionDescription = isCriticalAlert
    ? `${activeAlertName} is outside threshold at ${activeAlertValue}. Inspect blower and paint feed line immediately.`
    : isMotorOn
      ? 'Paint line is normal and motor is running in manual override mode.'
      : 'Paint line is within expected process thresholds and the motor is automatically turned OFF.';
  const alertHistory = useMemo(
    () => [...activeAlerts].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 4),
    [activeAlerts],
  );

  useEffect(() => {
    // Fault state always forces motor ON. Normal state allows manual override.
    if (isCriticalAlert) {
      setIsMotorOn(true);
      setIsManualMotorOverride(false);
      return;
    }

    if (!isManualMotorOverride) {
      setIsMotorOn(false);
    }
  }, [isCriticalAlert, isManualMotorOverride, latestData]);

  const systemKpi = useMemo(() => {
    const totalSensors = latestData.length;
    const normalSensors = latestData.filter((sensor) => sensor.status_flag === 'NORMAL').length;
    const healthPercent = totalSensors > 0 ? Math.round((normalSensors / totalSensors) * 100) : 0;

    if (totalSensors === 0) {
      return {
        healthPercent,
        statusText: 'No Data',
        statusClass: 'border border-slate-200 bg-slate-100 text-slate-700',
      };
    }

    if (faultCount === 0) {
      return {
        healthPercent,
        statusText: 'Optimal',
        statusClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    }

    if (faultCount <= 2) {
      return {
        healthPercent,
        statusText: 'Warning',
        statusClass: 'border border-amber-200 bg-amber-50 text-amber-700',
      };
    }

    return {
      healthPercent,
      statusText: 'Critical',
      statusClass: 'border border-red-200 bg-red-50 text-red-700',
    };
  }, [faultCount, latestData]);

  const handleJumpToPlaybackTime = () => {
    const parsed = toDateFromInput(jumpDate, jumpTime);
    if (!parsed) {
      setPlaybackMessage('Please select a valid date and time.');
      return;
    }

    const clamped = clampPlaybackTime(parsed);
    setPlaybackTime(clamped);
    setPlaybackMessage(`Jumped to ${toDateText(clamped)} ${toTimeText(clamped)}.`);
    setSecondsUntilNextUpdate(PLAYBACK_STEP_SECONDS);
  };

  const handleOpenSensorFromLogs = (sensor: SensorData) => {
    setSelectedSensor(sensor.sensor_name);
    setActiveSection(sensor.section);
    setActivePage('dashboard');
  };

  return (
    <div className="h-screen overflow-hidden flex bg-saas-bg">
      {/* SaaS Sidebar */}
      <aside className={cn(
        "bg-saas-sidebar border-r border-saas-border flex flex-col shrink-0 transition-all duration-300 z-50",
        isSidebarOpen ? "w-64" : "w-20"
      )}>
        <div className={cn(
          "h-16 flex items-center border-b border-saas-border",
          isSidebarOpen ? "px-6" : "px-3 justify-center"
        )}>
          <button
            onClick={() => setIsSidebarOpen((open) => !open)}
            className={cn(
              "flex items-center rounded-lg p-1 transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saas-accent/40",
              isSidebarOpen ? "gap-3" : "justify-center"
            )}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <div className="w-8 h-8 min-w-8 min-h-8 shrink-0 bg-saas-accent rounded-lg flex items-center justify-center shadow-sm">
              <Zap className="w-5 h-5 text-white" />
            </div>
            {isSidebarOpen && (
              <span className="text-sm font-bold tracking-tight text-saas-text-primary">STP Control</span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8 custom-scrollbar">
          {/* Main Nav */}
          <nav className="space-y-1">
            {[
              { icon: LayoutDashboard, label: 'Dashboard', key: 'dashboard' as AppPage },
              { icon: Database, label: 'Logs', key: 'logs' as AppPage },
            ].map((item) => (
              <button 
                key={item.key}
                onClick={() => setActivePage(item.key)}
                className={cn(
                  "saas-sidebar-item w-full",
                  activePage === item.key ? "saas-sidebar-item-active" : "saas-sidebar-item-inactive",
                  !isSidebarOpen && "justify-center px-0"
                )}
              >
                <item.icon className="w-4 h-4" />
                {isSidebarOpen && <span>{item.label}</span>}
              </button>
            ))}
          </nav>

          {/* Sections Nav */}
          <div className={cn("space-y-4", activePage !== 'dashboard' && "opacity-60 pointer-events-none")}>
            {isSidebarOpen && (
              <h3 className="px-3 text-[10px] font-bold text-saas-text-secondary uppercase tracking-wider">
                Plant Sections
              </h3>
            )}
            <nav className="space-y-1">
              {SECTIONS.map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={cn(
                    "saas-sidebar-item w-full",
                    activeSection === section ? "saas-sidebar-item-active" : "saas-sidebar-item-inactive",
                    !isSidebarOpen && "justify-center px-0"
                  )}
                >
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    activeSection === section ? "bg-saas-accent" : "bg-gray-300"
                  )} />
                  {isSidebarOpen && <span className="truncate">{section}</span>}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-saas-border bg-white">
          <button
            onClick={() => setActivePage('settings')}
            className={cn(
            "saas-sidebar-item w-full",
            activePage === 'settings' ? "saas-sidebar-item-active" : "saas-sidebar-item-inactive",
            !isSidebarOpen && "justify-center px-0"
          )}
          >
            <Settings className="w-4 h-4" />
            {isSidebarOpen && <span>Settings</span>}
          </button>
          <div className={cn(
            "mt-4 flex items-center gap-3 px-3 py-2",
            !isSidebarOpen && "justify-center px-0"
          )}>
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-saas-border">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-saas-text-primary truncate">Felix Admin</p>
                <p className="text-[10px] font-medium text-saas-text-secondary truncate">felix@stp.io</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* SaaS Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Simple Header */}
        <header className="shrink-0 border-b border-slate-200 bg-white z-40">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-8">
            <div className="flex items-center gap-2 text-base font-black tracking-tight text-slate-800">
              <span>{PAGE_LABELS[activePage]}</span>
              {activePage === 'dashboard' && (
                <>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                  <span className="font-black text-slate-900">{activeSection}</span>
                </>
              )}
            </div>

            <div className="hidden items-center gap-3 text-sm font-bold text-slate-700 lg:flex">
              {activePage === 'dashboard' && (
                <>
                  <span>{latestData.length} Sensors</span>
                  <span className="h-4 w-px bg-slate-200" />
                  <span className={faultCount > 0 ? 'text-red-600' : 'text-emerald-600'}>{faultCount} Active Faults</span>
                </>
              )}
              {activePage === 'logs' && (
                <>
                  <span>{logRows.length} / {logEntries.length} Log Entries</span>
                  <span className="h-4 w-px bg-slate-200" />
                  <span>Snapshot: {toDateText(playbackTime)} {toTimeText(playbackTime)}</span>
                </>
              )}
              {activePage === 'settings' && <span>Configuration Center</span>}
            </div>
          </div>
        </header>

        {/* SaaS Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[radial-gradient(circle_at_top_right,_#dbeafe_0%,_#f8fafc_40%,_#f8fafc_100%)] p-4 sm:p-8">
          <div className="max-w-[1400px] mx-auto space-y-8">
            {activePage === 'dashboard' && (
              <>
            {/* Page Header Section */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,4fr)_minmax(220px,1fr)] xl:items-stretch">
              <section className="h-full min-h-[260px] rounded-2xl border border-slate-200 bg-white px-4 py-5 sm:px-6">
                <div className="flex h-full flex-col justify-between gap-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Process Monitoring</p>
                      <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{activeSection} Monitoring</h1>
                      <p className="text-sm font-medium text-slate-600">
                        Manage and monitor all sensors in the {activeSection.toLowerCase()} section.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <span className="inline-flex h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
                        {latestData.length} Sensors Online
                      </span>
                      <span className="inline-flex h-9 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700">
                        {faultCount} Active Alerts
                      </span>
                      <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700">
                        <Clock className="h-3.5 w-3.5" />
                        {toDateText(playbackTime)} {toTimeText(playbackTime)}
                      </span>
                      <span className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold",
                        isPlaybackRunning
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      )}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        {isPlaybackRunning ? toDisplayDuration(secondsUntilNextUpdate) : 'Paused'}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <article className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Section Health</p>
                      <p className="mt-1 text-2xl font-black tracking-tight text-emerald-800">{sectionKpi.healthPercent}%</p>
                      <p className="mt-1 text-[11px] font-semibold text-emerald-700/90">
                        {sectionKpi.normalSensors} of {sectionKpi.totalSensors} sensors normal
                      </p>
                    </article>

                    <article className={cn(
                      'rounded-xl border px-4 py-3',
                      sectionKpi.faultSensors > 0
                        ? 'border-red-100 bg-red-50/70'
                        : 'border-blue-100 bg-blue-50/70',
                    )}>
                      <p className={cn(
                        'text-[10px] font-bold uppercase tracking-[0.14em]',
                        sectionKpi.faultSensors > 0 ? 'text-red-700' : 'text-blue-700',
                      )}>Section Faults</p>
                      <p className={cn(
                        'mt-1 text-2xl font-black tracking-tight',
                        sectionKpi.faultSensors > 0 ? 'text-red-800' : 'text-blue-800',
                      )}>{sectionKpi.faultSensors}</p>
                      <p className={cn(
                        'mt-1 text-[11px] font-semibold',
                        sectionKpi.faultSensors > 0 ? 'text-red-700/90' : 'text-blue-700/90',
                      )}>
                        {sectionKpi.faultSensors > 0 ? 'Attention required in this section' : 'No active section faults'}
                      </p>
                    </article>

                    <article className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Replay Status</p>
                      <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">
                        {isPlaybackRunning ? 'Live Replay' : 'Paused'}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-600">
                        Next update in {isPlaybackRunning ? toDisplayDuration(secondsUntilNextUpdate) : '00:00'}
                      </p>
                    </article>
                  </div>
                </div>
              </section>

              <div className="flex h-full">
                <div
                  className={cn(
                    'h-full min-h-[260px] w-full rounded-3xl border p-4 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.45)] transition-all sm:p-5',
                    isCriticalAlert
                      ? 'border-red-200 bg-red-50/70 shadow-[0_18px_34px_-22px_rgba(220,38,38,0.85)]'
                      : 'border-blue-200 bg-blue-50/70 shadow-[0_18px_34px_-22px_rgba(37,99,235,0.55)]',
                  )}
                >
                  <div className="flex flex-col items-center gap-5">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <span
                        className={cn(
                          'relative inline-flex h-20 w-20 items-center justify-center rounded-2xl border bg-white shadow-sm',
                          isCriticalAlert ? 'border-red-200' : 'border-blue-200',
                          !isMotorOn && 'opacity-55',
                        )}
                      >
                        <Fan
                          className={cn(
                            'h-11 w-11',
                            isMotorOn && 'stp-blower-spin-slow',
                            isCriticalAlert ? 'text-red-600' : 'text-blue-600',
                          )}
                        />
                      </span>

                      <p className={cn(
                        'text-base font-black tracking-tight',
                        isCriticalAlert ? 'text-red-700' : 'text-blue-700',
                      )}>
                        Motor Alert
                      </p>
                    </div>

                    <div className="w-full space-y-2">
                      <button
                        type="button"
                        onClick={() => setIsAlertPanelOpen(true)}
                        aria-label="Open motor alert console"
                        className={cn(
                          'h-10 w-full rounded-lg border text-xs font-bold uppercase tracking-wide transition-colors',
                          isCriticalAlert
                            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                            : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
                        )}
                      >
                        Open Console
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const nextMotorState = !isMotorOn;
                          setIsMotorOn(nextMotorState);

                          if (!isCriticalAlert) {
                            setIsManualMotorOverride(nextMotorState);
                          }
                        }}
                        aria-label="Toggle motor power"
                        className={cn(
                          'h-10 w-full rounded-lg border text-xs font-bold uppercase tracking-wide transition-colors',
                          isMotorOn
                            ? isCriticalAlert
                              ? 'border-red-300 bg-red-600 text-white hover:bg-red-700'
                              : 'border-blue-300 bg-blue-600 text-white hover:bg-blue-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {isCriticalAlert
                          ? isMotorOn ? 'Motor AUTO ON' : 'Motor OFF'
                          : isMotorOn ? 'Motor MANUAL ON' : 'Motor AUTO OFF'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {isAlertPanelOpen && (
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/35 p-4"
                onClick={() => setIsAlertPanelOpen(false)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Motor Alert Console"
                  onClick={(event) => event.stopPropagation()}
                  className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl ring-1 ring-slate-100"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Motor Alert Console</p>
                      <h3 className="mt-1 text-sm font-black text-slate-900">Blower & Paint Line</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'inline-flex h-7 items-center rounded-lg border px-2.5 text-[10px] font-bold uppercase',
                        isCriticalAlert
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-blue-200 bg-blue-50 text-blue-700',
                      )}>
                        {isCriticalAlert ? 'Critical' : 'Normal'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAlertPanelOpen(false)}
                        aria-label="Close motor alert console"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Motor Visualization</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white">
                        <Fan
                          className={cn(
                            'h-4 w-4',
                            isMotorOn
                              ? isCriticalAlert
                                ? 'stp-blower-spin-fast text-red-600'
                                : 'stp-blower-spin-slow text-blue-600'
                              : 'text-slate-400',
                          )}
                        />
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            isMotorOn
                              ? isCriticalAlert
                                ? 'bg-red-500'
                                : 'bg-blue-500'
                              : 'bg-slate-400',
                          )}
                          style={{ width: isMotorOn ? (isCriticalAlert ? '88%' : '52%') : '0%' }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-[11px] font-semibold text-slate-700">
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <span className="text-slate-500">Alert Type</span>
                      <span>{conditionLabel}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <span className="text-slate-500">Severity</span>
                      <span>{isCriticalAlert ? 'Critical' : 'Normal'}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <span className="text-slate-500">Timestamp</span>
                      <span>{toDateText(playbackTime)} {toTimeText(playbackTime)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <span className="text-slate-500">Machine Status</span>
                      <span>{machineStatusLabel}</span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Description</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">{conditionDescription}</p>
                  </div>

                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Recent Alert History</p>
                    {alertHistory.length > 0 ? (
                      <div className="mt-2 space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                        {alertHistory.map((alert) => (
                          <div key={alert.id} className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/70 px-2.5 py-2">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-bold text-red-800">{alert.sensor_name.replace(/_/g, ' ')}</p>
                              <p className="truncate text-[10px] font-semibold text-red-700/90">{alert.section} • {alert.date} {alert.time}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-[11px] font-semibold text-blue-700">
                        No recent faults. Blower monitoring is stable.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Main Grid Layout */}
            <div className="grid grid-cols-12 gap-8">
              {/* Analytics Column */}
              <div className="col-span-12 lg:col-span-8 space-y-8">
                <ChartPanel 
                  data={historicalData} 
                  sensorName={selectedSensor} 
                />

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  {/* System Health Card */}
                  <div className="saas-card p-6 bg-white">
                    <h3 className="text-sm font-bold text-saas-text-primary mb-4">Plant Health</h3>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-saas-text-secondary">Overall Status</span>
                        <span className={cn("inline-flex h-8 items-center rounded-xl px-3.5 text-[11px] font-bold uppercase tracking-wide shadow-sm", systemKpi.statusClass)}>{systemKpi.statusText}</span>
                      </div>
                      <div className="relative pt-1">
                        <div className="flex mb-2 items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold inline-block py-1 px-2 uppercase rounded-full text-saas-accent bg-saas-accent/10">
                              Healthy Sensors
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold inline-block text-saas-accent">
                              {systemKpi.healthPercent}%
                            </span>
                          </div>
                        </div>
                        <div className="overflow-hidden h-1.5 mb-4 text-xs flex rounded bg-gray-100">
                          <div style={{ width: `${systemKpi.healthPercent}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-saas-accent"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Alerts Card */}
                  <div className="saas-card p-6 bg-white">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-saas-text-primary">Recent Alerts</h3>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 items-center rounded-xl border border-red-200 bg-red-50 px-3.5 text-[11px] font-bold text-red-700 shadow-sm">
                          {faultCount} Active
                        </span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {activeAlerts.length > 0 ? (
                        activeAlerts.map((fault, i) => {
                          const bounds = resolveThresholdBounds(fault.sensor_name);
                          return (
                          <div key={i} className="flex gap-3 p-3 rounded-lg bg-red-50/50 border border-red-100">
                            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                            <div className="w-full space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-red-900">{fault.sensor_name.replace(/_/g, ' ')}</p>
                                <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                  {fault.section}
                                </span>
                              </div>
                              <p className="text-[10px] font-medium text-red-600">
                                Current: {fault.value.toFixed(1)} {fault.unit}
                              </p>
                              {bounds && (
                                <p className="text-[10px] font-medium text-red-600/90">
                                  Threshold: {bounds.minThreshold.toFixed(1)} - {bounds.maxThreshold.toFixed(1)} {fault.unit}
                                </p>
                              )}
                            </div>
                          </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-8">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-20" />
                          <p className="text-xs font-medium text-saas-text-secondary">No active alerts</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar Column */}
              <div className="col-span-12 lg:col-span-4 space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-saas-text-primary uppercase tracking-wider">Active Sensors</h3>
                    <span className="text-xs font-medium text-saas-text-secondary">{filteredSensors.length} sensors found</span>
                  </div>
                  {isLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-500">
                      Loading sensor snapshot...
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {filteredSensors.map((sensor) => (
                        <SensorCard
                          key={sensor.sensor_name}
                          data={sensor}
                          isSelected={selectedSensor === sensor.sensor_name}
                          onClick={() => setSelectedSensor(sensor.sensor_name)}
                        />
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
            </>
            )}

            {activePage === 'logs' && (
              <motion.section
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-3xl bg-white/95 p-5 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.35)] ring-1 ring-slate-100 sm:p-8"
              >
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-slate-900">Operational Logs</h2>
                    <p className="mt-1 text-sm font-medium text-slate-600">Live log buffer that appends records from each minute snapshot (00:00, 00:01, 00:02...).</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_180px_140px_auto_auto]">
                    <input
                      value={logSearchQuery}
                      onChange={(event) => setLogSearchQuery(event.target.value)}
                      placeholder="Search by sensor, section, status, or timestamp"
                      className="h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-saas-accent/50 focus:ring-2 focus:ring-saas-accent/15"
                    />

                    <select
                      value={logSectionFilter}
                      onChange={(event) => setLogSectionFilter(event.target.value as SensorSection | 'ALL')}
                      className="h-10 rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-saas-accent/50 focus:ring-2 focus:ring-saas-accent/15"
                    >
                      <option value="ALL">All Sections</option>
                      {logSections.map((section) => (
                        <option key={section} value={section}>{section}</option>
                      ))}
                    </select>

                    <select
                      value={logStatusFilter}
                      onChange={(event) => setLogStatusFilter(event.target.value as LogStatusFilter)}
                      className="h-10 rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-saas-accent/50 focus:ring-2 focus:ring-saas-accent/15"
                    >
                      <option value="ALL">All Status</option>
                      <option value="NORMAL">Normal</option>
                      <option value="FAULT">Fault</option>
                    </select>

                    <button
                      onClick={() => {
                        setLogSearchQuery('');
                        setLogSectionFilter('ALL');
                        setLogStatusFilter('ALL');
                      }}
                      className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      Clear Filters
                    </button>

                    <button
                      onClick={() => setLogEntries([])}
                      className="h-10 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 transition-colors hover:bg-red-100"
                    >
                      Clear Logs
                    </button>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {isLoading ? (
                    <div className="p-6 text-sm font-semibold text-slate-500">Loading logs...</div>
                  ) : logRows.length === 0 ? (
                    <div className="p-6 text-sm font-semibold text-slate-500">
                      {logEntries.length === 0
                        ? 'No log records yet. New rows will be appended every playback minute.'
                        : 'No log rows matched your search.'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50/90">
                          <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
                            <th className="px-4 py-3">Timestamp</th>
                            <th className="px-4 py-3">Sensor</th>
                            <th className="px-4 py-3">Section</th>
                            <th className="px-4 py-3">Value</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {logRows.map((sensor) => (
                            <tr key={sensor.id} className="text-xs font-medium text-slate-700">
                              <td className="px-4 py-3 whitespace-nowrap">{sensor.date} {sensor.time}</td>
                              <td className="px-4 py-3">{sensor.sensor_name.replace(/_/g, ' ')}</td>
                              <td className="px-4 py-3">{sensor.section}</td>
                              <td className="px-4 py-3">{sensor.value.toFixed(2)} {sensor.unit}</td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  "inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase",
                                  sensor.status_flag === 'FAULT'
                                    ? "border-red-200 bg-red-50 text-red-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                )}>
                                  {sensor.status_flag}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleOpenSensorFromLogs(sensor)}
                                  className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 transition-colors hover:bg-blue-100"
                                >
                                  Open
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.section>
            )}

            {activePage === 'settings' && (
              <motion.section
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="grid gap-6 lg:grid-cols-2"
              >
                <div className="rounded-3xl bg-white p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.35)] ring-1 ring-slate-100">
                  <h2 className="text-xl font-black text-slate-900">Replay Controls</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">Review timeline state and reset playback when needed.</p>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      Current playback: {toDateText(playbackTime)} {toTimeText(playbackTime)}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        type="date"
                        value={jumpDate}
                        min={toDateInputValue(PLAYBACK_START)}
                        max={toDateInputValue(PLAYBACK_END)}
                        onChange={(event) => setJumpDate(event.target.value)}
                        className="h-10 rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-saas-accent/50 focus:ring-2 focus:ring-saas-accent/15"
                      />
                      <input
                        type="time"
                        value={jumpTime}
                        step={60}
                        onChange={(event) => setJumpTime(event.target.value)}
                        className="h-10 rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-saas-accent/50 focus:ring-2 focus:ring-saas-accent/15"
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-1">
                      <button
                        onClick={() => {
                          setPlaybackTime(new Date(PLAYBACK_START.getTime()));
                          setSecondsUntilNextUpdate(PLAYBACK_STEP_SECONDS);
                          setPlaybackMessage(`Jumped to ${toDateText(PLAYBACK_START)} ${toTimeText(PLAYBACK_START)}.`);
                        }}
                        className="h-10 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        Reset To Start
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.35)] ring-1 ring-slate-100">
                  <h2 className="text-xl font-black text-slate-900">Alert Preferences</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">Enable automation and open relevant monitoring pages quickly.</p>

                  <div className="mt-5 space-y-4">
                    <button
                      onClick={() => setIsAlertsAutoEnabled((enabled) => !enabled)}
                      className={cn(
                        "inline-flex h-10 w-full items-center justify-between rounded-xl border px-4 text-sm font-bold transition-colors",
                        isAlertsAutoEnabled
                          ? "border-saas-accent/40 bg-saas-accent/10 text-saas-accent"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      <span>Automatic alert mode</span>
                      <span>{isAlertsAutoEnabled ? 'ON' : 'OFF'}</span>
                    </button>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => setActivePage('dashboard')}
                        className="h-10 rounded-xl border border-blue-200 bg-blue-50 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        Go To Dashboard
                      </button>
                      <button
                        onClick={() => setActivePage('logs')}
                        className="h-10 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
                      >
                        Go To Logs
                      </button>
                    </div>

                    {playbackMessage && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        {playbackMessage}
                      </div>
                    )}
                  </div>
                </div>
              </motion.section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
