import csv
import random
from datetime import datetime, timedelta

# Sensor configuration
sensors = [
    ("Influent_Quality", 250, 300, 270),
    ("Influent_Flow", 150, 200, 180),
    ("Influent_Temperature", 25, 30, 27),
    ("Aeration_DO", 2, 4, 2.6),
    ("Aeration_Airflow", 8000, 9000, 8500),
    ("Aeration_Energy", 130, 160, 145),
    ("MLSS_Data", 3500, 4500, 3800),
    ("SRT_Data", 15, 25, 18),
    ("FM_Ratio", 0.2, 0.4, 0.25),
    ("Ammonia_Profile", 5, 10, 6.5),
    ("Nitrification_Rate", 60, 90, 75),
    ("Denitrification_Rate", 50, 80, 60),
    ("Biofilm_Health", 70, 100, 85),
    ("Biofilm_Stress", 10, 40, 20),
    ("Sludge_Flow", 100, 150, 120),
    ("Sludge_Settling", 90, 130, 110),
    ("Chemical_Dosing", 20, 40, 25),
    ("Chlorine_Dosing", 1, 2, 1.4),
    ("Chlorine_Residual", 0.3, 1, 0.6),
    ("Effluent_Quality", 2, 10, 5),
    ("Digester_Feed", 30, 50, 40),
    ("Digester_Biogas", 200, 300, 220),
    ("Digester_Health", 6.5, 8, 7.1),
    ("Equipment_Health", 80, 100, 90),
    ("Anomaly_Events", 0, 1, 0),
]

# Time range: September 2025 through March 2026
start = datetime(2025, 9, 1, 0, 0)
end = datetime(2026, 4, 1, 0, 0)

file_name = "Sensor_Data.csv"

with open(file_name, mode="w", newline="") as file:
    writer = csv.writer(file)

    # Header
    writer.writerow(["id", "date", "time", "sensor_name", "value", "status_flag"])

    current_time = start
    record_id = 1

    while current_time < end:
        for name, min_val, max_val, base in sensors:
            # 5-7% FAULT probability
            if random.random() > 0.93:
                status = "FAULT"
                value = base * (0.9 + random.random() * 0.2)  # +-10%
            else:
                status = "NORMAL"
                value = base * (0.97 + random.random() * 0.06)  # +-3%

            # Clamp within threshold
            value = max(min_val, min(max_val, value))

            writer.writerow([
                record_id,
                current_time.strftime("%d/%m/%Y"),
                current_time.strftime("%H:%M:%S"),
                name,
                round(value, 2),
                status,
            ])

            record_id += 1

        current_time += timedelta(minutes=1)

print("Data Generated Successfully for Sep 2025 to Mar 2026!")
