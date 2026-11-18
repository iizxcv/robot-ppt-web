# 🤖 `robot-ppt-web`: API & OpenCV 연동 멀티 로봇 3D 쇼케이스 플랫폼

이기종 순찰/점검 로봇(**Flagship V2.1 / Professional V3.5 / Power V3.0**)을 하나의 스토리텔링형 웹 프레젠테이션 화면에서 **DNS 네이밍 기반으로 조작**하고, **OpenCV 실시간 비전 처리**와 **단일 3D 조감도(`map.pgm` SE(2) 좌표 정합)**를 동시에 시연하는 Docker 기반 플랫폼입니다.

## 1. Git 브랜치 전략
- `master` (또는 `main`): 전체 통합 배포 및 `docker_master/` 1:1 마운트 설정 기준 브랜치
- `backend`: Python FastAPI + OpenCV 비전 스튜디오 + `map.pgm` SE(2) 좌표계 정합 엔진 + 멀티 로봇 API/WebSocket 게이트웨이
- `frontend`: React + TypeScript + Three.js (`@react-three/fiber`) 3D 조감도 뷰어 + 파라메트릭 URDF 로봇 아바타 + 스토리텔링 PPT 슬라이드 UI

## 2. Docker 실행 및 영구 볼륨(1:1 Bind Mount) 구조
```bash
docker compose up -d --build
```
- `./docker_master/config` ➔ `/app/master/config` (`robots.json`, `map_alignment.json`, `slides_config.json`, `vision_presets.json`)
- `./docker_master/data` ➔ `/app/master/data` (`maps/*/map.pgm`, `map.yaml`, `models/*.urdf`, `showcase.db`)
- `./docker_master/logs` ➔ `/app/master/logs`
- `./docker_master/nginx` ➔ `/etc/nginx/conf.d`
