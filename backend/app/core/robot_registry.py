"""
DNS-style Robot Name & Tag Resolver + Auth Crypto (SHA-512 3088 rounds)
Reads and writes directly to the 1:1 mounted docker_master/config/robots.json
"""
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional


def get_master_dir() -> Path:
    env_dir = os.environ.get("MASTER_DIR")
    if env_dir and Path(env_dir).exists():
        return Path(env_dir)
    # Local fallback relative to repo root
    return Path(__file__).resolve().parents[3] / "docker_master"


def hash_password_3088(raw_password: str, rounds: int = 3088) -> str:
    """
    Replicates MOSS jsSHA("SHA-512", "TEXT", { encoding: "UTF8", numRounds: 3088 })
    """
    data = raw_password.encode("utf-8")
    for _ in range(rounds):
        data = hashlib.sha512(data).digest()
    return data.hex()


class RobotNameResolver:
    """
    DNS-like naming & tagging registry for multi-robot routing.
    Supports resolution by:
      - ID: 'flag-01', 'pro-01', 'power-01'
      - Hostname: 'flagship.robot.local', 'pro.robot.local', 'power.robot.local'
      - Alias: '@flag', 'flag', 'pro', 'power'
      - Tag: '#all', '#flagship', '#6dof-arm', '#4wd-steering', '#datacenter'
      - Direct IP: '10.200.28.63'
    """

    def __init__(self) -> None:
        self.config_path = get_master_dir() / "config" / "robots.json"
        self.reload()

    def reload(self) -> Dict[str, Any]:
        if not self.config_path.exists():
            self._data = {"domain_suffix": ".robot.local", "robots": []}
            return self._data
        with open(self.config_path, "r", encoding="utf-8") as f:
            self._data = json.load(f)
        return self._data

    def list_all(self) -> List[Dict[str, Any]]:
        self.reload()
        return self._data.get("robots", [])

    def resolve(self, query: str) -> List[Dict[str, Any]]:
        """
        Resolves a DNS hostname, @alias, #tag, or ID into one or more robot records.
        """
        self.reload()
        q = query.strip().lower()
        if not q or q in ("#all", "all", "*"):
            return self._data.get("robots", [])

        q_clean = q.lstrip("@")
        matched: List[Dict[str, Any]] = []

        for robot in self._data.get("robots", []):
            r_id = robot.get("id", "").lower()
            r_host = robot.get("hostname", "").lower()
            r_ip = robot.get("ip", "").lower()
            r_aliases = [a.lower() for a in robot.get("aliases", [])]
            r_tags = [t.lower() for t in robot.get("tags", [])]

            if q.startswith("#"):
                if q in r_tags or f"#{q_clean}" in r_tags:
                    matched.append(robot)
            elif (
                q_clean == r_id
                or q_clean == r_host
                or q_clean == r_ip
                or q_clean in r_aliases
                or f"#{q_clean}" in r_tags
            ):
                matched.append(robot)

        return matched

    def resolve_one(self, query: str) -> Optional[Dict[str, Any]]:
        res = self.resolve(query)
        return res[0] if res else None

    def get_default_auth(self) -> Dict[str, Any]:
        self.reload()
        return self._data.get(
            "default_auth",
            {"account": "super", "password_plain": "QAZWSXmoon890@", "hash_rounds": 3088},
        )
