export type StatusFlag = 'NORMAL' | 'FAULT';

export interface SensorData {
  id: string;
  date: string;
  time: string;
  sensor_name: string;
  value: number;
  status_flag: StatusFlag;
  unit: string;
  section: SensorSection;
  description: string;
}

export type SensorSection = 
  | 'Influent'
  | 'Aeration'
  | 'Biological'
  | 'Nitrogen Removal'
  | 'IFAS Biofilm'
  | 'Sludge'
  | 'Chemical & Disinfection'
  | 'Effluent'
  | 'Digestion'
  | 'System';

export interface SensorMetadata {
  name: string;
  section: SensorSection;
  unit: string;
  description: string;
  min: number;
  max: number;
  thresholdMin?: number;
  thresholdMax?: number;
}

export const SENSOR_METADATA: Record<string, SensorMetadata> = {
  'Influent_Quality': { name: 'Influent Quality', section: 'Influent', unit: 'mg/L', description: 'Combined influent quality index', min: 250, max: 300 },
  'Influent_Quality_BOD': { name: 'Influent BOD', section: 'Influent', unit: 'mg/L', description: 'Biochemical Oxygen Demand in influent', min: 100, max: 400 },
  'Influent_Quality_COD': { name: 'Influent COD', section: 'Influent', unit: 'mg/L', description: 'Chemical Oxygen Demand in influent', min: 200, max: 800 },
  'Influent_Quality_pH': { name: 'Influent pH', section: 'Influent', unit: 'pH', description: 'Acidity/Alkalinity of influent', min: 6.5, max: 8.5 },
  'Influent_Quality_TSS': { name: 'Influent TSS', section: 'Influent', unit: 'mg/L', description: 'Total Suspended Solids in influent', min: 150, max: 500 },
  'Influent_Flow': { name: 'Influent Flow', section: 'Influent', unit: 'm³/h', description: 'Raw sewage flow rate', min: 150, max: 200 },
  'Influent_Temperature': { name: 'Influent Temp', section: 'Influent', unit: '°C', description: 'Influent wastewater temperature', min: 25, max: 30 },
  
  'Aeration_DO': { name: 'Aeration DO', section: 'Aeration', unit: 'mg/L', description: 'Dissolved Oxygen in aeration tank', min: 2, max: 4 },
  'Aeration_Airflow': { name: 'Aeration Airflow', section: 'Aeration', unit: 'Nm³/h', description: 'Air supply to aeration basins', min: 8000, max: 9000 },
  'Aeration_Energy': { name: 'Aeration Energy', section: 'Aeration', unit: 'kW', description: 'Blower power consumption', min: 130, max: 160 },
  
  'MLSS_Data': { name: 'MLSS', section: 'Biological', unit: 'mg/L', description: 'Mixed Liquor Suspended Solids', min: 3500, max: 4500 },
  'SRT_Data': { name: 'SRT', section: 'Biological', unit: 'days', description: 'Sludge Retention Time', min: 15, max: 25 },
  'FM_Ratio': { name: 'F/M Ratio', section: 'Biological', unit: 'kg/kg·d', description: 'Food to Microorganism ratio', min: 0.2, max: 0.4 },
  
  'Ammonia_Profile': { name: 'Ammonia Profile', section: 'Nitrogen Removal', unit: 'mg/L', description: 'Ammonia concentration in biological stage', min: 5, max: 10 },
  'Nitrification_Rate': { name: 'Nitrification Rate', section: 'Nitrogen Removal', unit: 'mg/L·h', description: 'Rate of ammonia conversion to nitrate', min: 60, max: 90 },
  'Denitrification_Rate': { name: 'Denitrification Rate', section: 'Nitrogen Removal', unit: 'mg/L·h', description: 'Rate of nitrate conversion to nitrogen gas', min: 50, max: 80 },
  
  'Biofilm_Health': { name: 'Biofilm Health', section: 'IFAS Biofilm', unit: '%', description: 'Health index of IFAS carriers', min: 70, max: 100 },
  'Biofilm_Stress': { name: 'Biofilm Stress', section: 'IFAS Biofilm', unit: 'index', description: 'Stress level on biofilm carriers', min: 10, max: 40 },
  
  'Sludge_Flow_RAS': { name: 'RAS Flow', section: 'Sludge', unit: 'm³/h', description: 'Return Activated Sludge flow', min: 50, max: 250 },
  'Sludge_Flow_WAS': { name: 'WAS Flow', section: 'Sludge', unit: 'm³/h', description: 'Waste Activated Sludge flow', min: 5, max: 30 },
  'Sludge_Flow': { name: 'Sludge Flow', section: 'Sludge', unit: 'm³/h', description: 'Combined sludge flow rate', min: 100, max: 150 },
  'Sludge_Settling_SVI': { name: 'Sludge SVI', section: 'Sludge', unit: 'mL/g', description: 'Sludge Volume Index', min: 80, max: 150 },
  'Sludge_Settling': { name: 'Sludge Settling', section: 'Sludge', unit: 'mL/g', description: 'Sludge settling quality metric', min: 90, max: 130 },
  
  'Chemical_Dosing': { name: 'Coagulant Dose', section: 'Chemical & Disinfection', unit: 'L/h', description: 'Chemical coagulant dosing rate', min: 20, max: 40 },
  'Chlorine_Dosing': { name: 'Chlorine Dose', section: 'Chemical & Disinfection', unit: 'kg/h', description: 'Disinfectant dosing rate', min: 1, max: 2 },
  'Chlorine_Residual': { name: 'Chlorine Residual', section: 'Chemical & Disinfection', unit: 'mg/L', description: 'Residual chlorine in contact tank', min: 0.3, max: 1 },
  
  'Effluent_Quality_BOD': { name: 'Effluent BOD', section: 'Effluent', unit: 'mg/L', description: 'BOD in treated effluent', min: 0, max: 10 },
  'Effluent_Quality_TSS': { name: 'Effluent TSS', section: 'Effluent', unit: 'mg/L', description: 'TSS in treated effluent', min: 0, max: 10 },
  'Effluent_Quality_TN': { name: 'Effluent TN', section: 'Effluent', unit: 'mg/L', description: 'Total Nitrogen in effluent', min: 0, max: 15 },
  'Effluent_Quality_NH3': { name: 'Effluent NH3', section: 'Effluent', unit: 'mg/L', description: 'Ammonia in effluent', min: 0, max: 1.0 },
  'Effluent_Quality': { name: 'Effluent Quality', section: 'Effluent', unit: 'mg/L', description: 'Combined treated effluent quality index', min: 2, max: 10 },
  
  'Digester_Feed': { name: 'Digester Feed', section: 'Digestion', unit: 'm³/d', description: 'Sludge feed to anaerobic digester', min: 30, max: 50 },
  'Digester_Biogas': { name: 'Biogas Yield', section: 'Digestion', unit: 'm³/h', description: 'Biogas production rate', min: 200, max: 300 },
  'Digester_Health': { name: 'Digester Health', section: 'Digestion', unit: '%', description: 'Digester stability index', min: 6.5, max: 8 },
  
  'Equipment_Health': { name: 'Equipment Health', section: 'System', unit: '%', description: 'Overall mechanical health index', min: 80, max: 100 },
};
