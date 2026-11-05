@echo off
echo ===================================================
echo     DANG KHOI CHAY HE THONG EDUPROOF CLOUD...
echo ===================================================
echo May chu cuc bo dang khoi chay tai cong 8080...
echo Ban co the mo tren dien thoai cung Wifi qua IP may tinh: http://[IP]:8080
start http://localhost:8080/index.html
python -m http.server 8080
