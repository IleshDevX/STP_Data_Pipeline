from __future__ import annotations

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _build_conninfo() -> str:
    db_url = os.getenv("SUPABASE_DB_URL")
    if db_url:
        return db_url

    host = _require_env("SUPABASE_DB_HOST")
    port = os.getenv("SUPABASE_DB_PORT", "5432")
    dbname = os.getenv("SUPABASE_DB_NAME", "postgres")
    user = os.getenv("SUPABASE_DB_USER", "postgres")
    password = _require_env("SUPABASE_DB_PASSWORD")

    return (
        f"host={host} "
        f"port={port} "
        f"dbname={dbname} "
        f"user={user} "
        f"password={password} "
        "sslmode=require"
    )


def main() -> int:
    load_dotenv()
    # Default to full import so final table is populated unless user opts into fast staging-only mode.
    fast_mode = os.getenv("FAST_MODE", "0").strip() not in {"0", "false", "False"}

    csv_path = Path(os.getenv("CSV_PATH", "Sensor_Data.csv")).resolve()
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        return 1

    conninfo = _build_conninfo()
    print("Connecting to Supabase Postgres...")

    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            # Create tables if they don't exist.
            cur.execute(
                """
                create table if not exists public.sensor_data_raw (
                  id bigint,
                  date_text text,
                  time_text text,
                  sensor_name text,
                  value numeric,
                  status_flag text
                );

                create table if not exists public.sensor_data (
                  id bigint primary key,
                  recorded_at timestamp not null,
                  sensor_name text not null,
                  value numeric not null,
                  status_flag text not null check (status_flag in ('NORMAL','FAULT'))
                );

                create index if not exists idx_sensor_data_recorded_at
                  on public.sensor_data(recorded_at);

                create index if not exists idx_sensor_data_sensor_name
                  on public.sensor_data(sensor_name);
                """
            )

            print("Clearing staging table...")
            cur.execute("truncate table public.sensor_data_raw;")

            print(f"Copying CSV into staging table: {csv_path}")
            with csv_path.open("r", encoding="utf-8", newline="") as csv_file:
                with cur.copy(
                    """
                    copy public.sensor_data_raw
                    (id, date_text, time_text, sensor_name, value, status_flag)
                    from stdin with (format csv, header true)
                    """
                ) as copy:
                    while True:
                        chunk = csv_file.read(1024 * 1024)
                        if not chunk:
                            break
                        copy.write(chunk)

            cur.execute("select count(*) from public.sensor_data_raw;")
            staging_count = cur.fetchone()[0]
            print(f"Rows copied to staging: {staging_count}")

            affected = -1
            total_rows = 0
            if fast_mode:
                print("FAST_MODE=1: Skipping transform/upsert into public.sensor_data.")
            else:
                print("Upserting from staging into final table...")
                cur.execute(
                    """
                    insert into public.sensor_data
                      (id, recorded_at, sensor_name, value, status_flag)
                    select
                      id,
                      to_timestamp(
                        date_text || ' ' || time_text,
                        'DD/MM/YYYY HH24:MI:SS'
                      )::timestamp,
                      sensor_name,
                      value,
                      status_flag
                    from public.sensor_data_raw
                    on conflict (id)
                    do update set
                      recorded_at = excluded.recorded_at,
                      sensor_name = excluded.sensor_name,
                      value = excluded.value,
                      status_flag = excluded.status_flag;
                    """
                )

                affected = cur.rowcount
                cur.execute("select count(*) from public.sensor_data;")
                total_rows = cur.fetchone()[0]
            conn.commit()

    if fast_mode:
        print("Data is fully uploaded in public.sensor_data_raw.")
    else:
        if affected >= 0:
            print(f"Rows upserted in final step: {affected}")
        else:
            print("Upsert completed.")
        print(f"Total rows currently in public.sensor_data: {total_rows}")
    print("Import finished successfully.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Import failed: {exc}")
        raise SystemExit(1) from exc
