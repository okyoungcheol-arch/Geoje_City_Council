// backend/app/page.tsx
//
// 이 앱은 API 전용(모바일이 /api/insights만 호출)이므로 루트에 create-next-app
// 기본 템플릿을 남겨두지 않는다. 실데이터 관리자 뷰(/table1)로 바로 보낸다.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/table1");
}
