#!/usr/bin/env python3
"""
tls_reset_probe.py

Usage:
  python tls_reset_probe.py api.telegram.org web.whatsapp.com google.com
  python tls_reset_probe.py --skip-tcpdump api.telegram.org
"""

import argparse
import datetime
import pathlib
import shlex
import subprocess
from typing import List, Optional

LOG_DIR = pathlib.Path("tls_reset_logs")
LOG_DIR.mkdir(exist_ok=True)


def run_cmd(cmd: List[str], logfile: pathlib.Path) -> int:
    with logfile.open("w", encoding="utf-8") as f:
        f.write(f"$ {' '.join(shlex.quote(p) for p in cmd)}\n")
    proc = subprocess.run(cmd, capture_output=True, text=True)
    with logfile.open("a", encoding="utf-8") as f:
        f.write(proc.stdout)
        f.write(proc.stderr)
    return proc.returncode


def curl_probe(host: str) -> int:
    logfile = LOG_DIR / f"{host}-curl.log"
    cmd = [
        "curl",
        "--connect-timeout",
        "5",
        "--max-time",
        "10",
        "-I",
        "-v",
        f"https://{host}",
    ]
    return run_cmd(cmd, logfile)


def openssl_probe(host: str) -> int:
    logfile = LOG_DIR / f"{host}-openssl.log"
    cmd = [
        "openssl",
        "s_client",
        "-connect",
        f"{host}:443",
        "-servername",
        host,
        "-brief",
        "-tlsextdebug",
        "-msg",
        "-quiet",
    ]
    return run_cmd(cmd, logfile)


def tcpdump_capture(host: str, packet_count: int = 20) -> int:
    logfile = LOG_DIR / f"{host}-tcpdump.log"
    cmd = [
        "sudo",
        "tcpdump",
        "-n",
        "-i",
        "any",
        "tcp",
        "and",
        "host",
        host,
        "and",
        "port",
        "443",
        "-c",
        str(packet_count),
        "-w",
        str(logfile.with_suffix(".pcap")),
    ]
    return run_cmd(cmd, logfile)


def main(hosts: List[str], skip_tcpdump: bool, packets: int) -> None:
    summary = []
    for host in hosts:
        host = host.strip()
        if not host:
            continue
        start = datetime.datetime.now(datetime.UTC)
        print(f"[{start.isoformat()}Z] Probing {host}")
        curl_ret = curl_probe(host)
        openssl_ret = openssl_probe(host)
        tcpdump_ret: Optional[int] = None
        if not skip_tcpdump:
            try:
                tcpdump_ret = tcpdump_capture(host, packets)
            except FileNotFoundError:
                print("  tcpdump missing; install it or run manually with sudo.")
        summary.append((host, curl_ret, openssl_ret, tcpdump_ret))

    print("\nSummary (0=success, non-zero=failure):")
    for host, curl_ret, openssl_ret, tcpdump_ret in summary:
        tcpdump_status = tcpdump_ret if tcpdump_ret is not None else "n/a"
        print(
            f"  {host}: curl={curl_ret}, openssl={openssl_ret}, tcpdump={tcpdump_status}"
        )
    print(f"\nLogs saved in {LOG_DIR.resolve()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Probe TLS/HTTP resets and capture evidence."
    )
    parser.add_argument(
        "hosts", nargs="+", help="Hostnames to probe (e.g., api.telegram.org)"
    )
    parser.add_argument(
        "--skip-tcpdump", action="store_true", help="Skip tcpdump packet capture"
    )
    parser.add_argument(
        "--packets",
        type=int,
        default=20,
        help="Number of packets to capture with tcpdump",
    )
    args = parser.parse_args()
    main(args.hosts, args.skip_tcpdump, args.packets)
