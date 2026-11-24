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


## 참고사항

### 데이터 종류별 수집 방식 비교
| 데이터 항목 | 수집 방식 | 프로토콜 / 엔드포인트 | 비고 |
| --- | :---: | :---: | --- |
| 맵 점군 지도 (`map.pgm`, `map.yaml`) | SSH / SFTP | SFTP (Port 1004) | 로봇 내부 ROS 패키지 디렉토리에서 직접 추출 |
| 위치/충전점 목록 (26개 포인트) | REST API | HTTP POST `/api/v1/position/list` | JSON 포맷 실시간 동기화 |
| 순찰 작업/미션 목록 | REST API | HTTP POST `/api/v1/mission/list` | JSON 포맷 실시간 동기화 |
| 실시간 텔레메트리 (위치, 배터리, 센서) | Redis 버스 | TCP Redis (Port 6379, via SSH) | 1.5초 주기 실시간 폴링 |
| 원격 주행/미션 지시 | REST API | HTTP POST `/pad/giveCommand`, `/mission/execute` | 웹 관제에서 명령 즉시 하달 |
| 실시간 카메라 영상 | 미디어 중계 | WHEP (Port 8889) ➔ Nginx (Port 8080) | 단일 8080 포트 HTTP 스트림 변환 |