import React from 'react';
import { motion } from 'framer-motion';
import { 
  AlertCircle, 
  CheckCircle2, 
  Activity,
  MoreHorizontal
} from 'lucide-react';
import { SensorData } from '../types';
import { cn } from '../lib/utils';

interface SensorCardProps {
  data: SensorData;
  isSelected?: boolean;
  onClick?: () => void;
}

export const SensorCard: React.FC<SensorCardProps> = ({ data, isSelected, onClick }) => {
  const isFault = data.status_flag === 'FAULT';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        "saas-card p-5 cursor-pointer group relative overflow-hidden",
        isSelected && "ring-2 ring-saas-accent ring-offset-2"
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
            isFault ? "bg-red-50 text-red-600" : "bg-blue-50 text-saas-accent"
          )}>
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-saas-text-primary truncate max-w-[140px]">
              {data.sensor_name.replace(/_/g, ' ')}
            </h3>
            <p className="text-[11px] font-medium text-saas-text-secondary">
              {data.section}
            </p>
          </div>
        </div>
        <button className="text-saas-text-secondary hover:text-saas-text-primary p-1 rounded-md hover:bg-gray-50 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-baseline gap-1.5 mb-4">
        <span className="text-2xl font-bold tracking-tight text-saas-text-primary">
          {data.value.toFixed(1)}
        </span>
        <span className="text-xs font-semibold text-saas-text-secondary uppercase">
          {data.unit}
        </span>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-saas-border">
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
          isFault ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
        )}>
          {isFault ? (
            <>
              <AlertCircle className="w-3 h-3" />
              Fault
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3" />
              Optimal
            </>
          )}
        </div>

        <div className="text-[11px] font-semibold text-saas-text-secondary">
          {data.time}
        </div>
      </div>

      {/* Subtle hover effect background */}
      <div className="absolute inset-0 bg-saas-accent/0 group-hover:bg-saas-accent/[0.02] transition-colors pointer-events-none" />
    </motion.div>
  );
};
