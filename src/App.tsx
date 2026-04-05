import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  AlertCircle, 
  RefreshCw,
  ChevronRight,
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [playbackTime, setPlaybackTime] = useState<Date>(new Date(PLAYBACK_START.getTime()));
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(true);
  const [isAlertsAutoEnabled, setIsAlertsAutoEnabled] = useState(false);
  const [playbackMessage, setPlaybackMessage] = useState<string>('');
  const [jumpDate, setJumpDate] = useState<string>(toDateInputValue(PLAYBACK_START));
  const [jumpTime, setJumpTime] = useState<string>(toTimeInputValue(PLAYBACK_START));
  const [secondsUntilNextUpdate, setSecondsUntilNextUpdate] = useState<number>(PLAYBACK_STEP_MS / 1000);

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
      setSecondsUntilNextUpdate((previous) => {
        if (previous <= 1) {
          setPlaybackTime((currentPlaybackTime) => {
            const next = new Date(currentPlaybackTime.getTime() + PLAYBACK_STEP_MS);
            return next > PLAYBACK_END ? new Date(PLAYBACK_END.getTime()) : next;
          });
          return PLAYBACK_STEP_MS / 1000;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaybackRunning]);

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

  const filteredSensors = useMemo(() => {
    return latestData.filter((sensor) => sensor.section === activeSection);
  }, [latestData, activeSection]);

  const logSections = useMemo(() => {
    return Array.from(new Set(latestData.map((sensor) => sensor.section))).sort();
  }, [latestData]);

  const logRows = useMemo(() => {
    const term = logSearchQuery.trim().toLowerCase();

    return [...latestData]
      .sort((a, b) => Number(b.id) - Number(a.id))
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
  }, [latestData, logSearchQuery, logSectionFilter, logStatusFilter]);

  const activeAlerts = useMemo(() => latestData.filter((sensor) => sensor.status_flag === 'FAULT'), [latestData]);
  const faultCount = activeAlerts.length;

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
    setSecondsUntilNextUpdate(PLAYBACK_STEP_MS / 1000);
  };

  const handleOpenSensorFromLogs = (sensor: SensorData) => {
    setSelectedSensor(sensor.sensor_name);
    setActiveSection(sensor.section);
    setActivePage('dashboard');
  };

  return (
    <div className="min-h-screen flex bg-saas-bg">
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
      <main className="flex-1 flex flex-col min-h-screen">
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
                  <span>{logRows.length} Log Entries</span>
                  <span className="h-4 w-px bg-slate-200" />
                  <span>Snapshot: {toDateText(playbackTime)} {toTimeText(playbackTime)}</span>
                </>
              )}
              {activePage === 'settings' && <span>Configuration Center</span>}
            </div>
          </div>
        </header>

        {/* SaaS Content Area */}
        <div className="bg-[radial-gradient(circle_at_top_right,_#dbeafe_0%,_#f8fafc_40%,_#f8fafc_100%)] p-4 sm:p-8">
          <div className="max-w-[1400px] mx-auto space-y-8">
            {activePage === 'dashboard' && (
              <>
            {/* Page Header Section */}
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-5 sm:px-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Process Monitoring</p>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{activeSection} Monitoring</h1>
                  <p className="text-sm font-medium text-slate-600">
                    Manage and monitor all sensors in the {activeSection.toLowerCase()} section.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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

              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
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
                  <button
                    onClick={handleJumpToPlaybackTime}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Jump
                  </button>
                  <button
                    onClick={() => setIsPlaybackRunning((running) => !running)}
                    className={cn(
                      "h-10 rounded-xl border px-4 text-sm font-bold transition-colors",
                      isPlaybackRunning
                        ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    )}
                  >
                    {isPlaybackRunning ? 'Pause Replay' : 'Resume Replay'}
                  </button>
                </div>

                {playbackMessage && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    {playbackMessage}
                  </div>
                )}
              </div>
            </section>

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
                        {faultCount > 0 && (
                          <button
                            onClick={() => setIsAlertsAutoEnabled((enabled) => !enabled)}
                            className={cn(
                              "inline-flex h-8 items-center rounded-xl border px-3.5 text-[11px] font-bold uppercase tracking-wide shadow-sm transition-colors",
                              isAlertsAutoEnabled
                                ? "border-saas-accent/40 bg-saas-accent/10 text-saas-accent"
                                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                            )}
                          >
                            AUTO
                          </button>
                        )}
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
                    <p className="mt-1 text-sm font-medium text-slate-600">Search and inspect latest sensor records from the current playback snapshot.</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_180px_140px_auto]">
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
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {isLoading ? (
                    <div className="p-6 text-sm font-semibold text-slate-500">Loading logs...</div>
                  ) : logRows.length === 0 ? (
                    <div className="p-6 text-sm font-semibold text-slate-500">No log rows matched your search.</div>
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
                  <p className="mt-1 text-sm font-medium text-slate-600">Configure timeline behavior and playback jumps.</p>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      Current playback: {toDateText(playbackTime)} {toTimeText(playbackTime)}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
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
                      <button
                        onClick={handleJumpToPlaybackTime}
                        className="h-10 rounded-xl bg-saas-accent px-4 text-sm font-bold text-white transition-colors hover:bg-saas-accent-hover"
                      >
                        Apply
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => setIsPlaybackRunning((running) => !running)}
                        className={cn(
                          "h-10 rounded-xl border text-sm font-bold transition-colors",
                          isPlaybackRunning
                            ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        )}
                      >
                        {isPlaybackRunning ? 'Pause Replay' : 'Resume Replay'}
                      </button>
                      <button
                        onClick={() => {
                          setPlaybackTime(new Date(PLAYBACK_START.getTime()));
                          setSecondsUntilNextUpdate(PLAYBACK_STEP_MS / 1000);
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
