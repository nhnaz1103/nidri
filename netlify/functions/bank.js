import { getStore } from "@netlify/blobs";

export default async (req) => {
    const store = getStore("point_bank");

    // [GET] 유저 포인트 조회 요청
    if (req.method === "GET") {
        const url = new URL(req.url);
        const userId = url.searchParams.get("userId");
        
        // userId가 없으면 전체 유저의 포인트 목록(순위표) 반환
        if (!userId) {
            const { blobs } = await store.list();
            const allUsers = {};
            for (const blob of blobs) {
                const points = await store.get(blob.key, { type: "json" });
                allUsers[blob.key] = points;
            }
            return Response.json(allUsers);
        }

        // 저장된 포인트가 없으면 기본 0점 반환
        const points = (await store.get(userId, { type: "json" })) || 0;
        return Response.json({ userId, points });
    }

    // [POST] 포인트 적립(earn) 및 소모(spend) 처리 요청
    if (req.method === "POST") {
        try {
            const body = await req.json();
            const { action, userId, amount } = body;

            if (!userId || !action || typeof amount !== "number") {
                return Response.json({ error: "잘못된 요청 데이터입니다." }, { status: 400 });
            }

            let currentPoints = (await store.get(userId, { type: "json" })) || 0;

            if (action === "earn") {
                currentPoints += amount;
                await store.setJSON(userId, currentPoints);
                return Response.json({ 
                    status: "SUCCESS", 
                    action: "earn", 
                    userId, 
                    points: currentPoints 
                });
            } 
            
            else if (action === "spend") {
                if (currentPoints < amount) {
                    return Response.json({ 
                        status: "REJECT", 
                        reason: "INSUFFICIENT_POINTS", 
                        userId, 
                        currentPoints, 
                        required: amount 
                    }, { status: 400 });
                }

                currentPoints -= amount;
                await store.setJSON(userId, currentPoints);
                return Response.json({ 
                    status: "SUCCESS", 
                    action: "spend", 
                    userId, 
                    points: currentPoints 
                });
            }

            return Response.json({ error: "지원하지 않는 action 입니다." }, { status: 400 });

        } catch (err) {
            return Response.json({ error: "서버 오류 발생", details: err.message }, { status: 500 });
        }
    }

    return Response.json({ error: "지원하지 않는 메서드입니다." }, { status: 405 });
};

export const config = {
    path: "/api/bank"
};
```[cite: 6]

---

### 2. `bank_view.html` 수정
복잡한 설정 입력 없이 곧바로 전체 순위표를 깔끔하게 불러오도록 수정된 전체 코드입니다[cite: 1].

```html
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>포인트 은행 잔액 현황</title>
    <style>
        body {
            font-family: 'Malgun Gothic', sans-serif;
            background-color: #121212;
            color: #e0e0e0;
            margin: 0;
            padding: 30px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #1e1e1e;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        }
        h1 {
            text-align: center;
            color: #ffffff;
            margin-bottom: 20px;
        }
        .btn-group {
            text-align: right;
            margin-bottom: 15px;
        }
        button {
            background-color: #00adb5;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
        }
        button:hover {
            background-color: #008f95;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #333;
        }
        th {
            background-color: #252525;
            color: #00adb5;
        }
        tr:hover {
            background-color: #2a2a2a;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #888;
        }
    </style>
</head>
<body>

<div class="container">
    <h1>🏆 포인트 은행 잔액 현황</h1>
    <div class="btn-group">
        <button onclick="loadPoints()">새로고침</button>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>순위</th>
                <th>시청자 (닉네임)</th>
                <th>보유 포인트</th>
            </tr>
        </thead>
        <tbody id="point-list">
            <tr><td colspan="3" class="loading">데이터를 불러오는 중...</td></tr>
        </tbody>
    </table>
</div>

<script>
    async function loadPoints() {
        const tbody = document.getElementById('point-list');
        tbody.innerHTML = `<tr><td colspan="3" class="loading">데이터를 불러오는 중...</td></tr>`;

        try {
            const response = await fetch('/api/bank');
            const data = await response.json();

            if (data.error) {
                tbody.innerHTML = `<tr><td colspan="3" class="loading" style="color: #ff6b6b;">오류: ${data.error}</td></tr>`;
                return;
            }

            let users = [];
            if (Array.isArray(data)) {
                users = data;
            } else if (typeof data === 'object' && data !== null) {
                users = Object.entries(data).map(([name, points]) => ({ name, points }));
            }

            // 포인트 내림차순 정렬
            users.sort((a, b) => b.points - a.points);

            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" class="loading">저장된 포인트 내역이 없습니다. 채팅을 쳐서 포인트를 적립해보세요!</td></tr>`;
                return;
            }

            tbody.innerHTML = '';
            users.forEach((user, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${user.name}</td>
                    <td>${user.points.toLocaleString()} P</td>
                `;
                tbody.appendChild(tr);
            });

        } catch (error) {
            console.error('포인트 데이터를 불러오는 중 오류 발생:', error);
            tbody.innerHTML = `<tr><td colspan="3" class="loading" style="color: #ff6b6b;">데이터를 불러오지 못했습니다. 서버를 확인해주세요.</td></tr>`;
        }
    }

    // 페이지 로드 시 자동 실행
    window.addEventListener('DOMContentLoaded', () => {
        loadPoints();
    });
</script>

</body>
</html>
```[cite: 1]

이 두 파일을 프로젝트에 반영하고 깃허브에 푸시하신 뒤, `bank_view.html` 페이지를 새로고침해 보시면 정상적으로 포인트 순위 리스트가 출력될 것입니다.