import { getStore } from "@netlify/blobs";

export default async (req) => {
    // 'point_bank'라는 이름의 전용 금고(저장소)를 연다
    const store = getStore("point_bank");

    // [GET] 유저 포인트 조회 요청
    if (req.method === "GET") {
        const url = new URL(req.url);
        const userId = url.searchParams.get("userId");
        
        if (!userId) {
            return Response.json({ error: "userId가 필요합니다." }, { status: 400 });
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

            // 현재 유저의 잔액 조회 (없으면 0점)
            let currentPoints = (await store.get(userId, { type: "json" })) || 0;

            // 1. [적립] 처리
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
            
            // 2. [소모] 및 [거부] 처리
            else if (action === "spend") {
                // 잔액이 부족한 경우 -> [거부] 신호 발사
                if (currentPoints < amount) {
                    return Response.json({ 
                        status: "REJECT", 
                        reason: "INSUFFICIENT_POINTS", 
                        userId, 
                        currentPoints, 
                        required: amount 
                    }, { status: 400 });
                }

                // 잔액이 충분한 경우 -> 차감 후 성공 승인
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

// 고정 API 경로 설정 (/api/bank 로 접속 가능)
export const config = {
    path: "/api/bank"
};