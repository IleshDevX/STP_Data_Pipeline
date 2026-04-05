from __future__ import annotations

import csv
import os
import threading
import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from math import ceil
from pathlib import Path

import requests
from dotenv import load_dotenv


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _normalize_row(raw: dict[str, str]) -> dict[str, str]:
    return {
        "id": raw["id"],
        "date_text": raw["date"],
        "time_text": raw["time"],
        "sensor_name": raw["sensor_name"],
        "value": raw["value"],
        "status_flag": raw["status_flag"],
    }


def _iter_batched_rows(csv_path: Path, batch_size: int):
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        batch: list[dict[str, str]] = []
        for row in reader:
            batch.append(_normalize_row(row))
            if len(batch) >= batch_size:
                yield batch
                batch = []
        if batch:
            yield batch


def _count_data_rows(csv_path: Path) -> int:
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        # Exclude header row.
        return max(sum(1 for _ in f) - 1, 0)


def _post_batch(
    session: requests.Session,
    endpoint: str,
    headers: dict[str, str],
    rows: list[dict[str, str]],
    retries: int,
) -> int:
    delay = 1.0
    for attempt in range(retries + 1):
        try:
            response = session.post(endpoint, headers=headers, json=rows, timeout=120)
            if response.status_code in (200, 201, 204):
                return len(rows)

            # Retry transient statuses.
            if response.status_code in (408, 409, 425, 429, 500, 502, 503, 504):
                if attempt < retries:
                    time.sleep(delay)
                    delay *= 2
                    continue

            raise RuntimeError(
                f"HTTP {response.status_code}: {response.text[:500]}"
            )
        except requests.RequestException as exc:
            if attempt < retries:
                time.sleep(delay)
                delay *= 2
                continue
            raise RuntimeError(f"Request failed: {exc}") from exc

    raise RuntimeError("Unexpected retry loop exit")


def main() -> int:
    load_dotenv()

    supabase_url = _require("SUPABASE_URL").rstrip("/")
    supabase_key = _require("SUPABASE_KEY")

    csv_path = Path(os.getenv("CSV_PATH", "Sensor_Data.csv")).resolve()
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        return 1

    batch_size = int(os.getenv("REST_BATCH_SIZE", "2000"))
    max_workers = int(os.getenv("REST_MAX_WORKERS", "8"))
    retries = int(os.getenv("REST_RETRIES", "5"))

    endpoint = f"{supabase_url}/rest/v1/sensor_data_raw"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    print("Counting rows...")
    total_rows = _count_data_rows(csv_path)
    total_batches = ceil(total_rows / batch_size) if total_rows else 0
    print(f"Total rows: {total_rows}, total batches: {total_batches}")

    inserted = 0
    completed = 0
    lock = threading.Lock()
    started = time.time()

    def run(rows: list[dict[str, str]], index: int) -> tuple[int, int]:
        with requests.Session() as session:
            count = _post_batch(session, endpoint, headers, rows, retries)
        return index, count

    print("Uploading to Supabase REST in parallel...")
    batch_iter = _iter_batched_rows(csv_path, batch_size)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        in_flight: set[Future[tuple[int, int]]] = set()
        next_idx = 0

        while len(in_flight) < max_workers * 2:
            try:
                rows = next(batch_iter)
            except StopIteration:
                break
            in_flight.add(executor.submit(run, rows, next_idx))
            next_idx += 1

        while in_flight:
            done, in_flight = wait(in_flight, return_when=FIRST_COMPLETED)
            for future in done:
                index, count = future.result()
                with lock:
                    inserted += count
                    completed += 1
                    if completed % 20 == 0 or completed == total_batches:
                        elapsed = max(time.time() - started, 0.001)
                        rps = inserted / elapsed
                        print(
                            f"Progress: batch {completed}/{total_batches}, "
                            f"rows {inserted}/{total_rows}, rows/sec {rps:.1f}"
                        )

                try:
                    rows = next(batch_iter)
                except StopIteration:
                    rows = None

                if rows is not None:
                    in_flight.add(executor.submit(run, rows, next_idx))
                    next_idx += 1

    elapsed = max(time.time() - started, 0.001)
    print(f"Upload complete. Rows inserted: {inserted}. Time: {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Upload failed: {exc}")
        raise SystemExit(1) from exc
