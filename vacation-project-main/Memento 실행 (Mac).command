#!/bin/bash
# Memento 실행 스크립트 (Mac/Linux용)
# 더블클릭해서 실행이 안 될 경우, 터미널(Terminal) 앱을 열고 아래 명령어를 입력해주세요.
# chmod +x "Memento 실행 (Mac).command"

# 스크립트가 위치한 폴더의 public 폴더로 이동
cd "$(dirname "$0")/public" || {
    echo "[오류] public 폴더를 찾을 수 없습니다."
    exit 1
}

PORT=8080

echo ""
echo " ========================================"
echo "  Memento 다이어리를 시작합니다!"
echo " ========================================"
echo ""
echo "  접속 주소: http://localhost:$PORT/"
echo "  서버를 종료하려면 이 창을 닫거나 Ctrl+C를 누르세요."
echo ""

# 기본 브라우저 자동 실행 (Mac의 경우 open, Linux의 경우 xdg-open)
if command -v open > /dev/null; then
    (sleep 1 && open "http://localhost:$PORT/") &
elif command -v xdg-open > /dev/null; then
    (sleep 1 && xdg-open "http://localhost:$PORT/") &
fi

# Python 3로 로컬 서버 실행
if command -v python3 > /dev/null; then
    python3 -m http.server $PORT
elif command -v python > /dev/null; then
    python -m http.server $PORT
else
    echo "[오류] Python이 설치되어 있지 않습니다. Mac에 내장된 Python을 확인해주세요."
    exit 1
fi
