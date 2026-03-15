import ShareWorkspace from "./ShareWorkspace";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 這裡單純把 token 傳給 Client Component
  return <ShareWorkspace token={token} />;
}